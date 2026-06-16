import type { AgentParticipantRole } from './turn-controller.js'
import {
  canClientCoordinateThread,
  type ClientReconcilerLease,
  type ReconcilerOwner,
  resolveReconcilerOwnership,
} from './coordination.js'

export type ThreadPolicyKind = 'direct' | 'auto' | 'symphony' | 'open_group' | 'review'

export type ThreadKind =
  | 'main'
  | 'control'
  | 'worker'
  | 'review'
  | 'schedule'
  | 'schedule_run'

export type ReconcilerEventType =
  | 'message.appended'
  | 'input.required'
  | 'approval.required'
  | 'inbox.notification.created'
  | 'inbox.notification.updated'
  | 'delivery.submitted'
  | 'delivery.completed'
  | 'delivery.failed'
  | 'schedule.tick'
  | 'worker.blocked'
  | 'change.requested'
  | 'issue.updated'
  | 'task.updated'
  | 'run.updated'
  | (string & {})

export type ReconcilerActorRole =
  | AgentParticipantRole
  | 'worker'
  | 'reviewer'
  | 'runtime'
  | 'scheduler'
  | 'tool'
  | 'assistant'

export type WakeJobTargetRole = AgentParticipantRole | 'worker' | 'reviewer'
export type WakeJobPriority = 'low' | 'normal' | 'high'
export type WakeJobStatus = 'queued'
export type ReconcilerNotificationAudience = 'user'
export type ReconcilerNotificationChannel = 'inbox'
export type ReconcilerClientFocusState = 'focused' | 'background' | 'closed'
export type ReconcilerControlResourceClaimStatus = 'claimed' | 'lost' | 'display_only' | 'none'

export interface ReconcilerControlResourceClaimState {
  status: ReconcilerControlResourceClaimStatus
  controlResource?: string
  leaseOwner?: string
  leaseExpiresAt?: string
  reason?: string
}

export interface ReconcilerClientContext {
  id: string
  agentCapable?: boolean
  secretaryRuntimeAvailable?: boolean
  focusState?: ReconcilerClientFocusState
  activeThread?: string
  activeChat?: string
  generationLocked?: boolean
  controlResourceClaim?: ReconcilerControlResourceClaimState
}

export interface SecretaryInboxWakeContext {
  eventId: string
  eventType: ReconcilerEventType
  controlResource?: string
  sourceThread?: string
  sourceRun?: string
  sourceTask?: string
  requestKind?: string
  priority: WakeJobPriority
  shortSummary?: string
}

export interface ReconcilerActorRef {
  id?: string
  role?: ReconcilerActorRole
  label?: string
}

export interface ReconcilerAgentRef {
  id: string
  role?: WakeJobTargetRole
  aliases?: string[]
  subscribed?: boolean
}

export interface ThreadControlEvent<TData extends Record<string, unknown> = Record<string, unknown>> {
  id?: string
  type: ReconcilerEventType
  chat?: string
  thread?: string
  resource?: string
  actor?: ReconcilerActorRef
  content?: string
  createdAt?: string
  data?: TData
}

export interface ThreadPolicy {
  kind: ThreadPolicyKind
  reconcilerOwner?: ReconcilerOwner
  humanAuthorities?: string[]
  humanAuthorityCount?: number
  secretaryAgent?: string
  defaultAssistantAgent?: string
  assignedWorkerAgent?: string
  reviewerAgent?: string
  subscribedAgents?: string[]
  agents?: ReconcilerAgentRef[]
}

export interface ThreadPlacement {
  chat?: string
  thread: string
  kind: ThreadKind
  parentThread?: string
  rootThread?: string
  splitFrom?: string
  splitReason?: string
}

export interface WakeJob {
  id: string
  thread: string
  chat?: string
  targetAgent: string
  targetRole: WakeJobTargetRole
  trigger: ReconcilerEventType
  priority: WakeJobPriority
  status: WakeJobStatus
  reason: string
  sourceEventId?: string
  sourceEventType: ReconcilerEventType
  createdAt: string
}

