import type { PodTable, SolidDatabase } from '@undefineds.co/drizzle-solid'

type ExactRecordTarget = string | Record<string, unknown> | null | undefined
type ExactPodTable = PodTable<any>

type LocatorDatabase = SolidDatabase & {
  findByResource?: <T = unknown>(table: unknown, target: string | Record<string, unknown>) => Promise<T | null>
  findByLocator?: <T = unknown>(table: unknown, locator: Record<string, unknown>) => Promise<T | null>
  updateByResource?: <T = unknown>(
    table: unknown,
    target: string | Record<string, unknown>,
    data: Record<string, unknown>,
  ) => Promise<T | null>
  updateByLocator?: <T = unknown>(
    table: unknown,
    locator: Record<string, unknown>,
    data: Record<string, unknown>,
  ) => Promise<T | null>
  deleteByResource?: (table: unknown, target: string | Record<string, unknown>) => Promise<unknown>
  deleteByLocator?: (table: unknown, locator: Record<string, unknown>) => Promise<unknown>
  resolveResourceIri?: (table: unknown, target: string | Record<string, unknown>) => string
  resolveResourceId?: (table: unknown, target: string | Record<string, unknown>) => string
  resolveRowIri?: (table: unknown, row: Record<string, unknown>) => string
  resolveRowId?: (table: unknown, row: Record<string, unknown>) => string
}

const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/
const INTERNAL_FIELDS = new Set(['id', '@id', 'subject', 'source'])

export async function findExactRecord<T>(
  db: SolidDatabase,
  table: ExactPodTable,
  target: ExactRecordTarget,
): Promise<T | null> {
  const locatorDb = db as LocatorDatabase
  if (target && typeof locatorDb.findByResource === 'function') {
    return locatorDb.findByResource<T>(table, target)
  }

  const iri = resolveRecordIriWithDb(locatorDb, table, target)
  if (iri && typeof locatorDb.findByIri === 'function') {
    return locatorDb.findByIri<T>(table, iri)
  }

  const locator = resolveRecordLocator(target)
  if (locator && typeof locatorDb.findByLocator === 'function') {
    return locatorDb.findByLocator<T>(table, locator)
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
  if (target && typeof locatorDb.updateByResource === 'function') {
    await locatorDb.updateByResource(table, target, payload)
    return
  }

  const iri = resolveRecordIriWithDb(locatorDb, table, target)
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
  table: ExactPodTable,
  target: ExactRecordTarget,
): Promise<void> {
  const locatorDb = db as LocatorDatabase
  if (target && typeof locatorDb.deleteByResource === 'function') {
    await locatorDb.deleteByResource(table, target)
    return
  }

  const iri = resolveRecordIriWithDb(locatorDb, table, target)
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
  for (const key of ['@id', 'subject', 'uri', 'source']) {
    const value = record[key]
    if (typeof value === 'string' && ABSOLUTE_IRI.test(value)) {
      return value
    }
  }

  return null
}

function resolveRecordIriWithDb(db: LocatorDatabase, table: ExactPodTable, target: ExactRecordTarget): string | null {
  if (target && typeof db.resolveResourceIri === 'function') {
    try {
      return db.resolveResourceIri(table, target)
    } catch {
      // Fall back to older exact-record compatibility paths below.
    }
  }

  const directIri = resolveRecordIri(target)
  if (directIri) return directIri
  if (target && typeof target === 'object' && typeof db.resolveRowIri === 'function') {
    try {
      return db.resolveRowIri(table, target)
    } catch {
      return null
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

function sanitizeUpdatePayload(updates: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(updates)) {
    if (!INTERNAL_FIELDS.has(key) && value !== undefined) {
      payload[key] = value
    }
  }
  return payload
}
