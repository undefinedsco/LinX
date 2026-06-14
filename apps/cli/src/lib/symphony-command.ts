import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import {
  runThreadReconcilerCycle,
  summarizeWakeJobExecutionRecord,
  type AgentRuntimeBackendConfig,
  type ReconcileDecisionSummary,
  type ThreadControlEvent,
  type WakeJobSchedulerSnapshotSummary,
} from '@linx/agent-runtime'
import type { AutoModeCredentialSource, AutoModeMode, AutoModeWorkerBackend } from '@linx/agent-runtime/auto-mode'
import {
  appendSymphonyReconcilerDecision,
  createRunPlan,
  renderSymphonyRuntimePrompt,
  type CreateSymphonyRunPlanInput,
  type SymphonyDelegationTarget,
  type SymphonyRunPlan,
  type WorkerWorkspaceKind,
  type SymphonyWorkerPlan,
} from '@linx/agent-runtime/symphony'
import { runAutoMode, listArchivedAutoModeSessions, type AutoRunOptions } from './auto-mode/index.js'
import {
  formatSymphonyRecordSummary,
  getSymphonyHome,
  attachSymphonyRunPlanToIssue,
  createSymphonyRunPlanDraft,
  triageSymphonyIssue,
  withSymphonyIssueStatus,
  withSymphonyDeliveryStatus,
  withSymphonySessionStatus,
  withSymphonyTaskStatus,
  writeSymphonyRunPlan,
} from './symphony/archive.js'
import {
  listOpenSymphonyIssuesFromPod,
  mirrorSymphonyProjectionJsonLdFromPod,
  persistSymphonyControlStateToPod,
  persistSymphonyProjectionToPod,
} from './symphony/pod-projection.js'

export interface SymphonyRuntime {
  runAutoMode(options: AutoRunOptions): Promise<number>
  listAutoModeSessions(): ReturnType<typeof listArchivedAutoModeSessions>
  persistSymphonyControlStateToPod?: typeof persistSymphonyControlStateToPod
  /** @deprecated Use persistSymphonyControlStateToPod for LinX-owned Symphony records. */
  persistSymphonyProjectionToPod?: typeof persistSymphonyProjectionToPod
  listOpenSymphonyIssuesFromPod?: typeof listOpenSymphonyIssuesFromPod
  mirrorSymphonyProjectionJsonLdFromPod?: typeof mirrorSymphonyProjectionJsonLdFromPod
}

interface SymphonyRunArgs {
  objective?: string[]
  backend?: AutoModeWorkerBackend
  auto?: boolean
  dryRun?: boolean
  cwd?: string
  title?: string
  acceptance?: string | string[]
  model?: string
  agentRuntime?: AgentRuntimeBackendConfig
  secretaryModel?: string
  workerModel?: string
  workerSupervisorIntervalMs?: number
  plain?: boolean
  credentialSource?: AutoModeCredentialSource
  print?: boolean
  quietProjectionErrors?: boolean
  repository?: string
  branch?: string
  worktree?: string
  workspaceKind?: WorkerWorkspaceKind
  chat?: string
  thread?: string
  messages?: string[]
  target?: Partial<SymphonyDelegationTarget>
  worker?: string[]
  workerGoalMode?: boolean
  quietWorkers?: boolean
  commandOverride?: string
  commandEnv?: Record<string, string>
  signal?: AbortSignal
  '--'?: string[]
}

const defaultRuntime: SymphonyRuntime = {
  runAutoMode,
  listAutoModeSessions: listArchivedAutoModeSessions,
  persistSymphonyControlStateToPod,
  listOpenSymphonyIssuesFromPod,
  mirrorSymphonyProjectionJsonLdFromPod,
}

