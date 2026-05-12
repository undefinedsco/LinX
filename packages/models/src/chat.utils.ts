import { extractPodResourceTemplateValue, parsePodResourceRef } from '@undefineds.co/drizzle-solid'
import { chatResource } from './chat.schema'
import { threadResource } from './thread.schema'

export const toTimestamp = (value: unknown, fallback = 0): number => {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const ms = new Date(value).getTime()
    return Number.isNaN(ms) ? fallback : ms
  }
  if (typeof value === 'number') return value
  return fallback
}

export interface ChatThreadRef {
  chatId: string | null
  threadId: string | null
}

export function extractChatIdFromChatRef(chatRef: string | null | undefined): string | null {
  return extractPodResourceTemplateValue(threadResource, chatRef, 'chat')
    ?? extractPodResourceTemplateValue(chatResource, chatRef)
}

export function extractThreadIdFromThreadRef(threadRef: string | null | undefined): string | null {
  return extractPodResourceTemplateValue(threadResource, threadRef)
}

export function extractChatThreadRef(uri: string | null | undefined): ChatThreadRef {
  if (!uri) return { chatId: null, threadId: null }
  const parsed = parsePodResourceRef(threadResource, uri)
  return {
    chatId: parsed?.templateValues.chat ?? null,
    threadId: parsed?.templateValues.id ?? null,
  }
}

export function resolveThreadChatId(
  thread: Pick<Record<string, unknown>, 'chat'> | null | undefined,
): string | null {
  return extractChatIdFromChatRef(typeof thread?.chat === 'string' ? thread.chat : null)
}
