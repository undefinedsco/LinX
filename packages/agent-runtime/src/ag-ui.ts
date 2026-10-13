/**
 * LinX → AG-UI (protocol 1.0) mapping, runtime-agnostic (R6 spec §3.1, W2p).
 *
 * The conversation surface only consumes AG-UI events. Every LinX runtime
 * (the browser-local chat loop, the service runtime, ACP coding tools) first
 * normalizes its own stream into {@link LinxAgUiSourceEvent}s; this module
 * turns those into a well-formed AG-UI event sequence.
 *
 * Identity contract:
 * - `threadId`  = the topic (Thread) resource URI
 * - `runId`     = the run resource URI (or a URI derived from the topic when
 *                 the runtime has no durable Run resource)
 * - `messageId` = the Pod message resource URI
 * - interrupt `id` = the Approval / InputRequest resource URI
 *
 * Cards inside messages are A2UI v0.9 surfaces carried in `ACTIVITY_SNAPSHOT`
 * (`activityType: "a2ui-surface"`). `surfaceId` is the RDF resource the card
 * is bound to; the card reads its content and state from the Pod, never from
 * the event payload. The payload only names the card kind and carries a
 * plain-text fallback for renderers without the LinX catalog.
 *
 * This module has no dependency on `@ag-ui/core`: events are plain JSON with
 * the protocol's string event names, so it stays usable from CLI, service and
 * web. Consumers that need the SDK's nominal types cast at their boundary.
 */
import type { LinxRuntimeEvent } from './runtime.js'

export const AG_UI_EVENT = {
  RUN_STARTED: 'RUN_STARTED',
  RUN_FINISHED: 'RUN_FINISHED',
  RUN_ERROR: 'RUN_ERROR',
  TEXT_MESSAGE_START: 'TEXT_MESSAGE_START',
  TEXT_MESSAGE_CONTENT: 'TEXT_MESSAGE_CONTENT',
  TEXT_MESSAGE_END: 'TEXT_MESSAGE_END',
  REASONING_START: 'REASONING_START',
  REASONING_MESSAGE_START: 'REASONING_MESSAGE_START',
  REASONING_MESSAGE_CONTENT: 'REASONING_MESSAGE_CONTENT',
  REASONING_MESSAGE_END: 'REASONING_MESSAGE_END',
  REASONING_END: 'REASONING_END',
  TOOL_CALL_START: 'TOOL_CALL_START',
  TOOL_CALL_ARGS: 'TOOL_CALL_ARGS',
  TOOL_CALL_END: 'TOOL_CALL_END',
  TOOL_CALL_RESULT: 'TOOL_CALL_RESULT',
  ACTIVITY_SNAPSHOT: 'ACTIVITY_SNAPSHOT',
  MESSAGES_SNAPSHOT: 'MESSAGES_SNAPSHOT',
} as const

export type AgUiEventType = (typeof AG_UI_EVENT)[keyof typeof AG_UI_EVENT]

