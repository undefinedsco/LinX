const OUTBOX_STORAGE_PREFIX = 'linx.chat.generation-outbox.v1'
const OUTBOX_RETRY_BASE_DELAY_MS = 15_000
const OUTBOX_RETRY_MAX_DELAY_MS = 5 * 60_000

export interface ChatGenerationOutboxEntry {
  id: string
  accountScope: string
  threadId: string
  userItemId: string
  inferenceOptions?: Record<string, unknown>
  queuedAt: number
  attempts: number
  nextAttemptAt?: number
}

function storageKey(accountScope: string): string {
  return `${OUTBOX_STORAGE_PREFIX}:${encodeURIComponent(accountScope)}`
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readEntries(accountScope: string): ChatGenerationOutboxEntry[] {
  const storage = getStorage()
  if (!storage) return []
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(accountScope)) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((value): ChatGenerationOutboxEntry[] => {
      if (!value || typeof value !== 'object') return []
      const entry = value as Partial<ChatGenerationOutboxEntry>
      if (
        typeof entry.id !== 'string'
        || entry.accountScope !== accountScope
        || typeof entry.threadId !== 'string'
        || typeof entry.userItemId !== 'string'
      ) return []
      const queuedAt = typeof entry.queuedAt === 'number' && Number.isFinite(entry.queuedAt)
        ? entry.queuedAt
        : Date.now()
      const attempts = typeof entry.attempts === 'number' && Number.isInteger(entry.attempts) && entry.attempts >= 0
        ? entry.attempts
        : 0
      const nextAttemptAt = typeof entry.nextAttemptAt === 'number' && Number.isFinite(entry.nextAttemptAt)
        ? entry.nextAttemptAt
        : queuedAt
      return [{
        id: entry.id,
        accountScope,
        threadId: entry.threadId,
        userItemId: entry.userItemId,
        ...(entry.inferenceOptions && typeof entry.inferenceOptions === 'object'
          ? { inferenceOptions: entry.inferenceOptions }
          : {}),
        queuedAt,
        attempts,
        nextAttemptAt,
      }]
    })
  } catch {
    return []
  }
}

function writeEntries(accountScope: string, entries: ChatGenerationOutboxEntry[]): void {
  const storage = getStorage()
  if (!storage) return
  try {
    if (entries.length === 0) storage.removeItem(storageKey(accountScope))
    else storage.setItem(storageKey(accountScope), JSON.stringify(entries))
  } catch {
    // Outbox persistence is best-effort when browser storage is unavailable.
  }
}

export function listChatGenerationOutbox(
  accountScope: string,
  threadId?: string,
): ChatGenerationOutboxEntry[] {
  return readEntries(accountScope)
    .filter((entry) => !threadId || entry.threadId === threadId)
    .sort((left, right) => left.queuedAt - right.queuedAt)
}

export function enqueueChatGeneration(
  input: Omit<ChatGenerationOutboxEntry, 'id' | 'queuedAt' | 'attempts'>,
): ChatGenerationOutboxEntry {
  const entries = readEntries(input.accountScope)
  const existing = entries.find((entry) => (
    entry.threadId === input.threadId && entry.userItemId === input.userItemId
  ))
  if (existing) return existing

  const now = Date.now()
  const entry: ChatGenerationOutboxEntry = {
    ...input,
    id: crypto.randomUUID(),
    queuedAt: now,
    attempts: 0,
    nextAttemptAt: now + OUTBOX_RETRY_BASE_DELAY_MS,
  }
  writeEntries(input.accountScope, [...entries, entry])
  return entry
}

export function markChatGenerationAttempt(
  accountScope: string,
  entryId: string,
): ChatGenerationOutboxEntry | null {
  const entries = readEntries(accountScope)
  let updated: ChatGenerationOutboxEntry | null = null
  writeEntries(accountScope, entries.map((entry) => {
    if (entry.id !== entryId) return entry
    const attempts = entry.attempts + 1
    const retryDelay = Math.min(
      OUTBOX_RETRY_BASE_DELAY_MS * (2 ** attempts),
      OUTBOX_RETRY_MAX_DELAY_MS,
    )
    updated = { ...entry, attempts, nextAttemptAt: Date.now() + retryDelay }
    return updated
  }))
  return updated
}

export function nextChatGenerationAttemptAt(accountScope: string, threadId?: string): number | null {
  const first = listChatGenerationOutbox(accountScope, threadId)[0]
  if (!first) return null
  return first.nextAttemptAt ?? first.queuedAt
}

export function removeChatGeneration(accountScope: string, entryId: string): void {
  writeEntries(accountScope, readEntries(accountScope).filter((entry) => entry.id !== entryId))
}