export interface ReconcilerNotificationEvent {
  id: string
  thread: string
  chat?: string
  audience: ReconcilerNotificationAudience
  channel: ReconcilerNotificationChannel
  priority: WakeJobPriority
  reason: string
  sourceEventId?: string
  sourceEventType: ReconcilerEventType
  sourceResource?: string
  inboxNotification?: string
  sourceThread?: string
  sourceRun?: string
  sourceTask?: string
  requestKind?: string
  shortSummary?: string
  createdAt: string
}

export interface ReconcileDecision {
  id: string
  policyKind: ThreadPolicyKind
  reconcilerOwner: ReconcilerOwner
  event: ThreadControlEvent
  placement: ThreadPlacement
  wakeJobs: WakeJob[]
  notificationEvents?: ReconcilerNotificationEvent[]
  skippedReason?: string
  createdAt: string
}

export interface WakeJobSummary {
  id: string
  thread: string
  chat?: string
  targetAgent: string
  targetRole: WakeJobTargetRole
  trigger: ReconcilerEventType
  priority: WakeJobPriority
  status: WakeJobStatus
  reason: string
  sourceEventId?: string
  sourceEventType: ReconcilerEventType
  sourceResource?: string
  inboxNotification?: string
  controlGate?: string
}

export interface ReconcileDecisionSummary {
  id: string
  policyKind: ThreadPolicyKind
  reconcilerOwner: ReconcilerOwner
  eventType: ReconcilerEventType
  thread: string
  chat?: string
  skippedReason?: string
  wakeJobs: WakeJobSummary[]
  notificationEvents?: ReconcilerNotificationEvent[]
  createdAt: string
}

export interface ReconcileThreadEventInput {
  policy: ThreadPolicyKind | ThreadPolicy
  event: ThreadControlEvent
  reconcilerOwner?: ReconcilerOwner
  humanAuthorities?: string[]
  humanAuthorityCount?: number
  clientReconcilerLease?: ClientReconcilerLease | null
  requireClientReconcilerLease?: boolean
  chat?: string
  thread?: string
  now?: Date
  randomId?: string
  client?: ReconcilerClientContext
}

export interface ThreadReconciler {
  readonly policy: ThreadPolicy
  reconcile(event: ThreadControlEvent, options?: Omit<ReconcileThreadEventInput, 'policy' | 'event'>): ReconcileDecision
}

const DEFAULT_SECRETARY_AGENT = '__secretary__'
const DEFAULT_ASSISTANT_AGENT = 'primary-agent'
const DEFAULT_REVIEWER_AGENT = 'ai-reviewer'

export function createThreadReconciler(policy: ThreadPolicyKind | ThreadPolicy): ThreadReconciler {
  const normalized = normalizeThreadPolicy(policy)
  return {
    policy: normalized,
    reconcile(event, options = {}) {
      return reconcileThreadEvent({
        ...options,
        policy: normalized,
        event,
      })
    },
  }
}

export function reconcileThreadEvent(input: ReconcileThreadEventInput): ReconcileDecision {
  const policy = normalizeThreadPolicy(input.policy)
  const createdAt = (input.now ?? new Date()).toISOString()
  const event = normalizeThreadEvent(input.event, input, createdAt)
  const placement = resolveThreadPlacement({
    event,
    chat: input.chat,
    thread: input.thread,
    randomId: input.randomId,
  })
  const ownership = resolveReconcilerOwnership({
    policyKind: policy.kind,
    humanAuthorities: input.humanAuthorities ?? policy.humanAuthorities,
    humanAuthorityCount: input.humanAuthorityCount ?? policy.humanAuthorityCount,
    reconcilerOwner: input.reconcilerOwner ?? policy.reconcilerOwner,
  })
  const clientCoordinationSkip = resolveClientCoordinationSkip({
    ownership,
    input,
    placement,
    createdAt,
  })
  const jobs = clientCoordinationSkip
    ? []
    : selectWakeJobs(policy, event, placement, createdAt, input.randomId, input.client)
  const notificationEvents = selectNotificationEvents(event, placement, createdAt, input.randomId)
  const skippedReason = clientCoordinationSkip ?? (jobs.length === 0 ? skipReasonFor(policy, event, input.client) : undefined)

  return {
    id: createReconcilerId('decision', input.randomId),
    policyKind: policy.kind,
    reconcilerOwner: ownership.reconcilerOwner,
    event,
    placement,
    wakeJobs: jobs,
    ...(notificationEvents.length > 0 ? { notificationEvents } : {}),
    ...(skippedReason ? { skippedReason } : {}),
    createdAt,
  }
}

