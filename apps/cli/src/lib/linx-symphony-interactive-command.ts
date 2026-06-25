import type { AgentRuntimeBackendConfig } from '@linx/agent-runtime'
import type { AutoModeCredentialSource, AutoModeWorkerBackend } from './auto-mode/types.js'
import { runSymphony } from './symphony/run.js'
import { createSymphonyRuntimeForPodProjection } from './symphony/runtime.js'
import { formatSymphonyStatus } from './symphony/status.js'
import { showLinxInteractiveError } from './linx-interactive-error-display.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'
import { DEFAULT_SECRETARY_CHAT_ID, secretaryChatUri, secretaryThreadUri } from './pod-mirror-mapping.js'
import { getSessionControlManager } from './session-control.js'
import { resolveInteractiveCwd } from './linx-workspace-command.js'
import {
  createSymphonyIdeaRecord,
  type CaptureSymphonyIdeaInput,
} from './symphony/archive.js'
import { persistSymphonyIdeaToPod } from './symphony/pod-projection.js'
import { registerLinxInteractiveSubmitHandler } from './linx-interactive-submit-router.js'
import { setLinxInteractiveEditorText } from './linx-interactive-editor-text-host.js'
import { getLinxInteractiveRuntime, resolveLinxInteractivePodWebId } from './linx-interactive-runtime-host.js'
import { resolveLinxSessionId, resolveLinxSessionModelId } from './linx-session-metadata.js'
import { queueLinxInteractiveSessionRuntimeProjection } from './linx-session-work-control.js'
import {
  getLinxInteractiveListSymphonyIssues,
  getLinxInteractiveListSymphonySessions,
  getLinxInteractiveRunSymphony,
  isLinxInteractiveAutoModeEnabled,
  getLinxInteractiveSymphonyAgentRuntime,
  getLinxInteractiveSymphonyAgentRuntimeConfig,
  getLinxInteractiveSymphonyDispatchControllers,
  getLinxInteractiveSymphonyDispatches,
  getLinxInteractiveSymphonyModeGeneration,
  getLinxInteractiveSymphonyPodProjectionRuntime,
  getLinxInteractiveSymphonyStatusPodTimeoutMs,
  getLinxInteractiveSymphonyWorkerBackend,
  getLinxInteractiveSymphonyWorkerCredentialSource,
  getLinxInteractiveSymphonyWorkerModel,
  getLinxInteractiveSymphonyWorkerSupervisorIntervalMs,
  isLinxInteractiveSymphonyModeEnabled,
  notifyLinxInteractiveSymphonyControlChange,
  setLinxInteractiveSymphonyModeEnabled,
} from './linx-interactive-shell-state.js'

const DEFAULT_SYMPHONY_WORKER_SUPERVISOR_INTERVAL_MS = 10 * 60 * 1000
const symphonyCommandInstalled = new WeakSet<object>()

export function installSymphonyCommand(interactive: any): void {
  if (!interactive || symphonyCommandInstalled.has(interactive)) {
    return
  }

  registerLinxInteractiveSubmitHandler(interactive, {
    name: 'linx-symphony',
    priority: 20,
    async handler({ interactive: target, input, originalSubmit }) {
      const command = parseSymphonyCommand(input)
      if (command) {
        setLinxInteractiveEditorText(target, '')
        await handleSymphonyCommand(target, command)
        return true
      }

      if (isLinxInteractiveSymphonyModeEnabled(target) && shouldProjectSymphonyInput(input)) {
        getSessionControlManager(target, getLinxInteractiveRuntime(target)).recordUserMessage({ text: input })
        await queueSymphonySecretaryProjection(target, input)
        await originalSubmit(input)
        return true
      }

      return false
    },
  })

  symphonyCommandInstalled.add(interactive)
}

type SymphonyCommand =
  | { action: 'enable' }
  | { action: 'disable' }
  | { action: 'status' }
  | { action: 'usage'; input: string }

function parseSymphonyCommand(input: string): SymphonyCommand | null {
  if (input !== '/symphony' && !input.startsWith('/symphony ')) {
    return null
  }

  const args = input === '/symphony' ? '' : input.slice('/symphony'.length).trim()
  if (!args || args.toLowerCase() === 'on' || args.toLowerCase() === 'enable') {
    return { action: 'enable' }
  }

  const normalized = args.toLowerCase()
  if (normalized === 'off' || normalized === 'disable' || normalized === 'exit') {
    return { action: 'disable' }
  }
  if (normalized === 'status') {
    return { action: 'status' }
  }

  return { action: 'usage', input: args }
}

