const OUTBOX_STORAGE_PREFIX = 'linx.chat.generation-outbox.v1'

export interface ChatGenerationOutboxEntry {
  id: string
  accountScope: string
  threadId: string
  userItemId: string
  inferenceOptions?: Record<string, unknown>
  queuedAt: number
  attempts: number
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
    return parsed.filter((entry): entry is ChatGenerationOutboxEntry => Boolean(
      entry
      && typeof entry === 'object'
      && typeof (entry as ChatGenerationOutboxEntry).id === 'string'
      && (entry as ChatGenerationOutboxEntry).accountScope === accountScope
      && typeof (entry as ChatGenerationOutboxEntry).threadId === 'string'
      && typeof (entry as ChatGenerationOutboxEntry).userItemId === 'string',
    ))
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

export function listChatGenerationOutbox(accountScope: string): ChatGenerationOutboxEntry[] {
  return readEntries(accountScope)
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

  const entry: ChatGenerationOutboxEntry = {
    ...input,
    id: crypto.randomUUID(),
    queuedAt: Date.now(),
    attempts: 0,
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
    updated = { ...entry, attempts: entry.attempts + 1 }
    return updated
  }))
  return updated
}

export function removeChatGeneration(accountScope: string, entryId: string): void {
  writeEntries(accountScope, readEntries(accountScope).filter((entry) => entry.id !== entryId))
}
