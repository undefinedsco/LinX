import type { AutoModeMode, AutoModeWorkerBackend } from './auto-mode.js'
import { summarizeReconcileDecision, type ReconcileDecision, type ReconcileDecisionSummary } from './reconciler.js'
import { decideThreadControlEvent } from './thread-reconciler-controller.js'

export const SYMPHONY_HOME_DIRNAME = 'symphony'
export const SYMPHONY_IDEAS_DIRNAME = 'ideas'
export const SYMPHONY_ISSUES_DIRNAME = 'issues'
export const SYMPHONY_TASKS_DIRNAME = 'tasks'
export const SYMPHONY_DELIVERIES_DIRNAME = 'deliveries'
export const SYMPHONY_SESSIONS_DIRNAME = 'sessions'

export const SYMPHONY_IDEA_FILE_NAME = 'idea.json'
export const SYMPHONY_ISSUE_FILE_NAME = 'issue.json'
export const SYMPHONY_TASK_FILE_NAME = 'task.json'
export const SYMPHONY_DELIVERY_FILE_NAME = 'delivery.json'
export const SYMPHONY_SESSION_FILE_NAME = 'session.json'

const SYMPHONY_URI_PREFIX = 'urn:undefineds:linx'

export type WorkerWorkspaceKind = 'git' | 'folder'
export type SymphonyIdeaStatus = 'captured' | 'exploring' | 'candidate' | 'promoted' | 'deferred' | 'rejected' | 'superseded'
export type SymphonyIdeaCommitment = 'thought' | 'direction' | 'tentative_decision' | 'committed'
export type SymphonyIssueStatus = 'open' | 'triaging' | 'in_progress' | 'blocked' | 'resolved' | 'closed'
export type SymphonyTaskStatus = 'pending' | 'running' | 'completed' | 'failed'
export type SymphonyDeliveryStatus = 'pending' | 'dispatched' | 'completed' | 'failed'
export type SymphonySessionStatus = 'planned' | 'running' | 'completed' | 'failed'
export type SymphonyProjectionRole = 'user' | 'system' | 'tool'
export type SymphonyResourceKind = 'idea' | 'issue' | 'task' | 'delivery' | 'session'

export interface SymphonyReconcilerState {
  decisions: ReconcileDecisionSummary[]
}

export interface WorkerWorkspaceRef {
  path: string
  kind: WorkerWorkspaceKind
  repository?: string
  branch?: string
  worktree?: string
  workspace?: string
  baseRevision?: string
  environment?: SymphonyWorkerEnvironmentRef
}


export interface SymphonyWorkerEnvironmentRef {
  kind: 'local-shell' | 'remote-container' | 'cloud-runner' | 'backend-runtime' | 'unknown'
  id?: string
  label?: string
  runtime?: AutoModeWorkerBackend | string
}

export interface SymphonySupervisorPolicy {
  strategy: 'interval'
  intervalMs: number
  immediateWakeKinds: string[]
}

export interface SymphonyIssuerRef extends SymphonyChatThreadRef {
  source: 'user' | 'secretary' | 'system'
  webId?: string
  agent?: string
  label?: string
}

export interface SymphonyChatThreadRef {
  chat?: string
  thread?: string
  messages?: string[]
}

export type SymphonyDelegationTargetSource = 'active-session' | 'group-chat' | 'ai-contact' | 'explicit-backend' | 'default'

export interface SymphonyDelegationTarget extends SymphonyChatThreadRef {
  source: SymphonyDelegationTargetSource
  backend: AutoModeWorkerBackend
  contact?: string
  agent?: string
  label?: string
}

export interface SymphonyIdeaRecord extends SymphonyChatThreadRef {
  uri: string
  summary: string
  input?: string
  status: SymphonyIdeaStatus
  commitment: SymphonyIdeaCommitment
  source: 'cli'
  affectedArea?: string
  currentUnderstanding?: string
  openQuestions: string[]
  relatedRecords: string[]
  conflicts: string[]
  nextStep?: string
  promotedTo?: string
  createdAt: string
  updatedAt: string
}

export interface SymphonyIssueRecord extends SymphonyChatThreadRef {
  uri: string
  title: string
  description?: string
  status: SymphonyIssueStatus
  priority: 'low' | 'medium' | 'high' | 'urgent'
  source: 'cli'
  issuer: SymphonyIssuerRef
  tasks: string[]
  deliveries: string[]
  sessions: string[]
  createdAt: string
  updatedAt: string
  closedAt?: string
  error?: string
}

