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
 * This is the single place that decides it. The runtime can later replace it
 * (for example to start a fresh internal thread when the context gets long)
 * without the UI changing.
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
