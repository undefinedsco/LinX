/**
 * Chat Module Collections
 * 
 * TanStack DB collections for Chat, Thread, and Message entities.
 * These collections provide reactive data management with Solid Pod persistence.
 * 
 * Includes `chatOps` for business logic that spans multiple collections.
 */

import { useLiveQuery } from '@tanstack/react-db'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useMemo, useSyncExternalStore } from 'react'
import { getLiteral, getLiteralAll, getSolidDataset, getThing, getThingAll, getUrl, getUrlAll } from '@inrupt/solid-client'
import {
  chatResource,
  threadResource,
  threadRepository,
  messageResource,
  agentResource,
  contactResource,
  credentialResource,
  aiProviderResource,
  getDefaultAIConfigCredentialId,
  normalizeAIConfigProviderId,
  normalizeAIConfigResourceId,
  extractChatIdFromChatRef,
  extractThreadIdFromThreadRef,
  selectAIConfigCredential,
  UDFS,
  WF,
  type ChatRow,
  type ChatInsert,
  type ThreadRow,
  type ThreadInsert,
  type MessageRow,
  type MessageInsert,
  type AgentRow,
  type ContactRow,
  ContactClass,
  ContactType,
} from '@undefineds.co/models'
import {
  agentCollection,
  contactCollection as _contactCollection,
} from '../contacts-port'
export { configureChatContactsPort } from '../contacts-port'
import type { SolidDatabase } from '@undefineds.co/models'
import { appendChatReconcilerMetadata, reconcileChatAppend } from '@linx/agent-runtime/chat-reconciler'
import {
  agentResourceId,
  resolveThreadChatId as resolveThreadChatIdFromRow,
} from '@/lib/data/resource-identity'
import { resolveWorkspaceContainerUri } from '@/lib/data/workspace-uri'
import { queryClient } from '@/providers/query-provider'
import { createPodCollection } from '@/lib/data/pod-collection'
import { rebindPodCollections } from '@/lib/data/pod-collection-rebind'
import { resolveCurrentPodBaseUrl } from '@/lib/data/current-pod-base'
import { findExactRecord, updateExactRecord } from '@/lib/data/exact-records'
import { favoriteHooks } from '@/modules/favorites/collections'
import { createAgentContactRecords, writeCollectionRow } from '@/lib/data/direct-chat-records'
import { DEFAULT_LINX_PLATFORM_MODEL_ID, getAgentProviderInfo } from '@/lib/agent-providers'
import { toStringArray } from '@/lib/utils'
import { ensureAgentHome, updateAgentHomeMetadata } from '@/lib/data/agent-home'
import {
  type AgentAiRuntimeLocation,
  writeAgentAiRuntimeLocationMetadata,
} from '../domain/agent-runtime-location'

// ============================================================================
// Database Getter
// ============================================================================

let dbGetter: (() => SolidDatabase | null) | null = null
let currentChatDatabase: SolidDatabase | null = null
let currentChatQueryDatabase: SolidDatabase | null = null
let currentChatQueryScopeKey = 'logged-out'
let currentChatQueryGeneration = 0
const threadChatIdCache = new Map<string, string>()
let linxWelcomeInFlight: Promise<LinxWelcomeResult | null> | null = null
let linxWelcomeAttempt = 0
const linxWelcomeListeners = new Set<() => void>()
let stagedDefaultSecretaryRows: {
  agent: AgentRow
  contact: ContactRow
  chat: ChatRow
} | null = null
const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/
const DEFAULT_SECRETARY_EXACT_READ_TIMEOUT_MS = 1_500
export const SECRETARY_BOOTSTRAP_TIMEOUT_MS = 10_000

function observeChatQueryScope(scopeKey: string, db: SolidDatabase | null): number {
  if (currentChatQueryScopeKey !== scopeKey || currentChatQueryDatabase !== db) {
    currentChatQueryScopeKey = scopeKey
    currentChatQueryDatabase = db
    currentChatQueryGeneration += 1
  }
  return currentChatQueryGeneration
}

function throwIfChatQueryAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  const error = new Error('Chat query aborted.')
  error.name = 'AbortError'
  throw error
}

export const LINX_DEFAULT_SECRETARY = {
  agentKey: '__secretary__',
  agentId: agentResourceId('__secretary__'),
  contactKey: '__secretary__',
  contactId: contactResource.buildId({ id: '__secretary__' }),
  contactResourceId: contactResource.buildId({ id: '__secretary__' }),
  chatKey: '__secretary__',
  chatId: chatResource.buildId({ id: '__secretary__' }),
  chatResourceId: chatResource.buildId({ id: '__secretary__' }),
  title: 'LinX 主理人',
  provider: 'undefineds',
  model: DEFAULT_LINX_PLATFORM_MODEL_ID,
  threadKey: '__default__',
  threadTitle: '默认话题',
} as const

export interface LinxWelcomeResult {
  chatId: string
  threadId?: string
  created: boolean
}

export interface EnsureLinxWelcomeOptions {
  force?: boolean
}

export class SecretaryBootstrapTimeoutError extends Error {
  readonly kind = 'timeout'
  readonly recoverable = true

  constructor(timeoutMs: number) {
    super(`AI Secretary bootstrap timed out after ${timeoutMs}ms.`)
    this.name = 'SecretaryBootstrapTimeoutError'
  }
}

type SecretaryMetadata = {
  linx?: {
    role?: string
    version?: number
  }
}

type CollectionWriter<T extends Record<string, unknown> & { id: string }> =
  Parameters<typeof writeCollectionRow<T>>[0] & {
    get?: (id: string) => T | undefined
    insert?: (row: T) => {
      isPersisted?: {
        promise?: Promise<unknown>
      }
    }
  }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingExactReadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return /404|not found|missing/i.test(message)
}

function isUnsupportedCollectionReadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return /collection queries over plain LDP are not supported|Configure a global query capability/i.test(message)
}

function isMissingCollectionReadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return /Could not retrieve[\s\S]*HTTP status 404|NotFoundHttpError/i.test(message)
}

function isRecoverableCollectionReadError(error: unknown): boolean {
  return isUnsupportedCollectionReadError(error) || isMissingCollectionReadError(error)
}

function isExactReadTimeoutError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ExactReadTimeoutError'
}

async function findAIConfigCredentialRows(db: SolidDatabase, providerId: string): Promise<Array<Record<string, unknown>>> {
  const exactRows: Array<Record<string, unknown>> = []
  const findById = (db as any).findById
  if (typeof findById === 'function') {
    const exact = await findById.call(
      db,
      credentialResource as any,
      credentialResource.buildId({ id: getDefaultAIConfigCredentialId(providerId) }),
    )
      .catch((error: unknown) => {
        if (isMissingExactReadError(error)) return null
        throw error
      })
    if (exact) exactRows.push(exact as Record<string, unknown>)
  }

  if (exactRows.length > 0) {
    return exactRows
  }

  try {
    return await db.select().from(credentialResource).execute() as Array<Record<string, unknown>>
  } catch (error) {
    if (isRecoverableCollectionReadError(error)) {
      return exactRows
    }
    throw error
  }
}

function getSecretaryMetadata(metadata: unknown): SecretaryMetadata | null {
  if (!isRecord(metadata)) {
    return null
  }

  const linx = metadata.linx
  if (!isRecord(linx)) {
    return null
  }

  return {
    linx: {
      role: typeof linx.role === 'string' ? linx.role : undefined,
      version: typeof linx.version === 'number' ? linx.version : undefined,
    },
  }
}

function createSecretaryMetadata(existing?: unknown): Record<string, unknown> {
  const metadata = isRecord(existing) ? { ...existing } : {}
  const current = getSecretaryMetadata(metadata)

  metadata.linx = {
    ...(current?.linx ?? {}),
    role: 'secretary',
    version: 1,
  }

  return metadata
}

export function isLinxDefaultSecretaryChat(chat: Pick<ChatRow, 'title' | 'metadata'> | null | undefined): boolean {
  return chat?.title === LINX_DEFAULT_SECRETARY.title
    || getSecretaryMetadata(chat?.metadata)?.linx?.role === 'secretary'
}

export function setDatabaseGetter(getter: () => SolidDatabase | null) {
  dbGetter = getter
}

function getDb(): SolidDatabase | null {
  return dbGetter?.() ?? null
}

function notifyLinxWelcomeListeners(): void {
  linxWelcomeListeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.warn('[chatOps] LinX welcome listener failed:', error)
    }
  })
}

function setLinxWelcomeInFlight(promise: Promise<LinxWelcomeResult | null> | null): void {
  if (linxWelcomeInFlight === promise) {
    return
  }
  linxWelcomeInFlight = promise
  notifyLinxWelcomeListeners()
}

function subscribeLinxWelcome(listener: () => void): () => void {
  linxWelcomeListeners.add(listener)
  return () => {
    linxWelcomeListeners.delete(listener)
  }
}

function getCurrentWebId(db: SolidDatabase): string | null {
  const webId = (
    (db as any).getDialect?.()?.getWebId?.()
    ?? (db as any).getSession?.()?.info?.webId
    ?? (db as any).session?.info?.webId
  )
  return typeof webId === 'string' && webId.length > 0 ? webId : null
}

function normalizeParticipants(participants: unknown, selfWebId?: string | null): string[] {
  return Array.from(new Set(toStringArray(participants))).sort((left, right) => {
    if (selfWebId) {
      if (left === selfWebId && right !== selfWebId) return -1
      if (right === selfWebId && left !== selfWebId) return 1
    }
    return left.localeCompare(right)
  })
}

function hasHydratedChatMetadata(metadata: unknown): boolean {
  return isRecord(metadata)
    && (
      'memberRoles' in metadata
      || getSecretaryMetadata(metadata)?.linx?.role === 'secretary'
    )
}

function buildChatIri(db: SolidDatabase, chatId: string | undefined): string | null {
  if (!chatId) return null
  return resolveResourceIri(db, chatResource, buildChatResourceId(chatId))
}

function resolveAgentIri(db: SolidDatabase, agentId: string): string | null {
  if (!agentId) return null
  const resourceId = buildResourceId(agentResource as any, { id: agentId })
  return resolveResourceIri(db, agentResource, resourceId)
}

function getPodBaseUrl(db: SolidDatabase): string | null {
  return resolveCurrentPodBaseUrl(db)
}

function buildResourceId(
  resource: { buildId?: (row: Record<string, unknown>) => string },
  row: Record<string, unknown>,
): string {
  return typeof resource.buildId === 'function'
    ? resource.buildId(row)
    : String(row.id ?? '')
}

