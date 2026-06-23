import { SessionManager } from '@earendil-works/pi-coding-agent'
import {
  decideThreadControlEvent,
  runThreadReconcilerCycle,
  type ReconcileDecisionSummary,
  type ThreadControlEvent,
} from '@linx/agent-runtime'
import type {
  AutoModeApprovalDecision,
  AutoModeInteractionRequest,
  AutoModeNormalizedEvent,
  AutoModeSecretaryRecommendation,
  AutoModeSessionRecord,
  AutoModeUserInputAnswers,
} from '@linx/agent-runtime/auto-mode'
import { resolveAutoModeSecretaryRecommendation } from './auto-mode/secretary.js'
import { isLinxInteractiveAutoModeEnabled } from './linx-interactive-shell-state.js'
import { registerLinxInteractiveStopHandler } from './linx-interactive-stop-router.js'

export const SESSION_CONTROL_CUSTOM_TYPE = 'linx-session-control'

type SessionControlTrigger = 'auto' | 'blocked-runtime-event' | 'message'

export interface SessionControlSessionRef {
  id: string
  file?: string
  dir?: string
  cwd: string
}

export interface SessionControlBusinessRef {
  id?: string
  file?: string
  cwd: string
}

export interface SessionControlRuntimeRef {
  id?: string
  backend?: string
  cwd?: string
  model?: string
}

type SessionControlContext = {
  interactive?: any
  runtime?: any
  sessionCwd?: string
}

type SessionControlArchiveRef = {
  id?: string
  file?: string
  dir?: string
  cwd?: string
}

export interface SessionControlBlockedEvent {
  id: string
  type: 'approval.required' | 'input.required'
  message: string
  requestKind?: string
  createdAt: string
  reconciliation?: ReconcileDecisionSummary
  source: {
    businessSession: SessionControlBusinessRef
    runtime?: SessionControlRuntimeRef
  }
}

export type SessionControlAutoInputEventKind = 'requested' | 'delivered' | 'skipped' | 'failed'

export type SessionControlInteractionResponse =
  | {
    kind: 'approval'
    request: Exclude<AutoModeInteractionRequest, { kind: 'user-input' }>
    decision: AutoModeApprovalDecision
    recommendation: AutoModeSecretaryRecommendation
  }
  | {
    kind: 'user-input'
    request: Extract<AutoModeInteractionRequest, { kind: 'user-input' }>
    answers: AutoModeUserInputAnswers
    recommendation: AutoModeSecretaryRecommendation
  }

export interface SessionControlSnapshot {
  version: 1
  autoEnabled: boolean
  controlSession: SessionControlSessionRef
  businessSession: SessionControlBusinessRef
  blockedEvents: SessionControlBlockedEvent[]
  createdAt: string
  updatedAt: string
}

export class SessionControlManager {
  private controlSessionManager: SessionManager | null = null
  private snapshot: SessionControlSnapshot | null = null

  constructor(private readonly context: SessionControlContext) {}

  getSnapshot(): SessionControlSnapshot | null {
    return this.snapshot ? cloneSnapshot(this.snapshot) : null
  }

  ensureControlSession(trigger: SessionControlTrigger = 'auto'): SessionControlSnapshot {
    const now = new Date().toISOString()
    const businessSession = resolveBusinessSessionRef(this.context)

    if (!this.controlSessionManager || !this.snapshot) {
      this.controlSessionManager = createControlSessionManager(this.context, businessSession.cwd)
      bootstrapControlSession(this.controlSessionManager, businessSession, trigger)
      this.snapshot = {
        version: 1,
        autoEnabled: resolveCurrentAutoEnabled(this.context),
        controlSession: resolveControlSessionRef(this.controlSessionManager, businessSession.cwd),
        businessSession,
        blockedEvents: [],
        createdAt: now,
        updatedAt: now,
      }
      this.appendControlEntry('session-control.created', {
        trigger,
        businessSession,
        controlSession: this.snapshot.controlSession,
      })
      return cloneSnapshot(this.snapshot)
    }

    this.snapshot.businessSession = businessSession
    this.snapshot.updatedAt = now
    this.appendControlEntry('session-control.rebound', {
      trigger,
      businessSession,
      controlSession: this.snapshot.controlSession,
    })
    return cloneSnapshot(this.snapshot)
  }

