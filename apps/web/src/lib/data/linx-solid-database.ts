import { drizzle } from '@undefineds.co/drizzle-solid'
import type { SolidDatabase } from '@undefineds.co/models'
import { solidSchema } from '@undefineds.co/models'
import { installBrowserSparqlEngine } from './browser-sparql-engine'
import { initializeLinxPodStorage } from './pod-storage-bootstrap'
import {
  assertCurrentPodBaseUrl,
  assertIriBelongsToCurrentPod,
  assertInsertValuesBelongToCurrentPod,
  assertUpdateValuesBelongToCurrentPod,
} from './pod-write-guard'

export interface CreateLinxSolidDatabaseOptions {
  initTimeoutMs?: number
  podUrl?: string | null
}

const DEFAULT_INIT_TIMEOUT_MS = 30_000

/**
 * Creates a LinX-ready Solid database.
 *
 * Callers should treat the returned DB as already connected and bootstrapped:
 * Solid session -> drizzle DB -> solidSchema init -> LinX Pod containers.
 */
export async function createLinxSolidDatabase(
  session: unknown,
  options: CreateLinxSolidDatabaseOptions = {},
): Promise<SolidDatabase> {
  installBrowserSparqlEngine()

  const instance = drizzle(session as any, {
    disableInteropDiscovery: true,
    podUrl: normalizePodUrl(options.podUrl),
    schema: solidSchema,
  } as any) as unknown as SolidDatabase

  applyPodUrlOverride(instance, options.podUrl)
  assertExplicitPodUrlApplied(instance, options.podUrl, 'before Pod initialization')
  installInsertWriteGuard(instance)
  installMutationWriteGuard(instance)

  await withTimeout(
    initializeLinxPodStorage(instance),
    options.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS,
    'Pod init timed out',
  )

  assertExplicitPodUrlApplied(instance, options.podUrl, 'after Pod initialization')

  return instance
}

function installInsertWriteGuard(db: SolidDatabase): void {
  const target = db as any
  if (target.__linxInsertWriteGuardInstalled || typeof target.insert !== 'function') {
    return
  }

  const originalInsert = target.insert.bind(target)
  target.insert = (table: unknown) => {
    const builder = originalInsert(table)
    const originalValues = builder?.values
    if (typeof originalValues !== 'function') {
      return builder
    }

    builder.values = (values: unknown) => {
      if (!isIdpResource(table)) {
        assertInsertValuesBelongToCurrentPod(db, values)
      }
      return originalValues.call(builder, values)
    }
    return builder
  }
  target.__linxInsertWriteGuardInstalled = true
}

function installMutationWriteGuard(db: SolidDatabase): void {
  const target = db as any
  if (target.__linxMutationWriteGuardInstalled) {
    return
  }

  wrapUpdateByIri(db, target)
  wrapUpdateById(db, target)
  wrapDeleteByIri(db, target)
  wrapDeleteById(db, target)
  target.__linxMutationWriteGuardInstalled = true
}

function wrapUpdateByIri(db: SolidDatabase, target: any): void {
  if (typeof target.updateByIri !== 'function') {
    return
  }

  const original = target.updateByIri.bind(target)
  target.updateByIri = async (table: unknown, iri: string, values: Record<string, unknown>, ...rest: unknown[]) => {
    if (!isIdpResource(table)) {
      assertIriBelongsToCurrentPod(db, iri, 'update')
      assertUpdateValuesBelongToCurrentPod(db, values)
    }
    return await original(table, iri, values, ...rest)
  }
}

function wrapUpdateById(db: SolidDatabase, target: any): void {
  if (typeof target.updateById !== 'function') {
    return
  }

  const original = target.updateById.bind(target)
  target.updateById = async (table: unknown, id: string, values: Record<string, unknown>, ...rest: unknown[]) => {
    if (!isIdpResource(table)) {
      assertAbsoluteIdBelongsToCurrentPod(db, id, 'update')
      assertUpdateValuesBelongToCurrentPod(db, values)
    }
    return await original(table, id, values, ...rest)
  }
}

function wrapDeleteByIri(db: SolidDatabase, target: any): void {
  if (typeof target.deleteByIri !== 'function') {
    return
  }

  const original = target.deleteByIri.bind(target)
  target.deleteByIri = async (table: unknown, iri: string, ...rest: unknown[]) => {
    if (!isIdpResource(table)) {
      assertIriBelongsToCurrentPod(db, iri, 'delete')
    }
    return await original(table, iri, ...rest)
  }
}

function wrapDeleteById(db: SolidDatabase, target: any): void {
  if (typeof target.deleteById !== 'function') {
    return
  }

  const original = target.deleteById.bind(target)
  target.deleteById = async (table: unknown, id: string, ...rest: unknown[]) => {
    if (!isIdpResource(table)) {
      assertCurrentPodBaseUrl(db, 'delete')
      assertAbsoluteIdBelongsToCurrentPod(db, id, 'delete')
    }
    return await original(table, id, ...rest)
  }
}

function assertAbsoluteIdBelongsToCurrentPod(
  db: SolidDatabase,
  id: string,
  operation: 'update' | 'delete',
): void {
  if (isAbsoluteHttpIri(id)) {
    assertIriBelongsToCurrentPod(db, id, operation)
  }
}

function isAbsoluteHttpIri(value: string): boolean {
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}

function isIdpResource(table: unknown): boolean {
  return (table as any)?.config?.base === 'idp:///profile/card'
}

function applyPodUrlOverride(db: SolidDatabase, podUrl?: string | null): void {
  const normalized = normalizePodUrl(podUrl)
  if (!normalized) {
    return
  }

  const dialect = (db as any).getDialect?.()
  const currentPodUrl = dialect?.getPodUrl?.()
  if (normalizePodUrl(currentPodUrl) === normalized) {
    return
  }

  dialect?.runtime?.setPodUrl?.(normalized)
  dialect?.refreshBaseUrlFromRuntime?.()
}

function assertExplicitPodUrlApplied(db: SolidDatabase, podUrl: string | null | undefined, phase: string): void {
  const expected = normalizePodUrl(podUrl)
  if (!expected) {
    return
  }

  const actual = normalizePodUrl((db as any).getDialect?.()?.getPodUrl?.())
  if (actual === expected) {
    return
  }

  throw new Error(`Selected SP Pod URL was not applied ${phase}: expected ${expected}, got ${actual ?? 'unavailable'}`)
}

function normalizePodUrl(podUrl?: string | null): string | undefined {
  if (typeof podUrl !== 'string') {
    return undefined
  }

  const trimmed = podUrl.trim()
  if (!trimmed) {
    return undefined
  }

  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  })
}
