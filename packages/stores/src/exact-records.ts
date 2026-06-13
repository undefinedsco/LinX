import type { PodResource, SolidDatabase } from '@undefineds.co/drizzle-solid'
import { asBaseRelativeResourceId, requireRowResourceId } from '@linx/agent-runtime/pod-resource-identity'
import { assertCurrentPodBaseUrl, assertIriBelongsToCurrentPod, assertUpdateValuesBelongToCurrentPod } from './pod-write-guard'

type ExactRecordTarget = string | Record<string, unknown> | null | undefined
type ExactPodResource = PodResource<any>

type LocatorDatabase = SolidDatabase & {
  findById?: <T = unknown>(resource: unknown, id: string) => Promise<T | null>
  updateById?: <T = unknown>(resource: unknown, id: string, data: Record<string, unknown>) => Promise<T | null>
  deleteById?: (resource: unknown, id: string) => Promise<unknown>
}

const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/
const INTERNAL_FIELDS = new Set(['id', '@id', 'subject', 'uri', 'source'])

export async function findExactRecord<T>(
  db: SolidDatabase,
  resource: ExactPodResource,
  target: ExactRecordTarget,
): Promise<T | null> {
  const locatorDb = db as LocatorDatabase
  const id = resolveRecordId(target)
  if (id && typeof locatorDb.findById === 'function') {
    return locatorDb.findById<T>(resource, id)
  }

  const iri = resolveRecordIri(target)
  if (iri && typeof locatorDb.findByIri === 'function') {
    return locatorDb.findByIri<T>(resource, iri)
  }

  return null
}

export async function updateExactRecord(
  db: SolidDatabase,
  resource: ExactPodResource,
  target: ExactRecordTarget,
  updates: Record<string, unknown>,
): Promise<void> {
  const locatorDb = db as LocatorDatabase
  const payload = sanitizeUpdatePayload(updates)
  assertCurrentPodBaseUrl(db, 'update')
  assertUpdateValuesBelongToCurrentPod(db, payload)
  const id = resolveRecordId(target)
  if (id && typeof locatorDb.updateById === 'function') {
    await locatorDb.updateById(resource, id, payload)
    return
  }

  const iri = resolveRecordIri(target)
  if (iri) {
    assertIriBelongsToCurrentPod(db, iri, 'update')
  }
  if (iri && typeof locatorDb.updateByIri === 'function') {
    await locatorDb.updateByIri(resource, iri, payload)
    return
  }

  throw new Error('Cannot update exact record without updateById/updateByIri support.')
}

export async function deleteExactRecord(
  db: SolidDatabase,
  resource: ExactPodResource,
  target: ExactRecordTarget,
): Promise<void> {
  const locatorDb = db as LocatorDatabase
  assertCurrentPodBaseUrl(db, 'delete')
  const id = resolveRecordId(target)
  if (id && typeof locatorDb.deleteById === 'function') {
    await locatorDb.deleteById(resource, id)
    return
  }

  const iri = resolveRecordIri(target)
  if (iri) {
    assertIriBelongsToCurrentPod(db, iri, 'delete')
  }
  if (iri && typeof locatorDb.deleteByIri === 'function') {
    await locatorDb.deleteByIri(resource, iri)
    return
  }

  throw new Error('Cannot delete exact record without deleteById/deleteByIri support.')
}

function resolveRecordIri(target: ExactRecordTarget): string | null {
  if (typeof target === 'string') {
    return ABSOLUTE_IRI.test(target) ? target : null
  }
  if (!target) return null
  for (const key of ['@id', 'uri', 'subject', 'source']) {
    const value = target[key]
    if (typeof value === 'string' && ABSOLUTE_IRI.test(value)) {
      return value
    }
  }
  return null
}

function resolveRecordId(target: ExactRecordTarget): string | null {
  if (typeof target === 'string') {
    return ABSOLUTE_IRI.test(target)
      ? null
      : asBaseRelativeResourceId(target, 'record target')
  }

  if (!target) return null
  return requireRowResourceId(target as { id?: string | null }, 'record target')
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
