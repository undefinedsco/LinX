import { normalizePodBaseUrl } from './resource-utils'

export const resolveRowId = (row?: Partial<Record<string, unknown>> | null): string | null => {
  if (!row) return null
  const record = row as Record<string, unknown>
  const candidate =
    record['@id'] ??
    record.subject ??
    record.id
  if (typeof candidate === 'string' && candidate.length > 0) {
    return candidate
  }
  return null
}

export const ensureRowId = (row?: Partial<Record<string, unknown>> | null, fallback?: string): string => {
  const resolved = resolveRowId(row) ?? fallback
  if (!resolved) {
    throw new Error('Record is missing an identifier')
  }
  return resolved
}

export const toTimestamp = (value: unknown, fallback = 0): number => {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const ms = new Date(value).getTime()
    return Number.isNaN(ms) ? fallback : ms
  }
  if (typeof value === 'number') return value
  return fallback
}

const CHAT_THREAD_URI_PATTERN = /\/\.data\/chat\/([^/]+)\/index\.ttl#(.+)$/
const CHAT_URI_PATTERN = /\/\.data\/chat\/([^/]+)\/index\.ttl#this$/

export interface ChatThreadRef {
  chatId: string | null
  threadId: string | null
}

export function extractChatIdFromChatRef(chatRef: string | null | undefined): string | null {
  if (!chatRef) return null

  const threadMatch = chatRef.match(CHAT_THREAD_URI_PATTERN)
  if (threadMatch?.[1]) return decodeURIComponent(threadMatch[1])

  const chatMatch = chatRef.match(CHAT_URI_PATTERN)
  if (chatMatch?.[1]) return decodeURIComponent(chatMatch[1])

  if (!chatRef.includes('/') && !chatRef.includes('#')) return chatRef
  return null
}

export function extractThreadIdFromThreadRef(threadRef: string | null | undefined): string | null {
  if (!threadRef) return null

  const match = threadRef.match(CHAT_THREAD_URI_PATTERN)
  if (match?.[2]) return decodeURIComponent(match[2])

  if (!threadRef.includes('/') && !threadRef.includes('#')) return threadRef
  return null
}

export function extractChatThreadRef(uri: string | null | undefined): ChatThreadRef {
  if (!uri) return { chatId: null, threadId: null }
  const match = uri.match(CHAT_THREAD_URI_PATTERN)
  return {
    chatId: match?.[1] ? decodeURIComponent(match[1]) : null,
    threadId: match?.[2] ? decodeURIComponent(match[2]) : null,
  }
}

export function resolveThreadChatId(
  thread: Pick<Record<string, unknown>, 'chat'> | null | undefined,
): string | null {
  return extractChatIdFromChatRef(typeof thread?.chat === 'string' ? thread.chat : null)
}

export function buildChatResourceIri(podBaseUrl: string, chatId: string): string {
  return `${normalizePodBaseUrl(podBaseUrl)}/.data/chat/${encodeURIComponent(chatId)}/index.ttl#this`
}

export function buildThreadResourceIri(podBaseUrl: string, chatId: string, threadId: string): string {
  return `${normalizePodBaseUrl(podBaseUrl)}/.data/chat/${encodeURIComponent(chatId)}/index.ttl#${encodeURIComponent(threadId)}`
}