export function summarizeReconcileDecision(decision: ReconcileDecision): ReconcileDecisionSummary {
  return {
    id: decision.id,
    policyKind: decision.policyKind,
    reconcilerOwner: decision.reconcilerOwner,
    eventType: decision.event.type,
    thread: decision.placement.thread,
    ...(decision.placement.chat ? { chat: decision.placement.chat } : {}),
    ...(decision.skippedReason ? { skippedReason: decision.skippedReason } : {}),
    wakeJobs: decision.wakeJobs.map((job) => ({
      id: job.id,
      thread: job.thread,
      ...(job.chat ? { chat: job.chat } : {}),
      targetAgent: job.targetAgent,
      targetRole: job.targetRole,
      trigger: job.trigger,
      priority: job.priority,
      status: job.status,
      reason: job.reason,
      ...(job.sourceEventId ? { sourceEventId: job.sourceEventId } : {}),
      sourceEventType: job.sourceEventType,
      ...(decision.event.resource ? { sourceResource: decision.event.resource } : {}),
      ...(normalizeText(decision.event.data?.inboxNotification) ? { inboxNotification: normalizeText(decision.event.data?.inboxNotification)! } : {}),
      ...(resolveControlGate(decision.event) ? { controlGate: resolveControlGate(decision.event)! } : {}),
    })),
    ...(decision.notificationEvents && decision.notificationEvents.length > 0
      ? { notificationEvents: decision.notificationEvents.map((event) => ({ ...event })) }
      : {}),
    createdAt: decision.createdAt,
  }
}

export function resolveThreadPlacement(input: {
  event: ThreadControlEvent
  chat?: string
  thread?: string
  randomId?: string
}): ThreadPlacement {
  const chat = normalizeText(input.event.chat) ?? normalizeText(input.chat)
  const explicitThread = normalizeText(input.event.thread) ?? normalizeText(input.thread)

  if (input.event.type === 'schedule.tick') {
    const scheduleId = normalizeText(input.event.resource)
      ?? normalizeText(input.event.data?.schedule)
      ?? normalizeText(input.event.data?.scheduleId)
      ?? normalizeText(input.event.id)
      ?? normalizeText(input.randomId)
      ?? 'default'
    const scheduleThread = explicitThread ?? createSyntheticThreadUri('schedule', scheduleId)
    const shouldSplit = input.event.data?.splitThread === true
      || input.event.data?.longRunning === true
      || input.event.data?.noisy === true
      || input.event.data?.needsReview === true
      || input.event.data?.workerOwned === true

    if (shouldSplit) {
      return {
        ...(chat ? { chat } : {}),
        thread: createSyntheticThreadUri('schedule-run', `${scheduleId}-${input.randomId ?? input.event.id ?? 'tick'}`),
        kind: 'schedule_run',
        parentThread: scheduleThread,
        rootThread: scheduleThread,
        splitFrom: scheduleThread,
        splitReason: normalizeText(input.event.data?.splitReason) ?? 'schedule tick needs an execution thread',
      }
    }

    return {
      ...(chat ? { chat } : {}),
      thread: scheduleThread,
      kind: 'schedule',
    }
  }

  if (explicitThread) {
    return {
      ...(chat ? { chat } : {}),
      thread: explicitThread,
      kind: threadKindFromEvent(input.event),
    }
  }

  if (chat) {
    return {
      chat,
      thread: createSyntheticThreadUri('control', chat),
      kind: 'control',
    }
  }

  return {
    thread: 'urn:undefineds:linx:thread:system-control',
    kind: 'control',
  }
}

