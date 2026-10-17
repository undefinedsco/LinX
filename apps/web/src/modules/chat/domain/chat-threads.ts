/**
 * Internal thread management for one continuous chat. People never see or pick
 * a thread; a chat with an assistant is a single timeline (like WeChat), and
 * threads are only how LinX stores runs, schedules and context underneath.
 */

export interface ThreadActivity {
  id?: string | null
  createdAt?: unknown
  updatedAt?: unknown
}

function timeOf(value: unknown): number {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

/**
 * Where a new message goes: the chat's current internal thread, i.e. the most
 * recently active one (last update, then creation). Returns null when the chat
 * has no thread yet, and the caller creates the default one.
 *
 * This is the single place that decides which thread is current. Whether that
 * thread still has room is `threadRolloverReason`; the conversation applies it
 * when a message is sent.
 */
export function pickSendThread<T extends ThreadActivity>(threads: readonly T[]): T | null {
  let best: T | null = null
  let bestTime = -1
  for (const thread of threads) {
    if (!thread.id) continue
    const time = Math.max(timeOf(thread.updatedAt), timeOf(thread.createdAt))
    if (best === null || time > bestTime) {
      best = thread
      bestTime = time
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Runtime-managed thread switching
//
// People never pick a thread. When they send, LinX decides whether the chat's
// current internal thread still has room. A thread that has grown too long (the
// model would have to drop or squeeze its start) or that has been quiet for a
// long time gets a successor: a new internal thread that carries a short
// "where we left off" note (see `buildHandoffSummary`). The timeline merges all
// threads of the chat, so the switch is invisible.
//
// Numbers are deliberately conservative: switching only costs a short context
// note, while a thread that is too long costs answer quality for everyone.
// ---------------------------------------------------------------------------

/** Start a successor thread once the current one holds this many messages. */
export const THREAD_ROLLOVER_MAX_MESSAGES = 160
/** ...or once its text is roughly this many tokens (the model sees the latest turns, not all of it). */
export const THREAD_ROLLOVER_MAX_ESTIMATED_TOKENS = 24_000
/** ...or when nothing happened in it for this long (a new day's work is a new internal thread). */
export const THREAD_ROLLOVER_IDLE_MS = 3 * 24 * 60 * 60 * 1000
/** The handoff note keeps this many trailing messages, each cut to this many characters. */
export const THREAD_HANDOFF_MESSAGES = 6
export const THREAD_HANDOFF_MESSAGE_CHARS = 160

export interface ThreadLoad {
  messageCount: number
  estimatedTokens: number
  /** Time of the newest message, when there is one. */
  lastMessageAt?: unknown
}

export type ThreadRolloverReason = 'long' | 'idle'

/** Rough token estimate that works for Chinese and English alike (no tokenizer needed). */
export function estimateTokens(text: string): number {
  let tokens = 0
  for (const char of text) tokens += char.charCodeAt(0) > 0x2e80 ? 1 : 0.28
  return Math.ceil(tokens)
}

/** Why the current thread should hand over to a new one, or null when it can keep going. */
export function threadRolloverReason(thread: ThreadActivity, load: ThreadLoad, now: number): ThreadRolloverReason | null {
  if (load.messageCount === 0) return null
  if (load.messageCount >= THREAD_ROLLOVER_MAX_MESSAGES || load.estimatedTokens >= THREAD_ROLLOVER_MAX_ESTIMATED_TOKENS) return 'long'
  const lastActive = Math.max(timeOf(load.lastMessageAt), timeOf(thread.updatedAt), timeOf(thread.createdAt))
  if (lastActive > 0 && now - lastActive >= THREAD_ROLLOVER_IDLE_MS) return 'idle'
  return null
}

export interface HandoffMessage {
  role?: string | null
  text?: string | null
  createdAt?: unknown
}

/**
 * The short note a successor thread starts with: the last few messages of the
 * old one, trimmed. Stored in the new thread's metadata (`handoff_summary`) and
 * added to the assistant's context by the local chat service. Extractive on
 * purpose: no extra model call is needed to switch threads.
 */
export function buildHandoffSummary(messages: readonly HandoffMessage[]): string {
  return [...messages]
    .filter((message) => (message.text ?? '').trim().length > 0)
    .sort((left, right) => timeOf(left.createdAt) - timeOf(right.createdAt))
    .slice(-THREAD_HANDOFF_MESSAGES)
    .map((message) => {
      const text = (message.text ?? '').replace(/\s+/g, ' ').trim()
      const clipped = text.length > THREAD_HANDOFF_MESSAGE_CHARS ? `${text.slice(0, THREAD_HANDOFF_MESSAGE_CHARS)}…` : text
      return `${message.role === 'user' ? '用户' : '助手'}：${clipped}`
    })
    .join('\n')
}

/** Thread metadata keys written by a rollover (kept in the thread's existing `metadata` field). */
export const THREAD_HANDOFF_METADATA = { summary: 'handoff_summary', continues: 'continues_thread' } as const

/**
 * Merges the messages of all of a chat's threads into one timeline, oldest
 * first. `createdAt` is in seconds. Ties keep the order the parts and their
 * items came in, so a thread's own order is never shuffled.
 */
export function mergeThreadTimelines<T extends { createdAt: number }>(parts: ReadonlyArray<readonly T[]>): T[] {
  return parts
    .flatMap((part, partIndex) => part.map((entry, index) => ({ entry, partIndex, index })))
    .sort((left, right) => (
      left.entry.createdAt - right.entry.createdAt
      || left.partIndex - right.partIndex
      || left.index - right.index
    ))
    .map(({ entry }) => entry)
}