function resolveResourceIri(
  db: SolidDatabase,
  resource: unknown,
  resourceId: string,
): string | null {
  if (!resourceId || typeof db.resolveRowIri !== 'function') return null
  return db.resolveRowIri(resource as any, { id: resourceId })
}

function buildChatResourceId(chatId: string): string {
  return buildResourceId(chatResource as any, { id: chatId })
}

function normalizeChatRowId(chatIdOrKey: string | null | undefined): string | null {
  if (!chatIdOrKey) return null
  return buildChatResourceId(chatIdOrKey)
}

function resolveThreadChatRowId(row: ThreadRow | null | undefined): string | null {
  const chatKeyOrId = resolveThreadChatIdFromRow(row)
  return normalizeChatRowId(chatKeyOrId)
}

function buildThreadResourceId(threadId: string, chatIri: string): string {
  return threadRepository.idForChat(chatIri, threadId)
}

function buildMessageResourceId(
  messageId: string,
  row: Pick<MessageInsert, 'parent' | 'chat' | 'thread' | 'createdAt'>,
): string {
  return buildResourceId(messageResource as any, { ...row, id: messageId } as Record<string, unknown>)
}

function buildMessageReconcilerMetadata(input: {
  chat: string
  thread: string
  resource: string
  role: 'user' | 'assistant' | 'system'
  content: string
  maker: string
  source?: string
  createdAt: Date
  existingMetadata?: Record<string, unknown>
}): Record<string, unknown> {
  const { summary } = reconcileChatAppend({
    chat: input.chat,
    thread: input.thread,
    resource: input.resource,
    role: input.role,
    content: input.content,
    actor: {
      id: input.maker,
      role: input.role === 'user' ? 'user' : input.role === 'assistant' ? 'assistant' : 'runtime',
    },
    source: input.source ?? 'web-chat',
    createdAt: input.createdAt,
    randomId: input.resource,
  })
  return appendChatReconcilerMetadata(input.existingMetadata, summary)
}

async function insertPodRow(
  db: SolidDatabase,
  resource: unknown,
  row: Record<string, unknown>,
): Promise<void> {
  await db.insert(resource as any).values(row as any).execute()
}

function getCachedThreadChatId(threadId: string): string | null {
  return threadChatIdCache.get(threadId) ?? resolveThreadChatRowId(threadCollection.get(threadId)) ?? null
}

async function resolveThreadChatId(
  db: SolidDatabase,
  threadId: string | undefined,
  chatId?: string | null,
): Promise<string | null> {
  if (!threadId) return null
  if (ABSOLUTE_IRI.test(threadId)) {
    throw new Error('threadId must be a base-relative row.id, not a full RDF subject IRI.')
  }
  if (chatId) return chatId

  const cachedChatId = getCachedThreadChatId(threadId)
  if (cachedChatId) {
    return cachedChatId
  }

  const row = typeof (db as any).findById === 'function'
    ? await (db as any).findById(threadResource as any, threadId) as ThreadRow | null
    : null
  const rowChatId = resolveThreadChatRowId(row)
  if (!rowChatId) {
    return null
  }

  threadChatIdCache.set(threadId, rowChatId)
  if (row) {
    ;(threadCollection.utils as { writeUpsert?: (data: ThreadRow) => void }).writeUpsert?.(row)
  }
  return rowChatId
}

async function buildThreadIri(
  db: SolidDatabase,
  threadId: string | undefined,
  chatId?: string | null,
): Promise<string | null> {
  if (!threadId) return null
  const resolvedChatId = await resolveThreadChatId(db, threadId, chatId)
  if (!resolvedChatId) return null
  const chatIri = buildChatIri(db, resolvedChatId)
  if (!chatIri) return null
  return resolveResourceIri(db, threadResource, buildThreadResourceId(threadId, chatIri))
}

async function hydrateChatRows(
  db: SolidDatabase,
  rows: ChatRow[],
  signal?: AbortSignal,
): Promise<ChatRow[]> {
  throwIfChatQueryAborted(signal)
  const selfWebId = getCurrentWebId(db)
  const normalizedRows = rows.map((row) => {
    if (!Array.isArray(row.participants)) {
      return row
    }

    return {
      ...row,
      participants: normalizeParticipants(row.participants, selfWebId),
    }
  })

  const needsHydration = normalizedRows.filter(
    (row) => !Array.isArray(row.participants)
      || !hasHydratedChatMetadata(row.metadata)
      || !row.lastMessagePreview,
  )
  if (needsHydration.length === 0) {
    return normalizedRows
  }

  const hydratedRowsById = new Map<string, Partial<ChatRow>>()

  await Promise.all(needsHydration.map(async (row) => {
    const chatIri = row['@id'] ?? resolveResourceIri(db, chatResource, row.id)
    if (!chatIri) return

    try {
      const sessionFetch = (
        (db as any).getDialect?.()?.getAuthenticatedFetch?.()
        ?? (db as any).getSession?.()?.fetch
      ) as typeof fetch | undefined
      if (!sessionFetch) return

      const resourceUrl = chatIri.split('#')[0]
      const abortableFetch: typeof fetch = signal
        ? (input, init) => sessionFetch(input, { ...init, signal })
        : sessionFetch
      const dataset = await getSolidDataset(resourceUrl, {
        fetch: abortableFetch,
      })
      throwIfChatQueryAborted(signal)
      const thing = getThing(dataset, `${resourceUrl}#this`)
      if (!thing) return
      const nextRow: Partial<ChatRow> = {}
      const lastMessagePreview = getLiteral(thing, 'http://schema.org/text')?.value
      if (lastMessagePreview) {
        nextRow.lastMessagePreview = lastMessagePreview
      }
      const participants = normalizeParticipants(getUrlAll(thing, WF.participant), selfWebId)
      if (participants.length > 0) {
        nextRow.participants = participants
      }

      const metadataUrl = getUrl(thing, UDFS.metadata)
      if (metadataUrl) {
        const metadataThing = getThing(dataset, metadataUrl)
        const memberRolesLiteral = metadataThing
          ? getLiteral(metadataThing, UDFS.term('memberRoles'))
          : null
        if (memberRolesLiteral?.value) {
          try {
            nextRow.metadata = {
              ...(isRecord(row.metadata) ? row.metadata : {}),
              memberRoles: JSON.parse(memberRolesLiteral.value) as Record<string, 'owner' | 'admin' | 'member'>,
            }
          } catch (error) {
            console.warn('[chatOps] Failed to parse chat metadata:', row.id, error)
          }
        }
      }

      if (row.id && Object.keys(nextRow).length > 0) {
        hydratedRowsById.set(row.id, nextRow)
      }
    } catch (error) {
      console.warn('[chatOps] Failed to hydrate chat participants:', row.id, error)
    }
  }))
  throwIfChatQueryAborted(signal)

  return normalizedRows.map((row) => {
    const hydratedRow = row.id ? hydratedRowsById.get(row.id) : undefined
    if (!hydratedRow) return row
    return {
      ...row,
      ...hydratedRow,
    }
  })
}

async function ensureChatStateRow(db: SolidDatabase, chatId: string): Promise<ChatRow> {
  if (ABSOLUTE_IRI.test(chatId)) {
    throw new Error('chatId must be a base-relative row.id, not a full RDF subject IRI.')
  }
  const cached = chatCollection.get(chatId)
  if (cached) {
    return cached
  }

  const chatResourceId = buildChatResourceId(chatId)
  const located = typeof (db as any).findById === 'function'
    ? await (db as any).findById(chatResource as any, chatResourceId) as ChatRow | null
    : null
  if (located) {
    if (!chatCollection.isReady()) {
      await chatCollection.preload()
    }
    const [hydrated] = await hydrateChatRows(db, [located])
    const row = hydrated ?? located
    writeCollectionRow(chatCollection, row, chatId)
    return row
  }

  const rows = await chatCollection.fetch({ refetch: true })
  const [row] = await hydrateChatRows(db, rows.filter((candidate) => candidate.id === chatId))

  if (!row) {
    throw new Error(`Chat ${chatId} was not found in the Pod`)
  }

  writeCollectionRow(chatCollection, row, chatId)
  return row
}

async function ensureThreadStateRow(db: SolidDatabase, threadId: string): Promise<ThreadRow> {
  if (ABSOLUTE_IRI.test(threadId)) {
    throw new Error('threadId must be a base-relative row.id, not a full RDF subject IRI.')
  }
  const cached = threadCollection.get(threadId)
  if (cached) {
    return cached
  }

  const row = typeof (db as any).findById === 'function'
    ? await (db as any).findById(threadResource as any, threadId) as ThreadRow | null
    : null

  if (!row) {
    throw new Error(`Thread ${threadId} was not found in the Pod`)
  }

  const rowChatId = resolveThreadChatRowId(row)
  if (rowChatId) {
    threadChatIdCache.set(threadId, rowChatId)
  }
  ;(threadCollection.utils as { writeUpsert?: (data: ThreadRow) => void }).writeUpsert?.(row)
  return row
}

async function resolveThreadMutationTarget(db: SolidDatabase, threadId: string): Promise<ThreadRow | string> {
  if (ABSOLUTE_IRI.test(threadId)) {
    return threadId
  }

  const cached = threadCollection.get(threadId)
  if (cached?.id) {
    return cached
  }

  const findById = (db as { findById?: (resource: unknown, id: string) => Promise<ThreadRow | null> }).findById
  if (typeof findById === 'function') {
    const direct = await findById.call(db, threadResource as any, threadId)
    if (direct?.id) {
      ;(threadCollection.utils as { writeUpsert?: (data: ThreadRow) => void }).writeUpsert?.(direct)
      return direct
    }

    const chatId = getCachedThreadChatId(threadId)
    const chatIri = chatId ? buildChatIri(db, chatId) : null
    if (chatIri) {
      const resourceId = buildThreadResourceId(threadId, chatIri)
      const byResourceId = await findById.call(db, threadResource as any, resourceId)
      if (byResourceId?.id) {
        ;(threadCollection.utils as { writeUpsert?: (data: ThreadRow) => void }).writeUpsert?.(byResourceId)
        return byResourceId
      }
      return resourceId
    }
  }

  if (threadId.includes('/') || threadId.includes('#') || threadId.endsWith('.ttl')) {
    return threadId
  }

  throw new Error(`Thread ${threadId} was not found in the Pod; cannot mutate a short runtime id without its resource id.`)
}

async function findChatRow(db: SolidDatabase, chatId: string | undefined): Promise<ChatRow | null> {
  if (!chatId) return null

  const cached = chatCollection.get(chatId)
  if (cached) return cached

  try {
    return await ensureChatStateRow(db, chatId)
  } catch {
    return null
  }
}