function resolveClientCoordinationSkip(input: {
  ownership: { reconcilerOwner: ReconcilerOwner }
  input: ReconcileThreadEventInput
  placement: ThreadPlacement
  createdAt: string
}): string | undefined {
  if (input.ownership.reconcilerOwner !== 'client') {
    return undefined
  }
  if (!input.input.requireClientReconcilerLease && !input.input.clientReconcilerLease) {
    return undefined
  }
  const clientId = input.input.client?.id
  if (canClientCoordinateThread({
    clientId,
    thread: input.placement.thread,
    lease: input.input.clientReconcilerLease,
    now: input.createdAt,
  })) {
    return undefined
  }
  const owner = input.input.clientReconcilerLease?.ownerClientId
  return owner
    ? `Client-owned Reconciler is leased by ${owner}; client ${clientId ?? 'unknown'} must not reconcile ${input.placement.thread}.`
    : `Client-owned Reconciler requires an active client coordinator lease for ${input.placement.thread}.`
}

function selectWakeJobs(
  policy: ThreadPolicy,
  event: ThreadControlEvent,
  placement: ThreadPlacement,
  createdAt: string,
  randomId?: string,
  client?: ReconcilerClientContext,
): WakeJob[] {
  if (policy.kind === 'direct') {
    return isUserMessage(event)
      ? [createWakeJob(policy, event, placement, {
        targetAgent: policy.defaultAssistantAgent ?? DEFAULT_ASSISTANT_AGENT,
        targetRole: 'primary-agent',
        priority: 'normal',
        reason: 'Single-human assistant surfaces route user messages to the default assistant.',
        createdAt,
        randomId,
      })]
      : []
  }

  if (policy.kind === 'auto') {
    if (isActionableInboxEvent(event)) {
      return canClientScheduleInboxWake(client, event, createdAt)
        ? [createSecretaryWakeJob(policy, event, placement, 'Auto mode claimed an actionable control resource on this client and schedules the same-Thread Secretary to check Inbox.', 'high', createdAt, randomId)]
        : []
    }
    if (isInputApprovalOrBlocker(event)) {
      return [createSecretaryWakeJob(policy, event, placement, 'Auto mode routes input, approval, and blocker events to the same-Thread Secretary.', 'high', createdAt, randomId)]
    }
    if (isUserMessage(event)) {
      return [createSecretaryWakeJob(policy, event, placement, 'Auto mode routes user messages and steering input to the same-Thread Secretary before runtime projection.', 'normal', createdAt, randomId)]
    }
    if (isPrimaryAgentMessage(event)) {
      return [createSecretaryWakeJob(policy, event, placement, 'Auto mode treats the latest backend message as a candidate next user-input slot.', 'normal', createdAt, randomId)]
    }
    return []
  }

  if (policy.kind === 'symphony') {
    if (isActionableInboxEvent(event)) {
      return canClientScheduleInboxWake(client, event, createdAt)
        ? [createSecretaryWakeJob(policy, event, placement, 'Symphony claimed an actionable control resource on this client and schedules Secretary to check Inbox; the payload is runtime control context, not a human user message.', 'high', createdAt, randomId)]
        : []
    }
    if (isInputApprovalOrBlocker(event) || event.type === 'change.requested') {
      return [createSecretaryWakeJob(policy, event, placement, 'Symphony routes blocker, input, approval, and change requests to Secretary for semantic judgment.', 'high', createdAt, randomId)]
    }
    if (event.type === 'delivery.submitted') {
      if (isTaskDispatchDelivery(event) && policy.assignedWorkerAgent) {
        return [createWakeJob(policy, event, placement, {
          targetAgent: policy.assignedWorkerAgent,
          targetRole: 'worker',
          priority: 'normal',
          reason: 'Symphony task-dispatch Delivery wakes the assigned worker through the scheduler.',
          createdAt,
          randomId,
        })]
      }
      return [createSecretaryWakeJob(policy, event, placement, 'Symphony Delivery submissions wake Secretary for review or routing.', 'normal', createdAt, randomId)]
    }
    if (event.type === 'delivery.completed') {
      return [createSecretaryWakeJob(policy, event, placement, 'Symphony completion Delivery wakes Secretary for quality, acceptance, and follow-up extraction reconciliation.', 'high', createdAt, randomId)]
    }
    if (event.type === 'delivery.failed') {
      return [createSecretaryWakeJob(policy, event, placement, 'Symphony failed Delivery wakes Secretary for feasibility, retry, scope change, or follow-up extraction reconciliation.', 'high', createdAt, randomId)]
    }
    if (event.type === 'issue.updated' || event.type === 'task.updated' || event.type === 'run.updated') {
      return [createSecretaryWakeJob(policy, event, placement, 'Symphony state changes wake Secretary to reconcile system state.', 'normal', createdAt, randomId)]
    }
    if (event.type === 'schedule.tick') {
      return [createSecretaryWakeJob(policy, event, placement, 'Schedule ticks are Thread events; Symphony wakes Secretary to decide whether to keep, split, or dispatch work.', 'normal', createdAt, randomId)]
    }
    return []
  }

  if (policy.kind === 'open_group') {
    const targets = resolveOpenGroupTargets(policy, event)
    return targets.map((agent, index) => createWakeJob(policy, event, placement, {
      targetAgent: agent.id,
      targetRole: agent.role ?? 'primary-agent',
      priority: 'normal',
      reason: agent.subscribed ? 'Open group policy wakes a subscribed agent.' : 'Open group policy wakes a mentioned agent.',
      createdAt,
      randomId: `${randomId ?? event.id ?? 'event'}-${index + 1}`,
    }))
  }

  if (policy.kind === 'review') {
    if (event.type === 'delivery.submitted' || event.type === 'delivery.completed' || event.type === 'delivery.failed') {
      const reviewer = policy.reviewerAgent ?? policy.secretaryAgent ?? DEFAULT_REVIEWER_AGENT
      return [createWakeJob(policy, event, placement, {
        targetAgent: reviewer,
        targetRole: policy.reviewerAgent ? 'reviewer' : 'secretary',
        priority: event.type === 'delivery.failed' ? 'high' : 'normal',
        reason: 'Review policy routes Delivery boundaries to reviewer or Secretary.',
        createdAt,
        randomId,
      })]
    }
    return []
  }

  return []
}