  setAutoEnabled(enabled: boolean): SessionControlSnapshot {
    const snapshot = this.ensureControlSession('auto')
    this.snapshot = {
      ...snapshot,
      autoEnabled: enabled,
      updatedAt: new Date().toISOString(),
    }
    this.appendControlEntry('auto.state.changed', {
      autoEnabled: enabled,
      businessSession: this.snapshot.businessSession,
      controlSession: this.snapshot.controlSession,
    })
    return cloneSnapshot(this.snapshot)
  }

  recordRuntimeEvent(event: AutoModeNormalizedEvent): SessionControlBlockedEvent | null {
    if (!isSessionControlBlockedEvent(event)) {
      return null
    }

    const snapshot = this.ensureControlSession('blocked-runtime-event')
    const reconciliation = createBlockedEventReconciliation({
      event,
      snapshot,
      runtime: this.context.runtime,
    })
    const blockedEvent: SessionControlBlockedEvent = {
      id: `blocked-${Date.now()}-${snapshot.blockedEvents.length + 1}`,
      type: event.type,
      message: event.message,
      requestKind: resolveRequestKind(event.request),
      createdAt: new Date().toISOString(),
      reconciliation,
      source: {
        businessSession: snapshot.businessSession,
        runtime: resolveRuntimeRef(this.context.runtime),
      },
    }

    this.snapshot = {
      ...snapshot,
      blockedEvents: [...snapshot.blockedEvents, blockedEvent],
      updatedAt: blockedEvent.createdAt,
    }
    this.appendControlEntry('runtime.blocked', blockedEvent)
    return blockedEvent
  }

  recordUserMessage(input: { text: string }): ReconcileDecisionSummary | null {
    return this.recordMessageAppended({
      text: input.text,
      source: 'user',
      actorId: 'current-user',
      actorRole: 'user',
    })
  }

  recordSecretaryRuntimeIntent(input: {
    text: string
    reason?: string | null
  }): ReconcileDecisionSummary | null {
    return this.recordMessageAppended({
      text: input.text,
      source: 'secretary-runtime-intent',
      actorId: '__secretary__',
      actorRole: 'secretary',
      reason: input.reason,
    })
  }

  private recordMessageAppended(input: {
    text: string
    source: 'user' | 'secretary-runtime-intent'
    actorId: string
    actorRole: 'user' | 'secretary'
    reason?: string | null
  }): ReconcileDecisionSummary | null {
    const text = input.text.trim()
    if (!text) {
      return null
    }

    const snapshot = this.ensureControlSession('message')
    const { summary } = decideThreadControlEvent({
      policy: {
        kind: snapshot.autoEnabled ? 'auto' : 'direct',
        secretaryAgent: '__secretary__',
      },
      event: createThreadMessageEvent({
        text,
        snapshot,
        runtime: this.context.runtime,
        source: input.source,
        actorId: input.actorId,
        actorRole: input.actorRole,
        reason: input.reason,
      }),
      randomId: `message-${Date.now()}`,
    })
    this.snapshot = {
      ...snapshot,
      updatedAt: new Date().toISOString(),
    }
    this.appendControlEntry('thread.message.appended', {
      businessSession: snapshot.businessSession,
      source: input.source,
      actor: {
        id: input.actorId,
        role: input.actorRole,
      },
      content: text,
      messageLength: text.length,
      reason: input.reason,
      reconciler: summary,
    })
    return summary
  }

  recordAutoInputEvent(kind: SessionControlAutoInputEventKind, data: unknown): void {
    const snapshot = this.ensureControlSession('auto')
    this.snapshot = {
      ...snapshot,
      updatedAt: new Date().toISOString(),
    }
    this.appendControlEntry(`auto.input.${kind}`, {
      businessSession: this.snapshot.businessSession,
      controlSession: this.snapshot.controlSession,
      data,
    })
  }