async function isProtectedLinxSecretaryChat(db: SolidDatabase, chatId: string): Promise<boolean> {
  const chat = await findChatRow(db, chatId)
  return isLinxDefaultSecretaryChat(chat)
}

async function ensureLinxWelcomeInternal(isCurrentAttempt: () => boolean): Promise<LinxWelcomeResult | null> {
  const db = getDb()
  if (!db) {
    throw new Error('Solid database is not ready')
  }

  const resources = await ensureDefaultSecretaryResources(db, isCurrentAttempt)
  const threadId = await loadDefaultSecretaryThread(db, resources.chatIri, isCurrentAttempt)

  if (isCurrentAttempt()) {
    void ensureDefaultSecretaryAgentHome(db)
  }

  return {
    chatId: LINX_DEFAULT_SECRETARY.chatId,
    ...(threadId ? { threadId } : {}),
    created: resources.created,
  }
}

async function loadDefaultSecretaryThread(
  db: SolidDatabase,
  chatIri: string,
  isCurrentAttempt: () => boolean,
): Promise<string | null> {
  const threadId = buildThreadResourceId(LINX_DEFAULT_SECRETARY.threadKey, chatIri)
  const threadIri = resolveResourceIri(db, threadResource, threadId)
  if (!threadIri) return null

  const existing = await findOptionalExactRecord<ThreadRow>(db, threadResource, threadId)
  if (!existing) return null

  const normalized = normalizeCollectionRow(existing, threadId, threadIri)
  if (isCurrentAttempt()) {
    threadChatIdCache.set(threadId, LINX_DEFAULT_SECRETARY.chatId)
    threadChatIdCache.set(LINX_DEFAULT_SECRETARY.threadKey, LINX_DEFAULT_SECRETARY.chatId)
    writeCollectionRow(threadCollection, normalized, threadId)
  }
  return threadId
}

async function ensureDefaultSecretaryResources(
  db: SolidDatabase,
  isCurrentAttempt: () => boolean,
): Promise<{
  agentIri: string
  contactIri: string
  chatIri: string
  created: boolean
  chatCreated: boolean
}> {
  const now = new Date()
  const agentIri = resolveAgentIri(db, LINX_DEFAULT_SECRETARY.agentId)
  const contactIri = resolveResourceIri(db, contactResource, LINX_DEFAULT_SECRETARY.contactResourceId)
  const chatIri = resolveResourceIri(db, chatResource, LINX_DEFAULT_SECRETARY.chatResourceId)

  if (!agentIri || !contactIri || !chatIri) {
    throw new Error('Failed to resolve AI Secretary resource IRIs.')
  }

  const optimistic = buildDefaultSecretaryContactRows({
    now,
    agentIri,
    contactIri,
    chatIri,
  })
  if (isCurrentAttempt()) {
    stageDefaultSecretaryRows(optimistic)
  }

  const [contactResult, chatResult] = await Promise.all([
    ensureDefaultSecretaryRow<ContactRow>(
      db,
      contactResource as any,
      LINX_DEFAULT_SECRETARY.contactResourceId,
      optimistic.contact as Record<string, unknown>,
      _contactCollection,
      LINX_DEFAULT_SECRETARY.contactId,
      contactIri,
      { isCurrentAttempt, trustCached: false },
    ),
    ensureDefaultSecretaryRow<ChatRow>(
      db,
      chatResource as any,
      LINX_DEFAULT_SECRETARY.chatResourceId,
      {
        ...optimistic.chat,
        participants: [contactIri],
      } as Record<string, unknown>,
      chatCollection,
      LINX_DEFAULT_SECRETARY.chatId,
      chatIri,
      { isCurrentAttempt, trustCached: false },
    ),
  ])
  const contactParticipantIri = typeof contactResult.row['@id'] === 'string'
    ? contactResult.row['@id']
    : contactIri
  if (isCurrentAttempt()) {
    await normalizeDefaultSecretaryChatSingletons(db, chatIri)
    const [hydratedChat] = await hydrateChatRows(db, [{
      ...chatResult.row,
      id: LINX_DEFAULT_SECRETARY.chatId,
      '@id': chatIri,
    } as ChatRow])
    if (hydratedChat) {
      writeCollectionRow(chatCollection, hydratedChat, LINX_DEFAULT_SECRETARY.chatId)
    }
  }

  return {
    agentIri,
    contactIri: contactParticipantIri,
    chatIri,
    created: contactResult.created || chatResult.created,
    chatCreated: chatResult.created,
  }
}