async function handleSymphonyCommand(interactive: any, command: SymphonyCommand): Promise<void> {
  if (command.action === 'enable') {
    setLinxInteractiveSymphonyModeEnabled(interactive, getLinxInteractiveRuntime(interactive), true)
    showLinxInteractiveStatus(interactive, formatSymphonyModeChangeStatus(true))
    await notifyLinxInteractiveSymphonyControlChange(interactive, true)
    return
  }

  if (command.action === 'disable') {
    setLinxInteractiveSymphonyModeEnabled(interactive, getLinxInteractiveRuntime(interactive), false)
    abortInteractiveSymphonyDispatches(interactive)
    showLinxInteractiveStatus(interactive, formatSymphonyModeChangeStatus(false))
    await notifyLinxInteractiveSymphonyControlChange(interactive, false)
    return
  }

  if (command.action === 'status') {
    showLinxInteractiveStatus(interactive, await formatSymphonyStatus({
      enabled: isLinxInteractiveSymphonyModeEnabled(interactive),
      source: await resolveSymphonySourceContext(interactive),
      podProjectionRuntime: getLinxInteractiveSymphonyPodProjectionRuntime(interactive),
      statusPodTimeoutMs: getLinxInteractiveSymphonyStatusPodTimeoutMs(interactive),
      listLocalIssues: getLinxInteractiveListSymphonyIssues(interactive),
      listLocalSessions: getLinxInteractiveListSymphonySessions(interactive),
    }))
    return
  }

  showLinxInteractiveStatus(interactive, formatSymphonyUsage(command.input))
}

function formatSymphonyModeChangeStatus(enabled: boolean): string {
  return enabled
    ? 'Symphony is on. I will keep ordinary chat ordinary and only plan or hand off real work.'
    : 'Symphony is off. Back to direct chat. Active handoffs from this window were stopped.'
}

function formatSymphonyUsage(input: string): string {
  return [
    `Unsupported /symphony argument: ${input}`,
    'Use /symphony on to chat with Secretary, /symphony off to chat with the worker/backend peer, or /symphony status to inspect workers.',
    'After enabling Symphony, send the objective as a normal chat message to Secretary; Secretary will decide whether it is an Issue, update existing work, split tasks, and dispatch workers.',
  ].join('\n')
}

function shouldProjectSymphonyInput(input: string): boolean {
  return Boolean(input)
    && !input.startsWith('/')
    && !input.startsWith('!')
}

async function queueSymphonySecretaryProjection(interactive: any, input: string): Promise<void> {
  await queueLinxInteractiveSessionRuntimeProjection(interactive, {
    customType: 'linx.symphony.secretary_projection',
    content: renderSymphonySecretaryProjection(input),
    display: false,
    details: {
      kind: 'runtime_projection',
      visibleInput: input,
    },
  }, { deliverAs: 'nextTurn' })
}

function renderSymphonySecretaryProjection(input: string): string {
  return [
    '# AI Secretary Symphony request',
    '',
    'Symphony is on: the user is chatting with Secretary, not directly with the worker/backend peer.',
    'Treat the user message below as a Secretary-facing product message.',
    'Decide whether it is ordinary chat, an Idea, a change to existing work, or delegable work.',
    'Default response style: reply like normal chat.',
    'Do not print internal Symphony binding, Issue/Task routing, worker selection, or report-style sections unless a visible state change or blocker must be surfaced.',
    'If the message is ordinary chat or early exploration, answer directly and do not explain that it was not delegated.',
    'If real delegation is needed, summarize the visible handoff result briefly after updating control state.',
    'When you need to inspect or mutate Symphony Pod resources from the AI side, use the xpod CLI as the direct Pod tool surface.',
    'Prefer model-backed xpod obj commands for Idea, Issue, Task, Delivery, Run, RunStep, Report, Evidence, ApprovalRequest, InputRequest, and InboxNotification resources.',
    'xpod uses the same Solid authority as LinX inside the Agent Runtime; do not ask the model to handle tokens or client secrets.',
    'Before mutating Pod resources from tools, verify xpod auth status/whoami reports the same acting WebID/Pod root as the LinX session; stop on mismatch.',
    'Do not hand-patch TTL or guess Pod paths for modeled product resources; use xpod/model descriptors or inspect existing links first.',
    '',
    'User message:',
    input,
  ].join('\n')
}