  async resolveInteractionRequest(input: {
    request: AutoModeInteractionRequest
    record?: AutoModeSessionRecord
  }): Promise<SessionControlInteractionResponse | null> {
    const snapshot = this.ensureControlSession('blocked-runtime-event')
    const record = input.record ?? buildSyntheticSessionRecord({
      request: input.request,
      snapshot,
      runtime: this.context.runtime,
    })
    let response: SessionControlInteractionResponse | null = null
    let wakeError: unknown
    const cycle = await runThreadReconcilerCycle({
      policy: {
        kind: snapshot.autoEnabled ? 'auto' : 'direct',
        secretaryAgent: '__secretary__',
      },
      handleWakeJob: async ({ decisionSummary }) => {
        try {
          const recommendation = await resolveAutoModeSecretaryRecommendation({
            mode: 'auto',
            record,
            request: input.request,
          })
          response = mapRecommendationToInteractionResponse(input.request, recommendation)
          return {
            responseKind: response?.kind ?? 'none',
            requestKind: input.request.kind,
            decision: response?.kind === 'approval' ? response.decision : undefined,
            reconciler: decisionSummary.id,
          }
        } catch (error) {
          wakeError = error
          throw error
        }
      },
      event: createInteractionRequestThreadEvent({
        request: input.request,
        snapshot,
        runtime: this.context.runtime,
      }),
      dispatchOptions: {
        randomId: `interaction-${input.request.kind}-${Date.now()}`,
      },
      onDispatched: (dispatch) => {
        this.appendControlEntry('runtime.interaction.requested', {
          businessSession: snapshot.businessSession,
          requestKind: input.request.kind,
          reconciler: dispatch.summary,
          scheduler: {
          wakeRecords: dispatch.wakeRecordSummaries,
        },
      })
    },
    })
    const scheduler = cycle.schedulerSummary
    const resolvedResponse = response as SessionControlInteractionResponse | null
    this.appendControlEntry('runtime.interaction.resolved', {
      businessSession: snapshot.businessSession,
      requestKind: input.request.kind,
      responseKind: resolvedResponse?.kind,
      reconciler: cycle.summary,
      scheduler,
    })
    if (scheduler.failed.length > 0) {
      throw wakeError ?? new Error(String(scheduler.failed[0]?.error ?? 'AI Secretary interaction wake job failed'))
    }
    return resolvedResponse
  }

  private appendControlEntry(kind: string, data: unknown): void {
    this.controlSessionManager?.appendCustomEntry(SESSION_CONTROL_CUSTOM_TYPE, {
      version: 1,
      kind,
      data,
      createdAt: new Date().toISOString(),
    })
  }
}

type SessionControlRegistry = {
  managers: WeakMap<object, SessionControlManager>
  runtimeEventBridgeHosts: WeakSet<object>
}

const SESSION_CONTROL_REGISTRY = Symbol.for('linx.sessionControl.registry')
const sessionControlRegistry = getSessionControlRegistry()
const sessionControlManagers = sessionControlRegistry.managers
const sessionControlRuntimeEventBridgeHosts = sessionControlRegistry.runtimeEventBridgeHosts

function getSessionControlRegistry(): SessionControlRegistry {
  const host = globalThis as typeof globalThis & { [SESSION_CONTROL_REGISTRY]?: SessionControlRegistry }
  const existing = host[SESSION_CONTROL_REGISTRY]
  if (existing) {
    return existing
  }

  const registry: SessionControlRegistry = {
    managers: new WeakMap<object, SessionControlManager>(),
    runtimeEventBridgeHosts: new WeakSet<object>(),
  }
  Object.defineProperty(host, SESSION_CONTROL_REGISTRY, {
    configurable: false,
    enumerable: false,
    value: registry,
    writable: false,
  })
  return registry
}