export async function runSymphony(
  argv: SymphonyRunArgs,
  runtime: SymphonyRuntime = defaultRuntime,
): Promise<SymphonyRunPlan> {
  throwIfAborted(argv.signal)
  const objective = normalizeObjective(argv.objective)
  const cwd = resolve(argv.cwd || process.cwd())
  const workspace = resolveWorkspaceMetadata(cwd, argv)
  const backend = argv.backend ?? 'codex'
  const mode: AutoModeMode = 'off'
  const secretaryAutoEnabled = Boolean(argv.auto)
  const workers = normalizeWorkers(argv.worker, backend, argv.target)
  const agentRuntime = resolveSymphonyAgentRuntime(argv)
  const requestedWorkerModel = normalizeOptional(argv.workerModel) ?? normalizeOptional(argv.model)
  assertSymphonyWorkerModelCompatibility(backend, requestedWorkerModel, workers)
  const planInput: CreateSymphonyRunPlanInput = {
    objective,
    title: normalizeOptional(argv.title),
    acceptanceCriteria: normalizeAcceptanceCriteria(argv.acceptance),
    workspacePath: cwd,
    workspaceKind: workspace.kind,
    repository: workspace.repository,
    branch: workspace.branch,
    worktree: workspace.worktree,
    baseRevision: workspace.baseRevision,
    environment: {
      kind: 'local-shell',
      label: 'linx-cli',
      runtime: backend,
    },
    backend,
    mode,
    secretaryAutoEnabled,
    model: normalizeOptional(argv.model),
    workerModel: normalizeOptional(argv.workerModel),
    workerSupervisorIntervalMs: normalizePositiveInteger(argv.workerSupervisorIntervalMs),
    chat: normalizeOptional(argv.chat),
    thread: normalizeOptional(argv.thread),
    messages: normalizeMessages(argv.messages),
    issuer: {
      source: 'user',
      chat: normalizeOptional(argv.chat),
      thread: normalizeOptional(argv.thread),
      messages: normalizeMessages(argv.messages),
    },
    target: argv.target,
    workers,
  }
  const plan = await createSymphonyRunPlanForRuntime(planInput, runtime, argv.signal)
  throwIfAborted(argv.signal)
  const quietProjectionErrors = argv.quietProjectionErrors === true
  let currentPlan = await persistSymphonyControlState(plan, 'planned', runtime, {
    quiet: quietProjectionErrors,
    signal: argv.signal,
  })

  if (argv.dryRun) {
    throwIfAborted(argv.signal)
    currentPlan = withUpdatedIssue({
      ...currentPlan,
      workers: currentPlan.workers.map((worker) => ({
        ...worker,
        session: withSymphonySessionStatus(worker.session, 'planned', { dryRun: true }),
      })),
    })
    currentPlan = await persistSymphonyControlState(currentPlan, 'planned', runtime, {
      quiet: quietProjectionErrors,
      signal: argv.signal,
    })
    if (argv.print !== false) {
      printSymphonyRunPlan(currentPlan, { dryRun: true })
    }
    return currentPlan
  }

  let issue = withSymphonyIssueStatus(currentPlan.issue, 'in_progress')
  currentPlan = { ...currentPlan, issue }
  currentPlan = await persistSymphonyControlState(currentPlan, 'running', runtime, {
    quiet: quietProjectionErrors,
    signal: argv.signal,
  })
  issue = currentPlan.issue

  try {
    const dispatchedWorkers: SymphonyWorkerPlan[] = []
    let firstFailure: { exitCode: number; error: string } | null = null
    for (const [index, worker] of currentPlan.workers.entries()) {
      throwIfAborted(argv.signal)
      const dispatched = await runSymphonyWorker({
        worker,
        issue: currentPlan.issue,
        workerIndex: index + 1,
        workerCount: currentPlan.workers.length,
        secretaryAutoEnabled,
        cwd,
        plain: Boolean(argv.plain),
        agentRuntime,
        model: normalizeOptional(argv.workerModel) ?? normalizeOptional(argv.model),
        credentialSource: normalizeCredentialSource(argv.credentialSource),
        goalMode: argv.workerGoalMode !== false,
        quiet: argv.quietWorkers === true,
        passthroughArgs: ((argv['--'] as string[] | undefined) ?? []).map(String),
        commandOverride: normalizeOptional(argv.commandOverride),
        commandEnv: normalizeCommandEnv(argv.commandEnv),
        runtime,
        signal: argv.signal,
        onWorkerDispatched: async (runningWorker) => {
          currentPlan = withUpdatedWorker(currentPlan, runningWorker)
          currentPlan = await persistSymphonyControlState(currentPlan, 'running', runtime, {
            quiet: quietProjectionErrors,
            signal: argv.signal,
          })
        },
      })
      dispatchedWorkers.push(dispatched.worker)
      currentPlan = withUpdatedWorker(currentPlan, dispatched.worker)
      if (dispatched.exitCode !== 0 && !firstFailure) {
        firstFailure = {
          exitCode: dispatched.exitCode,
          error: `Backend ${dispatched.worker.session.backend} exited with code ${dispatched.exitCode}`,
        }
      }
    }

    const status = firstFailure ? 'failed' : 'completed'
    issue = withSymphonyIssueStatus(issue, firstFailure ? 'blocked' : 'resolved', firstFailure ? { error: firstFailure.error } : {})
    currentPlan = withUpdatedIssue({
      ...currentPlan,
      issue,
      workers: dispatchedWorkers,
    })
    currentPlan = await persistSymphonyControlState(currentPlan, status, runtime, {
      quiet: quietProjectionErrors,
      signal: argv.signal,
    })
    if (argv.print !== false) {
      printSymphonyRunPlan(currentPlan, { dryRun: false })
    }
    if (firstFailure) {
      process.exitCode = firstFailure.exitCode
    }
    return currentPlan
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    issue = withSymphonyIssueStatus(issue, 'blocked', { error: message })
    const failedWorker = currentPlan.workers[0]
    if (failedWorker) {
      const worker = {
        task: failedWorker.task,
        taskRecord: withSymphonyTaskStatus(failedWorker.taskRecord, 'failed', { error: message }),
        delivery: withSymphonyDeliveryStatus(failedWorker.delivery, 'failed', { error: message }),
        session: withSymphonySessionStatus(failedWorker.session, 'failed', { error: message, exitCode: 1 }),
      }
      currentPlan = withUpdatedWorker({ ...currentPlan, issue }, worker)
    } else {
      currentPlan = { ...currentPlan, issue }
    }
    await persistSymphonyControlState(currentPlan, 'failed', runtime, {
      quiet: quietProjectionErrors,
      signal: argv.signal,
    })
    throw error
  }
}