async function dispatchSymphonyWorkerFromInteractive(
  interactive: any,
  objective: string,
  source: SymphonySourceContext | undefined,
): Promise<void> {
  const activeRuntime = getLinxInteractiveRuntime(interactive)
  const backend = resolveSymphonyWorkerBackend(interactive, objective)
  const agentRuntime = resolveSymphonyControlAgentRuntime(interactive)
  const workerModel = resolveSymphonyWorkerModel(interactive, objective, backend)
  const workerCredentialSource = resolveSymphonyWorkerCredentialSource(interactive, backend)
  const workerGoalMode = isLinxInteractiveAutoModeEnabled(interactive, activeRuntime)
  const workerSupervisorIntervalMs = workerGoalMode ? resolveSymphonyWorkerSupervisorIntervalMs(interactive) : undefined
  const cwd = resolveInteractiveCwd(interactive, activeRuntime)
  const dispatchGeneration = getLinxInteractiveSymphonyModeGeneration(interactive)
  const dispatches = getLinxInteractiveSymphonyDispatches(interactive)
  const controller = new AbortController()
  const controllers = getLinxInteractiveSymphonyDispatchControllers(interactive)
  controllers.add(controller)

  showLinxInteractiveStatus(
    interactive,
    `Symphony handoff started: ${backend}${workerModel ? ` · ${workerModel}` : ''}`
    + `${workerGoalMode ? ` · supervised every ${formatSymphonySupervisorInterval(workerSupervisorIntervalMs)}` : ''}.`
    + ' Use /symphony status for details.',
  )

  const run = getLinxInteractiveRunSymphony(interactive) ?? runSymphony
  const dispatchArgs = {
    objective: [objective],
    backend,
    auto: workerGoalMode,
    cwd,
    plain: true,
    print: false,
    quietProjectionErrors: true,
    quietWorkers: true,
    credentialSource: workerCredentialSource,
    agentRuntime,
    workerModel,
    workerGoalMode,
    workerSupervisorIntervalMs,
    signal: controller.signal,
    ...(source?.chat ? { chat: source.chat } : {}),
    ...(source?.thread ? { thread: source.thread } : {}),
    target: {
      source: 'active-session',
      backend,
      agent: `${backend}-worker`,
      label: `${backend} worker`,
      ...(source?.chat ? { chat: source.chat } : {}),
      ...(source?.thread ? { thread: source.thread } : {}),
    },
  }
  const runtime = createInteractiveSymphonyRuntime(interactive)
  const dispatch = run(dispatchArgs, runtime)
    .then((plan: Awaited<ReturnType<typeof runSymphony>>) => {
      if (!isCurrentSymphonyDispatch(interactive, dispatchGeneration)) {
        return
      }
      showLinxInteractiveStatus(interactive, formatSymphonyDispatchResult(plan), { render: false })
    })
    .catch((error: unknown) => {
      if (!isCurrentSymphonyDispatch(interactive, dispatchGeneration)) {
        return
      }
      if (isSymphonyAbortError(error)) {
        showLinxInteractiveStatus(interactive, 'Symphony dispatch cancelled.', { render: false })
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      showLinxInteractiveError(interactive, `Symphony dispatch failed: ${message}`)
    })
    .finally(() => {
      controllers.delete(controller)
      if (!isCurrentSymphonyDispatch(interactive, dispatchGeneration)) {
        return
      }
      showLinxInteractiveStatus(interactive, null)
    })

  dispatches.push(dispatch)
  await Promise.resolve()
}

function abortInteractiveSymphonyDispatches(interactive: any): void {
  const controllers = getLinxInteractiveSymphonyDispatchControllers(interactive)
  for (const controller of controllers) {
    if (!controller.signal.aborted) {
      controller.abort(new Error('Symphony dispatch aborted by /symphony off'))
    }
  }
  controllers.clear()
}

function isSymphonyAbortError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
}

function isCurrentSymphonyDispatch(interactive: any, generation: number): boolean {
  return isLinxInteractiveSymphonyModeEnabled(interactive)
    && getLinxInteractiveSymphonyModeGeneration(interactive) === generation
}

function createInteractiveSymphonyRuntime(interactive: any) {
  const projectionRuntime = getLinxInteractiveSymphonyPodProjectionRuntime(interactive)
  return projectionRuntime ? createSymphonyRuntimeForPodProjection(projectionRuntime) : undefined
}

