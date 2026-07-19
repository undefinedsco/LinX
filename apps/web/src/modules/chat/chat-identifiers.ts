import { resolveRowSubject } from '@undefineds.co/drizzle-solid'

const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/

function isAbsoluteIri(value: string): boolean {
  return ABSOLUTE_IRI.test(value)
}

export function extractLocalChatIdFromRef(chatRef: string | null | undefined): string | null {
  if (!chatRef) return null

  const flatMatch = chatRef.match(/\/\.data\/chat\/([^/#?]+)\.ttl(?:#.*)?$/)
  if (flatMatch?.[1]) return decodeURIComponent(flatMatch[1])

  const legacyMatch = chatRef.match(/\/\.data\/chat\/([^/#?]+)\/index\.ttl(?:#.*)?$/)
  if (legacyMatch?.[1]) return decodeURIComponent(legacyMatch[1])

  return null
}

export function resolveChatSubject(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null
  const subject = resolveRowSubject(row)
  if (subject) return subject

  for (const key of ['subject', '@id']) {
    const value = row[key]
    if (typeof value === 'string' && value.length > 0) return value
  }

  const id = row.id
  return typeof id === 'string' && isAbsoluteIri(id) ? id : null
}

export function resolveChatStorageId(chatIdOrRef: string | null | undefined): string | null {
  if (!chatIdOrRef) return null
  return extractLocalChatIdFromRef(chatIdOrRef) ?? chatIdOrRef
}

export function resolveChatListId(row: Record<string, unknown> | null | undefined): string {
  return resolveChatSubject(row) ?? (typeof row?.id === 'string' ? row.id : 'unknown')
}

export function isSameChatReference(
  row: Record<string, unknown> | null | undefined,
  chatIdOrRef: string | null | undefined,
): boolean {
  if (!row || !chatIdOrRef) return false

  const candidates = new Set<string>()
  const add = (value: unknown) => {
    if (typeof value !== 'string' || value.length === 0) return
    candidates.add(value)
    const localId = extractLocalChatIdFromRef(value)
    if (localId) candidates.add(localId)
    if (value.endsWith('.ttl')) candidates.add(`${value}#this`)
    if (value.endsWith('/index.ttl')) candidates.add(`${value}#this`)
  }

  add(row.id)
  add(row['@id'])
  add(row.subject)
  add(row.source)
  add(resolveRowSubject(row))

  if (candidates.has(chatIdOrRef)) return true

  const selectedLocalId = extractLocalChatIdFromRef(chatIdOrRef)
  return Boolean(selectedLocalId && candidates.has(selectedLocalId))
}

export function findChatByReference<T extends Record<string, unknown>>(
  chats: T[] | null | undefined,
  chatIdOrRef: string | null | undefined,
): T | null {
  if (!chats || !chatIdOrRef) return null
  return chats.find((chat) => isSameChatReference(chat, chatIdOrRef)) ?? null
}
