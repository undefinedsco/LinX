import {
  ContactClass,
  ContactType,
  agentTable,
  agentRepository,
  contactTable,
  contactRepository,
  type AgentRow,
  type ContactRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import { resolveRowSubject } from '@undefineds.co/drizzle-solid'

export interface CreateAgentContactRecordsInput {
  name: string
  provider: string
  model: string
  instructions?: string
}

export interface CreateSolidContactRecordInput {
  name: string
  webId: string
  avatarUrl?: string
}

export interface CreateGroupContactRecordInput {
  name: string
  entityUri: string
  avatarUrl?: string
}

type CollectionStateLike<T extends Record<string, unknown>> =
  | Map<string, T>
  | { data?: T[] }

type CollectionInternalState<T extends Record<string, unknown>> = {
  syncedData?: {
    get?: (key: string) => T | undefined
    set?: (key: string, value: T) => unknown
    has?: (key: string) => boolean
    size?: number
  }
  syncedKeys?: { add?: (key: string) => unknown }
  optimisticDeletes?: Iterable<string>
  optimisticUpserts?: { keys?: () => IterableIterator<string> }
  size?: number
}

function ensureRecordId(
  db: SolidDatabase,
  table: unknown,
  record: Partial<Record<string, unknown>>,
  fallback?: string,
): string {
  const directId = typeof record.id === 'string' && record.id.length > 0 ? record.id : undefined
  if (directId) {
    return directId
  }

  const resolver = db as SolidDatabase & {
    resolveResourceId?: (table: unknown, target: string | Record<string, unknown>) => string
  }
  if (typeof resolver.resolveResourceId === 'function') {
    try {
      return resolver.resolveResourceId(table, record as Record<string, unknown>)
    } catch {
      // Fall back to the caller-provided id for compatibility with older ORM builds.
    }
  }

  if (fallback) {
    return fallback
  }

  throw new Error('Record is missing an identifier')
}

export async function createAgentContactRecords(
  db: SolidDatabase,
  input: CreateAgentContactRecordsInput,
): Promise<{
  agent: AgentRow
  contact: ContactRow
  agentId: string
  contactId: string
  contactUri: string
}> {
  const agentId = crypto.randomUUID()
  const agent = await agentRepository.create!(db, {
    id: agentId,
    name: input.name,
    provider: input.provider,
    model: input.model,
    instructions: input.instructions || undefined,
  })

  const agentUri = resolveRowSubject(agent as Record<string, unknown>) ?? agentId
  const contactId = crypto.randomUUID()
  const contact = await contactRepository.create!(db, {
    id: contactId,
    name: input.name,
    entityUri: agentUri,
    rdfType: ContactClass.AGENT,
    contactType: ContactType.AGENT,
    isPublic: false,
  })

  return {
    agent: agent as AgentRow,
    contact: contact as ContactRow,
    agentId: ensureRecordId(db, agentTable, agent as Record<string, unknown>, agentId),
    contactId: ensureRecordId(db, contactTable, contact as Record<string, unknown>, contactId),
    contactUri: resolveRowSubject(contact as Record<string, unknown>) ?? contactId,
  }
}

export async function createSolidContactRecord(
  db: SolidDatabase,
  input: CreateSolidContactRecordInput,
): Promise<{
  contact: ContactRow
  contactId: string
  contactUri: string
}> {
  const contactId = crypto.randomUUID()
  const contact = await contactRepository.create!(db, {
    id: contactId,
    name: input.name,
    avatarUrl: input.avatarUrl,
    entityUri: input.webId,
    rdfType: ContactClass.PERSON,
    contactType: ContactType.SOLID,
    isPublic: false,
  })

  return {
    contact: contact as ContactRow,
    contactId: ensureRecordId(db, contactTable, contact as Record<string, unknown>, contactId),
    contactUri: resolveRowSubject(contact as Record<string, unknown>) ?? contactId,
  }
}

export async function createGroupContactRecord(
  db: SolidDatabase,
  input: CreateGroupContactRecordInput,
): Promise<{
  contact: ContactRow
  contactId: string
  contactUri: string
}> {
  const contactId = crypto.randomUUID()
  const contact = await contactRepository.create!(db, {
    id: contactId,
    name: input.name,
    avatarUrl: input.avatarUrl,
    entityUri: input.entityUri,
    rdfType: ContactClass.GROUP,
    contactType: ContactType.SOLID,
    isPublic: false,
  })

  return {
    contact: contact as ContactRow,
    contactId: ensureRecordId(db, contactTable, contact as Record<string, unknown>, contactId),
    contactUri: resolveRowSubject(contact as Record<string, unknown>) ?? contactId,
  }
}

export function upsertStateRow<T extends Record<string, unknown>>(
  state: CollectionStateLike<T> | undefined,
  row: T,
  rowId?: string,
): void {
  if (!state) {
    return
  }

  const resolvedId = rowId ?? resolveRowSubject(row)

  if (state instanceof Map) {
    if (!resolvedId) {
      return
    }

    const existing = state.get(resolvedId)
    state.set(resolvedId, existing ? { ...existing, ...row } : row)
    return
  }

  if (!Array.isArray(state.data)) {
    return
  }

  if (!resolvedId) {
    state.data.unshift(row)
    return
  }

  const index = state.data.findIndex((item) => {
    const itemId = resolveRowSubject(item)
    return itemId === resolvedId || (typeof (item as { id?: unknown }).id === 'string' && item.id === resolvedId)
  })

  if (index === -1) {
    state.data.unshift(row)
    return
  }

  state.data[index] = {
    ...state.data[index],
    ...row,
  }
}

export function writeCollectionRow<T extends Record<string, unknown>>(
  collection: {
    state?: CollectionStateLike<T>
    _state?: CollectionInternalState<T>
    isReady?: () => boolean
    utils?: { writeUpsert?: (row: T) => void }
  } | null | undefined,
  row: T,
  rowId?: string,
): void {
  const resolvedId = rowId ?? resolveRowSubject(row)
  if (resolvedId) {
    upsertInternalStateRow(collection?._state, row, resolvedId)
  } else {
    upsertStateRow(collection?.state, row, rowId)
  }

  const canManualSync =
    typeof collection?.utils?.writeUpsert === 'function'
    && (typeof collection.isReady !== 'function' || collection.isReady())

  if (canManualSync) {
    try {
      collection.utils?.writeUpsert?.(row)
    } catch {
      // The local state has already been updated. TanStack manual sync may not
      // be initialized in headless integration tests or early app bootstrap.
    }
  }
}

function upsertInternalStateRow<T extends Record<string, unknown>>(
  state: CollectionInternalState<T> | undefined,
  row: T,
  rowId: string,
): void {
  const syncedData = state?.syncedData
  if (typeof syncedData?.set !== 'function') {
    return
  }

  const existing = typeof syncedData.get === 'function' ? syncedData.get(rowId) : undefined
  syncedData.set(rowId, existing ? { ...existing, ...row } : row)
  state?.syncedKeys?.add?.(rowId)

  if (typeof state?.size === 'number') {
    state.size = getCollectionStateSize(state)
  }
}

function getCollectionStateSize<T extends Record<string, unknown>>(
  state: CollectionInternalState<T>,
): number {
  const syncedSize = state.syncedData?.size ?? 0
  const optimisticDeletes = state.optimisticDeletes
    ? Array.from(state.optimisticDeletes).filter((key) => state.syncedData?.has?.(key)).length
    : 0
  const optimisticUpserts = state.optimisticUpserts?.keys
    ? Array.from(state.optimisticUpserts.keys()).filter((key) => !state.syncedData?.has?.(key)).length
    : 0

  return syncedSize - optimisticDeletes + optimisticUpserts
}