function resolveSymphonyWorkerBackend(interactive: any, objective?: string): AutoModeWorkerBackend {
  const activeRuntime = getLinxInteractiveRuntime(interactive)
  const candidates = [
    getLinxInteractiveSymphonyWorkerBackend(interactive),
    activeRuntime?.symphonyWorkerBackend,
    extractSymphonyWorkerBackendFromText(objective),
    activeRuntime?.runtimeBackend,
    activeRuntime?.workerBackend,
    activeRuntime?.backendCommandRouter?.backend,
    activeRuntime?.backendSessionRef?.backend,
  ]
  for (const candidate of candidates) {
    if (candidate === 'cc') {
      return 'claude'
    }
    if (isSymphonyWorkerBackend(candidate)) {
      return candidate
    }
  }
  return 'codex'
}

function isSymphonyWorkerBackend(value: unknown): value is AutoModeWorkerBackend {
  return value === 'linx' || value === 'codex' || value === 'claude' || value === 'codebuddy'
}

function resolveSymphonyWorkerCredentialSource(interactive: any, backend: AutoModeWorkerBackend): AutoModeCredentialSource {
  const activeRuntime = getLinxInteractiveRuntime(interactive)
  const configured = normalizeSymphonyCredentialSource(
    getLinxInteractiveSymphonyWorkerCredentialSource(interactive),
    activeRuntime?.symphonyWorkerCredentialSource,
    activeRuntime?.workerCredentialSource,
  )
  if (configured) {
    return configured
  }

  return backend === 'linx' ? 'cloud' : 'local'
}

function normalizeSymphonyCredentialSource(...values: unknown[]): AutoModeCredentialSource | undefined {
  for (const value of values) {
    if (value === 'local' || value === 'cloud') {
      return value
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'local' || normalized === 'cloud') {
        return normalized
      }
    }
  }
  return undefined
}

function extractSymphonyWorkerBackendFromText(input: string | undefined): AutoModeWorkerBackend | undefined {
  const normalized = input?.trim().toLowerCase()
  if (!normalized) {
    return undefined
  }

  if (/\b(?:linx|pi)\s*(?:runtime|backend|worker|agent)\b/u.test(normalized)
    || /\b(?:runtime|backend|worker|agent)\s*(?:=|:|：|是|用|使用|设为|指定为)\s*(?:linx|pi)\b/u.test(normalized)
    || /(用|使用|让|派)\s*(linx|pi)\s*(runtime|后端|worker|agent|模型)?/u.test(normalized)) {
    return 'linx'
  }

  if (/\b(?:claude|cc)\s*(?:code\s*)?(?:runtime|backend|worker|agent)\b/u.test(normalized)
    || /\b(?:runtime|backend|worker|agent)\s*(?:=|:|：|是|用|使用|设为|指定为)\s*(?:claude|cc)\b/u.test(normalized)
    || /(用|使用|让|派)\s*(?:claude|cc)\s*(?:code|runtime|后端|worker|agent|模型)?/u.test(normalized)) {
    return 'claude'
  }

  if (/\bcodex\s*(?:runtime|backend|worker|agent)?\b/u.test(normalized)) {
    return 'codex'
  }

  if (/\b(?:claude|cc)\s*(?:code|runtime|backend|worker|agent)?\b/u.test(normalized)) {
    return 'claude'
  }

  if (/\bcodebuddy\s*(?:runtime|backend|worker|agent)?\b/u.test(normalized)) {
    return 'codebuddy'
  }

  return undefined
}

function resolveSymphonyControlAgentRuntime(interactive: any): AgentRuntimeBackendConfig | undefined {
  const activeRuntime = getLinxInteractiveRuntime(interactive)
  const configured = normalizeSymphonyAgentRuntimeConfig(
    getLinxInteractiveSymphonyAgentRuntime(interactive),
    getLinxInteractiveSymphonyAgentRuntimeConfig(interactive),
    activeRuntime?.agentRuntime,
    activeRuntime?.agentRuntimeConfig,
  )
  const model = configured?.model ?? normalizeSymphonyConfigString(
    resolveLinxSessionModelId({ interactive, runtime: activeRuntime }),
  )
  if (!configured && !model) {
    return undefined
  }

  return {
    backend: configured?.backend ?? 'linx',
    credentialSource: configured?.credentialSource ?? 'cloud',
    ...configured,
    ...(model ? { model } : {}),
  }
}

