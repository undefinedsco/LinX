import type { PodTable, SolidDatabase } from '@undefineds.co/drizzle-solid'

type ExactRecordTarget = string | Record<string, unknown> | null | undefined
type ExactPodTable = PodTable<any>

type LocatorDatabase = SolidDatabase & {
  findByIri?: <T = unknown>(table: unknown, iri: string) => Promise<T | null>
  findByResource?: <T = unknown>(table: unknown, target: string | Record<string, unknown>) => Promise<T | null>
  findByLocator?: <T = unknown>(table: unknown, locator: Record<string, unknown>) => Promise<T | null>
  findById?: <T = unknown>(table: unknown, id: string) => Promise<T | null>
  updateByIri?: <T = unknown>(table: unknown, iri: string, data: Record<string, unknown>) => Promise<T | null>
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
  updateById?: <T = unknown>(table: unknown, id: string, data: Record<string, unknown>) => Promise<T | null>
  deleteByIri?: (table: unknown, iri: string) => Promise<unknown>
  deleteByResource?: (table: unknown, target: string | Record<string, unknown>) => Promise<unknown>
  deleteByLocator?: (table: unknown, locator: Record<string, unknown>) => Promise<unknown>
  deleteById?: (table: unknown, id: string) => Promise<unknown>
}

const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/
const IRI_FIELDS = new Set(['@id', 'subject', 'uri', 'source'])
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

  const resourceTarget = resolveRecordResourceTarget(target)
  if (resourceTarget && typeof locatorDb.findByResource === 'function') {
    return locatorDb.findByResource<T>(table, resourceTarget)
  }

  const locator = resolveRecordLocator(target)
  if (locator && typeof locatorDb.findByLocator === 'function') {
    return locatorDb.findByLocator<T>(table, locator)
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

  const resourceTarget = resolveRecordResourceTarget(target)
  if (resourceTarget && typeof locatorDb.updateByResource === 'function') {
    await locatorDb.updateByResource(table, resourceTarget, payload)
    return
  }

  const locator = resolveRecordLocator(target)
  if (locator && typeof locatorDb.updateByLocator === 'function') {
    await locatorDb.updateByLocator(table, locator, payload)
    return
  }

  const id = resolveRecordId(target)
  if (id && typeof locatorDb.updateById === 'function') {
    await locatorDb.updateById(table, id, payload)
    return
  }

  throw new Error('Cannot update exact record without updateByResource/updateByLocator/updateById/updateByIri support.')
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

  const resourceTarget = resolveRecordResourceTarget(target)
  if (resourceTarget && typeof locatorDb.deleteByResource === 'function') {
    await locatorDb.deleteByResource(table, resourceTarget)
    return
  }

  const locator = resolveRecordLocator(target)
  if (locator && typeof locatorDb.deleteByLocator === 'function') {
    await locatorDb.deleteByLocator(table, locator)
    return
  }

  const id = resolveRecordId(target)
  if (id && typeof locatorDb.deleteById === 'function') {
    await locatorDb.deleteById(table, id)
    return
  }

  throw new Error('Cannot delete exact record without deleteByResource/deleteByLocator/deleteById/deleteByIri support.')
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

function resolveRecordResourceTarget(target: ExactRecordTarget): string | Record<string, unknown> | null {
  if (typeof target === 'string') {
    return target.length > 0 ? target : null
  }

  return target && Object.keys(target).length > 0 ? target : null
}

function resolveRecordLocator(target: ExactRecordTarget): Record<string, unknown> | null {
  if (typeof target === 'string') {
    return ABSOLUTE_IRI.test(target) ? null : { id: target }
  }

  if (!target) {
    return null
  }

  const locator: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(target)) {
    if (!IRI_FIELDS.has(key) && value !== undefined) {
      locator[key] = value
    }
  }

  return Object.keys(locator).length > 0 ? locator : null
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