function selectNotificationEvents(
  event: ThreadControlEvent,
  placement: ThreadPlacement,
  createdAt: string,
  randomId?: string,
): ReconcilerNotificationEvent[] {
  if (!isActionableInboxEvent(event)) {
    return []
  }

  const wakeContext = buildSecretaryInboxWakeContext(event, { priority: 'high' })
  return [{
    id: createReconcilerId('notice', randomId ?? event.id),
    thread: placement.thread,
    ...(placement.chat ? { chat: placement.chat } : {}),
    audience: 'user',
    channel: 'inbox',
    priority: 'high',
    reason: 'Inbox envelope changed; notify subscribed clients to refresh Inbox and read the linked control resource without converting it into chat.',
    ...(event.id ? { sourceEventId: event.id } : {}),
    sourceEventType: event.type,
    ...(event.resource ? { sourceResource: event.resource } : {}),
    ...(normalizeText(event.data?.inboxNotification) ? { inboxNotification: normalizeText(event.data?.inboxNotification)! } : {}),
    ...(wakeContext.sourceThread ? { sourceThread: wakeContext.sourceThread } : {}),
    ...(wakeContext.sourceRun ? { sourceRun: wakeContext.sourceRun } : {}),
    ...(wakeContext.sourceTask ? { sourceTask: wakeContext.sourceTask } : {}),
    ...(wakeContext.requestKind ? { requestKind: wakeContext.requestKind } : {}),
    ...(wakeContext.shortSummary ? { shortSummary: wakeContext.shortSummary } : {}),
    createdAt,
  }]
}