async function createSymphonyRunPlanForRuntime(
  input: CreateSymphonyRunPlanInput,
  runtime: SymphonyRuntime,
  signal?: AbortSignal,
): Promise<SymphonyRunPlan> {
  throwIfAborted(signal)
  const listIssues = runtime.listOpenSymphonyIssuesFromPod
  if (!listIssues) {
    return createSymphonyRunPlanDraft(input)
  }

  let podIssues: Awaited<ReturnType<typeof listOpenSymphonyIssuesFromPod>>
  try {
    podIssues = await withAbortSignal(listIssues(), signal)
    throwIfAborted(signal)
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Symphony Pod control read failed: ${message}`)
  }

  if (!podIssues) {
    throw new Error('No active Pod session; Symphony control-plane state must be read from Pod in LinX runtime.')
  }

  const plan = createRunPlan(input)
  const triage = triageSymphonyIssue({
    objective: input.objective,
    chat: input.chat,
    thread: input.thread,
    workspacePath: input.workspacePath,
    issues: podIssues,
  })

  return triage.action === 'update' && triage.issue
    ? attachSymphonyRunPlanToIssue(plan, triage.issue)
    : plan
}

async function runSymphonyWorker(input: {
  worker: SymphonyWorkerPlan
  issue: SymphonyRunPlan['issue']
  workerIndex: number
  workerCount: number
  secretaryAutoEnabled: boolean
  cwd: string
  plain: boolean
  agentRuntime?: AgentRuntimeBackendConfig
  model?: string
  credentialSource?: AutoModeCredentialSource
  goalMode: boolean
  quiet: boolean
  passthroughArgs: string[]
  commandOverride?: string
  commandEnv?: Record<string, string>
  runtime: SymphonyRuntime
  signal?: AbortSignal
  onWorkerDispatched?: (worker: SymphonyWorkerPlan) => Promise<void>
}): Promise<{ worker: SymphonyWorkerPlan; status: 'completed' | 'failed'; exitCode: number }> {
  throwIfAborted(input.signal)
  const beforeAutoModeIds = new Set(input.runtime.listAutoModeSessions().map((record) => record.id))
  const cwd = input.worker.session.cwd || input.cwd
  const workspace = input.worker.session.workspace ?? {
    path: cwd,
    kind: 'folder' as const,
  }
  const prompt = renderSymphonyRuntimePrompt({
    issue: input.issue,
    task: input.worker.task,
    objective: input.worker.taskRecord.objective,
    acceptanceCriteria: input.worker.taskRecord.acceptanceCriteria,
    workspace,
    backend: input.worker.session.backend,
    mode: input.worker.session.mode,
    secretaryAutoEnabled: input.worker.session.secretaryAutoEnabled ?? input.secretaryAutoEnabled,
    session: input.worker.session.uri,
    target: input.worker.session.target,
    issuer: input.issue.issuer,
    ...(input.workerCount > 1 ? {
      workerIndex: input.workerIndex,
      workerCount: input.workerCount,
    } : {}),
  })

  let exitCode: number | null = null
  let wakeError: unknown
  let runningDelivery = input.worker.delivery
  let runningSession = input.worker.session
  let runningTask = input.worker.taskRecord
  const cycle = await runThreadReconcilerCycle({
    policy: {
      kind: 'symphony',
      assignedWorkerAgent: input.worker.delivery.targetAgent,
      secretaryAgent: '__secretary__',
    },
    handleWakeJob: async ({ decisionSummary, record }) => {
      try {
        throwIfAborted(input.signal)
        exitCode = await input.runtime.runAutoMode({
          backend: input.worker.session.backend,
          autoEnabled: input.secretaryAutoEnabled,
          mode: 'off',
          cwd,
          plain: input.plain,
          model: normalizeOptional(input.worker.session.model) ?? input.model,
          credentialSource: input.credentialSource,
          prompt,
          goalMode: input.goalMode,
          quiet: input.quiet,
          passthroughArgs: input.passthroughArgs,
          ...(input.commandOverride ? { commandOverride: input.commandOverride } : {}),
          ...(input.commandEnv ? { commandEnv: input.commandEnv } : {}),
          metadata: {
            symphony: {
              issue: input.issue.uri,
              task: input.worker.task,
              delivery: input.worker.delivery.uri,
              session: input.worker.session.uri,
              ...(input.agentRuntime ? { agentRuntime: input.agentRuntime } : {}),
              ...(input.worker.session.model ? { workerModel: input.worker.session.model } : {}),
              ...(input.worker.session.supervisor ? { supervisor: input.worker.session.supervisor } : {}),
            },
            reconciler: decisionSummary,
            scheduler: {
              wakeRecord: summarizeWakeJobExecutionRecord(record),
            },
          },
          ...(input.signal ? { signal: input.signal } : {}),
        })
        throwIfAborted(input.signal)
        return { exitCode }
      } catch (error) {
        wakeError = error
        throw error
      }
    },
    event: createSymphonyWorkerDispatchEvent(input.worker),
    dispatchOptions: {
      randomId: `${input.worker.delivery.uri}-dispatch`,
    },
    onDispatched: (dispatch) => {
      throwIfAborted(input.signal)
      runningDelivery = appendSymphonyReconcilerDecision(withSymphonyDeliveryStatus(input.worker.delivery, 'dispatched'), dispatch.summary)
      runningSession = appendSymphonyReconcilerDecision(withSymphonySessionStatus(input.worker.session, 'running'), dispatch.summary)
      runningTask = appendSymphonyReconcilerDecision(withSymphonyTaskStatus(input.worker.taskRecord, 'running'), dispatch.summary)
      return input.onWorkerDispatched?.({
        task: input.worker.task,
        taskRecord: runningTask,
        delivery: runningDelivery,
        session: runningSession,
      })
    },
  })
  const dispatchScheduler = cycle.schedulerSummary
  if (dispatchScheduler.failed.length > 0) {
    throw wakeError ?? new Error(String(dispatchScheduler.failed[0]?.error ?? 'Symphony worker wake job failed'))
  }
  if (exitCode === null) {
    throw new Error('Symphony worker was not awakened by the Thread Reconciler.')
  }

  throwIfAborted(input.signal)
  const autoModeSessionId = resolveCreatedAutoModeSessionId(beforeAutoModeIds, input.runtime)
  const status = exitCode === 0 ? 'completed' : 'failed'
  const statusDecision = await dispatchSymphonyWorkerStatusDecision({
    worker: {
      task: input.worker.task,
      taskRecord: runningTask,
      delivery: runningDelivery,
      session: runningSession,
    },
    status,
    exitCode,
    autoModeSessionId,
  })
  return {
    status,
    exitCode,
    worker: {
      task: input.worker.task,
      taskRecord: appendSymphonyReconcilerDecision(withSymphonyTaskStatus(runningTask, status, {
        ...(exitCode === 0 ? {} : { error: `Backend exited with code ${exitCode}` }),
      }), statusDecision.decision),
      delivery: appendSymphonyReconcilerDecision(withSymphonyDeliveryStatus(runningDelivery, status, {
        autoModeSessionId,
        ...(exitCode === 0 ? {} : { error: `Backend exited with code ${exitCode}` }),
      }), statusDecision.decision),
      session: appendSymphonyReconcilerDecision(withSymphonySessionStatus(runningSession, status, {
        autoModeSessionId,
        exitCode,
        ...(exitCode === 0 ? {} : { error: `Backend exited with code ${exitCode}` }),
      }), statusDecision.decision),
    },
  }
}

function createSymphonyWorkerDispatchEvent(worker: SymphonyWorkerPlan): ThreadControlEvent {
  return {
    type: 'delivery.submitted',
    ...(worker.delivery.chat ? { chat: worker.delivery.chat } : {}),
    ...(worker.delivery.thread ? { thread: worker.delivery.thread } : {}),
    resource: worker.delivery.uri,
    actor: {
      id: '__secretary__',
      role: 'secretary',
    },
    data: {
      deliveryType: worker.delivery.type,
      issue: worker.delivery.issue,
      task: worker.delivery.task,
      delivery: worker.delivery.uri,
      session: worker.session.uri,
    },
  }
}

async function dispatchSymphonyWorkerStatusDecision(input: {
  worker: SymphonyWorkerPlan
  status: 'completed' | 'failed'
  exitCode: number
  autoModeSessionId?: string
}): Promise<{ decision: ReconcileDecisionSummary; scheduler: WakeJobSchedulerSnapshotSummary }> {
  let wakeError: unknown
  const cycle = await runThreadReconcilerCycle({
    policy: {
      kind: 'symphony',
      secretaryAgent: '__secretary__',
    },
    handleWakeJob: ({ job }) => {
      try {
        return {
          targetAgent: job.targetAgent,
          targetRole: job.targetRole,
          status: input.status,
        }
      } catch (error) {
        wakeError = error
        throw error
      }
    },
    event: createSymphonyWorkerStatusEvent(input),
    dispatchOptions: {
      randomId: `${input.worker.delivery.uri}-${input.status}`,
    },
  })
  const scheduler = cycle.schedulerSummary
  if (scheduler.failed.length > 0) {
    throw wakeError ?? new Error(String(scheduler.failed[0]?.error ?? 'Symphony status wake job failed'))
  }
  return {
    decision: cycle.summary,
    scheduler,
  }
}

function createSymphonyWorkerStatusEvent(input: {
  worker: SymphonyWorkerPlan
  status: 'completed' | 'failed'
  exitCode: number
  autoModeSessionId?: string
}): ThreadControlEvent {
  return {
    type: input.status === 'completed' ? 'delivery.completed' : 'delivery.failed',
    ...(input.worker.delivery.chat ? { chat: input.worker.delivery.chat } : {}),
    ...(input.worker.delivery.thread ? { thread: input.worker.delivery.thread } : {}),
    resource: input.worker.delivery.uri,
    actor: {
      id: input.worker.delivery.targetAgent,
      role: 'worker',
    },
    data: {
      issue: input.worker.delivery.issue,
      task: input.worker.delivery.task,
      delivery: input.worker.delivery.uri,
      session: input.worker.session.uri,
      autoModeSessionId: input.autoModeSessionId,
      exitCode: input.exitCode,
    },
  }
}

async function persistSymphonyControlState(
  plan: SymphonyRunPlan,
  stage: 'planned' | 'running' | 'completed' | 'failed',
  runtime: SymphonyRuntime,
  options: { quiet?: boolean; signal?: AbortSignal } = {},
): Promise<SymphonyRunPlan> {
  throwIfAborted(options.signal)
  const persist = runtime.persistSymphonyControlStateToPod ?? runtime.persistSymphonyProjectionToPod
  if (!persist) {
    // Portable/no-Pod Symphony runtimes may use the local archive as their
    // control record. LinX product runtime always provides a Pod writer and
    // must not silently downgrade its own control-plane facts to local JSON.
    writeSymphonyRunPlan(plan)
    return plan
  }

  try {
    const result = await withAbortSignal(persist(plan, { stage }), options.signal)
    throwIfAborted(options.signal)
    if (!result) {
      throw new Error('No active Pod session; Symphony control-plane state must be written to Pod in LinX runtime.')
    }
    await mirrorSymphonyControlStateBestEffort(result, runtime, options)
    return result.plan
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Symphony Pod write failed during ${stage}: ${message}`)
  }
}

