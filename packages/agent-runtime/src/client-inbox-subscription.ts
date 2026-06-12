import {
  buildSecretaryInboxWakeContext,
  type ReconcilerActorRef,
  type ReconcilerClientContext,
  type ReconcilerClientFocusState,
  type ReconcilerEventType,
  type ReconcilerControlResourceClaimState,
  type SecretaryInboxWakeContext,
  type ThreadControlEvent,
  type WakeJobPriority,
} from './reconciler.js'

type MaybePromise<T> = T | Promise<T>

export type InboxSubscriptionEventType = 'inbox.notification.created' | 'inbox.notification.updated'
export type InboxSubscriptionItemStatus = 'pending' | 'handling' | 'resolved' | 'rejected' | 'expired' | (string & {})

export interface InboxSubscriptionEvent {
  id?: string
  type: InboxSubscriptionEventType
  /** ActivityStreams notification resource under /inbox/. Envelope only; never claimed. */
  inboxNotification?: string
  /** Linked ApprovalRequest/InputRequest/control resource from as:object. This is the claim target. */
  controlResource: string
  chat?: string
  thread?: string
  actor?: ReconcilerActorRef
  status?: InboxSubscriptionItemStatus
  requestKind?: string
  sourceThread?: string
  sourceRun?: string
  sourceTask?: string
  priority?: WakeJobPriority
  shortSummary?: string
  createdAt?: string
  data?: Record<string, unknown>
}

export interface InboxClientPresence {
  clientId: string
  agentCapable?: boolean
  secretaryRuntimeAvailable?: boolean
  focusState?: ReconcilerClientFocusState
  activeThread?: string
  activeChat?: string
  generationLocked?: boolean
}

export interface ControlResourceClaimRequest {
  clientId: string
  controlResource: string
  eventId?: string
  eventType: InboxSubscriptionEventType
  requestedLeaseMs?: number
}

export type ControlResourceClaimHandler = (request: ControlResourceClaimRequest) => MaybePromise<ReconcilerControlResourceClaimState>

export interface PrepareInboxSubscriptionForClientInput {
  event: InboxSubscriptionEvent
  client: InboxClientPresence
  claimControlResource?: ControlResourceClaimHandler
  requestedLeaseMs?: number
}

export interface PreparedInboxSubscriptionForClient {
  event: ThreadControlEvent
  client: ReconcilerClientContext
  wakeContext: SecretaryInboxWakeContext
}

export function buildInboxControlEventFromSubscription(input: InboxSubscriptionEvent): ThreadControlEvent {
  const data = {
    ...(input.data ?? {}),
    status: input.status ?? input.data?.status ?? 'pending',
    ...(input.requestKind ? { requestKind: input.requestKind } : {}),
    ...(input.sourceThread ? { sourceThread: input.sourceThread } : {}),
    ...(input.sourceRun ? { sourceRun: input.sourceRun } : {}),
    ...(input.sourceTask ? { sourceTask: input.sourceTask } : {}),
    ...(input.priority ? { priority: input.priority } : {}),
    ...(input.shortSummary ? { shortSummary: input.shortSummary } : {}),
    ...(input.inboxNotification ? { inboxNotification: input.inboxNotification } : {}),
    controlResource: input.controlResource,
  }

  return {
    ...(input.id ? { id: input.id } : {}),
    type: input.type as ReconcilerEventType,
    ...(input.chat ? { chat: input.chat } : {}),
    ...(input.thread ? { thread: input.thread } : {}),
    resource: input.controlResource,
    actor: input.actor ?? { role: 'runtime', id: 'pod-subscription' },
    ...(input.shortSummary ? { content: input.shortSummary } : {}),
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    data,
  }
}

export async function prepareInboxSubscriptionForClient(
  input: PrepareInboxSubscriptionForClientInput,
): Promise<PreparedInboxSubscriptionForClient> {
  const event = buildInboxControlEventFromSubscription(input.event)
  const claim = await resolveControlResourceClaim(input)
  const client = buildReconcilerClientContextFromControlResourceClaim(input.client, claim)
  return {
    event,
    client,
    wakeContext: buildSecretaryInboxWakeContext(event, { priority: input.event.priority ?? 'high' }),
  }
}

export function buildReconcilerClientContextFromControlResourceClaim(
  presence: InboxClientPresence,
  claim: ReconcilerControlResourceClaimState,
): ReconcilerClientContext {
  return {
    id: presence.clientId,
    ...(presence.agentCapable !== undefined ? { agentCapable: presence.agentCapable } : {}),
    ...(presence.secretaryRuntimeAvailable !== undefined ? { secretaryRuntimeAvailable: presence.secretaryRuntimeAvailable } : {}),
    ...(presence.focusState ? { focusState: presence.focusState } : {}),
    ...(presence.activeThread ? { activeThread: presence.activeThread } : {}),
    ...(presence.activeChat ? { activeChat: presence.activeChat } : {}),
    ...(presence.generationLocked !== undefined ? { generationLocked: presence.generationLocked } : {}),
    controlResourceClaim: claim,
  }
}

async function resolveControlResourceClaim(
  input: PrepareInboxSubscriptionForClientInput,
): Promise<ReconcilerControlResourceClaimState> {
  if (!shouldAttemptControlResourceClaim(input.event, input.client)) {
    return {
      status: 'display_only',
      controlResource: input.event.controlResource,
      reason: 'Client is not eligible to handle this Inbox subscription event.',
    }
  }

  if (!input.claimControlResource) {
    return {
      status: 'display_only',
      controlResource: input.event.controlResource,
      reason: 'No control-resource claim handler was provided for this client.',
    }
  }

  return input.claimControlResource({
    clientId: input.client.clientId,
    controlResource: input.event.controlResource,
    eventId: input.event.id,
    eventType: input.event.type,
    requestedLeaseMs: input.requestedLeaseMs,
  })
}

function shouldAttemptControlResourceClaim(event: InboxSubscriptionEvent, client: InboxClientPresence): boolean {
  if (!isActionableInboxStatus(event.status ?? event.data?.status)) {
    return false
  }
  if (client.agentCapable !== true) {
    return false
  }
  if (client.secretaryRuntimeAvailable === false) {
    return false
  }
  if (client.focusState === 'closed') {
    return false
  }
  return true
}

function isActionableInboxStatus(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) {
    return true
  }
  const status = value.trim()
  return status === 'pending' || status === 'handling'
}