export function getSessionControlManager(
  interactive: any,
  runtime: any,
  sessionCwd?: string,
): SessionControlManager {
  const interactiveHost = asObjectHost(interactive)
  const runtimeHost = asObjectHost(runtime)
  const existing = (interactiveHost ? sessionControlManagers.get(interactiveHost) : undefined)
    ?? (runtimeHost ? sessionControlManagers.get(runtimeHost) : undefined)
  if (existing) {
    bindSessionControlManager(interactiveHost, existing)
    bindSessionControlManager(runtimeHost, existing)
    return existing
  }

  const manager = new SessionControlManager({ interactive, runtime, sessionCwd })
  bindSessionControlManager(interactiveHost, manager)
  bindSessionControlManager(runtimeHost, manager)
  return manager
}

export function installSessionControlRuntimeEventBridge(
  interactive: any,
  runtime: any,
  sessionCwd?: string,
): void {
  const bridgeHost = asObjectHost(interactive) ?? asObjectHost(runtime)
  if (bridgeHost && sessionControlRuntimeEventBridgeHosts.has(bridgeHost)) {
    return
  }

  const subscribe = runtime?.backendCommandRouter?.subscribe
  if (typeof subscribe !== 'function') {
    return
  }

  const unsubscribe = subscribe((event: AutoModeNormalizedEvent) => {
    if (!isSessionControlBlockedEvent(event)) {
      return
    }
    getSessionControlManager(interactive, runtime, sessionCwd).recordRuntimeEvent(event)
  })

  if (bridgeHost) {
    sessionControlRuntimeEventBridgeHosts.add(bridgeHost)
  }

  registerLinxInteractiveStopHandler(interactive, {
    name: 'linx-session-control-runtime-event-bridge',
    phase: 'before',
    priority: 20,
    handler() {
      unsubscribe()
      if (bridgeHost) {
        sessionControlRuntimeEventBridgeHosts.delete(bridgeHost)
      }
    },
  })
}

function asObjectHost(value: unknown): object | undefined {
  return value && (typeof value === 'object' || typeof value === 'function') ? value as object : undefined
}

function bindSessionControlManager(host: object | undefined, manager: SessionControlManager): void {
  if (host) {
    sessionControlManagers.set(host, manager)
  }
}

export function isSessionControlBlockedEvent(
  event: AutoModeNormalizedEvent,
): event is Extract<AutoModeNormalizedEvent, { type: 'approval.required' | 'input.required' }> {
  return event.type === 'approval.required' || event.type === 'input.required'
}

function createBlockedEventReconciliation(input: {
  event: Extract<AutoModeNormalizedEvent, { type: 'approval.required' | 'input.required' }>
  snapshot: SessionControlSnapshot
  runtime?: any
}): ReconcileDecisionSummary {
  const businessSession = input.snapshot.businessSession
  const runtimeRef = resolveRuntimeRef(input.runtime)
  const thread = businessSession.id ?? businessSession.file ?? `cwd:${businessSession.cwd}`
  const { summary } = decideThreadControlEvent({
    policy: {
      kind: input.snapshot.autoEnabled ? 'auto' : 'direct',
      secretaryAgent: '__secretary__',
    },
    event: {
      type: input.event.type,
      thread,
      chat: businessSession.id ?? businessSession.file,
      actor: {
        id: runtimeRef?.id ?? runtimeRef?.backend ?? 'backend-runtime',
        role: 'runtime',
      },
      data: {
        requestKind: resolveRequestKind(input.event.request),
        backend: runtimeRef?.backend,
        runtimeSession: runtimeRef?.id,
        businessSession: businessSession.id,
      },
    },
    randomId: `${input.event.type}-${Date.now()}`,
  })
  return summary
}

function createInteractionRequestThreadEvent(input: {
  request: AutoModeInteractionRequest
  snapshot: SessionControlSnapshot
  runtime?: any
}): ThreadControlEvent {
  const businessSession = input.snapshot.businessSession
  const runtimeRef = resolveRuntimeRef(input.runtime)
  const thread = businessSession.id ?? businessSession.file ?? `cwd:${businessSession.cwd}`
  return {
    type: input.request.kind === 'user-input' ? 'input.required' : 'approval.required',
    thread,
    chat: businessSession.id ?? businessSession.file,
    actor: {
      id: runtimeRef?.id ?? runtimeRef?.backend ?? 'backend-runtime',
      role: 'runtime',
    },
    data: {
      requestKind: input.request.kind,
      backend: runtimeRef?.backend,
      runtimeSession: runtimeRef?.id,
      businessSession: businessSession.id,
    },
  }
}