async function mirrorSymphonyControlStateBestEffort(
  result: Awaited<ReturnType<typeof persistSymphonyControlStateToPod>>,
  runtime: SymphonyRuntime,
  options: { quiet?: boolean; signal?: AbortSignal } = {},
): Promise<void> {
  throwIfAborted(options.signal)
  if (!result) {
    return
  }

  const mirror = runtime.mirrorSymphonyProjectionJsonLdFromPod
  if (!mirror) {
    return
  }

  try {
    await withAbortSignal(mirror(result), options.signal)
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    const message = error instanceof Error ? error.message : String(error)
    if (!options.quiet) {
      process.stderr.write(`[symphony] Pod JSON-LD mirror skipped: ${message}\n`)
    }
  }
}

function withUpdatedIssue(plan: SymphonyRunPlan): SymphonyRunPlan {
  const primary = plan.workers[0]
  if (!primary) {
    return plan
  }

  return {
    ...plan,
    task: primary.task,
    delivery: primary.delivery,
    session: primary.session,
  }
}

function withUpdatedWorker(plan: SymphonyRunPlan, worker: SymphonyWorkerPlan): SymphonyRunPlan {
  const workers = plan.workers.map((candidate) => (
    candidate.session.uri === worker.session.uri ? worker : candidate
  ))
  return withUpdatedIssue({
    ...plan,
    workers,
  })
}