function normalizeSymphonyAgentRuntimeConfig(...values: unknown[]): AgentRuntimeBackendConfig | undefined {
  for (const value of values) {
    if (!isRecord(value)) {
      continue
    }
    const metadata = isRecord(value.metadata) ? { ...value.metadata } : undefined
    const resolved: AgentRuntimeBackendConfig = {
      ...(normalizeSymphonyConfigString(value.backend) ? { backend: normalizeSymphonyConfigString(value.backend) } : {}),
      ...(normalizeSymphonyConfigString(value.model) ? { model: normalizeSymphonyConfigString(value.model) } : {}),
      ...(normalizeSymphonyConfigString(value.credentialSource) ? { credentialSource: normalizeSymphonyConfigString(value.credentialSource) } : {}),
      ...(normalizeSymphonyConfigString(value.runtime) ? { runtime: normalizeSymphonyConfigString(value.runtime) } : {}),
      ...(normalizeSymphonyConfigString(value.transport) ? { transport: normalizeSymphonyConfigString(value.transport) } : {}),
      ...(normalizeSymphonyConfigString(value.endpoint) ? { endpoint: normalizeSymphonyConfigString(value.endpoint) } : {}),
      ...(metadata ? { metadata } : {}),
    }
    if (Object.keys(resolved).length > 0) {
      return resolved
    }
  }
  return undefined
}

function formatSymphonyControlRuntime(runtime: AgentRuntimeBackendConfig): string {
  return [
    runtime.backend ?? 'linx',
    runtime.model,
    runtime.credentialSource ? `credentials=${runtime.credentialSource}` : undefined,
  ].filter(Boolean).join(' · ')
}

function resolveSymphonyWorkerModel(interactive: any, objective: string, backend: AutoModeWorkerBackend): string | undefined {
  const activeRuntime = getLinxInteractiveRuntime(interactive)
  const configured = normalizeSymphonyConfigString(
    getLinxInteractiveSymphonyWorkerModel(interactive),
    activeRuntime?.symphonyWorkerModel,
    activeRuntime?.workerModel,
    extractSymphonyWorkerModelFromText(objective),
  )
  if (backend === 'claude' && configured && isProviderRoutedModel(configured)) {
    return 'opus'
  }
  return configured
}

function resolveSymphonyWorkerSupervisorIntervalMs(interactive: any): number {
  const activeRuntime = getLinxInteractiveRuntime(interactive)
  const value = Number(
    getLinxInteractiveSymphonyWorkerSupervisorIntervalMs(interactive)
    ?? activeRuntime?.symphonyWorkerSupervisorIntervalMs
    ?? DEFAULT_SYMPHONY_WORKER_SUPERVISOR_INTERVAL_MS,
  )
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_SYMPHONY_WORKER_SUPERVISOR_INTERVAL_MS
  }
  return Math.trunc(value)
}

function formatSymphonySupervisorInterval(value: number | undefined): string {
  const intervalMs = Number(value)
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return `${DEFAULT_SYMPHONY_WORKER_SUPERVISOR_INTERVAL_MS / 60_000}m`
  }
  if (intervalMs % 60_000 === 0) {
    return `${intervalMs / 60_000}m`
  }
  if (intervalMs % 1000 === 0) {
    return `${intervalMs / 1000}s`
  }
  return `${intervalMs}ms`
}

function normalizeSymphonyConfigString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const normalized = typeof value === 'string' ? value.trim() : ''
    if (normalized) {
      return normalized
    }
  }
  return undefined
}

function extractSymphonyWorkerModelFromText(input: string): string | undefined {
  const patterns = [
    /(?:worker|agent|模型|model)\s*(?:=|:|：|是|用|使用|设为|指定为)\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,80})/iu,
    /(?:用|使用|让|派)\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,80})\s*(?:作为)?\s*(?:worker|agent|模型|model)/iu,
    /\b((?:deepseek|gpt|claude|qwen|gemini)[A-Za-z0-9._/-]{1,80})\s*(?:worker|agent)?/iu,
  ]

  for (const pattern of patterns) {
    const match = input.match(pattern)
    const normalized = normalizeSymphonyModelToken(match?.[1])
    if (normalized) {
      return normalized
    }
  }

  return undefined
}