export function buildSecretaryInboxWakeContext(
  event: ThreadControlEvent,
  options: { priority?: WakeJobPriority } = {},
): SecretaryInboxWakeContext {
  const controlResource = normalizeText(event.resource)
    ?? normalizeText(event.data?.controlResource)
    ?? normalizeText(event.data?.controlResourceId)
    ?? normalizeText(event.data?.approval)
    ?? normalizeText(event.data?.inputRequest)
  const requestKind = normalizeText(event.data?.requestKind)
    ?? normalizeText(event.data?.kind)
    ?? normalizeText(event.data?.type)
  const sourceThread = normalizeText(event.data?.sourceThread)
  const sourceRun = normalizeText(event.data?.sourceRun)
  const sourceTask = normalizeText(event.data?.sourceTask)
  const shortSummary = normalizeText(event.data?.shortSummary)
    ?? normalizeText(event.data?.summary)
    ?? normalizeText(event.content)
  return {
    eventId: event.id ?? createReconcilerId('event', controlResource ?? requestKind),
    eventType: event.type,
    ...(controlResource ? { controlResource } : {}),
    ...(sourceThread ? { sourceThread } : {}),
    ...(sourceRun ? { sourceRun } : {}),
    ...(sourceTask ? { sourceTask } : {}),
    ...(requestKind ? { requestKind } : {}),
    priority: options.priority ?? 'normal',
    ...(shortSummary ? { shortSummary } : {}),
  }
}

export function canClientScheduleInboxWake(
  client: ReconcilerClientContext | undefined,
  event: ThreadControlEvent,
  now: Date | string | number = Date.now(),
): boolean {
  if (!client || !isActionableInboxEvent(event)) {
    return false
  }
  if (client.agentCapable !== true) {
    return false
  }
  if (client.secretaryRuntimeAvailable === false) {
    return false
  }
  const claim = client.controlResourceClaim
  if (!claim || claim.status !== 'claimed') {
    return false
  }
  const eventControlResource = normalizeText(event.resource)
    ?? normalizeText(event.data?.controlResource)
    ?? normalizeText(event.data?.controlResourceId)
  const claimControlResource = normalizeText(claim.controlResource)
  if (eventControlResource && claimControlResource && eventControlResource !== claimControlResource) {
    return false
  }
  const leaseOwner = normalizeText(claim.leaseOwner)
  if (leaseOwner && leaseOwner !== client.id) {
    return false
  }
  if (claim.leaseExpiresAt) {
    const expiresAt = Date.parse(claim.leaseExpiresAt)
    const nowMs = typeof now === 'number' ? now : Date.parse(now instanceof Date ? now.toISOString() : now)
    if (!Number.isNaN(expiresAt) && !Number.isNaN(nowMs) && expiresAt <= nowMs) {
      return false
    }
  }
  return true
}

function createSecretaryWakeJob(
  policy: ThreadPolicy,
  event: ThreadControlEvent,
  placement: ThreadPlacement,
  reason: string,
  priority: WakeJobPriority,
  createdAt: string,
  randomId?: string,
): WakeJob {
  return createWakeJob(policy, event, placement, {
    targetAgent: policy.secretaryAgent ?? DEFAULT_SECRETARY_AGENT,
    targetRole: 'secretary',
    priority,
    reason,
    createdAt,
    randomId,
  })
}

