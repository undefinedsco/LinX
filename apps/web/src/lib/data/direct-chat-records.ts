import {
  ContactClass,
  ContactType,
  agentResource,
  contactResource,
  contactRepository,
  type AgentRow,
  type ContactRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import {
  agentResourceId,
  asBaseRelativeResourceId,
  requireRowResourceId,
  type BaseRelativeResourceId,
} from './resource-identity'

export interface CreateAgentContactRecordsInput {
  agentId?: string
  contactId?: string
  name: string
  provider: string
  model: string
  instructions?: string
}

export interface EnsureAgentContactRecordsInput {
  agentId: string
  contactId: string
  contactResourceId?: string
  name: string
  provider: string
  model: string
  instructions?: string
  isPublic?: boolean
  readTimeoutMs?: number
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
  const now = new Date()
  const agentUri = db.resolveRowIri(agentResource as any, { id: agentId })
  const agent = {
    id: agentId,
    '@id': agentUri,
    name: input.name,
    provider: input.provider,
    model: input.model,
    instructions: input.instructions || undefined,
    createdAt: now,
    updatedAt: now,
  } as AgentRow
  if (!agentUri) {
    throw new Error('Failed to resolve Agent resource IRI.')
  }
  const contactKey = input.contactId?.trim() || crypto.randomUUID()
  const contactId = asBaseRelativeResourceId(contactKey, 'Contact id')
  const contactUri = db.resolveRowIri(contactResource as any, {
    id: contactResource.buildId({ id: contactId }),
  })
  const createdContact = await contactRepository.create!(db, {
    id: contactId,
    '@id': contactUri,
    name: input.name,
    entity: agentUri,
    rdfType: ContactClass.AGENT,
    contactType: ContactType.AGENT,
    isPublic: false,
  })
  const contact = {
    ...createdContact,
    id: contactId,
    '@id': contactUri,
    entity: agentUri,
    entityUri: agentUri,
  } as ContactRow & { entityUri: string }

  return {
    agent,
    contact,
    agentId: requireRowResourceId(agent, 'created agent'),
    contactId: requireRowResourceId(contact, 'created contact'),
    contactUri,
  }
}

export async function ensureAgentContactRecords(
  db: SolidDatabase,
  input: EnsureAgentContactRecordsInput,
): Promise<{
  agent: AgentRow
  contact: ContactRow
  agentId: BaseRelativeResourceId
  contactId: BaseRelativeResourceId
  contactUri: string
  agentUri: string
  created: boolean
  agentCreated: boolean
  contactCreated: boolean
}> {
  const agentId = agentResourceId(input.agentId)
  const contactId = asBaseRelativeResourceId(input.contactId, 'Contact id')
  const contactResourceId = asBaseRelativeResourceId(input.contactResourceId ?? input.contactId, 'Contact resource id')
  const agentUri = db.resolveRowIri(agentResource as any, { id: agentId })
  const contactUri = db.resolveRowIri(contactResource as any, {
    id: contactResource.buildId({ id: contactResourceId }),
  })
  if (!agentUri || !contactUri) {
    throw new Error('Failed to resolve Agent Contact resource IRIs.')
  }

  const now = new Date()
  const agent = {
    id: agentId,
    '@id': agentUri,
    name: input.name,
    provider: input.provider,
    model: input.model,
    instructions: input.instructions || undefined,
    createdAt: now,
    updatedAt: now,
  } as AgentRow

  const existingContact = await findOptionalById<ContactRow>(db, contactResource, contactResourceId, input.readTimeoutMs)
  const contact = existingContact
    ? {
      ...existingContact,
      id: contactId,
      '@id': existingContact['@id'] ?? contactUri,
      entity: existingContact.entity ?? existingContact.entityUri ?? agentUri,
      entityUri: existingContact.entityUri ?? existingContact.entity ?? agentUri,
    } as ContactRow & { entityUri: string }
    : await contactRepository.create!(db, {
      id: contactId,
      '@id': contactUri,
      name: input.name,
      entity: agentUri,
      rdfType: ContactClass.AGENT,
      contactType: ContactType.AGENT,
      isPublic: input.isPublic ?? false,
    } as ContactRow)

  const normalizedAgent = {
    ...agent,
    id: agentId,
    '@id': (agent as Record<string, unknown>)['@id'] ?? agentUri,
  } as AgentRow
  const normalizedContact = {
    ...contact,
    id: contactId,
    '@id': (contact as Record<string, unknown>)['@id'] ?? contactUri,
    entity: (contact as Record<string, unknown>).entity ?? (contact as Record<string, unknown>).entityUri ?? agentUri,
    entityUri: (contact as Record<string, unknown>).entityUri ?? (contact as Record<string, unknown>).entity ?? agentUri,
  } as ContactRow & { entityUri: string }

  return {
    agent: normalizedAgent,
    contact: normalizedContact,
    agentId,
    contactId,
    contactUri,
    agentUri,
    created: !existingContact,
    agentCreated: false,
    contactCreated: !existingContact,
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
  const contactId = asBaseRelativeResourceId(crypto.randomUUID(), 'Contact id')
  const contactUri = db.resolveRowIri(contactResource as any, {
    id: contactResource.buildId({ id: contactId }),
  })
  const createdContact = await contactRepository.create!(db, {
    id: contactId,
    '@id': contactUri,
    name: input.name,
    avatarUrl: input.avatarUrl,
    entity: input.webId,
    rdfType: ContactClass.PERSON,
    contactType: ContactType.SOLID,
    isPublic: false,
  })
  const contact = {
    ...createdContact,
    id: contactId,
    '@id': contactUri,
    entity: input.webId,
    entityUri: input.webId,
  } as ContactRow & { entityUri: string }

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
  const contactId = asBaseRelativeResourceId(crypto.randomUUID(), 'Contact id')
  const contactUri = db.resolveRowIri(contactResource as any, {
    id: contactResource.buildId({ id: contactId }),
  })
  const createdContact = await contactRepository.create!(db, {
    id: contactId,
    '@id': contactUri,
    name: input.name,
    avatarUrl: input.avatarUrl,
    entity: input.entityUri,
    rdfType: ContactClass.GROUP,
    contactType: ContactType.SOLID,
    isPublic: false,
  })
  const contact = {
    ...createdContact,
    id: contactId,
    '@id': contactUri,
    entity: input.entityUri,
    entityUri: input.entityUri,
  } as ContactRow & { entityUri: string }

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

async function findOptionalById<T>(
  db: SolidDatabase,
  resource: unknown,
  id: string,
  timeoutMs = 1_500,
): Promise<T | null> {
  if (typeof (db as any).findById !== 'function') {
    return null
  }

  try {
    return await withOptionalTimeout(
      (db as any).findById(resource as any, id) as Promise<T | null>,
      timeoutMs,
    )
  } catch (error) {
    if (isMissingResourceError(error)) {
      return null
    }
    throw error
  }
}

function isMissingResourceError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  return /404|not found|missing/i.test(message)
}

async function withOptionalTimeout<T>(promise: Promise<T | null>, timeoutMs: number): Promise<T | null> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return await promise
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
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