function normalizeSymphonyModelToken(value: unknown): string | undefined {
  const normalized = typeof value === 'string'
    ? value.trim().replace(/[，。,.、;；:：!?！？)）\]}】]+$/u, '')
    : ''
  return normalized || undefined
}

function isProviderRoutedModel(model: string): boolean {
  return /(?:deepseek|qwen|gemini|kimi|moonshot|mistral|grok|glm|minimax)/iu.test(model)
}

function formatSymphonyDispatchResult(plan: Awaited<ReturnType<typeof runSymphony>>): string {
  const worker = plan.workers[0]
  const session = worker?.session ?? plan.session
  const delivery = worker?.delivery ?? plan.delivery
  const lines = [
    plan.issue.status === 'resolved' && delivery.status === 'completed'
      ? `Symphony handoff completed: ${plan.issue.title}.`
      : `Symphony handoff recorded: ${plan.issue.title}.`,
    'Use /symphony status for details.',
  ]
  if (session.error) {
    lines.push(`Error: ${session.error}`)
  }
  return lines.join('\n')
}

interface CapturedSymphonyIdeaContext {
  uri: string
  summary: string
  status: string
  commitment: string
}

async function captureSymphonyIdeaIfNeeded(
  input: string,
  source: SymphonySourceContext | undefined,
): Promise<CapturedSymphonyIdeaContext | undefined> {
  if (!shouldCaptureSymphonyIdeaInput(input)) {
    return undefined
  }

  try {
    const affectedArea = inferSymphonyIdeaAffectedArea(input)
    const captureInput: CaptureSymphonyIdeaInput = {
      input,
      commitment: 'thought',
      status: 'captured',
      currentUnderstanding: input.trim(),
      nextStep: 'Bind this Idea against existing control records before promoting it to work.',
      ...(source?.chat ? { chat: source.chat } : {}),
      ...(source?.thread ? { thread: source.thread } : {}),
      ...(affectedArea ? { affectedArea } : {}),
    }
    const idea = createSymphonyIdeaRecord(captureInput)
    const persisted = await persistSymphonyIdeaToPod(idea)
    if (!persisted) {
      throw new Error('No active Pod session; Symphony Idea records must be written to Pod in LinX runtime.')
    }
    return {
      uri: idea.uri,
      summary: idea.summary,
      status: idea.status,
      commitment: idea.commitment,
    }
  } catch (error) {
    process.emitWarning(
      error instanceof Error
        ? new Error(`LinX Symphony Idea Pod write failed: ${error.message}`)
        : new Error(`LinX Symphony Idea Pod write failed: ${String(error)}`),
    )
    return undefined
  }
}

function shouldCaptureSymphonyIdeaInput(input: string): boolean {
  const normalized = input.trim()
  if (normalized.length < 12) {
    return false
  }
  return /\b(idea|maybe|perhaps|could we|should we|what if|proposal|direction)\b/iu.test(normalized)
    || /(我觉得|感觉|也许|可能|考虑|想法|方向|要不要|能不能|是不是|是否|应该)/u.test(normalized)
}

function inferSymphonyIdeaAffectedArea(input: string): string | undefined {
  const normalized = input.toLowerCase()
  if (/symphony|secretary|auto|approval|grant|pod|xpod|skill|worker|agent/u.test(normalized)) {
    return normalized.match(/symphony|secretary|auto|approval|grant|pod|xpod|skill|worker|agent/u)?.[0]
  }
  if (/(建模|模型|数据|同步|权限|审批|托管|多端|工作流|指标|质检)/u.test(input)) {
    return input.match(/建模|模型|数据|同步|权限|审批|托管|多端|工作流|指标|质检/u)?.[0]
  }
  return undefined
}


interface SymphonySourceContext {
  chat: string
  thread: string
  sessionId?: string
}

async function resolveSymphonySourceContext(interactive: any): Promise<SymphonySourceContext | undefined> {
  const sessionId = resolveLinxSessionId({ interactive, runtime: getLinxInteractiveRuntime(interactive) })
  const webId = await resolveLinxInteractivePodWebId(interactive)
  if (typeof sessionId !== 'string' || !sessionId.trim() || !webId) {
    return undefined
  }

  const trimmedSessionId = sessionId.trim()
  return {
    chat: secretaryChatUri(webId),
    thread: secretaryThreadUri(webId, trimmedSessionId, DEFAULT_SECRETARY_CHAT_ID),
    sessionId: trimmedSessionId,
  }
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