function createWakeJob(
  _policy: ThreadPolicy,
  event: ThreadControlEvent,
  placement: ThreadPlacement,
  input: {
    targetAgent: string
    targetRole: WakeJobTargetRole
    priority: WakeJobPriority
    reason: string
    createdAt: string
    randomId?: string
  },
): WakeJob {
  return {
    id: createReconcilerId('wake', input.randomId ?? event.id),
    thread: placement.thread,
    ...(placement.chat ? { chat: placement.chat } : {}),
    targetAgent: input.targetAgent,
    targetRole: input.targetRole,
    trigger: event.type,
    priority: input.priority,
    status: 'queued',
    reason: input.reason,
    ...(event.id ? { sourceEventId: event.id } : {}),
    sourceEventType: event.type,
    createdAt: input.createdAt,
  }
}

function normalizeThreadPolicy(policy: ThreadPolicyKind | ThreadPolicy): ThreadPolicy {
  return typeof policy === 'string' ? { kind: policy } : policy
}

function normalizeThreadEvent(
  event: ThreadControlEvent,
  input: ReconcileThreadEventInput,
  createdAt: string,
): ThreadControlEvent {
  return {
    ...event,
    ...(event.chat ?? input.chat ? { chat: event.chat ?? input.chat } : {}),
    ...(event.thread ?? input.thread ? { thread: event.thread ?? input.thread } : {}),
    id: event.id ?? createReconcilerId('event', input.randomId),
    createdAt: event.createdAt ?? createdAt,
  }
}

function threadKindFromEvent(event: ThreadControlEvent): ThreadKind {
  if (event.type === 'delivery.submitted' || event.type === 'delivery.completed' || event.type === 'delivery.failed') {
    return 'worker'
  }
  if (event.type === 'schedule.tick') {
    return 'schedule'
  }
  if (event.type === 'issue.updated' || event.type === 'task.updated' || event.type === 'run.updated') {
    return 'control'
  }
  if (isInboxEvent(event)) {
    return 'control'
  }
  return 'main'
}

function isInputApprovalOrBlocker(event: ThreadControlEvent): boolean {
  return event.type === 'input.required' || event.type === 'approval.required' || event.type === 'worker.blocked'
}

function resolveControlGate(event: ThreadControlEvent): string | undefined {
  if (isInboxEvent(event)) {
    const explicitGate = normalizeText(event.data?.controlGate)
    if (explicitGate) {
      return explicitGate
    }
    const requestKind = normalizeText(event.data?.requestKind)
      ?? normalizeText(event.data?.kind)
      ?? normalizeText(event.data?.type)
    if (requestKind && /approval|auth|credential|grant|permission|destructive/iu.test(requestKind)) {
      return 'authority'
    }
    if (requestKind && /block|fail|feasibil/iu.test(requestKind)) {
      return 'feasibility'
    }
    if (requestKind && /change|scope|rebase|steer/iu.test(requestKind)) {
      return 'change'
    }
    return 'binding'
  }
  if (event.type === 'input.required' || event.type === 'approval.required') {
    return 'authority'
  }
  if (event.type === 'worker.blocked') {
    return 'feasibility'
  }
  if (event.type === 'change.requested') {
    return 'change'
  }
  if (event.type === 'delivery.completed') {
    return 'quality'
  }
  if (event.type === 'delivery.failed') {
    return 'feasibility'
  }
  if (event.type === 'issue.updated' || event.type === 'task.updated' || event.type === 'run.updated') {
    return 'binding'
  }
  if (event.type === 'schedule.tick') {
    return 'binding'
  }
  return undefined
}

function isUserMessage(event: ThreadControlEvent): boolean {
  return event.type === 'message.appended'
    && (event.actor?.role === 'user' || event.data?.role === 'user')
}