function printSymphonyRunPlan(plan: SymphonyRunPlan, options: { dryRun: boolean }): void {
  process.stdout.write(options.dryRun ? 'LinX Secretary Symphony dry-run\n' : 'LinX Secretary Symphony dispatch\n')
  process.stdout.write(`work: ${formatSymphonyRecordSummary('issue', plan.issue)}\n`)
  for (const [index, worker] of plan.workers.entries()) {
    const prefix = plan.workers.length > 1 ? `worker ${index + 1}/${plan.workers.length}` : 'worker'
    if (worker.taskRecord) {
      process.stdout.write(`${prefix}: ${formatSymphonyRecordSummary('task', worker.taskRecord)}\n`)
    }
    process.stdout.write(`task: ${worker.task}\n`)
    process.stdout.write(`dispatch: ${formatSymphonyRecordSummary('delivery', worker.delivery)}\n`)
    process.stdout.write(`session: ${formatSymphonyRecordSummary('session', worker.session)}\n`)
  }
  process.stdout.write(`local mirror/cache: ${getSymphonyHome()}\n`)
  if (options.dryRun) {
    process.stdout.write('\nProjected runtime prompt:\n')
    process.stdout.write(`${plan.delivery.projection.prompt}\n`)
  }
}

function resolveCreatedAutoModeSessionId(beforeIds: Set<string>, runtime: SymphonyRuntime): string | undefined {
  const created = runtime.listAutoModeSessions()
    .filter((record) => !beforeIds.has(record.id))
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
  return created[0]?.id
}

