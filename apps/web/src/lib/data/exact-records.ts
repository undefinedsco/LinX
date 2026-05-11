import type { AnyPodTable, SolidDatabase } from '@undefineds.co/models'

type ExactRecordTarget = string | Record<string, unknown> | null | undefined

type LocatorDatabase = SolidDatabase & {
  findByLocator?: <T = unknown>(table: AnyPodTable, locator: Record<string, unknown>) => Promise<T | null>
  updateByLocator?: <T = unknown>(
    table: AnyPodTable,
    locator: Record<string, unknown>,
    data: Record<string, unknown>,
  ) => Promise<T | null>
  deleteByLocator?: (table: AnyPodTable, locator: Record<string, unknown>) => Promise<unknown>
}

const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/
const INTERNAL_FIELDS = new Set(['id', '@id', 'subject', 'source'])

export async function findExactRecord<T>(
  db: SolidDatabase,
  table: AnyPodTable,
  target: ExactRecordTarget,
): Promise<T | null> {
  const locatorDb = db as LocatorDatabase
  const iri = resolveRecordIri(target)
  if (iri && typeof locatorDb.findByIri === 'function') {
    return locatorDb.findByIri<T>(table, iri)
  }

  const locator = resolveRecordLocator(target)
  if (locator && typeof locatorDb.findByLocator === 'function') {
    return locatorDb.findByLocator<T>(table, locator)
  }

  const rows = await db.select().from(table).execute()
  const expectedId = resolveRecordId(target)
  return (rows.find((row) => rowMatchesTarget(row, expectedId, iri)) as T | undefined) ?? null
}

export async function updateExactRecord(
  db: SolidDatabase,
  table: AnyPodTable,
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

  const locator = resolveRecordLocator(target)
  if (locator && typeof locatorDb.updateByLocator === 'function') {
    await locatorDb.updateByLocator(table, locator, payload)
    return
  }

  const query = db.update(table).set(payload)
  if (iri && typeof query.whereByIri === 'function') {
    await query.whereByIri(iri).execute()
    return
  }

  if (!locator) {
    throw new Error('Cannot update record without id or IRI.')
  }
  await query.where(locator).execute()
}

export async function deleteExactRecord(
  db: SolidDatabase,
  table: AnyPodTable,
  target: ExactRecordTarget,
): Promise<void> {
  const locatorDb = db as LocatorDatabase
  const iri = resolveRecordIri(target)
  if (iri && typeof locatorDb.deleteByIri === 'function') {
    await locatorDb.deleteByIri(table, iri)
    return
  }

  const locator = resolveRecordLocator(target)
  if (locator && typeof locatorDb.deleteByLocator === 'function') {
    await locatorDb.deleteByLocator(table, locator)
    return
  }

  const query = db.delete(table)
  if (iri && typeof query.whereByIri === 'function') {
    await query.whereByIri(iri).execute()
    return
  }

  if (!locator) {
    throw new Error('Cannot delete record without id or IRI.')
  }
  await query.where(locator).execute()
}

function resolveRecordIri(target: ExactRecordTarget): string | null {
  if (typeof target === 'string') {
    return ABSOLUTE_IRI.test(target) ? target : null
  }

  const record = target ?? {}
  for (const key of ['@id', 'subject', 'source']) {
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

function resolveRecordLocator(target: ExactRecordTarget): Record<string, unknown> | null {
  const id = resolveRecordId(target)
  return id ? { id } : null
}

function rowMatchesTarget(row: unknown, expectedId: string | null, expectedIri: string | null): boolean {
  if (!row || typeof row !== 'object') {
    return false
  }

  const record = row as Record<string, unknown>
  if (expectedId && record.id === expectedId) {
    return true
  }

  if (!expectedIri) {
    return false
  }

  return record['@id'] === expectedIri || record.subject === expectedIri || record.source === expectedIri
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