function isPrimaryAgentMessage(event: ThreadControlEvent): boolean {
  if (event.actor?.role === 'secretary') {
    return false
  }
  return event.type === 'message.appended'
    && (
      event.actor?.role === 'primary-agent'
      || event.actor?.role === 'assistant'
      || event.actor?.role === 'worker'
      || event.actor?.role === 'runtime'
      || event.data?.role === 'assistant'
      || event.data?.source === 'primary-agent'
    )
}

function isInboxEvent(event: ThreadControlEvent): boolean {
  return event.type === 'inbox.notification.created' || event.type === 'inbox.notification.updated'
}

function isActionableInboxEvent(event: ThreadControlEvent): boolean {
  if (!isInboxEvent(event)) {
    return false
  }
  const status = normalizeText(event.data?.status)
  if (!status) {
    return event.type === 'inbox.notification.created'
  }
  return status === 'pending' || status === 'handling'
}

function isTaskDispatchDelivery(event: ThreadControlEvent): boolean {
  return event.data?.deliveryType === 'task_dispatch'
    || event.data?.type === 'task_dispatch'
    || event.data?.dispatch === true
}

function resolveOpenGroupTargets(policy: ThreadPolicy, event: ThreadControlEvent): ReconcilerAgentRef[] {
  const agents = policy.agents ?? []
  const explicit = normalizeStringArray(event.data?.mentions)
  const mentioned = explicit.length > 0
    ? agents.filter((agent) => {
      const aliases = [agent.id, ...(agent.aliases ?? [])].map((item) => item.toLowerCase())
      return explicit.some((mention) => aliases.includes(mention.toLowerCase()))
    })
    : agents.filter((agent) => isMentioned(event.content, agent))
  const subscribed = agents.filter((agent) => {
    if (!agent.subscribed) {
      return false
    }
    return !mentioned.some((item) => item.id === agent.id)
  })
  const subscribedIds = new Set(policy.subscribedAgents ?? [])
  const policySubscribed = agents.filter((agent) => {
    if (!subscribedIds.has(agent.id)) {
      return false
    }
    return !mentioned.some((item) => item.id === agent.id) && !subscribed.some((item) => item.id === agent.id)
  })
  return [...mentioned, ...subscribed, ...policySubscribed]
}

function isMentioned(content: string | undefined, agent: ReconcilerAgentRef): boolean {
  if (!content) {
    return false
  }
  const normalized = content.toLowerCase()
  return [agent.id, ...(agent.aliases ?? [])]
    .filter(Boolean)
    .some((name) => normalized.includes(`@${name.toLowerCase()}`))
}

function skipReasonFor(
  policy: ThreadPolicy,
  event: ThreadControlEvent,
  client?: ReconcilerClientContext,
): string {
  if (policy.kind === 'open_group') {
    return 'No mentioned or subscribed agents matched the event.'
  }
  if (isActionableInboxEvent(event) && (policy.kind === 'auto' || policy.kind === 'symphony')) {
    if (!client) {
      return `Policy ${policy.kind} keeps ${event.type} display-only until a subscribed client claims the control resource.`
    }
    const claimStatus = client.controlResourceClaim?.status ?? 'none'
    return `Policy ${policy.kind} keeps ${event.type} display-only for client ${client.id} because control resource claim status is ${claimStatus}.`
  }
  return `Policy ${policy.kind} does not wake an agent for ${event.type}.`
}

function createSyntheticThreadUri(kind: string, value: string): string {
  return `urn:undefineds:linx:thread:${kind}:${safeUriSegment(value)}`
}

function createReconcilerId(prefix: string, randomId?: string): string {
  const suffix = normalizeText(randomId)
    ?? globalThis.crypto?.randomUUID?.()
    ?? Math.random().toString(36).slice(2, 10).padEnd(8, '0')
  return `${prefix}_${safeUriSegment(suffix)}`
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter((item): item is string => Boolean(item))
    : []
}

function safeUriSegment(value: string): string {
  const normalized = value
    .replace(/[^a-zA-Z0-9._:-]/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 160)
  return normalized || 'unknown'
}