function assertSymphonyWorkerModelCompatibility(
  fallbackBackend: AutoModeWorkerBackend,
  workerModel: string | undefined,
  workers: Partial<SymphonyDelegationTarget>[] | undefined,
): void {
  if (!workerModel || !isNonCodexProviderModel(workerModel)) {
    return
  }

  const targets = workers && workers.length > 0 ? workers : [{ backend: fallbackBackend }]
  const codexTarget = targets.find((target) => (target.backend ?? fallbackBackend) === 'codex')
  if (codexTarget) {
    throw new Error(`codex backend cannot run worker model ${workerModel}. Use backend claude/cc or linx for provider-routed models.`)
  }

  const claudeTarget = targets.find((target) => (target.backend ?? fallbackBackend) === 'claude')
  if (claudeTarget && isProviderRoutedClaudeModel(workerModel)) {
    throw new Error(`claude backend cannot set provider-routed worker model ${workerModel}. Configure it behind a Claude Code alias such as opus, or omit the worker model.`)
  }
}

function isNonCodexProviderModel(model: string): boolean {
  return /(?:deepseek|claude|qwen|gemini|kimi|moonshot|mistral|grok|glm|minimax)/iu.test(model)
}

function isProviderRoutedClaudeModel(model: string): boolean {
  return /(?:deepseek|qwen|gemini|kimi|moonshot|mistral|grok|glm|minimax)/iu.test(model)
}

