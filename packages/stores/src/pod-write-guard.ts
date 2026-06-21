import type { SolidDatabase } from '@undefineds.co/models'
import { resolveCurrentPodBaseUrl } from './current-pod-base'

const ABSOLUTE_IRI = /^[a-zA-Z][a-zA-Z\d+.-]*:/
const SUBJECT_FIELDS = ['@id', 'subject', 'uri', 'source', 'id'] as const
const STORAGE_RELATION_FIELDS = [
  'approval',
  'chat',
  'entry',
  'issue',
  'issues',
  'lastMessageId',
  'messageResource',
  'messageResources',
  'object',
  'parentIssue',
  'replyTo',
  'run',
  'runStep',
  'runSteps',
  'runs',
  'session',
  'task',
  'tasks',
  'target',
  'thread',
  'workspace',
] as const
const STORAGE_RELATION_URI_FIELDS = [
  'repoRootUri',
  'rootUri',
  'targetUri',
] as const
type SubjectCarrier = Record<string, unknown>

export function assertIriBelongsToCurrentPod(
  db: SolidDatabase,
  iri: string,
  operation: 'insert' | 'update' | 'delete',
): void {
  const currentPodBase = assertCurrentPodBaseUrl(db, operation)

  const podPrefix = normalizePodPrefix(currentPodBase)
  const target = normalizeAbsoluteIri(iri)
  if (!target.startsWith(podPrefix)) {
    throw new Error(`Refusing to ${operation} a Pod record outside the current SP: ${iri}`)
  }
}

export function assertCurrentPodBaseUrl(
  db: SolidDatabase,
  operation: 'insert' | 'update' | 'delete',
): string {
  const currentPodBase = resolveCurrentPodBaseUrl(db as any)
  if (!currentPodBase) {
    throw new Error(`Cannot ${operation} Pod record without a current SP Pod URL.`)
  }
  return currentPodBase
}

export function assertInsertValuesBelongToCurrentPod(db: SolidDatabase, values: unknown): void {
  assertCurrentPodBaseUrl(db, 'insert')
  for (const iri of collectStorageSensitiveIris(values)) {
    assertIriBelongsToCurrentPod(db, iri, 'insert')
  }
}

export function assertUpdateValuesBelongToCurrentPod(db: SolidDatabase, values: unknown): void {
  assertCurrentPodBaseUrl(db, 'update')
  for (const iri of collectStorageSensitiveIris(values)) {
    assertIriBelongsToCurrentPod(db, iri, 'update')
  }
}

function collectStorageSensitiveIris(values: unknown): string[] {
  const seen = new Set<string>()
  collectStorageSensitiveIrisInto(values, seen)
  return [...seen]
}

function collectStorageSensitiveIrisInto(values: unknown, seen: Set<string>): void {
  if (Array.isArray(values)) {
    for (const value of values) {
      collectStorageSensitiveIrisInto(value, seen)
    }
    return
  }

  if (!isSubjectCarrier(values)) {
    return
  }

  for (const [field, value] of Object.entries(values)) {
    if (typeof value === 'string' && ABSOLUTE_IRI.test(value)) {
      if (shouldGuardFieldIri(field) && isHttpIri(value)) {
        seen.add(value)
      }
      continue
    }

    if (Array.isArray(value) && shouldGuardFieldIri(field)) {
      for (const item of value) {
        if (typeof item === 'string' && ABSOLUTE_IRI.test(item) && isHttpIri(item)) {
          seen.add(item)
        }
      }
      continue
    }

    collectStorageSensitiveIrisInto(value, seen)
  }
}

function isSubjectCarrier(value: unknown): value is SubjectCarrier {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSubjectField(field: string): boolean {
  return (SUBJECT_FIELDS as readonly string[]).includes(field)
}

function isStorageRelationField(field: string): boolean {
  return (STORAGE_RELATION_FIELDS as readonly string[]).includes(field)
}

function isStorageRelationUriField(field: string): boolean {
  if ((STORAGE_RELATION_URI_FIELDS as readonly string[]).includes(field)) {
    return true
  }

  if (!field.endsWith('Uri')) {
    return false
  }

  const baseName = field.slice(0, -3)
  return isStorageRelationField(baseName)
}

function shouldGuardFieldIri(field: string): boolean {
  return isSubjectField(field) || isStorageRelationField(field) || isStorageRelationUriField(field)
}

function normalizePodPrefix(podBaseUrl: string): string {
  return `${podBaseUrl.trim().replace(/\/+$/, '')}/`
}

function normalizeAbsoluteIri(iri: string): string {
  try {
    return new URL(iri).href
  } catch {
    return iri
  }
}

function isHttpIri(iri: string): boolean {
  try {
    const { protocol } = new URL(iri)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