export interface SymphonyTaskRecord extends SymphonyChatThreadRef {
  uri: string
  issue: string
  title: string
  objective: string
  acceptanceCriteria: string[]
  status: SymphonyTaskStatus
  target: SymphonyDelegationTarget
  backend: AutoModeWorkerBackend
  contact?: string
  agent?: string
  delivery: string
  session: string
  reconciler?: SymphonyReconcilerState
  createdAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface SymphonyDeliveryRecord extends SymphonyChatThreadRef {
  uri: string
  issue: string
  task: string
  type: 'task_dispatch'
  status: SymphonyDeliveryStatus
  sourceAgent: '__secretary__'
  targetBackend: AutoModeWorkerBackend
  targetAgent: string
  target: SymphonyDelegationTarget
  projection: {
    runtimeRole: SymphonyProjectionRole
    prompt: string
  }
  session?: string
  autoModeSessionId?: string
  reconciler?: SymphonyReconcilerState
  createdAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface SymphonySessionRecord extends SymphonyChatThreadRef {
  uri: string
  issue: string
  task: string
  delivery: string
  backend: AutoModeWorkerBackend
  mode: AutoModeMode
  secretaryAutoEnabled?: boolean
  status: SymphonySessionStatus
  cwd: string
  workspaceRef?: WorkerWorkspaceRef
  target: SymphonyDelegationTarget
  model?: string
  supervisor?: SymphonySupervisorPolicy
  autoModeSessionId?: string
  dryRun?: boolean
  exitCode?: number | null
  reconciler?: SymphonyReconcilerState
  createdAt: string
  updatedAt: string
  completedAt?: string
  error?: string
}

export interface SymphonyRunPlan {
  issue: SymphonyIssueRecord
  task: string
  taskRecord: SymphonyTaskRecord
  delivery: SymphonyDeliveryRecord
  session: SymphonySessionRecord
  workers: SymphonyWorkerPlan[]
}

export interface SymphonyWorkerPlan {
  task: string
  taskRecord: SymphonyTaskRecord
  delivery: SymphonyDeliveryRecord
  session: SymphonySessionRecord
}

export interface SymphonyWorkerSpec extends Partial<SymphonyDelegationTarget> {
  title?: string
  objective?: string
  acceptanceCriteria?: string[]
  model?: string
  supervisorIntervalMs?: number
  workspace?: Partial<WorkerWorkspaceRef>
}

export interface CreateSymphonyRunPlanInput {
  objective: string
  title?: string
  acceptanceCriteria?: string[]
  workspacePath: string
  workspaceKind?: WorkerWorkspaceKind
  repository?: string
  branch?: string
  worktree?: string
  workspace?: string
  baseRevision?: string
  environment?: Partial<SymphonyWorkerEnvironmentRef>
  backend: AutoModeWorkerBackend
  mode: AutoModeMode
  secretaryAutoEnabled?: boolean
  model?: string
  workerModel?: string
  workerSupervisorIntervalMs?: number
  chat?: string
  thread?: string
  messages?: string[]
  issuer?: Partial<SymphonyIssuerRef>
  target?: Partial<SymphonyDelegationTarget>
  workers?: SymphonyWorkerSpec[]
  now?: Date
  randomId?: string
}

export function createSymphonyIdeaUri(options: { now?: Date; randomId?: string } = {}): string {
  return createSymphonyResourceUri('idea', options)
}

export function createSymphonyIssueUri(options: { now?: Date; randomId?: string } = {}): string {
  return createSymphonyResourceUri('issue', options)
}

export function createTaskUri(options: { now?: Date; randomId?: string } = {}): string {
  return createSymphonyResourceUri('task', options)
}

export function createSymphonyDeliveryUri(options: { now?: Date; randomId?: string } = {}): string {
  return createSymphonyResourceUri('delivery', options)
}

export function createSymphonySessionUri(options: { now?: Date; randomId?: string } = {}): string {
  return createSymphonyResourceUri('session', options)
}

export function getSymphonyArchiveRelativePaths(uri: string, kind: SymphonyResourceKind): {
  dir: string
  file: string
} {
  const key = getSymphonyArchiveKey(uri)
  const dirNameByKind: Record<SymphonyResourceKind, string> = {
    idea: SYMPHONY_IDEAS_DIRNAME,
    issue: SYMPHONY_ISSUES_DIRNAME,
    task: SYMPHONY_TASKS_DIRNAME,
    delivery: SYMPHONY_DELIVERIES_DIRNAME,
    session: SYMPHONY_SESSIONS_DIRNAME,
  }
  const fileNameByKind: Record<SymphonyResourceKind, string> = {
    idea: SYMPHONY_IDEA_FILE_NAME,
    issue: SYMPHONY_ISSUE_FILE_NAME,
    task: SYMPHONY_TASK_FILE_NAME,
    delivery: SYMPHONY_DELIVERY_FILE_NAME,
    session: SYMPHONY_SESSION_FILE_NAME,
  }
  const dirName = dirNameByKind[kind]
  const fileName = fileNameByKind[kind]

  return {
    dir: `${dirName}/${key}`,
    file: `${dirName}/${key}/${fileName}`,
  }
}

export function createRunPlan(input: CreateSymphonyRunPlanInput): SymphonyRunPlan {
  const now = input.now ?? new Date()
  const timestamp = now.toISOString()
  const randomId = normalizeSymphonyRandomId(input.randomId)
  const uriOptions = { now, randomId }
  const objective = normalizeRequiredText(input.objective, 'objective')
  const title = normalizeOptionalText(input.title) ?? createSymphonyTitle(objective)
  const acceptanceCriteria = normalizeSymphonyAcceptanceCriteria(input.acceptanceCriteria)
  const issuer = normalizeSymphonyIssuer(input)
  const workerSpecs = normalizeSymphonyWorkerSpecs(input)
  const primaryTarget = workerSpecs[0]!.target
  const chatThread = normalizeSymphonyChatThreadRef({
    chat: normalizeOptionalText(input.chat) ?? primaryTarget.chat,
    thread: normalizeOptionalText(input.thread) ?? primaryTarget.thread,
    messages: input.messages ?? primaryTarget.messages,
  })
  const workspace: WorkerWorkspaceRef = {
    path: normalizeRequiredText(input.workspacePath, 'workspacePath'),
    kind: input.workspaceKind ?? 'folder',
    ...(normalizeOptionalText(input.repository) ? { repository: normalizeOptionalText(input.repository) } : {}),
    ...(normalizeOptionalText(input.branch) ? { branch: normalizeOptionalText(input.branch) } : {}),
    ...(normalizeOptionalText(input.worktree) ? { worktree: normalizeOptionalText(input.worktree) } : {}),
    ...(normalizeOptionalText(input.workspace) ? { workspace: normalizeOptionalText(input.workspace) } : {}),
    ...(normalizeOptionalText(input.baseRevision) ? { baseRevision: normalizeOptionalText(input.baseRevision) } : {}),
    environment: normalizeSymphonyWorkerEnvironment(input.environment, input.backend),
  }
  const issueUri = createSymphonyIssueUri(uriOptions)
  const workerUris = workerSpecs.map((_, index) => createSymphonyWorkerUris(uriOptions, index))

  const issue: SymphonyIssueRecord = {
    uri: issueUri,
    title,
    description: objective,
    status: 'open',
    priority: 'medium',
    source: 'cli',
    issuer,
    tasks: workerUris.map((item) => item.task),
    deliveries: workerUris.map((item) => item.delivery),
    sessions: workerUris.map((item) => item.session),
    ...chatThread,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const workers = workerSpecs.map((spec, index): SymphonyWorkerPlan => {
    const uris = workerUris[index]!
    const target = spec.target
    const workerWorkspace = normalizeSymphonyWorkerWorkspace(workspace, spec.workspace, target.backend)
    const workerObjective = spec.objective
    const workerTitle = spec.title ?? createSymphonyTitle(workerObjective)
    const workerAcceptanceCriteria = spec.acceptanceCriteria.length > 0
      ? spec.acceptanceCriteria
      : acceptanceCriteria
    const workerChatThread = normalizeSymphonyChatThreadRef({
      chat: target.chat ?? chatThread.chat,
      thread: target.thread ?? chatThread.thread,
      messages: target.messages ?? chatThread.messages,
    })
    const targetAgent = target.agent ?? target.contact ?? target.backend
    const dispatchReconciler = createSymphonyDispatchReconcilerState({
      issue: issueUri,
      task: uris.task,
      delivery: uris.delivery,
      session: uris.session,
      chat: workerChatThread.chat,
      thread: workerChatThread.thread,
      targetAgent,
      now,
      randomId: `${randomId}-w${index + 1}-dispatch`,
    })
    const taskRecord: SymphonyTaskRecord = {
      uri: uris.task,
      issue: issueUri,
      title: workerTitle,
      objective: workerObjective,
      acceptanceCriteria: workerAcceptanceCriteria,
      status: 'pending',
      target,
      backend: target.backend,
      ...(target.agent ? { agent: target.agent } : {}),
      delivery: uris.delivery,
      session: uris.session,
      reconciler: dispatchReconciler,
      ...workerChatThread,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const session: SymphonySessionRecord = {
      uri: uris.session,
      issue: issueUri,
      task: uris.task,
      delivery: uris.delivery,
      backend: target.backend,
      mode: input.mode,
      ...(input.secretaryAutoEnabled !== undefined ? { secretaryAutoEnabled: input.secretaryAutoEnabled } : {}),
      status: 'planned',
      cwd: workerWorkspace.path,
      workspaceRef: workerWorkspace,
      target,
      ...(spec.model ? { model: spec.model } : {}),
      ...(spec.supervisor ? { supervisor: spec.supervisor } : {}),
      reconciler: dispatchReconciler,
      ...workerChatThread,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const delivery: SymphonyDeliveryRecord = {
      uri: uris.delivery,
      issue: issueUri,
      task: uris.task,
      type: 'task_dispatch',
      status: 'pending',
      sourceAgent: '__secretary__',
      targetBackend: target.backend,
      targetAgent,
      target,
      projection: {
        runtimeRole: 'user',
        prompt: renderSymphonyRuntimePrompt({
          issue,
          task: uris.task,
          objective: workerObjective,
          acceptanceCriteria: workerAcceptanceCriteria,
          workspace: workerWorkspace,
          backend: target.backend,
          mode: input.mode,
          secretaryAutoEnabled: input.secretaryAutoEnabled,
          session: uris.session,
          target,
          issuer,
          workerIndex: index + 1,
          workerCount: workerSpecs.length,
        }),
      },
      session: uris.session,
      reconciler: dispatchReconciler,
      ...workerChatThread,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    return { task: uris.task, taskRecord, delivery, session }
  })

  const primary = workers[0]!
  return { issue, task: primary.task, taskRecord: primary.taskRecord, delivery: primary.delivery, session: primary.session, workers }
}

export function appendSymphonyReconcilerDecision<T extends { reconciler?: SymphonyReconcilerState }>(
  record: T,
  decision: ReconcileDecision | ReconcileDecisionSummary,
): T {
  const summary = isReconcileDecisionSummary(decision)
    ? decision
    : summarizeReconcileDecision(decision)
  return {
    ...record,
    reconciler: {
      decisions: [
        ...(record.reconciler?.decisions ?? []),
        summary,
      ],
    },
  }
}

export function renderSymphonyRuntimePrompt(input: {
  issue?: SymphonyIssueRecord
  task: string
  objective: string
  acceptanceCriteria?: string[]
  workspace: WorkerWorkspaceRef
  backend: AutoModeWorkerBackend
  mode: AutoModeMode
  secretaryAutoEnabled?: boolean
  session: string
  target?: SymphonyDelegationTarget
  issuer?: SymphonyIssuerRef
  workerIndex?: number
  workerCount?: number
}): string {
  const acceptanceCriteria = normalizeSymphonyAcceptanceCriteria(input.acceptanceCriteria)
  const criteria = acceptanceCriteria.length > 0
    ? acceptanceCriteria.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : [
      '1. Infer concrete acceptance criteria from the delegated objective, source context, and repository state.',
      '2. If the objective cannot be made testable without a user decision, report the blocker to AI Secretary instead of guessing.',
      '3. Otherwise complete the objective and report concrete verification evidence.',
    ].join('\n')
  const workThread = normalizeOptionalText(input.target?.thread ?? input.issue?.thread ?? input.issuer?.thread)

  return [
    '# LinX Symphony Task',
    '',
    ...(input.issue ? [`Issue URI: ${input.issue.uri}`] : []),
    `Task URI: ${input.task}`,
    `Session URI: ${input.session}`,
    `Backend: ${input.backend}`,
    `Worker mode: ${input.mode}`,
    `Secretary auto: ${input.secretaryAutoEnabled === true ? 'on' : 'off'}`,
    ...(input.issuer?.webId ? [`Issuer WebID: ${input.issuer.webId}`] : []),
    ...(input.issuer?.agent ? [`Issuer agent: ${input.issuer.agent}`] : []),
    ...(input.issuer?.chat ? [`Issuer chat: ${input.issuer.chat}`] : []),
    ...(input.issuer?.thread ? [`Issuer thread: ${input.issuer.thread}`] : []),
    ...(input.target?.chat ? [`Target chat: ${input.target.chat}`] : []),
    ...(input.target?.thread ? [`Target thread: ${input.target.thread}`] : []),
    ...(input.target?.contact ? [`Target contact: ${input.target.contact}`] : []),
    ...(input.target?.agent ? [`Target agent: ${input.target.agent}`] : []),
    ...(input.workerIndex && input.workerCount ? [`Worker: ${input.workerIndex}/${input.workerCount}`] : []),
    ...(workThread ? [`Work thread: ${workThread}`] : []),
    `Workspace: ${input.workspace.path}`,
    `Workspace kind: ${input.workspace.kind}`,
    ...(input.workspace.workspace ? [`Workspace resource: ${input.workspace.workspace}`] : []),
    ...(input.workspace.repository ? [`Workspace repository: ${input.workspace.repository}`] : []),
    ...(input.workspace.branch ? [`Workspace branch: ${input.workspace.branch}`] : []),
    ...(input.workspace.baseRevision ? [`Workspace base revision: ${input.workspace.baseRevision}`] : []),
    ...(input.workspace.environment ? [`Workspace environment: ${formatSymphonyWorkerEnvironment(input.workspace.environment)}`] : []),
    '',
    '## Runtime Space Contract',
    '- Shared control space: Idea/Issue/Report/Evidence are file-primary Pod resources with structured meta; Task, Delivery, Session, Run, and RunStep are TTL control resources. Use the provided URIs as the common coordination surface with AI Secretary and product UI.',
    '- Explicit session topology: you may be collaborating in the same room as Secretary or running in a runtime-projected worker session reached through control events. Follow the provided chat/thread/session targets; do not infer topology from workspace sharing.',
    '- Thread reconciliation: messages, input/approval requests, blockers, schedule ticks, and Delivery submissions enter the Thread first; the Reconciler/Scheduler wakes Secretary or workers.',
    '- Report through Delivery plus file-primary Report/Evidence: return progress, blockers, implementation change requests, and verification so AI Secretary can persist structured control facts and Pod files without inlining long logs into TTL.',
    '- Thread workspace: workers assigned to the same Thread in the same environment should normally share this workspace; independent Threads may use separate worktrees.',
    '- Environment-scoped identity: cross-environment file identity requires revision, artifact, patch, checksum, or evidence references.',
    '',
    '## Objective',
    input.objective,
    '',
    '## Acceptance Criteria',
    criteria,
    '',
    '## Execution Contract',
    '- Start and maintain this as the active goal for the worker session until the acceptance criteria are met.',
    '- Work only inside the workspace unless the task explicitly requires otherwise.',
    '- Treat this prompt as a delegated task from the user via AI Secretary.',
    '- Treat later Secretary messages in this session as Steer or follow-up Delivery updates, not as a replacement for the Goal.',
    '- Report blockers to AI Secretary instead of asking the user directly.',
    '- Do not read sibling worker transcripts unless Secretary explicitly includes them in a Delivery.',
    '- Preserve a concise report with changed files, commands run, and remaining risks.',
    '- In the final report, explicitly list follow-up candidates separately from assigned-work evidence: new defects, missing shared abstractions, app-local glue to move into shared models, storage, or adapter packages, live verification gaps, or deferred cleanup. Secretary classifies these; do not create or close Issues yourself.',
    '- If blocked by missing credentials, destructive actions, or unclear scope, report the blocker instead of guessing.',
    '- Your workspace path is local to this worker environment. Same-Thread workers in this environment may share it, but do not assume Secretary, the user, or workers in other environments can access the same absolute path.',
    '- When reporting file work across environments, include repo-relative paths plus base revision, checksums/etags, patch or artifact references, and verification evidence.',
    '',
    '## Pod And Control Record Boundary',
    '- In LinX runtime, Pod control records are authoritative. Local files are mirrors, logs, or portable-runtime fallbacks.',
    '- If Pod/model tools are available, read only the assigned Issue document/meta, Task, Delivery, Run, source context, and existing Report/Evidence files needed for this task.',
    '- Write only execution facts for the assigned work: Run/RunStep progress, blockers, file-primary Evidence/Report, Delivery report metadata, or Implementation Change Request.',
    '- Do not close Issues, rewrite Spec/current truth, change acceptance criteria, change work split, alter release or roadmap state, create grants, or mutate sibling worker state.',
    '- Use shared model/ORM surfaces when writing structured Pod data. Do not hand-patch business TTL or invent Pod paths.',
    '- If Pod access is unavailable, return the same facts as a structured report so AI Secretary can persist them.',
    '',
    '## Documentation Authority',
    '- Pod Issue files plus meta, Spec files, and Task control records are the authority for status, scope, acceptance, split, ownership, closure, and cross-client coordination.',
    '- Repository docs are the implementation authority for code-adjacent design, behavior notes, tests, examples, migration details, and file-level evidence.',
    '- When you edit repository docs, reference the Pod Issue/Spec/Task URI instead of creating a second Issue truth.',
    '- If repository findings contradict the Pod control record, write an Implementation Change Request instead of silently changing acceptance or scope.',
  ].join('\n')
}

function createSymphonyDispatchReconcilerState(input: {
  issue: string
  task: string
  delivery: string
  session: string
  chat?: string
  thread?: string
  targetAgent: string
  now: Date
  randomId: string
}): SymphonyReconcilerState {
  const { summary } = decideThreadControlEvent({
    policy: {
      kind: 'symphony',
      assignedWorkerAgent: input.targetAgent,
      secretaryAgent: '__secretary__',
    },
    event: {
      type: 'delivery.submitted',
      ...(input.chat ? { chat: input.chat } : {}),
      ...(input.thread ? { thread: input.thread } : {}),
      resource: input.delivery,
      actor: {
        id: '__secretary__',
        role: 'secretary',
      },
      data: {
        deliveryType: 'task_dispatch',
        issue: input.issue,
        task: input.task,
        delivery: input.delivery,
        session: input.session,
      },
    },
    now: input.now,
    randomId: input.randomId,
  })
  return {
    decisions: [summary],
  }
}

function isReconcileDecisionSummary(
  decision: ReconcileDecision | ReconcileDecisionSummary,
): decision is ReconcileDecisionSummary {
  return 'eventType' in decision
}

export function formatSymphonySessionSummary(session: SymphonySessionRecord): string {
  const linked = session.autoModeSessionId ? ` -> ${session.autoModeSessionId}` : ''
  return `${formatSymphonyUri(session.uri)} ${session.status} ${session.backend}/${session.mode}${linked} (${session.cwd})`
}

export function formatSymphonyDeliverySummary(delivery: SymphonyDeliveryRecord): string {
  return `${formatSymphonyUri(delivery.uri)} ${delivery.status} ${delivery.sourceAgent} -> ${delivery.targetBackend} (${formatSymphonyUri(delivery.issue)}/${formatSymphonyUri(delivery.task)})`
}

export function formatSymphonyIssueSummary(issue: SymphonyIssueRecord): string {
  return `${formatSymphonyUri(issue.uri)} ${issue.status} ${issue.title} (${issue.tasks.length} task${issue.tasks.length === 1 ? '' : 's'})`
}

export function getSymphonyArchiveKey(uri: string): string {
  const trimmed = uri.trim()
  if (!trimmed) {
    throw new Error('Missing Symphony resource URI')
  }
  const tail = trimmed.match(/[:/#]([^:/#]+)$/u)?.[1] ?? trimmed
  const key = decodeURIComponent(tail)
    .replace(/[^a-zA-Z0-9._-]/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
  return key || Buffer.from(trimmed).toString('base64url')
}

function createSymphonyResourceUri(kind: SymphonyResourceKind, options: { now?: Date; randomId?: string } = {}): string {
  const key = `${kind}_${formatSymphonyTimestamp(options.now)}_${normalizeSymphonyRandomId(options.randomId)}`
  return `${SYMPHONY_URI_PREFIX}:${kind}:${key}`
}

function formatSymphonyUri(uri: string): string {
  return getSymphonyArchiveKey(uri)
}

function createSymphonyTitle(objective: string): string {
  const compact = objective.replace(/\s+/gu, ' ').trim()
  return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact
}

function normalizeSymphonyAcceptanceCriteria(criteria?: string[]): string[] {
  return (criteria ?? [])
    .flatMap((item) => item.split(/\r?\n/u))
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeRequiredText(value: string | undefined, name: string): string {
  const normalized = normalizeOptionalText(value)
  if (!normalized) {
    throw new Error(`Missing Symphony ${name}`)
  }
  return normalized
}

function normalizeOptionalText(value: string | undefined | null): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || undefined
}

function normalizeSymphonyChatThreadRef(
  input: Pick<CreateSymphonyRunPlanInput, 'chat' | 'thread' | 'messages'>,
): SymphonyChatThreadRef {
  const chat = normalizeOptionalText(input.chat)
  const thread = normalizeOptionalText(input.thread)
  const messages = (input.messages ?? [])
    .map((item) => normalizeOptionalText(item))
    .filter((item): item is string => Boolean(item))
  return {
    ...(chat ? { chat } : {}),
    ...(thread ? { thread } : {}),
    ...(messages.length > 0 ? { messages } : {}),
  }
}

function createSymphonyWorkerUris(
  options: { now?: Date; randomId?: string },
  index: number,
): { task: string; delivery: string; session: string } {
  if (index === 0) {
    return {
      task: createTaskUri(options),
      delivery: createSymphonyDeliveryUri(options),
      session: createSymphonySessionUri(options),
    }
  }

  const suffix = `w${index + 1}`
  return {
    task: createTaskUri({ ...options, randomId: `${normalizeSymphonyRandomId(options.randomId)}-${suffix}` }),
    delivery: createSymphonyDeliveryUri({ ...options, randomId: `${normalizeSymphonyRandomId(options.randomId)}-${suffix}` }),
    session: createSymphonySessionUri({ ...options, randomId: `${normalizeSymphonyRandomId(options.randomId)}-${suffix}` }),
  }
}

function normalizeSymphonyWorkerWorkspace(
  root: WorkerWorkspaceRef,
  override: Partial<WorkerWorkspaceRef> | undefined,
  backend: AutoModeWorkerBackend,
): WorkerWorkspaceRef {
  const path = normalizeOptionalText(override?.path) ?? root.path
  return {
    path,
    kind: override?.kind ?? root.kind,
    ...(normalizeOptionalText(override?.repository ?? root.repository) ? { repository: normalizeOptionalText(override?.repository ?? root.repository) } : {}),
    ...(normalizeOptionalText(override?.branch ?? root.branch) ? { branch: normalizeOptionalText(override?.branch ?? root.branch) } : {}),
    ...(normalizeOptionalText(override?.worktree ?? root.worktree) ? { worktree: normalizeOptionalText(override?.worktree ?? root.worktree) } : {}),
    ...(normalizeOptionalText(override?.workspace ?? root.workspace) ? { workspace: normalizeOptionalText(override?.workspace ?? root.workspace) } : {}),
    ...(normalizeOptionalText(override?.baseRevision ?? root.baseRevision) ? { baseRevision: normalizeOptionalText(override?.baseRevision ?? root.baseRevision) } : {}),
    environment: normalizeSymphonyWorkerEnvironment(override?.environment ?? root.environment, backend),
  }
}

function normalizeSymphonyWorkerEnvironment(
  environment: Partial<SymphonyWorkerEnvironmentRef> | undefined,
  backend: AutoModeWorkerBackend,
): SymphonyWorkerEnvironmentRef {
  const kind = environment?.kind ?? (backend === 'codex' || backend === 'claude' || backend === 'codebuddy' ? 'backend-runtime' : 'local-shell')
  return {
    kind,
    ...(normalizeOptionalText(environment?.id) ? { id: normalizeOptionalText(environment?.id) } : {}),
    ...(normalizeOptionalText(environment?.label) ? { label: normalizeOptionalText(environment?.label) } : {}),
    runtime: normalizeOptionalText(environment?.runtime) ?? backend,
  }
}

function formatSymphonyWorkerEnvironment(environment: SymphonyWorkerEnvironmentRef): string {
  return [
    environment.kind,
    environment.runtime ? `runtime=${environment.runtime}` : undefined,
    environment.id ? `id=${environment.id}` : undefined,
    environment.label ? `label=${environment.label}` : undefined,
  ].filter(Boolean).join(' ')
}

function normalizeSymphonyIssuer(input: CreateSymphonyRunPlanInput): SymphonyIssuerRef {
  const explicit = input.issuer ?? {}
  const chatThread = normalizeSymphonyChatThreadRef({
    chat: explicit.chat ?? input.chat,
    thread: explicit.thread ?? input.thread,
    messages: explicit.messages ?? input.messages,
  })

  return {
    source: explicit.source ?? 'user',
    ...(normalizeOptionalText(explicit.webId) ? { webId: normalizeOptionalText(explicit.webId) } : {}),
    ...(normalizeOptionalText(explicit.agent) ? { agent: normalizeOptionalText(explicit.agent) } : {}),
    ...(normalizeOptionalText(explicit.label) ? { label: normalizeOptionalText(explicit.label) } : {}),
    ...chatThread,
  }
}

function normalizeSymphonyWorkerSpecs(input: CreateSymphonyRunPlanInput): Array<{
  target: SymphonyDelegationTarget
  title?: string
  objective: string
  acceptanceCriteria: string[]
  model?: string
  supervisor?: SymphonySupervisorPolicy
  workspace?: Partial<WorkerWorkspaceRef>
}> {
  const workers: SymphonyWorkerSpec[] = input.workers && input.workers.length > 0 ? input.workers : [input.target ?? {}]
  const rootObjective = normalizeRequiredText(input.objective, 'objective')
  const rootAcceptanceCriteria = normalizeSymphonyAcceptanceCriteria(input.acceptanceCriteria)
  return workers.map((worker, index) => {
    const target = normalizeSymphonyDelegationTarget({
      ...input,
      target: {
        ...worker,
        backend: worker.backend ?? input.backend,
      },
    })
    const objective = normalizeOptionalText(worker.objective) ?? rootObjective
    const label = normalizeOptionalText(worker.label) ?? normalizeOptionalText(worker.agent)
    const title = normalizeOptionalText(worker.title)
      ?? (workers.length > 1 && label ? createSymphonyTitle(`${label}: ${objective}`) : undefined)
      ?? (workers.length > 1 ? createSymphonyTitle(`Worker ${index + 1}: ${objective}`) : undefined)
    const acceptanceCriteria = normalizeSymphonyAcceptanceCriteria(worker.acceptanceCriteria)
    const model = normalizeOptionalText(worker.model) ?? normalizeOptionalText(input.workerModel) ?? normalizeOptionalText(input.model)
    const supervisor = createSymphonySupervisorPolicy(worker.supervisorIntervalMs ?? input.workerSupervisorIntervalMs)

    return {
      target,
      ...(title ? { title } : {}),
      objective,
      acceptanceCriteria: acceptanceCriteria.length > 0 ? acceptanceCriteria : rootAcceptanceCriteria,
      ...(model ? { model } : {}),
      ...(supervisor ? { supervisor } : {}),
      ...(worker.workspace ? { workspace: worker.workspace } : {}),
    }
  })
}

function createSymphonySupervisorPolicy(intervalMs: unknown): SymphonySupervisorPolicy | undefined {
  const normalized = typeof intervalMs === 'number' && Number.isFinite(intervalMs)
    ? Math.trunc(intervalMs)
    : undefined
  if (!normalized || normalized <= 0) {
    return undefined
  }

  return {
    strategy: 'interval',
    intervalMs: normalized,
    immediateWakeKinds: ['approval', 'question', 'blocked', 'failed', 'completed'],
  }
}

function normalizeSymphonyDelegationTarget(input: CreateSymphonyRunPlanInput): SymphonyDelegationTarget {
  const explicit = input.target ?? {}
  const backend = explicit.backend ?? input.backend
  const chatThread = normalizeSymphonyChatThreadRef({
    chat: explicit.chat ?? input.chat,
    thread: explicit.thread ?? input.thread,
    messages: explicit.messages ?? input.messages,
  })
  const contact = normalizeOptionalText(explicit.contact) ?? normalizeOptionalText(explicit.agent) ?? backend
  const agent = normalizeOptionalText(explicit.agent) ?? contact
  const label = normalizeOptionalText(explicit.label)
  const source = explicit.source
    ?? (chatThread.chat || chatThread.thread
      ? 'active-session'
      : input.target
        ? 'explicit-backend'
        : 'default')

  return {
    source,
    backend,
    contact,
    agent,
    ...(label ? { label } : {}),
    ...chatThread,
  }
}

function formatSymphonyTimestamp(now: Date = new Date()): string {
  return now.toISOString().replace(/[:.]/gu, '-')
}

function normalizeSymphonyRandomId(randomId?: string): string {
  const normalized = typeof randomId === 'string'
    ? randomId.replace(/[^a-zA-Z0-9_-]/gu, '').slice(0, 12)
    : ''
  return normalized || Math.random().toString(36).slice(2, 10)
}