function normalizeWorkers(
  values: string[] | undefined,
  fallbackBackend: AutoModeWorkerBackend,
  explicitTarget?: Partial<SymphonyDelegationTarget>,
): Partial<SymphonyDelegationTarget>[] | undefined {
  if (!values || values.length === 0) {
    return explicitTarget ? [explicitTarget] : undefined
  }

  return values.map((value) => {
    const [backendPart, agentPart] = value.split(':', 2)
    const backend = normalizeBackend(backendPart) ?? fallbackBackend
    const agent = normalizeOptional(agentPart) ?? `${backend}-worker`
    return {
      source: 'explicit-backend',
      backend,
      agent,
      label: agent,
    }
  })
}

function normalizeBackend(value: string | undefined): AutoModeWorkerBackend | undefined {
  const normalized = normalizeOptional(value)
  if (normalized === 'cc') {
    return 'claude'
  }
  if (normalized === 'linx' || normalized === 'codex' || normalized === 'claude' || normalized === 'codebuddy') {
    return normalized
  }
  return undefined
}

function normalizeObjective(parts?: string[]): string {
  const objective = (parts ?? [])
    .filter((item): item is string => typeof item === 'string')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!objective) {
    throw new Error('Symphony objective is required')
  }
  return objective
}

function normalizeAcceptanceCriteria(value?: string | string[]): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : []
  return values
    .flatMap((item) => item.split(/\r?\n/u))
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeMessages(value?: string[]): string[] | undefined {
  const messages = (value ?? [])
    .map((item) => normalizeOptional(item))
    .filter((item): item is string => Boolean(item))
  return messages.length > 0 ? messages : undefined
}

