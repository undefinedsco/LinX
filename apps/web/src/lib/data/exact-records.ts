import type { PodTable, SolidDatabase } from '@undefineds.co/drizzle-solid'

type ExactRecordTarget = string | Record<string, unknown> | null | undefined
type ExactPodTable = PodTable<any>

type LocatorDatabase = SolidDatabase & {
  findById?: <T = unknown>(table: unknown, id: string) => Promise<T | null>
  updateById?: <T = unknown>(table: unknown, id: string, data: Record<string, unknown>) => Promise<T | null>
  deleteById?: (table: unknown, id: string) => Promise<unknown>
}

const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/
const INTERNAL_FIELDS = new Set(['id', '@id', 'subject', 'source'])

export async function findExactRecord<T>(
  db: SolidDatabase,
  table: ExactPodTable,
  target: ExactRecordTarget,
): Promise<T | null> {
  const locatorDb = db as LocatorDatabase
  const iri = resolveRecordIri(target)
  if (iri && typeof locatorDb.findByIri === 'function') {
    return locatorDb.findByIri<T>(table, iri)
  }

  const id = resolveRecordId(target)
  if (id && typeof locatorDb.findById === 'function') {
    return locatorDb.findById<T>(table, id)
  }

  return null
}

export async function updateExactRecord(
  db: SolidDatabase,
  table: ExactPodTable,
  target: ExactRecordTarget,
  updates: Record<string, unknown>,
): Promise<void> {
  const locatorDb = db as LocatorDatabase
  const payload = sanitizeUpdatePayload(updates)
  const iri = resolveRecordIri(target)
  if (iri && typeof locatorDb.updateByIri === 'function') {
    await locatorDb.updateByIri(table, iri, payload)
    return
  }

  const id = resolveRecordId(target)
  if (id && typeof locatorDb.updateById === 'function') {
    await locatorDb.updateById(table, id, payload)
    return
  }

  throw new Error('Cannot update exact record without updateById/updateByIri support.')
}

export async function deleteExactRecord(
  db: SolidDatabase,
  table: ExactPodTable,
  target: ExactRecordTarget,
): Promise<void> {
  const locatorDb = db as LocatorDatabase
  const iri = resolveRecordIri(target)
  if (iri && typeof locatorDb.deleteByIri === 'function') {
    await locatorDb.deleteByIri(table, iri)
    return
  }

  const id = resolveRecordId(target)
  if (id && typeof locatorDb.deleteById === 'function') {
    await locatorDb.deleteById(table, id)
    return
  }

  throw new Error('Cannot delete exact record without deleteById/deleteByIri support.')
}

function resolveRecordIri(target: ExactRecordTarget): string | null {
  if (typeof target === 'string') {
    return ABSOLUTE_IRI.test(target) ? target : null
  }

  const record = target ?? {}
  for (const key of ['@id', 'subject', 'uri', 'source']) {
    const value = record[key]
    if (typeof value === 'string' && ABSOLUTE_IRI.test(value)) {
      return value
    }
  }

  return null
}

function resolveRecordId(target: ExactRecordTarget): string | null {
  if (typeof target === 'string') {
    return ABSOLUTE_IRI.test(target) ? null : target
  }

  const id = target?.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

function sanitizeUpdatePayload(updates: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (!INTERNAL_FIELDS.has(key) && value !== undefined) {
      payload[key] = value
    }
  }
  return payload
}