function createThreadMessageEvent(input: {
  text: string
  snapshot: SessionControlSnapshot
  runtime?: any
  source: 'user' | 'secretary-runtime-intent'
  actorId: string
  actorRole: 'user' | 'secretary'
  reason?: string | null
}): ThreadControlEvent {
  const businessSession = input.snapshot.businessSession
  const runtimeRef = resolveRuntimeRef(input.runtime)
  const thread = businessSession.id ?? businessSession.file ?? `cwd:${businessSession.cwd}`
  return {
    type: 'message.appended',
    thread,
    chat: businessSession.id ?? businessSession.file,
    actor: {
      id: input.actorId,
      role: input.actorRole,
    },
    content: input.text,
    data: {
      source: input.source,
      reason: input.reason ?? undefined,
      backend: runtimeRef?.backend,
      runtimeSession: runtimeRef?.id,
      businessSession: businessSession.id,
    },
  }
}

function mapRecommendationToInteractionResponse(
  request: AutoModeInteractionRequest,
  recommendation: AutoModeSecretaryRecommendation | null | undefined,
): SessionControlInteractionResponse | null {
  if (recommendation?.canAutoDecide !== true) {
    return null
  }

  if (request.kind === 'user-input') {
    if (recommendation.kind !== 'user-input' || !recommendation.answers) {
      return null
    }
    return {
      kind: 'user-input',
      request,
      answers: recommendation.answers,
      recommendation,
    }
  }

  if (recommendation.kind === 'user-input' || !recommendation.decision) {
    return null
  }

  return {
    kind: 'approval',
    request,
    decision: recommendation.decision,
    recommendation,
  }
}

function createControlSessionManager(context: SessionControlContext, cwd: string): SessionManager {
  const explicitFactory = context.runtime?.sessionControl?.createControlSession
  if (typeof explicitFactory === 'function') {
    const created = explicitFactory({ cwd, businessSession: resolveBusinessSessionRef(context) })
    if (isSessionManagerLike(created)) {
      return created
    }
  }

  return SessionManager.inMemory(cwd)
}

function bootstrapControlSession(
  manager: SessionManager,
  businessSession: SessionControlBusinessRef,
  trigger: SessionControlTrigger,
): void {
  manager.appendSessionInfo('AI Secretary Control')
  manager.appendCustomEntry(SESSION_CONTROL_CUSTOM_TYPE, {
    version: 1,
    kind: 'session-control.bootstrap',
    data: {
      trigger,
      businessSession,
    },
    createdAt: new Date().toISOString(),
  })
}

function resolveBusinessSessionManager(context: Pick<SessionControlContext, 'interactive' | 'runtime'>): any {
  return context.interactive?.sessionManager
    ?? context.interactive?.session?.sessionManager
    ?? context.runtime?.session?.sessionManager
    ?? context.runtime?.sessionManager
}

function resolveCurrentAutoEnabled(context: Pick<SessionControlContext, 'interactive' | 'runtime'>): boolean {
  return isLinxInteractiveAutoModeEnabled(context.interactive, context.runtime)
}

function resolveBusinessSessionRef(context: SessionControlContext): SessionControlBusinessRef {
  const archive = resolveBusinessSessionArchiveRef(context)
  return {
    id: archive.id
      ?? normalizeString(context.interactive?.session?.sessionId)
      ?? normalizeString(context.runtime?.sessionId),
    file: archive.file
      ?? normalizeString(context.interactive?.session?.sessionFile)
      ?? normalizeString(context.runtime?.sessionFile),
    cwd: normalizeString(context.interactive?.session?.cwd)
      ?? archive.cwd
      ?? normalizeString(context.runtime?.cwd)
      ?? normalizeString(context.sessionCwd)
      ?? process.cwd(),
  }
}