export interface AgUiInterrupt {
  id: string
  reason: 'tool_call' | 'input_required' | 'confirmation' | (string & {})
  message?: string
  toolCallId?: string
  responseSchema?: Record<string, unknown>
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export type AgUiRunOutcome =
  | { type: 'success' }
  | { type: 'interrupt'; interrupts: AgUiInterrupt[] }
  | { type: 'cancelled' }

/** Structural subset of the AG-UI 1.0 events LinX produces. */
export type AgUiEvent =
  | { type: 'RUN_STARTED'; threadId: string; runId: string }
  | { type: 'RUN_FINISHED'; threadId: string; runId: string; outcome?: AgUiRunOutcome }
  | { type: 'RUN_ERROR'; message: string; code?: string }
  | { type: 'TEXT_MESSAGE_START'; messageId: string; role: 'assistant' }
  | { type: 'TEXT_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'TEXT_MESSAGE_END'; messageId: string }
  | { type: 'REASONING_START'; messageId: string }
  | { type: 'REASONING_MESSAGE_START'; messageId: string; role: 'reasoning' }
  | { type: 'REASONING_MESSAGE_CONTENT'; messageId: string; delta: string }
  | { type: 'REASONING_MESSAGE_END'; messageId: string }
  | { type: 'REASONING_END'; messageId: string }
  | { type: 'TOOL_CALL_START'; toolCallId: string; toolCallName: string; parentMessageId?: string }
  | { type: 'TOOL_CALL_ARGS'; toolCallId: string; delta: string }
  | { type: 'TOOL_CALL_END'; toolCallId: string }
  | { type: 'TOOL_CALL_RESULT'; messageId: string; toolCallId: string; content: string; role: 'tool' }
  | {
      type: 'ACTIVITY_SNAPSHOT'
      messageId: string
      activityType: string
      content: Record<string, unknown>
      replace?: boolean
    }

// ---------------------------------------------------------------------------
// A2UI v0.9 card surfaces (W2c catalog)
// ---------------------------------------------------------------------------

export const A2UI_SURFACE_ACTIVITY_TYPE = 'a2ui-surface'
export const LINX_A2UI_VERSION = 'v0.9'
/** Identifies the LinX card catalog; renderers without it fall back to text. */
export const LINX_A2UI_CATALOG_ID = 'https://undefineds.co/ns/linx/a2ui/cards/v1'

/** Progress of one assistant turn (the W1 process line). Not a card. */
export const LINX_PROGRESS_ACTIVITY_TYPE = 'linx-progress'
/** Sources an answer cites (K5). Not a card. */
export const LINX_SOURCES_ACTIVITY_TYPE = 'linx-sources'

export const LINX_CARD_KINDS = [
  'approval',
  'auto-judge',
  'input',
  'login',
  'file',
  'remember',
  'run-progress',
  'pending-change',
  'command-permission',
  'plan',
  'naming',
] as const

export type LinxCardKind = (typeof LINX_CARD_KINDS)[number]

/** Catalog component name per card kind. */
export const LINX_CARD_COMPONENTS: Readonly<Record<LinxCardKind, string>> = {
  approval: 'LinxApproval',
  'auto-judge': 'LinxAutoJudge',
  input: 'LinxInputRequest',
  login: 'LinxLogin',
  file: 'LinxFile',
  remember: 'LinxRemember',
  'run-progress': 'LinxRunProgress',
  'pending-change': 'LinxPendingChange',
  'command-permission': 'LinxCommandPermission',
  plan: 'LinxPlan',
  naming: 'LinxNaming',
}

const CARD_KIND_BY_COMPONENT = new Map<string, LinxCardKind>(
  LINX_CARD_KINDS.map((kind) => [LINX_CARD_COMPONENTS[kind], kind]),
)

export function isLinxCardKind(value: unknown): value is LinxCardKind {
  return typeof value === 'string' && (LINX_CARD_KINDS as readonly string[]).includes(value)
}

export interface LinxCardSurfaceInput {
  card: LinxCardKind
  /** The RDF resource the card is bound to; becomes the A2UI surfaceId. */
  resource: string
  /** One plain sentence for renderers that do not know the LinX catalog. */
  fallbackText: string
  /**
   * Lookup hints only (e.g. a tool call id while the resource URI is not yet
   * known). Never displayed as card content: content is read from the Pod.
   */
  hints?: Record<string, string>
}

export type A2uiOperation = Record<string, unknown> & { version: string }

/**
 * A2UI v0.9 operations for one card. The root is a standard `Column` holding
 * the catalog component and a `Text` fallback, so a generic A2UI renderer
 * still shows one sentence while the LinX renderer draws its own component.
 */
export function buildLinxCardSurface(input: LinxCardSurfaceInput): A2uiOperation[] {
  const surfaceId = input.resource
  return [
    {
      version: LINX_A2UI_VERSION,
      createSurface: { surfaceId, catalogId: LINX_A2UI_CATALOG_ID },
    },
    {
      version: LINX_A2UI_VERSION,
      updateComponents: {
        surfaceId,
        components: [
          { id: 'root', component: 'Column', children: ['card', 'fallback'] },
          { id: 'card', component: LINX_CARD_COMPONENTS[input.card], resource: { path: '/resource' } },
          { id: 'fallback', component: 'Text', text: input.fallbackText },
        ],
      },
    },
    {
      version: LINX_A2UI_VERSION,
      updateDataModel: {
        surfaceId,
        path: '/',
        value: { resource: input.resource, card: input.card, ...(input.hints ? { hints: input.hints } : {}) },
      },
    },
  ]
}

export interface LinxCardSurface {
  card: LinxCardKind
  resource: string
  fallbackText: string | null
  hints: Record<string, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Reads a LinX card back from A2UI operations (as streamed, or as returned by
 * an A2UI state serializer). Returns null for surfaces from other catalogs.
 */
export function readLinxCardSurface(operations: unknown): LinxCardSurface | null {
  if (!Array.isArray(operations)) return null
  let surfaceId: string | null = null
  let catalogId: string | null = null
  let component: string | null = null
  let fallbackText: string | null = null
  let data: Record<string, unknown> = {}
  for (const operation of operations) {
    if (!isRecord(operation)) continue
    const create = operation.createSurface
    if (isRecord(create)) {
      if (typeof create.surfaceId === 'string') surfaceId = create.surfaceId
      if (typeof create.catalogId === 'string') catalogId = create.catalogId
    }
    const update = operation.updateComponents
    if (isRecord(update) && Array.isArray(update.components)) {
      if (!surfaceId && typeof update.surfaceId === 'string') surfaceId = update.surfaceId
      for (const node of update.components) {
        if (!isRecord(node) || typeof node.component !== 'string') continue
        if (CARD_KIND_BY_COMPONENT.has(node.component)) component = node.component
        if (node.id === 'fallback' && typeof node.text === 'string') fallbackText = node.text
      }
    }
    const model = operation.updateDataModel
    if (isRecord(model)) {
      const value = model.value ?? model.contents ?? model.data
      if (isRecord(value) && (model.path === undefined || model.path === '/' || model.path === '')) {
        data = { ...data, ...value }
      }
    }
  }
  if (catalogId !== null && catalogId !== LINX_A2UI_CATALOG_ID) return null
  const card = component ? CARD_KIND_BY_COMPONENT.get(component) : (isLinxCardKind(data.card) ? data.card : undefined)
  const resource = typeof data.resource === 'string' ? data.resource : surfaceId
  if (!card || !resource) return null
  const hints: Record<string, string> = {}
  if (isRecord(data.hints)) {
    for (const [key, value] of Object.entries(data.hints)) {
      if (typeof value === 'string') hints[key] = value
    }
  }
  return { card, resource, fallbackText, hints }
}

/** The activity message id for a card, unique per bound resource. */
export function linxCardActivityId(resource: string): string {
  return `${resource}#a2ui-card`
}

export function linxCardActivityEvent(input: LinxCardSurfaceInput): AgUiEvent {
  return {
    type: 'ACTIVITY_SNAPSHOT',
    messageId: linxCardActivityId(input.resource),
    activityType: A2UI_SURFACE_ACTIVITY_TYPE,
    content: { a2ui_operations: buildLinxCardSurface(input) },
  }
}

// ---------------------------------------------------------------------------
// Process line (W1 / W1b)
// ---------------------------------------------------------------------------

export type LinxProgressStepStatus = 'running' | 'done' | 'failed' | 'skipped'

export interface LinxProgressStep {
  title: string
  status: LinxProgressStepStatus
}

export type LinxProgressPhase = 'running' | 'waiting' | 'stopping' | 'stopped' | 'failed' | 'done' | 'interrupted'

export interface LinxProgressContent {
  phase: LinxProgressPhase
  steps: LinxProgressStep[]
}

export function linxProgressActivityId(messageId: string): string {
  return `${messageId}#progress`
}

export function readLinxProgress(value: unknown): LinxProgressContent | null {
  if (!isRecord(value) || !Array.isArray(value.steps) || typeof value.phase !== 'string') return null
  const steps = value.steps.flatMap((step): LinxProgressStep[] => (
    isRecord(step) && typeof step.title === 'string' && typeof step.status === 'string'
      ? [{ title: step.title, status: step.status as LinxProgressStepStatus }]
      : []
  ))
  return { phase: value.phase as LinxProgressPhase, steps }
}

// ---------------------------------------------------------------------------
// Sources (K5 citations)
// ---------------------------------------------------------------------------

export interface LinxSourceLocator {
  page?: number
  timeSeconds?: number
  line?: number
  quote?: string
}

export interface LinxSource {
  /** A Pod resource (opens the card dialog) or an http(s) page. */
  uri: string
  title: string
  locator?: LinxSourceLocator
}

export function linxSourcesActivityId(messageId: string): string {
  return `${messageId}#sources`
}

export function readLinxSources(value: unknown): LinxSource[] {
  if (!isRecord(value) || !Array.isArray(value.sources)) return []
  return value.sources.flatMap((source): LinxSource[] => {
    if (!isRecord(source) || typeof source.uri !== 'string' || typeof source.title !== 'string') return []
    const locator = isRecord(source.locator) ? source.locator as LinxSourceLocator : undefined
    return [{ uri: source.uri, title: source.title, ...(locator ? { locator } : {}) }]
  })
}

// ---------------------------------------------------------------------------
// Interrupts
// ---------------------------------------------------------------------------

export function approvalInterrupt(input: {
  approvalUri: string
  message?: string
  toolCallId?: string
}): AgUiInterrupt {
  return {
    id: input.approvalUri,
    reason: input.toolCallId ? 'tool_call' : 'confirmation',
    ...(input.message ? { message: input.message } : {}),
    ...(input.toolCallId ? { toolCallId: input.toolCallId } : {}),
  }
}

export function inputRequestInterrupt(input: {
  inputRequestUri: string
  message?: string
  responseSchema?: Record<string, unknown>
}): AgUiInterrupt {
  return {
    id: input.inputRequestUri,
    reason: 'input_required',
    ...(input.message ? { message: input.message } : {}),
    ...(input.responseSchema ? { responseSchema: input.responseSchema } : {}),
  }
}

// ---------------------------------------------------------------------------
// ACP permission options (W10)
// ---------------------------------------------------------------------------

/** What the person picked on a command-permission card. */
export type LinxPermissionChoice = 'allow-once' | 'delegate' | 'reject'

/**
 * ACP `allow_once` = 允许这一次; `allow_always` = 以后交给 LinX 判断 (writes a
 * grant); `reject_*` = 拒绝. `allow_for_session` is treated as once: LinX
 * grants are durable and decided by the person, not by session scope.
 */
export function acpOptionKindToChoice(kind: string | undefined): LinxPermissionChoice | null {
  switch (kind) {
    case 'allow_once':
    case 'allow_for_session':
      return 'allow-once'
    case 'allow_always':
      return 'delegate'
    case 'reject_once':
    case 'reject_always':
      return 'reject'
    default:
      return null
  }
}

export function selectAcpOptionId(
  options: ReadonlyArray<{ optionId: string; kind?: string }>,
  choice: LinxPermissionChoice,
): string | undefined {
  const preferred: Record<LinxPermissionChoice, string[]> = {
    'allow-once': ['allow_once', 'allow_for_session'],
    delegate: ['allow_always', 'allow_once'],
    reject: ['reject_once', 'reject_always'],
  }
  for (const kind of preferred[choice]) {
    const match = options.find((option) => option.kind === kind)
    if (match) return match.optionId
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Normalized runtime events → AG-UI
// ---------------------------------------------------------------------------

/**
 * Input of {@link LinxAgUiMapper}: the shared normalized runtime events plus
 * the few presentation-level facts a runtime can report.
 */
export type LinxAgUiSourceEvent =
  | LinxRuntimeEvent
  | { type: 'message.started'; payload: { messageId: string } }
  | { type: 'reasoning.delta'; payload: { messageId?: string; text: string } }
  | { type: 'step.progress'; payload: { title: string; status?: LinxProgressStepStatus } }
  | { type: 'card'; payload: LinxCardSurfaceInput }
  | { type: 'sources'; payload: { messageId?: string; sources: LinxSource[] } }
  | { type: 'tool.result'; payload: { toolCallId: string; content: string } }
  | { type: 'session.stopping'; payload?: Record<string, unknown> }
  | { type: 'session.cancelled'; payload?: Record<string, unknown> }

export interface LinxAgUiMapperOptions {
  threadId: string
  runId: string
  /** Creates a message URI when a runtime streams text without one. */
  createMessageId?: () => string
}

function stringField(payload: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = payload?.[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/**
 * Stateful translator that guarantees the AG-UI ordering rules: one
 * RUN_STARTED first; text, reasoning and tool calls opened before content and
 * closed before RUN_FINISHED; exactly one terminal event.
 */
export class LinxAgUiMapper {
  private readonly threadId: string
  private readonly runId: string
  private readonly createMessageId: () => string
  private started = false
  private finished = false
  private messageId: string | null = null
  private textOpen = false
  private text = ''
  private reasoningOpen = false
  private reasoningId: string | null = null
  private readonly openToolCalls = new Set<string>()
  private readonly interrupts: AgUiInterrupt[] = []
  private readonly steps: LinxProgressStep[] = []
  private phase: LinxProgressPhase = 'running'
  private messageCounter = 0

  constructor(options: LinxAgUiMapperOptions) {
    this.threadId = options.threadId
    this.runId = options.runId
    this.createMessageId = options.createMessageId
      ?? (() => `${options.runId}#message-${++this.messageCounter}`)
  }

  get currentMessageId(): string | null {
    return this.messageId
  }

  get isFinished(): boolean {
    return this.finished
  }

  get accumulatedText(): string {
    return this.text
  }

  start(): AgUiEvent[] {
    if (this.started) return []
    this.started = true
    return [{ type: 'RUN_STARTED', threadId: this.threadId, runId: this.runId }]
  }

  map(event: LinxAgUiSourceEvent): AgUiEvent[] {
    if (this.finished) return []
    const out = this.start()
    const payload = (event as { payload?: Record<string, unknown> }).payload
    switch (event.type) {
      case 'session.started':
        return out
      case 'message.started': {
        out.push(...this.closeReasoning())
        out.push(...this.openMessage(stringField(payload, 'messageId')))
        return out
      }
      case 'message.delta': {
        const text = stringField(payload, 'text') ?? stringField(payload, 'delta')
        if (!text) return out
        out.push(...this.closeReasoning())
        out.push(...this.openMessage(stringField(payload, 'messageId')))
        this.text += text
        out.push({ type: 'TEXT_MESSAGE_CONTENT', messageId: this.messageId!, delta: text })
        return out
      }
      case 'message.completed': {
        const finalText = stringField(payload, 'text')
        out.push(...this.closeReasoning())
        if (finalText !== undefined || this.textOpen) {
          out.push(...this.openMessage(stringField(payload, 'messageId')))
          if (finalText && finalText !== this.text && finalText.startsWith(this.text)) {
            const delta = finalText.slice(this.text.length)
            this.text = finalText
            out.push({ type: 'TEXT_MESSAGE_CONTENT', messageId: this.messageId!, delta })
          } else if (finalText && !this.text) {
            this.text = finalText
            out.push({ type: 'TEXT_MESSAGE_CONTENT', messageId: this.messageId!, delta: finalText })
          }
        }
        out.push(...this.closeText())
        return out
      }
      case 'reasoning.delta': {
        const text = stringField(payload, 'text')
        if (!text) return out
        if (!this.reasoningOpen) {
          this.reasoningId = stringField(payload, 'messageId') ?? `${this.messageId ?? this.runId}#reasoning`
          this.reasoningOpen = true
          out.push({ type: 'REASONING_START', messageId: this.reasoningId })
          out.push({ type: 'REASONING_MESSAGE_START', messageId: this.reasoningId, role: 'reasoning' })
        }
        out.push({ type: 'REASONING_MESSAGE_CONTENT', messageId: this.reasoningId!, delta: text })
        return out
      }
      case 'step.progress': {
        const title = stringField(payload, 'title')
        if (!title) return out
        const status = (payload?.status as LinxProgressStepStatus | undefined) ?? 'running'
        const last = this.steps[this.steps.length - 1]
        if (last && last.status === 'running' && last.title !== title) last.status = 'done'
        if (last && last.title === title) last.status = status
        else this.steps.push({ title, status })
        out.push(...this.progressSnapshot())
        return out
      }
      case 'tool.call': {
        const toolCallId = stringField(payload, 'toolCallId') ?? stringField(payload, 'requestId')
        if (!toolCallId) return out
        out.push(...this.closeReasoning())
        out.push(...this.closeText())
        const toolCallName = stringField(payload, 'toolName') ?? stringField(payload, 'name') ?? 'tool'
        const args = payload?.arguments
        out.push({
          type: 'TOOL_CALL_START',
          toolCallId,
          toolCallName,
          ...(this.messageId ? { parentMessageId: this.messageId } : {}),
        })
        this.openToolCalls.add(toolCallId)
        const argsText = typeof args === 'string' ? args : args === undefined ? '' : JSON.stringify(args)
        if (argsText) out.push({ type: 'TOOL_CALL_ARGS', toolCallId, delta: argsText })
        out.push({ type: 'TOOL_CALL_END', toolCallId })
        this.openToolCalls.delete(toolCallId)
        return out
      }
      case 'tool.result': {
        const toolCallId = stringField(payload, 'toolCallId')
        if (!toolCallId) return out
        out.push({
          type: 'TOOL_CALL_RESULT',
          messageId: `${toolCallId}#result`,
          toolCallId,
          content: stringField(payload, 'content') ?? '',
          role: 'tool',
        })
        return out
      }
      case 'card': {
        out.push(...this.closeReasoning())
        out.push(...this.closeText())
        out.push(linxCardActivityEvent(event.payload))
        return out
      }
      case 'sources': {
        const messageId = event.payload.messageId ?? this.messageId
        if (!messageId || event.payload.sources.length === 0) return out
        out.push({
          type: 'ACTIVITY_SNAPSHOT',
          messageId: linxSourcesActivityId(messageId),
          activityType: LINX_SOURCES_ACTIVITY_TYPE,
          content: { sources: event.payload.sources },
        })
        return out
      }
      case 'approval.required': {
        const approvalUri = stringField(payload, 'approvalUri') ?? stringField(payload, 'requestId')
        if (!approvalUri) return out
        const interrupt = approvalInterrupt({
          approvalUri,
          message: stringField(payload, 'message'),
          toolCallId: stringField(payload, 'toolCallId'),
        })
        this.interrupts.push(interrupt)
        out.push(...this.closeReasoning())
        out.push(...this.closeText())
        out.push(linxCardActivityEvent({
          card: payload?.endpoint && String(payload.endpoint).startsWith('acp:') ? 'command-permission' : 'approval',
          resource: approvalUri,
          fallbackText: interrupt.message ?? '需要你决定',
        }))
        this.phase = 'waiting'
        return out
      }
      case 'input.required': {
        const inputRequestUri = stringField(payload, 'inputRequestUri') ?? stringField(payload, 'requestId')
        if (!inputRequestUri) return out
        const interrupt = inputRequestInterrupt({ inputRequestUri, message: stringField(payload, 'message') })
        this.interrupts.push(interrupt)
        out.push(...this.closeReasoning())
        out.push(...this.closeText())
        out.push(linxCardActivityEvent({
          card: payload?.kind === 'login' ? 'login' : 'input',
          resource: inputRequestUri,
          fallbackText: interrupt.message ?? '需要你补充一点信息',
        }))
        this.phase = 'waiting'
        return out
      }
      case 'session.stopping': {
        this.phase = 'stopping'
        out.push(...this.progressSnapshot())
        return out
      }
      case 'session.cancelled':
        return [...out, ...this.finish({ type: 'cancelled' })]
      case 'session.completed':
        return [...out, ...this.finish()]
      case 'session.error':
        return [...out, ...this.fail(stringField(payload, 'message') ?? '这次没有完成')]
      default:
        return out
    }
  }

  /** Closes everything that is open and ends the run. */
  finish(outcome?: AgUiRunOutcome): AgUiEvent[] {
    if (this.finished) return []
    const out = this.start()
    out.push(...this.closeReasoning())
    out.push(...this.closeText())
    for (const toolCallId of this.openToolCalls) out.push({ type: 'TOOL_CALL_END', toolCallId })
    this.openToolCalls.clear()
    const resolved: AgUiRunOutcome = outcome
      ?? (this.interrupts.length > 0 ? { type: 'interrupt', interrupts: [...this.interrupts] } : { type: 'success' })
    if (this.steps.length > 0 || this.phase !== 'running') {
      this.phase = resolved.type === 'cancelled' ? 'stopped' : resolved.type === 'interrupt' ? 'waiting' : 'done'
      for (const step of this.steps) {
        if (step.status === 'running') step.status = resolved.type === 'success' ? 'done' : step.status
      }
      out.push(...this.progressSnapshot())
    }
    this.finished = true
    out.push({
      type: 'RUN_FINISHED',
      threadId: this.threadId,
      runId: this.runId,
      ...(resolved.type === 'success' ? {} : { outcome: resolved }),
    })
    return out
  }

  fail(message: string, code?: string): AgUiEvent[] {
    if (this.finished) return []
    const out = this.start()
    out.push(...this.closeReasoning())
    out.push(...this.closeText())
    for (const toolCallId of this.openToolCalls) out.push({ type: 'TOOL_CALL_END', toolCallId })
    this.openToolCalls.clear()
    if (this.steps.length > 0) {
      this.phase = 'failed'
      const last = this.steps[this.steps.length - 1]
      if (last && last.status === 'running') last.status = 'failed'
      out.push(...this.progressSnapshot())
    }
    this.finished = true
    out.push({ type: 'RUN_ERROR', message, ...(code ? { code } : {}) })
    return out
  }

  private openMessage(messageId: string | undefined): AgUiEvent[] {
    const out: AgUiEvent[] = []
    if (this.textOpen) {
      if (!messageId || messageId === this.messageId) return out
      out.push(...this.closeText())
    }
    if (messageId && this.messageId !== messageId) {
      this.messageId = messageId
      this.text = ''
    } else if (!this.messageId) {
      this.messageId = this.createMessageId()
      this.text = ''
    }
    this.textOpen = true
    out.push({ type: 'TEXT_MESSAGE_START', messageId: this.messageId, role: 'assistant' })
    return out
  }

  private closeText(): AgUiEvent[] {
    if (!this.textOpen || !this.messageId) return []
    this.textOpen = false
    return [{ type: 'TEXT_MESSAGE_END', messageId: this.messageId }]
  }

  private closeReasoning(): AgUiEvent[] {
    if (!this.reasoningOpen || !this.reasoningId) return []
    this.reasoningOpen = false
    const id = this.reasoningId
    return [
      { type: 'REASONING_MESSAGE_END', messageId: id },
      { type: 'REASONING_END', messageId: id },
    ]
  }

  private progressSnapshot(): AgUiEvent[] {
    return [{
      type: 'ACTIVITY_SNAPSHOT',
      messageId: linxProgressActivityId(this.runId),
      activityType: LINX_PROGRESS_ACTIVITY_TYPE,
      content: { phase: this.phase, steps: this.steps.map((step) => ({ ...step })) },
    }]
  }
}
