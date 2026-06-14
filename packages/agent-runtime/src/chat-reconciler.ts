import {
  type ReconcileDecisionSummary,
  type ReconcilerActorRef,
  type ReconcilerClientContext,
  type ReconcilerActorRole,
  type ThreadControlEvent,
  type ThreadPolicy,
  type ThreadPolicyKind,
} from './reconciler.js'
import { decideThreadControlEvent } from './thread-reconciler-controller.js'

export type ChatAppendRole = 'user' | 'assistant' | 'system'

export type ChatAppendSource =
  | 'web-chat'
  | 'cli-chat-store'
  | 'cli-pi-mirror'
  | 'cli-auto-mode'
  | 'service-runtime'
  | 'matrix'
  | 'secretary-runtime-intent'
  | 'primary-agent'
  | 'runtime'
  | 'worker'
  | (string & {})

export interface ChatAppendReconcilerInput {
  chat?: string
  thread: string
  resource?: string
  role: ChatAppendRole
  content: string
  actor?: ReconcilerActorRef
  source?: ChatAppendSource
  policy?: ThreadPolicyKind | ThreadPolicy
  autoEnabled?: boolean
  secretaryAgent?: string
  defaultAssistantAgent?: string
  createdAt?: Date | string | number
  randomId?: string
  client?: ReconcilerClientContext
  data?: Record<string, unknown>
}

export interface ChatAppendReconcilerResult {
  event: ThreadControlEvent
  summary: ReconcileDecisionSummary
}

export interface ChatReconcilerMetadata {
  version: 1
  latest: ReconcileDecisionSummary
  decisions: ReconcileDecisionSummary[]
}

export function reconcileChatAppend(input: ChatAppendReconcilerInput): ChatAppendReconcilerResult {
  const event = createChatAppendEvent(input)
  const { summary } = decideThreadControlEvent({
    policy: resolveChatAppendPolicy(input),
    event,
    ...(input.chat ? { chat: input.chat } : {}),
    thread: input.thread,
    ...(input.createdAt !== undefined ? { now: toDate(input.createdAt) } : {}),
    randomId: input.randomId ?? input.resource,
    ...(input.client ? { client: input.client } : {}),
  })

  return { event, summary }
}

export function createChatAppendEvent(input: ChatAppendReconcilerInput): ThreadControlEvent {
  const actor = input.actor ?? defaultActorForChatAppend(input)
  return {
    type: 'message.appended',
    ...(input.chat ? { chat: input.chat } : {}),
    thread: input.thread,
    ...(input.resource ? { resource: input.resource } : {}),
    actor,
    content: input.content,
    ...(input.createdAt !== undefined ? { createdAt: toDate(input.createdAt).toISOString() } : {}),
    data: {
      ...(input.data ?? {}),
      role: input.role,
      ...(input.source ? { source: input.source } : {}),
    },
  }
}

export function appendChatReconcilerMetadata(
  metadata: Record<string, unknown> | null | undefined,
  summary: ReconcileDecisionSummary,
): Record<string, unknown> {
  const base = isRecord(metadata) ? { ...metadata } : {}
  const existing = readChatReconcilerMetadata(base.reconciler)
  base.reconciler = {
    version: 1,
    latest: summary,
    decisions: [...(existing?.decisions ?? []), summary],
  } satisfies ChatReconcilerMetadata
  return base
}

export function readChatReconcilerMetadata(value: unknown): ChatReconcilerMetadata | null {
  if (!isRecord(value)) {
    return null
  }
  const latest = isRecord(value.latest) ? value.latest as unknown as ReconcileDecisionSummary : undefined
  const decisions = Array.isArray(value.decisions)
    ? value.decisions.filter(isRecord).map((item) => item as unknown as ReconcileDecisionSummary)
    : []
  if (!latest && decisions.length === 0) {
    return null
  }
  return {
    version: 1,
    latest: latest ?? decisions[decisions.length - 1]!,
    decisions: decisions.length > 0 ? decisions : [latest!],
  }
}

function resolveChatAppendPolicy(input: ChatAppendReconcilerInput): ThreadPolicyKind | ThreadPolicy {
  if (input.policy) {
    return input.policy
  }
  if (input.autoEnabled) {
    return {
      kind: 'auto',
      secretaryAgent: input.secretaryAgent ?? '__secretary__',
      defaultAssistantAgent: input.defaultAssistantAgent,
    }
  }
  return {
    kind: 'direct',
    defaultAssistantAgent: input.defaultAssistantAgent ?? 'primary-agent',
  }
}

function defaultActorForChatAppend(input: ChatAppendReconcilerInput): ReconcilerActorRef {
  if (input.role === 'user') {
    return { role: 'user' }
  }
  if (input.source === 'secretary-runtime-intent') {
    return { id: input.secretaryAgent ?? '__secretary__', role: 'secretary' }
  }
  if (input.source === 'worker') {
    return { role: 'worker' }
  }
  if (input.source === 'runtime') {
    return { role: 'runtime' }
  }
  if (input.source === 'primary-agent') {
    return { id: input.defaultAssistantAgent ?? 'primary-agent', role: 'primary-agent' }
  }
  if (input.role === 'assistant') {
    return { role: 'assistant' }
  }
  return { role: 'runtime' satisfies ReconcilerActorRole }
}

function toDate(value: Date | string | number): Date {
  if (value instanceof Date) {
    return value
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid chat append timestamp: ${String(value)}`)
  }
  return date
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
