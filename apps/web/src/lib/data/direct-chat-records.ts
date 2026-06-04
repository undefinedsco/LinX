import {
  ContactClass,
  ContactType,
  agentTable,
  agentRepository,
  agentResourceId,
  contactTable,
  contactRepository,
  asBaseRelativeResourceId,
  requireRowResourceId,
  type AgentRow,
  type BaseRelativeResourceId,
  type ContactRow,
  type SolidDatabase,
} from '@undefineds.co/models'

export interface CreateAgentContactRecordsInput {
  agentId?: string
  contactId?: string
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

type PersistedRow = Record<string, unknown> & { id: string }

type CollectionStateLike<T extends PersistedRow> =
  | Map<string, T>
  | { data?: T[] }

type CollectionInternalState<T extends PersistedRow> = {
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

export async function createAgentContactRecords(
  db: SolidDatabase,
  input: CreateAgentContactRecordsInput,
): Promise<{
  agent: AgentRow
  contact: ContactRow
  agentId: BaseRelativeResourceId
  contactId: BaseRelativeResourceId
  contactUri: string
}> {
  const agentId = agentResourceId(input.agentId?.trim() || crypto.randomUUID())
  const agent = await agentRepository.create!(db, {
    id: agentId,
    name: input.name,
    provider: input.provider,
    model: input.model,
    instructions: input.instructions || undefined,
  })
  const agentUri = db.resolveRowIri(agentTable as any, agent)
  const contactId = input.contactId?.trim() || crypto.randomUUID()
  const contact = await contactRepository.create!(db, {
    id: contactId,
    name: input.name,
    entityUri: agentUri,
    rdfType: ContactClass.AGENT,
    contactType: ContactType.AGENT,
    isPublic: false,
  })
  const contactUri = db.resolveRowIri(contactTable as any, contact)

  return {
    agent,
    contact,
    agentId: requireRowResourceId(agent, 'created agent'),
    contactId: requireRowResourceId(contact, 'created contact'),
    contactUri,
  }
}

export async function createSolidContactRecord(
  db: SolidDatabase,
  input: CreateSolidContactRecordInput,
): Promise<{
  contact: ContactRow
  contactId: BaseRelativeResourceId
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
  const contactUri = db.resolveRowIri(contactTable as any, contact)

  return {
    contact,
    contactId: requireRowResourceId(contact, 'created contact'),
    contactUri,
  }
}

export async function createGroupContactRecord(
  db: SolidDatabase,
  input: CreateGroupContactRecordInput,
): Promise<{
  contact: ContactRow
  contactId: BaseRelativeResourceId
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
  const contactUri = db.resolveRowIri(contactTable as any, contact)

  return {
    contact,
    contactId: requireRowResourceId(contact, 'created contact'),
    contactUri,
  }
}

export function upsertStateRow<T extends PersistedRow>(
  state: CollectionStateLike<T> | undefined,
  row: T,
  rowId?: string,
): void {
  if (!state) {
    return
  }

  const id = rowId
    ? asBaseRelativeResourceId(rowId, 'collection row id')
    : requireRowResourceId(row, 'collection row')

  if (state instanceof Map) {
    const existing = state.get(id)
    state.set(id, existing ? { ...existing, ...row } : row)
    return
  }

  if (!Array.isArray(state.data)) {
    return
  }

  const index = state.data.findIndex((item) => {
    return item.id === id
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

export function writeCollectionRow<T extends PersistedRow>(
  collection: {
    state?: CollectionStateLike<T>
    _state?: CollectionInternalState<T>
    isReady?: () => boolean
    utils?: { writeUpsert?: (row: T) => void }
  } | null | undefined,
  row: T,
  rowId?: string,
): void {
  const id = rowId
    ? asBaseRelativeResourceId(rowId, 'collection row id')
    : requireRowResourceId(row, 'collection row')
  upsertInternalStateRow(collection?._state, row, id)

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

function upsertInternalStateRow<T extends PersistedRow>(
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

function getCollectionStateSize<T extends PersistedRow>(
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