function resolveSymphonyAgentRuntime(argv: SymphonyRunArgs): AgentRuntimeBackendConfig | undefined {
  const explicit = normalizeAgentRuntimeConfig(argv.agentRuntime)
  const model = explicit?.model
    ?? normalizeOptional(argv.secretaryModel)
    ?? normalizeOptional(argv.model)
  if (!explicit && !model) {
    return undefined
  }

  return {
    backend: explicit?.backend ?? 'linx',
    credentialSource: explicit?.credentialSource ?? 'cloud',
    ...explicit,
    ...(model ? { model } : {}),
  }
}

function normalizeAgentRuntimeConfig(value: AgentRuntimeBackendConfig | undefined): AgentRuntimeBackendConfig | undefined {
  if (!value) {
    return undefined
  }

  const metadata = isRecord(value.metadata) ? { ...value.metadata } : undefined
  const resolved: AgentRuntimeBackendConfig = {
    ...(normalizeOptional(value.backend) ? { backend: normalizeOptional(value.backend) } : {}),
    ...(normalizeOptional(value.model) ? { model: normalizeOptional(value.model) } : {}),
    ...(normalizeOptional(value.credentialSource) ? { credentialSource: normalizeOptional(value.credentialSource) } : {}),
    ...(normalizeOptional(value.runtime) ? { runtime: normalizeOptional(value.runtime) } : {}),
    ...(normalizeOptional(value.transport) ? { transport: normalizeOptional(value.transport) } : {}),
    ...(normalizeOptional(value.endpoint) ? { endpoint: normalizeOptional(value.endpoint) } : {}),
    ...(metadata ? { metadata } : {}),
  }
  return Object.keys(resolved).length > 0 ? resolved : undefined
}

function normalizeOptional(value?: string | null): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeCommandEnv(value: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!value) {
    return undefined
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key.trim(), String(entryValue)] as const)
    .filter(([key]) => Boolean(key))

  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function normalizeCredentialSource(value: AutoModeCredentialSource | undefined): AutoModeCredentialSource | undefined {
  return value === 'local' ? 'local' : value === 'cloud' ? 'cloud' : undefined
}

function normalizePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  const normalized = Math.trunc(value)
  return normalized > 0 ? normalized : undefined
}

function createAbortError(message = 'The operation was aborted.'): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return
  }

  const reason = signal.reason
  if (reason instanceof Error) {
    throw reason
  }
  throw createAbortError(typeof reason === 'string' && reason.trim() ? reason : undefined)
}

function withAbortSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise
  }
  throwIfAborted(signal)

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason instanceof Error
      ? signal.reason
      : createAbortError(typeof signal.reason === 'string' && signal.reason.trim() ? signal.reason : undefined))
    signal.addEventListener('abort', onAbort, { once: true })
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function resolveWorkspaceMetadata(cwd: string, argv: SymphonyRunArgs): {
  kind: WorkerWorkspaceKind
  repository?: string
  branch?: string
  worktree?: string
  baseRevision?: string
} {
  const git = isGitWorkspace(cwd)
  return {
    kind: argv.workspaceKind ?? (git ? 'git' : 'folder'),
    repository: normalizeOptional(argv.repository) ?? (git ? gitOutput(cwd, ['remote', 'get-url', 'origin']) : undefined),
    branch: normalizeOptional(argv.branch) ?? (git ? gitOutput(cwd, ['branch', '--show-current']) : undefined),
    worktree: normalizeOptional(argv.worktree) ?? (git ? gitOutput(cwd, ['rev-parse', '--show-toplevel']) : undefined),
    baseRevision: git ? gitOutput(cwd, ['rev-parse', 'HEAD']) : undefined,
  }
}

function isGitWorkspace(cwd: string): boolean {
  return gitOutput(cwd, ['rev-parse', '--is-inside-work-tree']) === 'true'
}

function gitOutput(cwd: string, args: string[]): string | undefined {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  if ((result.status ?? 1) !== 0) {
    return undefined
  }

  return normalizeOptional(result.stdout)
}
