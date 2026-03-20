import {
  ContactClass,
  ContactType,
  agentRepository,
  contactRepository,
  resolveRowId,
  type AgentRow,
  type ContactRow,
  type SolidDatabase,
} from '@linx/models'

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

function ensureRecordId(record: Partial<Record<string, unknown>>, fallback?: string): string {
  const directId = typeof record.id === 'string' && record.id.length > 0 ? record.id : undefined
  if (directId) {
    return directId
  }

  const uri = resolveRowId(record)
  if (uri) {
    const match = uri.match(/\/([^/#]+?)(?:\.ttl)?(?:#.*)?$/)
    if (match?.[1]) {
      return match[1]
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

  const agentUri = resolveRowId(agent) ?? agentId
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
    agentId: ensureRecordId(agent as Record<string, unknown>, agentId),
    contactId: ensureRecordId(contact as Record<string, unknown>, contactId),
    contactUri: resolveRowId(contact) ?? contactId,
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
    contactId: ensureRecordId(contact as Record<string, unknown>, contactId),
    contactUri: resolveRowId(contact) ?? contactId,
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
    contactId: ensureRecordId(contact as Record<string, unknown>, contactId),
    contactUri: resolveRowId(contact) ?? contactId,
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

  const resolvedId = rowId ?? resolveRowId(row)

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
    const itemId = resolveRowId(item)
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
  collection: { state?: CollectionStateLike<T> } | null | undefined,
  row: T,
  rowId?: string,
): void {
  upsertStateRow(collection?.state, row, rowId)
}