function resolveBusinessSessionArchiveRef(context: Pick<SessionControlContext, 'interactive' | 'runtime'>): SessionControlArchiveRef {
  const manager = resolveBusinessSessionManager(context)
  return {
    id: normalizeString(manager?.getSessionId?.()),
    file: normalizeString(manager?.getSessionFile?.()),
    cwd: normalizeString(manager?.getCwd?.()),
  }
}

function resolveControlSessionRef(manager: SessionManager, fallbackCwd: string): SessionControlSessionRef {
  const archive = resolveControlSessionArchiveRef(manager)
  return {
    id: archive.id ?? '',
    file: archive.file,
    dir: archive.dir,
    cwd: archive.cwd ?? fallbackCwd,
  }
}

function resolveControlSessionArchiveRef(manager: SessionManager): SessionControlArchiveRef {
  return {
    id: manager.getSessionId(),
    file: normalizeString(manager.getSessionFile?.()),
    dir: normalizeString(manager.getSessionDir?.()),
    cwd: normalizeString(manager.getCwd?.()),
  }
}

function resolveRuntimeRef(runtime: any): SessionControlRuntimeRef | undefined {
  const ref = runtime?.backendSessionRef
  if (ref && typeof ref === 'object') {
    return {
      id: normalizeString(ref.id),
      backend: normalizeString(ref.backend),
      cwd: normalizeString(ref.cwd),
      model: normalizeString(ref.model),
    }
  }

  const backend = normalizeString(runtime?.backendCommandRouter?.backend)
  const id = normalizeString(runtime?.sessionId)
  if (!backend && !id) {
    return undefined
  }

  return {
    id,
    backend,
    cwd: normalizeString(runtime?.cwd),
    model: normalizeString(runtime?.model),
  }
}

function resolveRequestKind(request: unknown): string | undefined {
  return typeof request === 'object' && request !== null && typeof (request as { kind?: unknown }).kind === 'string'
    ? (request as { kind: string }).kind
    : undefined
}

function buildSyntheticSessionRecord(input: {
  request: AutoModeInteractionRequest
  snapshot: SessionControlSnapshot
  runtime?: any
}): AutoModeSessionRecord {
  const runtimeRef = resolveRuntimeRef(input.runtime)
  const backend = normalizeAutoModeBackend(runtimeRef?.backend)
  const now = new Date().toISOString()
  return {
    id: runtimeRef?.id ?? input.snapshot.controlSession.id,
    backend,
    runtime: 'local',
    transport: backend === 'linx' ? undefined : 'acp',
    mode: 'auto',
    autoEnabled: true,
    cwd: runtimeRef?.cwd ?? input.snapshot.businessSession.cwd,
    ...(runtimeRef?.model ? { model: runtimeRef.model } : {}),
    passthroughArgs: [],
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
    command: backend === 'linx' ? 'linx' : backend,
    args: [],
    status: 'running',
    startedAt: input.snapshot.createdAt || now,
    archiveDir: '',
    eventsFile: '',
  }
}

function normalizeAutoModeBackend(value: unknown): AutoModeSessionRecord['backend'] {
  return value === 'codex' || value === 'claude' || value === 'codebuddy' ? value : 'linx'
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isSessionManagerLike(value: unknown): value is SessionManager {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { appendCustomEntry?: unknown }).appendCustomEntry === 'function'
    && typeof (value as { appendSessionInfo?: unknown }).appendSessionInfo === 'function'
    && typeof (value as { getSessionId?: unknown }).getSessionId === 'function'
}

function cloneSnapshot(snapshot: SessionControlSnapshot): SessionControlSnapshot {
  return {
    ...snapshot,
    controlSession: { ...snapshot.controlSession },
    businessSession: { ...snapshot.businessSession },
    blockedEvents: snapshot.blockedEvents.map((event) => ({
      ...event,
      source: {
        businessSession: { ...event.source.businessSession },
        runtime: event.source.runtime ? { ...event.source.runtime } : undefined,
      },
    })),
  }
}