async function normalizeDefaultSecretaryChatSingletons(
  db: SolidDatabase,
  chatIri: string,
): Promise<void> {
  const authFetch = (
    (db as any).getDialect?.()?.getAuthenticatedFetch?.()
    ?? (db as any).getSession?.()?.fetch
  ) as typeof fetch | undefined
  if (!authFetch) return

  const resourceUrl = chatIri.split('#')[0]
  try {
    const dataset = await getSolidDataset(resourceUrl, { fetch: authFetch })
    const thing = getThing(dataset, `${resourceUrl}#this`)
    if (!thing) return

    const titlePredicate = 'http://purl.org/dc/terms/title'
    const createdPredicate = 'http://purl.org/dc/terms/created'
    const updatedPredicate = 'http://purl.org/dc/terms/modified'
    const lastActivePredicate = UDFS.lastActiveAt
    const titles = getLiteralAll(thing, titlePredicate).map((literal) => literal.value)
    const createdValues = getLiteralAll(thing, createdPredicate)
      .map((literal) => literal.value)
      .filter((value) => !Number.isNaN(Date.parse(value)))
      .sort((left, right) => Date.parse(left) - Date.parse(right))
    const updatedValues = getLiteralAll(thing, updatedPredicate)
      .map((literal) => literal.value)
      .filter((value) => !Number.isNaN(Date.parse(value)))
      .sort((left, right) => Date.parse(left) - Date.parse(right))
    const lastActiveValues = getLiteralAll(thing, lastActivePredicate)
      .map((literal) => literal.value)
      .filter((value) => !Number.isNaN(Date.parse(value)))
      .sort((left, right) => Date.parse(left) - Date.parse(right))
    const createdAt = createdValues[0]
    const updatedAt = updatedValues[updatedValues.length - 1]
    const lastActiveAt = lastActiveValues[lastActiveValues.length - 1]
    const isCanonical = titles.length === 1
      && titles[0] === LINX_DEFAULT_SECRETARY.title
      && createdValues.length === 1
      && updatedValues.length <= 1
      && lastActiveValues.length <= 1
    if (isCanonical || !createdAt) return

    const timeDeletePatterns = [
      updatedAt ? `<${chatIri}> <${updatedPredicate}> ?oldUpdatedAt .` : null,
      lastActiveAt ? `<${chatIri}> <${lastActivePredicate}> ?oldLastActiveAt .` : null,
    ].filter((pattern): pattern is string => Boolean(pattern))
    const timeInsertPatterns = [
      updatedAt
        ? `<${chatIri}> <${updatedPredicate}> "${updatedAt}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .`
        : null,
      lastActiveAt
        ? `<${chatIri}> <${lastActivePredicate}> "${lastActiveAt}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .`
        : null,
    ].filter((pattern): pattern is string => Boolean(pattern))
    const timeWherePatterns = [
      updatedAt ? `OPTIONAL { <${chatIri}> <${updatedPredicate}> ?oldUpdatedAt . }` : null,
      lastActiveAt ? `OPTIONAL { <${chatIri}> <${lastActivePredicate}> ?oldLastActiveAt . }` : null,
    ].filter((pattern): pattern is string => Boolean(pattern))

    const update = `
DELETE {
  GRAPH <${resourceUrl}> {
    <${chatIri}> <${titlePredicate}> ?oldTitle .
    <${chatIri}> <${createdPredicate}> ?oldCreatedAt .
    ${timeDeletePatterns.join('\n    ')}
  }
}
INSERT {
  GRAPH <${resourceUrl}> {
    <${chatIri}> <${titlePredicate}> "${LINX_DEFAULT_SECRETARY.title}" .
    <${chatIri}> <${createdPredicate}> "${createdAt}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
    ${timeInsertPatterns.join('\n    ')}
  }
}
WHERE {
  GRAPH <${resourceUrl}> {
    <${chatIri}> ?existingPredicate ?existingObject .
    OPTIONAL { <${chatIri}> <${titlePredicate}> ?oldTitle . }
    OPTIONAL { <${chatIri}> <${createdPredicate}> ?oldCreatedAt . }
    ${timeWherePatterns.join('\n    ')}
  }
}`
    const response = await authFetch(resourceUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/sparql-update' },
      body: update,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`)
    }
  } catch (error) {
    console.warn('[chatOps] Failed to normalize default Secretary chat metadata:', error)
  }
}

async function normalizeUpdatedAtSingletons(
  db: SolidDatabase,
  rows: Array<{ '@id'?: string; id?: string; parent?: string }>,
  discoverThreads = false,
): Promise<void> {
  const authFetch = (
    (db as any).getDialect?.()?.getAuthenticatedFetch?.()
    ?? (db as any).getSession?.()?.fetch
  ) as typeof fetch | undefined
  if (!authFetch) return

  const rowsByResource = new Map<string, string[]>()
  for (const row of rows) {
    const subjectIri = row['@id']
      ?? (row.id?.startsWith('http') ? row.id : undefined)
      ?? resolveResourceIri(
        db,
        threadResource,
        buildResourceId(threadResource as any, row as Record<string, unknown>),
      )
      ?? (row.parent?.startsWith('http') && row.id
        ? `${row.parent.split('#')[0]}#${row.id.split('#').pop()}`
        : undefined)
    if (!subjectIri?.includes('#')) continue
    const resourceUrl = subjectIri.split('#')[0]
    const subjects = rowsByResource.get(resourceUrl) ?? []
    subjects.push(subjectIri)
    rowsByResource.set(resourceUrl, subjects)
  }

  await Promise.all([...rowsByResource].map(async ([resourceUrl, subjectIris]) => {
    try {
      const dataset = await getSolidDataset(resourceUrl, { fetch: authFetch })
      const candidateSubjectIris = discoverThreads
        ? getThingAll(dataset)
          .filter((thing) => getUrlAll(thing, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type')
            .includes('http://rdfs.org/sioc/ns#Thread'))
          .map((thing) => thing.url)
        : subjectIris
      const replacements = candidateSubjectIris.flatMap((subjectIri) => {
        const thing = getThing(dataset, subjectIri)
        if (!thing) return []
        const values = getLiteralAll(thing, 'http://purl.org/dc/terms/modified')
          .map((literal) => literal.value)
          .filter((value) => !Number.isNaN(Date.parse(value)))
          .sort((left, right) => Date.parse(left) - Date.parse(right))
        const latest = values[values.length - 1]
        // Only a chat-resource scan can authoritatively infer a Thread's
        // parent from the graph URL. A global thread query may resolve a
        // fragment-only row against the default chat and must never rewrite
        // ownership based on that fallback.
        const expectedParent = discoverThreads && resourceUrl.includes('/.data/chat/')
          ? `${resourceUrl}#this`
          : undefined
        const parents = getUrlAll(thing, 'http://rdfs.org/sioc/ns#has_parent')
        const repairParent = Boolean(expectedParent)
          && (parents.length !== 1 || parents[0] !== expectedParent)
        const repairUpdatedAt = values.length > 1 && Boolean(latest)
        return repairParent || repairUpdatedAt
          ? [{ subjectIri, latest: repairUpdatedAt ? latest : undefined, expectedParent: repairParent ? expectedParent : undefined }]
          : []
      })
      if (replacements.length === 0) return

      const update = `
DELETE {
  GRAPH <${resourceUrl}> {
    ${replacements.flatMap(({ subjectIri, latest, expectedParent }, index) => [
      latest ? `<${subjectIri}> <http://purl.org/dc/terms/modified> ?oldUpdatedAt${index} .` : null,
      expectedParent ? `<${subjectIri}> <http://rdfs.org/sioc/ns#has_parent> ?oldParent${index} .` : null,
    ].filter((pattern): pattern is string => Boolean(pattern))).join('\n    ')}
  }
}
INSERT {
  GRAPH <${resourceUrl}> {
    ${replacements.flatMap(({ subjectIri, latest, expectedParent }) => [
      latest ? `<${subjectIri}> <http://purl.org/dc/terms/modified> "${latest}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .` : null,
      expectedParent ? `<${subjectIri}> <http://rdfs.org/sioc/ns#has_parent> <${expectedParent}> .` : null,
    ].filter((pattern): pattern is string => Boolean(pattern))).join('\n    ')}
  }
}
WHERE {
  GRAPH <${resourceUrl}> {
    ${replacements.flatMap(({ subjectIri, latest, expectedParent }, index) => [
      `<${subjectIri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> <http://rdfs.org/sioc/ns#Thread> .`,
      latest ? `<${subjectIri}> <http://purl.org/dc/terms/modified> ?oldUpdatedAt${index} .` : null,
      expectedParent ? `OPTIONAL { <${subjectIri}> <http://rdfs.org/sioc/ns#has_parent> ?oldParent${index} . }` : null,
    ].filter((pattern): pattern is string => Boolean(pattern))).join('\n    ')}
  }
}`
      const response = await authFetch(resourceUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: update,
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      console.warn('[chatOps] Failed to normalize legacy thread metadata:', resourceUrl, error)
    }
  }))
}

function buildDefaultSecretaryContactRows(input: {
  now: Date
  agentIri: string
  contactIri: string
  chatIri: string
}): {
  agent: AgentRow
  contact: ContactRow
  chat: ChatRow
} {
  return {
    agent: {
      id: LINX_DEFAULT_SECRETARY.agentId,
      '@id': input.agentIri,
      name: LINX_DEFAULT_SECRETARY.title,
      provider: normalizeAIConfigProviderId(LINX_DEFAULT_SECRETARY.provider),
      model: normalizeAIConfigResourceId(LINX_DEFAULT_SECRETARY.model),
      createdAt: input.now,
      updatedAt: input.now,
    } as AgentRow,
    contact: {
      id: LINX_DEFAULT_SECRETARY.contactId,
      '@id': input.contactIri,
      name: LINX_DEFAULT_SECRETARY.title,
      about: input.agentIri,
      rdfType: ContactClass.AGENT,
      contactType: ContactType.AGENT,
      isPublic: false,
      createdAt: input.now,
      updatedAt: input.now,
    } as ContactRow,
    chat: {
      id: LINX_DEFAULT_SECRETARY.chatId,
      '@id': input.chatIri,
      title: LINX_DEFAULT_SECRETARY.title,
      metadata: createSecretaryMetadata(),
      participants: [input.contactIri],
      createdAt: input.now,
      updatedAt: input.now,
      lastActiveAt: input.now,
    } as ChatRow,
  }
}

function stageDefaultSecretaryRows(rows: {
  agent: AgentRow
  contact: ContactRow
  chat: ChatRow
}): void {
  stagedDefaultSecretaryRows = rows
  // Agent Home is directory-backed (/agents/{agentKey}/), so it is prepared by
  // ensureAgentHome instead of collection.insert, which writes file resources.
  writeCollectionRow(agentCollection, rows.agent, LINX_DEFAULT_SECRETARY.agentId)
  writeCollectionRow(_contactCollection, rows.contact, LINX_DEFAULT_SECRETARY.contactId)
  writeCollectionRow(chatCollection, rows.chat, LINX_DEFAULT_SECRETARY.chatId)
}

function stageDefaultSecretaryThread(db: SolidDatabase, chatIri: string): ThreadRow | null {
  const threadId = buildThreadResourceId(LINX_DEFAULT_SECRETARY.threadKey, chatIri)
  const existing = threadCollection.get(threadId)
  if (existing) return existing

  const threadIri = resolveResourceIri(db, threadResource, threadId)
  if (!threadIri) return null

  const now = new Date()
  const thread = {
    id: threadId,
    '@id': threadIri,
    parent: chatIri,
    title: LINX_DEFAULT_SECRETARY.threadTitle,
    createdAt: now,
    updatedAt: now,
  } as ThreadRow
  threadChatIdCache.set(threadId, LINX_DEFAULT_SECRETARY.chatId)
  threadChatIdCache.set(LINX_DEFAULT_SECRETARY.threadKey, LINX_DEFAULT_SECRETARY.chatId)
  writeCollectionRow(threadCollection, thread, threadId)
  return thread
}

/**
 * Makes the product-owned Secretary available before any Pod read or write.
 * Persistence remains the responsibility of ensureLinxWelcome.
 */
export function stageLinxDefaultSecretary(db: SolidDatabase): ChatRow | null {
  const agentIri = resolveAgentIri(db, LINX_DEFAULT_SECRETARY.agentId)
  const contactIri = resolveResourceIri(db, contactResource, LINX_DEFAULT_SECRETARY.contactResourceId)
  const chatIri = resolveResourceIri(db, chatResource, LINX_DEFAULT_SECRETARY.chatResourceId)
  const existing = chatCollection.get(LINX_DEFAULT_SECRETARY.chatId)
  if (existing) {
    const normalizedChat = existing.title === LINX_DEFAULT_SECRETARY.title
      ? existing
      : { ...existing, title: LINX_DEFAULT_SECRETARY.title }
    if (normalizedChat !== existing) {
      writeCollectionRow(chatCollection, normalizedChat, LINX_DEFAULT_SECRETARY.chatId)
    }

    const existingContact = _contactCollection.get(LINX_DEFAULT_SECRETARY.contactId)
    if (!existingContact && agentIri && contactIri && chatIri) {
      const rows = buildDefaultSecretaryContactRows({
        now: new Date(),
        agentIri,
        contactIri,
        chatIri,
      })
      if (!agentCollection.get(LINX_DEFAULT_SECRETARY.agentId)) {
        writeCollectionRow(agentCollection, rows.agent, LINX_DEFAULT_SECRETARY.agentId)
      }
      writeCollectionRow(_contactCollection, rows.contact, LINX_DEFAULT_SECRETARY.contactId)
    } else if (existingContact && existingContact.name !== LINX_DEFAULT_SECRETARY.title) {
      writeCollectionRow(_contactCollection, {
        ...existingContact,
        name: LINX_DEFAULT_SECRETARY.title,
      }, LINX_DEFAULT_SECRETARY.contactId)
    }
    if (chatIri) {
      stageDefaultSecretaryThread(db, chatIri)
    }
    return normalizedChat
  }

  if (!agentIri || !contactIri || !chatIri) {
    return null
  }

  const rows = buildDefaultSecretaryContactRows({
    now: new Date(),
    agentIri,
    contactIri,
    chatIri,
  })
  stageDefaultSecretaryRows(rows)
  stageDefaultSecretaryThread(db, chatIri)
  return rows.chat
}

function getStagedSecretaryChatRows(): ChatRow[] {
  const staged = readCollectionRows<ChatRow>(chatCollection)
    .find((row) => row.id === LINX_DEFAULT_SECRETARY.chatId)
    ?? stagedDefaultSecretaryRows?.chat
  return staged ? [staged] : []
}

function forgetLocalSecretaryChatRow(): void {
  if (!chatCollection.get(LINX_DEFAULT_SECRETARY.chatId)) {
    return
  }

  const collection = chatCollection as typeof chatCollection & {
    state?: Map<string, ChatRow>
    _state?: { syncedData?: { delete?: (id: string) => void } }
    utils?: { writeDelete?: (id: string) => void }
  }
  const canManualSync = typeof collection.utils?.writeDelete === 'function'
    && (typeof collection.isReady !== 'function' || collection.isReady())
  if (canManualSync) {
    try {
      collection.utils?.writeDelete?.(LINX_DEFAULT_SECRETARY.chatId)
      return
    } catch {
      // Fall through to headless/bootstrap state cleanup.
    }
  }

  if (collection.state instanceof Map) {
    collection.state.delete(LINX_DEFAULT_SECRETARY.chatId)
    return
  }
  collection._state?.syncedData?.delete?.(LINX_DEFAULT_SECRETARY.chatId)
}

function mergeChatRows(priorityRows: ChatRow[], rows: ChatRow[]): ChatRow[] {
  const persistedById = new Map(rows.flatMap((row) => row.id ? [[row.id, row] as const] : []))
  const merged = priorityRows.flatMap((staged) => {
    if (!staged.id) return []
    const persisted = persistedById.get(staged.id)
    persistedById.delete(staged.id)
    return [{ ...staged, ...persisted } as ChatRow]
  })

  return [...merged, ...persistedById.values()]
}

export function isLinxDefaultSecretaryBootstrapSettling(): boolean {
  return isLinxDefaultSecretaryBootstrapPending()
}

export function isLinxDefaultSecretaryBootstrapPending(): boolean {
  return !!linxWelcomeInFlight
}

async function ensureDefaultSecretaryAgentHome(db: SolidDatabase): Promise<void> {
  try {
    await ensureAgentHome(db, {
      agentId: LINX_DEFAULT_SECRETARY.agentId,
      name: LINX_DEFAULT_SECRETARY.title,
      provider: normalizeAIConfigProviderId(LINX_DEFAULT_SECRETARY.provider),
      model: normalizeAIConfigResourceId(LINX_DEFAULT_SECRETARY.model),
    })
  } catch (error) {
    console.warn('[chatOps] Failed to prepare default Secretary Agent Home:', error)
  }
}

function readCollectionRows<T extends Record<string, unknown> & { id: string }>(
  collection: unknown,
): T[] {
  const rows = new Map<string, T>()
  const add = (row: unknown) => {
    if (isRecord(row) && typeof row.id === 'string') {
      rows.set(row.id, row as T)
    }
  }
  const target = collection as {
    state?: Map<string, T> | { data?: T[] }
    toArray?: T[]
    _state?: {
      syncedData?: Map<string, T> | { values?: () => IterableIterator<T> }
    }
  } | null | undefined

  const collectionState = target?.state
  if (collectionState instanceof Map) {
    Array.from(collectionState.values()).forEach(add)
  } else if (Array.isArray(collectionState?.data)) {
    collectionState.data.forEach(add)
  }
  if (Array.isArray(target?.toArray)) {
    target.toArray.forEach(add)
  }
  const syncedData = target?._state?.syncedData
  const syncedValues = syncedData?.values
  if (typeof syncedValues === 'function') {
    Array.from(syncedValues.call(syncedData)).forEach(add)
  }

  return Array.from(rows.values())
}

async function ensureDefaultSecretaryRow<T extends Record<string, unknown> & { id: string }>(
  db: SolidDatabase,
  resource: unknown,
  targetId: string,
  row: Record<string, unknown>,
  collection: CollectionWriter<T>,
  collectionId: string,
  iri: string,
  options: {
    isCurrentAttempt?: () => boolean
    trustCached?: boolean
    skipExistingRead?: boolean
  } = {},
): Promise<{ row: T; created: boolean }> {
  const cached = collection?.get?.(collectionId) as T | undefined
  if (cached && options.trustCached !== false) {
    return { row: cached, created: false }
  }

  if (!options.skipExistingRead) {
    const existing = await findOptionalExactRecord<T>(db, resource as any, targetId)
    if (existing) {
      const normalized = normalizeCollectionRow(existing, collectionId, iri)
      if (options.isCurrentAttempt?.() !== false) {
        writeCollectionRow(collection, normalized, collectionId)
      }
      return { row: normalized, created: false }
    }
  }

  if (cached && options.trustCached === false) {
    const documentExists = await podDocumentExists(db, iri)
    if (documentExists) {
      return { row: cached, created: false }
    }
  }

  const created = normalizeCollectionRow(row as T, collectionId, iri)
  if (cached && options.trustCached === false) {
    const persisted = await insertPodRowWithRetry<T>(db, resource, created, targetId)
    if (options.isCurrentAttempt?.() !== false) {
      writeCollectionRow(collection, persisted, collectionId)
    }
    return { row: persisted, created: true }
  }

  const persisted = await insertPodRowWithRetry<T>(db, resource, created, targetId)
  if (options.isCurrentAttempt?.() !== false) {
    writeCollectionRow(collection, persisted, collectionId)
  }
  return { row: persisted, created: true }
}

async function insertPodRowWithRetry<T extends Record<string, unknown> & { id: string }>(
  db: SolidDatabase,
  resource: unknown,
  row: T,
  targetId: string,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await insertPodRow(db, resource, row)
      return row
    } catch (error) {
      lastError = error
      const existing = await findOptionalExactRecord<T>(db, resource, targetId)
      if (existing) {
        return normalizeCollectionRow(existing, row.id, typeof row['@id'] === 'string' ? row['@id'] : '')
      }
      if (!isTransientPodWriteError(error) || attempt === 3) {
        throw error
      }
      await delay(200 * (attempt + 1))
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

function isTransientPodWriteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /deadlock detected|HTTP status 5\d\d|\\b5\d\d\\b|InternalServerError/i.test(message)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeCollectionRow<T extends Record<string, unknown> & { id: string }>(
  row: T,
  collectionId: string,
  iri: string,
): T {
  return {
    ...row,
    id: collectionId,
    '@id': typeof row['@id'] === 'string' ? row['@id'] : iri,
  }
}

async function findOptionalExactRecord<T>(
  db: SolidDatabase,
  resource: unknown,
  id: string,
): Promise<T | null> {
  try {
    return await withExactReadTimeout(
      findExactRecord<T>(db, resource as any, id),
      DEFAULT_SECRETARY_EXACT_READ_TIMEOUT_MS,
    )
  } catch (error) {
    if (isMissingExactReadError(error) || isExactReadTimeoutError(error)) {
      return null
    }
    throw error
  }
}

async function podDocumentExists(db: SolidDatabase, iri: string): Promise<boolean | null> {
  const fetchCandidate = (
    (db as any).getDialect?.()?.getAuthenticatedFetch?.()
    ?? (db as any).getSession?.()?.fetch
    ?? (db as any).session?.fetch
  )
  if (typeof fetchCandidate !== 'function') {
    return null
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_SECRETARY_EXACT_READ_TIMEOUT_MS)
  try {
    const documentUrl = iri.split('#', 1)[0]
    const response = await fetchCandidate(documentUrl, {
      method: 'GET',
      headers: { Accept: 'text/turtle, */*;q=0.1' },
      signal: controller.signal,
    })
    if (response.ok) return true
    if (response.status === 404) return false
    return null
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

function withExactReadTimeout<T>(promise: Promise<T | null>, timeoutMs: number): Promise<T | null> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T | null>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error('Exact record read timed out.')
      error.name = 'ExactReadTimeoutError'
      reject(error)
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  })
}

function withSecretaryBootstrapTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new SecretaryBootstrapTimeoutError(timeoutMs))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  })
}

// ============================================================================
// Chat Collection
// ============================================================================

export const chatCollection = createPodCollection<typeof chatResource, ChatRow, ChatInsert>({
  resource: chatResource,
  queryKey: ['chats'],
  queryClient,
  getDb,
  orderBy: { column: 'lastActiveAt', direction: 'desc' },
  transformRows: async (rows, db) => {
    await normalizeUpdatedAtSingletons(db, rows.map((row) => ({
      '@id': resolveResourceIri(
        db,
        chatResource,
        buildResourceId(chatResource as any, row as Record<string, unknown>),
      ) ?? undefined,
    })), true)
    const hydratedRows = await hydrateChatRows(db, rows)
    return mergeChatRows(getStagedSecretaryChatRows(), hydratedRows)
  },
  getKey: (item) => {
    if (!item.id) throw new Error('Chat item is missing id.')
    return item.id
  },
})

export async function projectChatSummary(
  chatId: string,
  summary: Pick<ChatRow, 'lastMessageId' | 'lastMessagePreview' | 'lastActiveAt' | 'updatedAt'>,
): Promise<void> {
  const rowId = normalizeChatRowId(chatId)
  if (!rowId) return
  const existing = chatCollection.get(rowId)
  if (!existing) return
  const transaction = chatCollection.update(rowId, (draft) => {
    Object.assign(draft, summary)
  })
  await transaction.isPersisted.promise
}

// ============================================================================
// Thread Collection
// ============================================================================

// Columns needed for thread list view
const threadListColumns: (keyof ThreadRow)[] = [
  'id',
  'parent',
  'title',
  'starred',
  'workspace',
  'metadata',
  'updatedAt',
]

export const threadCollection = createPodCollection<typeof threadResource, ThreadRow, ThreadInsert>({
  resource: threadResource,
  queryKey: ['threads'],
  queryClient,
  getDb,
  columns: threadListColumns,
  transformRows: async (rows, db) => {
    await normalizeUpdatedAtSingletons(db, rows)
    return rows
  },
  orderBy: { column: 'updatedAt', direction: 'desc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Thread item is missing id.')
    return item.id
  },
})

// ============================================================================
// Message Collection
// ============================================================================

// Include richContent because message branch metadata is persisted there.
const messageListColumns: (keyof MessageRow)[] = [
  'id',
  'thread',
  'chat',
  'maker',
  'role',
  'content',
  'status',
  'createdAt',
  'richContent',
]

export const messageCollection = createPodCollection<typeof messageResource, MessageRow, MessageInsert>({
  resource: messageResource,
  queryKey: ['messages'],
  queryClient,
  getDb,
  columns: messageListColumns,
  orderBy: { column: 'createdAt', direction: 'asc' },
  getKey: (item) => {
    if (!item.id) throw new Error('Message item is missing id.')
    return item.id
  },
})

// ============================================================================
// Agent Collection (for creating AI chats)
// ============================================================================

export { agentCollection }

// ============================================================================
// Chat Operations (Business Logic)
// ============================================================================

export interface CreateAIChatInput {
  title: string
  provider: string
  model: string
  systemPrompt?: string
  agentId?: string
  contactId?: string
  chatId?: string
}

export interface UpdateAgentProfileInput {
  agentId: string
  name?: string
  instructions?: string
  aiRuntimeLocation?: AgentAiRuntimeLocation
  chatId?: string
  contactId?: string
}

export interface UpdateAgentModelInput {
  agentId: string
  provider: string
  model: string
  chatId?: string
  contactId?: string
}

/**
 * Chat Operations - Business logic for chat management
 * 
 * All operations that need to coordinate multiple collections go here.
 * Simple CRUD can use the collections directly.
 */
export const chatOps = {
  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Get all chats from collection state
   */
  getAll(): ChatRow[] {
    return readCollectionRows<ChatRow>(chatCollection)
  },

  /**
   * Get chat by ID
   */
  getById(id: string): ChatRow | null {
    const items = readCollectionRows<ChatRow>(chatCollection)
    return items.find((c: ChatRow) => c.id === id) || null
  },

  /**
   * Get threads for a chat
   */
  getThreads(chatId: string): ThreadRow[] {
    const items = readCollectionRows<ThreadRow>(threadCollection)
    return items.filter((t: ThreadRow) => resolveThreadChatRowId(t) === normalizeChatRowId(chatId))
  },

  /**
   * Get messages for a thread
   */
  getMessages(threadId: string): MessageRow[] {
    const items = readCollectionRows<MessageRow>(messageCollection)
    return items
      .filter((m: MessageRow) => extractThreadIdFromThreadRef(m.thread) === threadId)
      .sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return aTime - bTime
      })
  },

  // ==========================================================================
  // Chat CRUD Operations
  // ==========================================================================

  /**
   * Create an AI Chat with new Agent and Contact
   * 
   * Flow:
   * 1. Create Agent record (with avatarUrl from provider)
   * 2. Create Contact record (type: agent, about → Agent)
   * 3. Create Chat record (participants → Contact URI)
   * 
   * @returns The created Chat with related IDs
   */
  async createAIChat(input: CreateAIChatInput): Promise<ChatRow & { agentId: string; contactId: string }> {
    const { title, provider, model, systemPrompt } = input

    const db = getDb()
    if (!db) {
      throw new Error('Solid database is not ready')
    }

    const providerInfo = getAgentProviderInfo(provider)
    const {
      agent,
      contact,
      agentId,
      contactId,
      contactUri,
    } = await createAgentContactRecords(db, {
      agentId: input.agentId,
      contactId: input.contactId,
      name: title,
      provider: normalizeAIConfigProviderId(provider),
      model: normalizeAIConfigResourceId(model),
      instructions: systemPrompt,
    })
    await ensureAgentHome(db, {
      agentId,
      name: title,
      provider: normalizeAIConfigProviderId(provider),
      model: normalizeAIConfigResourceId(model),
      instructions: systemPrompt,
    })

    const chatId = input.chatId?.trim() || crypto.randomUUID()
    const chatRowId = buildChatResourceId(chatId)
    const chatIri = buildChatIri(db, chatRowId)
    if (!chatIri) {
      throw new Error(`Failed to resolve chat IRI for chat ${chatId}`)
    }
    const now = new Date()

    writeCollectionRow(agentCollection, agent as AgentRow, agentId)
    writeCollectionRow(_contactCollection, contact as ContactRow, contactId)

    const chatData = {
      id: chatRowId,
      '@id': chatIri,
      title,
      avatarUrl: providerInfo?.logoUrl,
      metadata: title === LINX_DEFAULT_SECRETARY.title
        ? createSecretaryMetadata()
        : undefined,
      participants: [contactUri],
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    } as ChatInsert & { '@id': string }
    const chatTx = chatCollection.insert(chatData as ChatRow)
    await chatTx.isPersisted.promise
    writeCollectionRow(chatCollection, { ...chatData, id: chatRowId } as ChatRow, chatRowId)

    return { ...chatData, id: chatRowId, agentId, contactId } as ChatRow & { agentId: string; contactId: string }
  },

  /**
   * LinX product welcome flow.
   *
   * xpod remains generic storage/runtime infrastructure; LinX owns the
   * product-specific default assistant and records completion in LinX settings.
   */
  async ensureLinxWelcome(options: EnsureLinxWelcomeOptions = {}): Promise<LinxWelcomeResult | null> {
    if (options.force) {
      setLinxWelcomeInFlight(null)
    }

    if (!linxWelcomeInFlight) {
      const attempt = ++linxWelcomeAttempt
      const persistence = ensureLinxWelcomeInternal(() => linxWelcomeAttempt === attempt)
      const inFlight = withSecretaryBootstrapTimeout(persistence, SECRETARY_BOOTSTRAP_TIMEOUT_MS)
      setLinxWelcomeInFlight(inFlight)
      void inFlight.then(
        () => {
          if (linxWelcomeInFlight === inFlight) {
            setLinxWelcomeInFlight(null)
          }
        },
        () => {
          if (linxWelcomeInFlight === inFlight) {
            setLinxWelcomeInFlight(null)
          }
        },
      )
    }

    return linxWelcomeInFlight
  },

  stageLinxDefaultSecretary(db: SolidDatabase): ChatRow | null {
    return stageLinxDefaultSecretary(db)
  },

  stageLinxDefaultSecretaryThread(db: SolidDatabase): ThreadRow | null {
    const chatIri = resolveResourceIri(db, chatResource, LINX_DEFAULT_SECRETARY.chatResourceId)
    return chatIri ? stageDefaultSecretaryThread(db, chatIri) : null
  },

  /**
   * Update a chat
   */
  async updateChat(id: string, data: Partial<ChatRow>): Promise<void> {
    const db = getDb()
    const updatedAt = new Date()
    let existing = chatCollection.get(id)
    if (!chatCollection.get(id)) {
      if (!db) {
        throw new Error('Solid database is not ready')
      }
      existing = await ensureChatStateRow(db, id)
    }

    if (db) {
      const persistenceTarget = {
        ...(existing ?? {}),
        id: buildChatResourceId(id),
      }
      await updateExactRecord(db, chatResource as any, persistenceTarget, {
        ...data,
        updatedAt,
      } as Record<string, unknown>)
      writeCollectionRow(chatCollection, {
        ...(existing ?? { id }),
        ...data,
        updatedAt,
      } as ChatRow, id)
      return
    }

    const tx = chatCollection.update(id, (draft: any) => {
      Object.assign(draft, data, { updatedAt })
    })
    await tx.isPersisted.promise
  },

  /**
   * Toggle chat starred status
   */
  async toggleChatStar(id: string, currentStarred: boolean): Promise<void> {
    const newStarred = !currentStarred
    await this.updateChat(id, { starred: newStarred })

    // CP1: report starred change to favorites hub
    const chat = this.getById(id)
    favoriteHooks.onStarredChange('chat', id, newStarred, {
      title: chat?.title ?? id,
      searchText: chat?.title ?? undefined,
      snapshotContent: chat?.lastMessagePreview ?? undefined,
    })
  },

  /**
   * Toggle chat muted status
   */
  async toggleChatMute(id: string, currentMuted: boolean): Promise<void> {
    await this.updateChat(id, { muted: !currentMuted })
  },

  /**
   * Delete a chat (and its threads/messages)
   */
  async deleteChat(id: string): Promise<void> {
    const db = getDb()
    if (!db) {
      throw new Error('Solid database is not ready')
    }

    if (await isProtectedLinxSecretaryChat(db, id)) {
      throw new Error('默认助手不能删除。')
    }

    // Delete all threads first
    const threads = this.getThreads(id)
    for (const thread of threads) {
      await this.deleteThread(thread.id, id)
    }
    
    // Delete chat
    const tx = chatCollection.delete(id)
    await tx.isPersisted.promise
  },

  // ==========================================================================
  // Thread CRUD Operations
  // ==========================================================================

  /**
   * Create a new thread
   */
  async createThread(chatId: string, title?: string, options?: { threadId?: string }): Promise<ThreadRow> {
    const db = getDb()
    const threadKey = options?.threadId?.trim() || crypto.randomUUID()
    const now = new Date()
    const chatIri = db ? buildChatIri(db, chatId) : null
    if (db && !chatIri) {
      throw new Error(`Failed to resolve chat IRI for chat ${chatId}`)
    }
    const threadResourceId = db && chatIri
      ? buildThreadResourceId(threadKey, chatIri)
      : threadKey
    const threadIri = db && chatIri
      ? resolveResourceIri(db, threadResource, threadResourceId)
      : null
    if (db && !threadIri) {
      throw new Error(`Failed to resolve thread IRI for thread ${threadKey}`)
    }
    
    const threadData = {
      id: threadResourceId,
      ...(threadIri ? { '@id': threadIri } : {}),
      parent: chatIri ?? chatId,
      title: title || `话题 ${now.toLocaleTimeString()}`,
      createdAt: now,
      updatedAt: now,
    } as ThreadInsert & { '@id'?: string }
    
    if (db) {
      await db.insert(threadResource).values(threadData as any).execute()
    } else {
      const tx = threadCollection.insert(threadData as ThreadRow)
      await tx.isPersisted.promise
    }
    threadChatIdCache.set(threadResourceId, chatId)
    threadChatIdCache.set(threadKey, chatId)
    writeCollectionRow(threadCollection, { ...threadData, id: threadResourceId } as ThreadRow, threadResourceId)
    
    // Invalidate threads query
    queryClient.invalidateQueries({ queryKey: ['chats', chatId, 'threads'] })
    
    return { ...threadData, id: threadResourceId } as ThreadRow
  },

  async ensureThreadWorkspace(input: {
    threadId: string
    workspaceUri?: string
    title?: string
    repoPath?: string
    folderPath?: string
    baseRef?: string
    branch?: string
  }): Promise<string> {
    const db = getDb()
    if (!db) {
      throw new Error('数据库未就绪，无法绑定 workspace。')
    }

    const thread = await ensureThreadStateRow(db, input.threadId)
    const requestedWorkspaceUri = input.workspaceUri?.trim()

    const podBaseUrl = getPodBaseUrl(db)
    if (!podBaseUrl) {
      throw new Error('无法解析 Pod 地址，无法绑定 workspace。')
    }

    const workspaceUri = requestedWorkspaceUri
      ?? thread.workspace?.trim()
      ?? resolveWorkspaceContainerUri(podBaseUrl, thread.id)

    if (thread.workspace !== workspaceUri) {
      await this.updateThread(thread.id, { workspace: workspaceUri })
      const chatId = resolveThreadChatRowId(thread)
      if (chatId) {
        queryClient.invalidateQueries({ queryKey: QUERY_KEYS.threads(chatId) })
      }
    }

    return workspaceUri
  },

  /**
   * Update a thread
   */
  async updateThread(id: string, data: Partial<ThreadRow>): Promise<void> {
    const db = getDb()
    const updatedAt = new Date()
    const payload = { ...data, updatedAt }

    if (db) {
      const target = await resolveThreadMutationTarget(db, id)
      await updateExactRecord(db, threadResource as any, target, payload as Record<string, unknown>)
      const nextRow = {
        ...(typeof target === 'object' && target ? target : { id: target }),
        ...payload,
      } as ThreadRow
      writeCollectionRow(threadCollection, nextRow, nextRow.id)
      return
    }

    const tx = threadCollection.update(id, (draft: any) => {
      Object.assign(draft, payload)
    })
    await tx.isPersisted.promise
  },

  /**
   * Toggle thread starred status
   */
  async toggleThreadStar(id: string, chatId: string, currentStarred: boolean): Promise<void> {
    await this.updateThread(id, { starred: !currentStarred })
    queryClient.invalidateQueries({ queryKey: ['chats', chatId, 'threads'] })
  },

  /**
   * Delete a thread (and its messages)
   */
  async deleteThread(id: string, chatId: string): Promise<void> {
    // Delete all messages first
    const messages = this.getMessages(id)
    for (const msg of messages) {
      const tx = messageCollection.delete(msg.id)
      await tx.isPersisted.promise
    }
    
    // Delete thread
    const tx = threadCollection.delete(id)
    await tx.isPersisted.promise
    
    // Invalidate threads query
    queryClient.invalidateQueries({ queryKey: ['chats', chatId, 'threads'] })
  },

  // ==========================================================================
  // Message CRUD Operations
  // ==========================================================================

  /**
   * Create a user message
   */
  async createUserMessage(
    chatId: string, 
    threadId: string, 
    content: string, 
    maker: string
  ): Promise<MessageRow> {
    const db = getDb()
    if (!db) throw new Error('Database not connected')

    const msgKey = crypto.randomUUID()
    const now = new Date()
    const chatRef = buildChatIri(db, chatId)
    if (!chatRef) {
      throw new Error(`Failed to resolve chat IRI for chat ${chatId}`)
    }
    const threadRef = await buildThreadIri(db, threadId, chatId)
    if (!threadRef) {
      throw new Error(`Failed to resolve thread IRI for thread ${threadId}`)
    }
    const messageResourceId = buildMessageResourceId(msgKey, {
      parent: chatRef,
      chat: chatRef,
      thread: threadRef,
      createdAt: now,
    })
    const messageIri = resolveResourceIri(db, messageResource, messageResourceId)
    if (!messageIri) {
      throw new Error(`Failed to resolve message IRI for message ${msgKey}`)
    }
    
    const msgData = {
      id: messageResourceId,
      '@id': messageIri,
      parent: chatRef,
      chat: chatRef,
      thread: threadRef,
      maker,
      role: 'user',
      content,
      status: 'sent',
      metadata: buildMessageReconcilerMetadata({
        chat: chatRef,
        thread: threadRef,
        resource: messageIri,
        role: 'user',
        content,
        maker,
        createdAt: now,
      }),
      createdAt: now,
    } as MessageInsert & { '@id': string }
    
    await db.insert(messageResource).values(msgData as any).execute()
    writeCollectionRow(messageCollection, { ...msgData, id: messageResourceId } as MessageRow, messageResourceId)
    
    // Update chat last activity
    await this.updateChat(chatId, {
      lastActiveAt: now,
      lastMessageId: messageResourceId,
      lastMessagePreview: content.slice(0, 100),
    })
    
    // Invalidate messages query
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(chatId, threadId) })
    
    return { ...msgData, id: messageResourceId } as MessageRow
  },

  /**
   * Create an assistant message
   */
  async createAssistantMessage(
    chatId: string,
    threadId: string,
    content: string,
    maker: string,
    richContent?: string,
    options?: {
      messageId?: string
      chatIri?: string
      threadIri?: string
    },
  ): Promise<MessageRow> {
    const db = getDb()
    if (!db) throw new Error('Database not connected')

    const msgKey = options?.messageId?.trim() || crypto.randomUUID()
    const now = new Date()
    const chatRef = options?.chatIri ?? buildChatIri(db, chatId)
    if (!chatRef) {
      throw new Error(`Failed to resolve chat IRI for chat ${chatId}`)
    }
    const threadRef = options?.threadIri ?? await buildThreadIri(db, threadId, chatId)
    if (!threadRef) {
      throw new Error(`Failed to resolve thread IRI for thread ${threadId}`)
    }
    const messageResourceId = buildMessageResourceId(msgKey, {
      parent: chatRef,
      chat: chatRef,
      thread: threadRef,
      createdAt: now,
    })
    const messageIri = resolveResourceIri(db, messageResource, messageResourceId)
    if (!messageIri) {
      throw new Error(`Failed to resolve message IRI for message ${msgKey}`)
    }
    
    const msgData = {
      id: messageResourceId,
      '@id': messageIri,
      parent: chatRef,
      chat: chatRef,
      thread: threadRef,
      maker,
      role: 'assistant',
      content,
      richContent,
      status: 'sent',
      metadata: buildMessageReconcilerMetadata({
        chat: chatRef,
        thread: threadRef,
        resource: messageIri,
        role: 'assistant',
        content,
        maker,
        source: 'primary-agent',
        createdAt: now,
      }),
      createdAt: now,
    } as MessageInsert & { '@id': string }
    
    await insertPodRow(db, messageResource, msgData as Record<string, unknown>)
    const persistedMessage = normalizeCollectionRow(msgData as MessageRow, messageResourceId, messageIri)
    writeCollectionRow(messageCollection, persistedMessage, messageResourceId)
    
    await this.updateChat(chatId, {
      lastActiveAt: now,
      lastMessageId: messageResourceId,
      lastMessagePreview: content.slice(0, 100),
    })
    
    // Invalidate messages query
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(chatId, threadId) })
    
    return persistedMessage
  },

  /**
   * Delete a message
   */
  async deleteMessage(id: string, threadId: string): Promise<void> {
    const tx = messageCollection.delete(id)
    await tx.isPersisted.promise

    const chatId = getCachedThreadChatId(threadId) || ''
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.messages(chatId, threadId) })
  },

  // ==========================================================================
  // Agent Operations
  // ==========================================================================

  /**
   * Update agent profile and keep related contact/chat display fields in sync.
   */
  async updateAgentProfile(input: UpdateAgentProfileInput): Promise<void> {
    const { agentId, name, instructions, aiRuntimeLocation, chatId, contactId } = input
    const normalizedName = name?.trim()
    const nextInstructions = instructions?.trim() ?? ''

    const current = agentCollection.get(agentId) as AgentRow | undefined
    if (!current) throw new Error(`Agent ${agentId} was not found`)
    const changes: Parameters<typeof updateAgentHomeMetadata>[2] = {}
    if (normalizedName) changes.name = normalizedName
    if (instructions !== undefined) changes.instructions = nextInstructions
    if (aiRuntimeLocation) {
      changes.metadata = writeAgentAiRuntimeLocationMetadata(current.metadata, aiRuntimeLocation)
    }
    const db = getDb()
    if (!db) throw new Error('Pod database is not initialized')
    await updateAgentHomeMetadata(db, agentId as any, changes, current)
    writeCollectionRow(agentCollection, { ...current, ...changes } as AgentRow, agentId)

    if (contactId && normalizedName) {
      const contactTx = _contactCollection.update(contactId, (draft: any) => {
        draft.name = normalizedName
        draft.updatedAt = new Date()
      })
      await contactTx.isPersisted.promise
    }

    if (chatId && normalizedName) {
      await this.updateChat(chatId, { title: normalizedName })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.chats })
    }
  },

  /**
   * Update an agent's instructions (system prompt)
   */
  async updateAgentInstructions(agentId: string, instructions: string): Promise<void> {
    const current = agentCollection.get(agentId) as AgentRow | undefined
    if (!current) throw new Error(`Agent ${agentId} was not found`)
    const changes = { instructions }
    const db = getDb()
    if (!db) throw new Error('Pod database is not initialized')
    await updateAgentHomeMetadata(db, agentId as any, changes, current)
    writeCollectionRow(agentCollection, { ...current, ...changes } as AgentRow, agentId)
  },

  /**
   * Update an agent's model (and avatarUrl when provider changes)
   * Also updates the related Chat's avatarUrl for list display
   */
  async updateAgentModel(agentId: string, provider: string, model: string, chatId?: string, contactId?: string): Promise<void> {
    const providerInfo = getAgentProviderInfo(provider)
    const providerRef = normalizeAIConfigProviderId(provider)
    const modelRef = normalizeAIConfigResourceId(model)
    const current = agentCollection.get(agentId) as AgentRow | undefined
    if (!current) throw new Error(`Agent ${agentId} was not found`)
    const providerChanged = normalizeAIConfigProviderId(current.provider || '') !== provider
    const changes: Parameters<typeof updateAgentHomeMetadata>[2] = {
      provider: providerRef,
      model: modelRef,
    }
    if (providerChanged && providerInfo?.logoUrl) changes.avatarUrl = providerInfo.logoUrl
    const db = getDb()
    if (!db) throw new Error('Pod database is not initialized')
    await updateAgentHomeMetadata(db, agentId as any, changes, current)
    writeCollectionRow(agentCollection, { ...current, ...changes } as AgentRow, agentId)

    if (contactId && providerInfo?.logoUrl) {
      const contactTx = _contactCollection.update(contactId, (draft: any) => {
        draft.avatarUrl = providerInfo.logoUrl
        draft.updatedAt = new Date()
      })
      await contactTx.isPersisted.promise
    }
    
    // Also update Chat avatarUrl if chatId provided and provider changed
    if (chatId && providerInfo?.logoUrl) {
      await this.updateChat(chatId, { avatarUrl: providerInfo.logoUrl })
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.chats })
    }
  },

  // ==========================================================================
  // AI Completion
  // ==========================================================================

  /**
   * Get base URL for a provider using Discovery Service
   * 
   * Currently reads from local JSON (providers.json).
   * Future: Can be upgraded to remote discovery service.
   */
  getProviderBaseUrl(providerSlug: string): string {
    const provider = getAgentProviderInfo(providerSlug)
    return provider?.baseUrl || 'https://api.openai.com/v1'
  },

  /**
   * Fetch AI completion
   */
  async fetchCompletion(
    providerSlug: string,
    params: {
      baseUrl?: string | null
      apiKey: string
      model: string
      messages: { role: string; content: string }[]
    }
  ): Promise<string> {
    const { baseUrl, apiKey, model, messages } = params
    
    // Use provided baseUrl or get from discovery service
    const base = baseUrl || this.getProviderBaseUrl(providerSlug)
    const cleanBase = base.replace(/\/$/, '')
    const endpoint = `${cleanBase}/chat/completions`
    
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    })
    
    if (!res.ok) {
      const text = await res.text()
      console.error('[chatOps] AI API Error:', text)
      throw new Error(`AI Error ${res.status}: ${text.slice(0, 100)}`)
    }
    
    const data = await res.json()
    return data.choices?.[0]?.message?.content ?? ''
  },

  /**
   * Get API credential for a provider from Pod-backed AI config resources.
   */
  async getCredential(provider: string): Promise<{ apiKey: string; baseUrl?: string } | null> {
    const db = getDb()
    if (!db) return null

    const providerId = normalizeAIConfigProviderId(provider)
    const [credentialRows, providerRow] = await Promise.all([
      findAIConfigCredentialRows(db, providerId),
      typeof (db as any).findById === 'function'
        ? (db as any).findById(aiProviderResource as any, aiProviderResource.buildId({ id: providerId }))
        : Promise.resolve(null),
    ])
    const selected = selectAIConfigCredential(
      providerId,
      credentialRows as Array<Record<string, unknown>>,
      providerRow ? [providerRow as Record<string, unknown>] : [],
    )

    if (!selected) return null

    return {
      apiKey: selected.apiKey,
      baseUrl: selected.baseUrl || undefined,
    }
  },

  // ==========================================================================
  // Fetch Operations (for initial load)
  // ==========================================================================

  /**
   * Fetch chats from Pod
   */


  /**
   * Fetch messages for a thread
   */


  // ==========================================================================
  // Subscription Operations
  // ==========================================================================

  /**
   * Subscribe to Pod notifications for real-time updates
   */
  async subscribeToPod(): Promise<() => void> {
    const db = getDb()
    if (!db) {
      console.warn('[chatOps] No database available for subscription')
      return () => {}
    }
    
    const unsubscribers: (() => void)[] = []
    
    try {
      const chatUnsub = await chatCollection.subscribeToPod(db)
      const threadUnsub = await threadCollection.subscribeToPod(db)
      const messageUnsub = await messageCollection.subscribeToPod(db)
      
      unsubscribers.push(chatUnsub, threadUnsub, messageUnsub)
    } catch (e) {
      console.error('[chatOps] Failed to subscribe:', e)
    }
    
    return () => {
      unsubscribers.forEach(unsub => {
        try { unsub() } catch (e) { console.warn('[chatOps] Unsubscribe error:', e) }
      })
    }
  },
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize chat collections with the database instance.
 * Call this from a component that has access to useSolidDatabase.
 */
export async function initializeChatCollections(db: SolidDatabase | null): Promise<void> {
  if (currentChatDatabase === db) return

  currentChatDatabase = db
  linxWelcomeAttempt += 1
  forgetLocalSecretaryChatRow()
  stagedDefaultSecretaryRows = null
  setLinxWelcomeInFlight(null)
  setDatabaseGetter(() => db)

  try {
    await rebindPodCollections([
      {
        collection: chatCollection,
        cancelInFlight: () => queryClient.cancelQueries({ queryKey: ['chats'], exact: true }),
      },
      {
        collection: threadCollection,
        cancelInFlight: () => queryClient.cancelQueries({ queryKey: ['threads'], exact: true }),
      },
      {
        collection: messageCollection,
        cancelInFlight: () => queryClient.cancelQueries({ queryKey: ['messages'], exact: true }),
      },
    ], Boolean(db))
  } catch (error) {
    if (currentChatDatabase === db) {
      currentChatDatabase = null
    }
    throw error
  }
}

// ============================================================================
// React Query Hooks
// ============================================================================

import { useSolidDatabase } from '@/providers/solid-database-provider'

/**
 * Hook to initialize chat collections with database.
 * Call this at the top of any component that uses chat collections.
 */
export function useChatInit() {
  const { db, scopeKey } = useSolidDatabase()
  setDatabaseGetter(() => db)
  observeChatQueryScope(scopeKey, db)

  return { db, scopeKey, isReady: !!db }
}

export function useLinxDefaultSecretaryBootstrapSettling(): boolean {
  return useSyncExternalStore(
    subscribeLinxWelcome,
    isLinxDefaultSecretaryBootstrapPending,
    () => false,
  )
}

const QUERY_KEYS = {
  chats: ['chats'] as const,
  chat: (id: string) => ['chats', id] as const,
  threads: (chatId: string) => ['chats', chatId, 'threads'] as const,
  workspaces: ['workspaces'] as const,
  messages: (chatId: string, threadId: string) => ['chats', chatId, 'threads', threadId, 'messages'] as const,
}

export function buildChatListQueryKey(scopeKey: string, search: string) {
  return [...QUERY_KEYS.chats, 'scope', scopeKey, search] as const
}

export function buildThreadListQueryKey(scopeKey: string, chatId: string) {
  return [...QUERY_KEYS.threads(chatId), 'scope', scopeKey] as const
}

export function buildThreadIndexQueryKey(scopeKey: string) {
  return ['threads', 'index', 'scope', scopeKey] as const
}

export function buildMessageListQueryKey(scopeKey: string, chatId: string, threadId: string) {
  return [...QUERY_KEYS.messages(chatId, threadId), 'scope', scopeKey] as const
}

/**
 * Hook to fetch chat list with optional search
 */
export function useChatList(filters?: { search?: string }) {
  const query = useLiveQuery(chatCollection)
  const messageQuery = useLiveQuery(messageCollection)
  const data = useMemo(() => {
    const latestMessageByChat = new Map<string, MessageRow>()
    for (const message of (messageQuery.data ?? []) as MessageRow[]) {
      const chatKey = extractChatIdFromChatRef(message.chat ?? message.parent)
      const chatId = normalizeChatRowId(chatKey)
      if (!chatId || !message.content) continue
      const current = latestMessageByChat.get(chatId)
      if (!current || new Date(message.createdAt).getTime() > new Date(current.createdAt).getTime()) {
        latestMessageByChat.set(chatId, message)
      }
    }
    const rows = ((query.data ?? []) as ChatRow[]).map((row) => {
      if (row.lastMessagePreview || !row.id) return row
      const latestMessage = latestMessageByChat.get(row.id)
      return latestMessage
        ? { ...row, lastMessagePreview: latestMessage.content.slice(0, 100) }
        : row
    })
    const term = filters?.search?.trim().toLocaleLowerCase()
    if (!term) return rows
    return rows.filter((row) => [row.title, row.lastMessagePreview]
      .some((value) => value?.toLocaleLowerCase().includes(term)))
  }, [filters?.search, messageQuery.data, query.data])
  return { ...query, data, error: null, refetch: () => chatCollection.fetch({ refetch: true }) }
}

/**
 * Hook to fetch thread list for a chat
 */
export function useThreadList(chatId: string, options?: { enabled?: boolean }) {
  const query = useLiveQuery(threadCollection)
  const enabled = options?.enabled ?? !!chatId
  const isDefaultSecretarySettling = useLinxDefaultSecretaryBootstrapSettling()
  const data = useMemo(() => {
    if (!enabled || !chatId) return []
    if (normalizeChatRowId(chatId) === LINX_DEFAULT_SECRETARY.chatId && isDefaultSecretarySettling) {
      return []
    }
    return ((query.data ?? []) as ThreadRow[])
      .filter((row) => resolveThreadChatRowId(row) === normalizeChatRowId(chatId))
  }, [chatId, enabled, isDefaultSecretarySettling, query.data])
  return { ...query, data, error: null, refetch: () => threadCollection.fetch({ refetch: true }) }
}

/**
 * Hook to fetch all threads for chat list/runtime index use cases.
 */
export function useThreadIndex(options?: { enabled?: boolean }) {
  const query = useLiveQuery(threadCollection)
  return {
    ...query,
    data: options?.enabled === false ? [] : (query.data ?? []) as ThreadRow[],
    error: null,
    refetch: () => threadCollection.fetch({ refetch: true }),
  }
}

export function messageRowMatchesThread(
  rowThreadRef: string | null | undefined,
  selectedThreadRef: string | null | undefined,
): boolean {
  if (!rowThreadRef || !selectedThreadRef) return false
  return extractThreadIdFromThreadRef(rowThreadRef)
    === (extractThreadIdFromThreadRef(selectedThreadRef) ?? selectedThreadRef)
}

export function useWorkspaceList(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true

  return useQuery({
    queryKey: QUERY_KEYS.workspaces,
    queryFn: async () => [],
    enabled,
    staleTime: Infinity,
  })
}

/**
 * Hook to fetch message list for a thread
 */
export function useMessageList(chatId: string | null, threadId: string | null) {
  const query = useLiveQuery(messageCollection)
  const data = useMemo(() => threadId && chatId
    ? ((query.data ?? []) as MessageRow[])
      .filter((row) => messageRowMatchesThread(row.thread, threadId))
      .sort((left, right) => new Date(left.createdAt ?? 0).getTime() - new Date(right.createdAt ?? 0).getTime())
    : [], [chatId, query.data, threadId])
  return { ...query, data, error: null, refetch: () => messageCollection.fetch({ refetch: true }) }
}

// ============================================================================
// Mutation Hooks (using chatOps)
// ============================================================================

/**
 * Hook for chat mutations
 */
export function useChatMutations() {
  const createAIChat = useMutation({
    mutationFn: (input: CreateAIChatInput) => chatOps.createAIChat(input),
  })

  const updateChat = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<ChatRow>) => 
      chatOps.updateChat(id, data),
  })

  const deleteChat = useMutation({
    mutationFn: (id: string) => chatOps.deleteChat(id),
  })

  const ensureLinxWelcome = useMutation({
    mutationFn: (options?: EnsureLinxWelcomeOptions) => chatOps.ensureLinxWelcome(options),
  })

  const createThread = useMutation({
    mutationFn: ({ chatId, title }: { chatId: string; title?: string }) => 
      chatOps.createThread(chatId, title),
  })

  const ensureThreadWorkspace = useMutation({
    mutationFn: (input: {
      threadId: string
      workspaceUri?: string
      title?: string
      repoPath?: string
      folderPath?: string
      baseRef?: string
      branch?: string
    }) => chatOps.ensureThreadWorkspace(input),
  })

  const updateThread = useMutation({
    mutationFn: ({ id, chatId: _chatId, ...data }: { id: string; chatId: string } & Partial<ThreadRow>) =>
      chatOps.updateThread(id, data),
  })

  const deleteThread = useMutation({
    mutationFn: ({ id, chatId }: { id: string; chatId: string }) => 
      chatOps.deleteThread(id, chatId),
  })

  const deleteMessage = useMutation({
    mutationFn: ({ id, threadId }: { id: string; threadId: string }) => 
      chatOps.deleteMessage(id, threadId),
  })

  const updateAgentProfile = useMutation({
    mutationFn: (input: UpdateAgentProfileInput) => chatOps.updateAgentProfile(input),
  })

  const updateAgentInstructions = useMutation({
    mutationFn: ({ agentId, instructions }: { agentId: string; instructions: string }) =>
      chatOps.updateAgentInstructions(agentId, instructions),
  })

  const updateAgentModel = useMutation({
    mutationFn: ({ agentId, provider, model, chatId, contactId }: UpdateAgentModelInput) =>
      chatOps.updateAgentModel(agentId, provider, model, chatId, contactId),
  })

  return {
    createAIChat,
    ensureLinxWelcome,
    updateChat,
    deleteChat,
    createThread,
    ensureThreadWorkspace,
    updateThread,
    deleteThread,
    deleteMessage,
    updateAgentProfile,
    updateAgentInstructions,
    updateAgentModel,
  }
}

/**
 * Combined hook that mirrors the old useChatService API
 * for easier migration
 */
export function useChatCollections() {
  const mutations = useChatMutations()
  
  return {
    useChatList,
    useThreadList,
    useMessageList,
    mutations,
    // Direct access to chatOps for non-mutation operations
    ops: chatOps,
  }
}
