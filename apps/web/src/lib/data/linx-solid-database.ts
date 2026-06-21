import { drizzle } from '@undefineds.co/drizzle-solid'
import type { SolidDatabase } from '@undefineds.co/models'
import { solidSchema } from '@undefineds.co/models'
import { installBrowserSparqlEngine } from './browser-sparql-engine'
import { initializeLinxPodStorage, type PodStorageBootstrapEvent } from './pod-storage-bootstrap'
import {
  assertCurrentPodBaseUrl,
  assertIriBelongsToCurrentPod,
  assertInsertValuesBelongToCurrentPod,
  assertUpdateValuesBelongToCurrentPod,
} from './pod-write-guard'

export interface CreateLinxSolidDatabaseOptions {
  initTimeoutMs?: number
  podUrl?: string | null
  transportUrlRewrite?: TransportUrlRewrite | null
}

const DEFAULT_INIT_TIMEOUT_MS = 30_000
const inFlightCreations = new Map<string, Promise<SolidDatabase>>()
const MAX_BOOTSTRAP_EVENTS = 80

export interface TransportUrlRewrite {
  fromBaseUrl: string
  toBaseUrl: string
}

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
  const cacheKeys = resolveCreationCacheKeys(session, options.podUrl)
  for (const cacheKey of cacheKeys) {
    const inFlight = inFlightCreations.get(cacheKey)
    if (inFlight) {
      return await inFlight
    }
  }

  const creation = createLinxSolidDatabaseUncached(session, options)
  if (cacheKeys.length > 0) {
    for (const cacheKey of cacheKeys) {
      inFlightCreations.set(cacheKey, creation)
    }
    const clearInFlight = () => {
      for (const cacheKey of cacheKeys) {
        if (inFlightCreations.get(cacheKey) === creation) {
          inFlightCreations.delete(cacheKey)
        }
      }
    }
    void creation.then(clearInFlight, clearInFlight)
  }

  return await creation
}

async function createLinxSolidDatabaseUncached(
  session: unknown,
  options: CreateLinxSolidDatabaseOptions,
): Promise<SolidDatabase> {
  const report = createBootstrapReporter()
  report({ stage: 'database:create:start' })
  installBrowserSparqlEngine()

  const runtimeSession = createTransportRewriteSession(session, options.transportUrlRewrite)
  const instance = drizzle(runtimeSession as any, {
    disableInteropDiscovery: true,
    podUrl: normalizePodUrl(options.podUrl),
    resourcePreparation: 'best-effort',
    schema: solidSchema,
  } as any) as unknown as SolidDatabase
  report({ stage: 'database:create:done' })

  applyPodUrlOverride(instance, options.podUrl)
  assertExplicitPodUrlApplied(instance, options.podUrl, 'before Pod initialization')
  report({
    stage: 'database:pod-url:ready',
    target: normalizePodUrl((instance as any).getDialect?.()?.getPodUrl?.()),
  })
  installInsertWriteGuard(instance)
  installMutationWriteGuard(instance)

  try {
    await withTimeout(
      initializeLinxPodStorage(instance, { onEvent: report }),
      options.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS,
      'Pod init timed out',
    )
  } catch (error) {
    report({
      stage: 'database:init:error',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  assertExplicitPodUrlApplied(instance, options.podUrl, 'after Pod initialization')
  report({ stage: 'database:init:done' })

  return instance
}

export function createTransportRewriteSession(
  session: unknown,
  rewrite?: TransportUrlRewrite | null,
): unknown {
  if (!rewrite || !isUsableTransportRewrite(rewrite)) {
    return session
  }

  const sourceSession = session as { fetch?: typeof fetch } | null | undefined
  if (typeof sourceSession?.fetch !== 'function') {
    return session
  }

  const rewrittenFetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const rewrittenInput = rewriteFetchInput(input, rewrite)
      return sourceSession.fetch!(rewrittenInput, init)
    }

  if (typeof session === 'object' && session !== null) {
    return new Proxy(session, {
      get(target, property, receiver) {
        if (property === 'fetch') {
          return rewrittenFetch
        }
        return Reflect.get(target, property, receiver)
      },
    })
  }

  return {
    fetch: rewrittenFetch,
  }
}

function rewriteFetchInput(input: RequestInfo | URL, rewrite: TransportUrlRewrite): RequestInfo | URL {
  const originalUrl = getRequestUrl(input)
  const rewrittenUrl = originalUrl ? rewriteUrlBase(originalUrl, rewrite.fromBaseUrl, rewrite.toBaseUrl) : null
  if (!rewrittenUrl || rewrittenUrl === originalUrl) {
    return input
  }

  if (typeof Request !== 'undefined' && input instanceof Request) {
    return new Request(rewrittenUrl, input)
  }

  if (input instanceof URL) {
    return new URL(rewrittenUrl)
  }

  return rewrittenUrl
}

function getRequestUrl(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') {
    return input
  }
  if (input instanceof URL) {
    return input.toString()
  }
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url
  }
  return null
}

function isUsableTransportRewrite(rewrite: TransportUrlRewrite): boolean {
  return Boolean(
    normalizePodUrl(rewrite.fromBaseUrl)
    && normalizePodUrl(rewrite.toBaseUrl)
    && normalizePodUrl(rewrite.fromBaseUrl) !== normalizePodUrl(rewrite.toBaseUrl),
  )
}

function rewriteUrlBase(requestUrl: string, fromBaseUrl: string, toBaseUrl: string): string | null {
  try {
    const request = new URL(requestUrl)
    const from = new URL(fromBaseUrl)
    const to = new URL(toBaseUrl)
    if (request.origin !== from.origin || !request.pathname.startsWith(from.pathname)) {
      return null
    }

    const suffix = request.pathname.slice(from.pathname.length)
    const rewritten = new URL(suffix.replace(/^\/+/, ''), to)
    rewritten.search = request.search
    rewritten.hash = request.hash
    return rewritten.toString()
  } catch {
    return null
  }
}

function resolveCreationCacheKeys(session: unknown, podUrl?: string | null): string[] {
  const info = (session as { info?: { sessionId?: string; webId?: string } } | null | undefined)?.info
  const normalizedPodUrl = normalizePodUrl(podUrl)
  const webId = typeof info?.webId === 'string' && info.webId.trim()
    ? info.webId
    : null

  const keys: string[] = []
  if (normalizedPodUrl) {
    keys.push(`pod:${normalizedPodUrl}`)
  }

  if (webId) {
    keys.push(`webid:${webId}:default`)
  }

  return keys
}

function installInsertWriteGuard(db: SolidDatabase): void {
  const target = db as any
  if (target.__linxInsertWriteGuardInstalled || typeof target.insert !== 'function') {
    return
  }

  const originalInsert = target.insert.bind(target)
  target.insert = (resource: unknown) => {
    const builder = originalInsert(resource)
    const originalValues = builder?.values
    if (typeof originalValues !== 'function') {
      return builder
    }

    builder.values = (values: unknown) => {
      if (!isIdpResource(resource)) {
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
  target.updateByIri = async (resource: unknown, iri: string, values: Record<string, unknown>, ...rest: unknown[]) => {
    if (!isIdpResource(resource)) {
      assertIriBelongsToCurrentPod(db, iri, 'update')
      assertUpdateValuesBelongToCurrentPod(db, values)
    }
    return await original(resource, iri, values, ...rest)
  }
}

function wrapUpdateById(db: SolidDatabase, target: any): void {
  if (typeof target.updateById !== 'function') {
    return
  }

  const original = target.updateById.bind(target)
  target.updateById = async (resource: unknown, id: string, values: Record<string, unknown>, ...rest: unknown[]) => {
    if (!isIdpResource(resource)) {
      assertAbsoluteIdBelongsToCurrentPod(db, id, 'update')
      assertUpdateValuesBelongToCurrentPod(db, values)
    }
    return await original(resource, id, values, ...rest)
  }
}

function wrapDeleteByIri(db: SolidDatabase, target: any): void {
  if (typeof target.deleteByIri !== 'function') {
    return
  }

  const original = target.deleteByIri.bind(target)
  target.deleteByIri = async (resource: unknown, iri: string, ...rest: unknown[]) => {
    if (!isIdpResource(resource)) {
      assertIriBelongsToCurrentPod(db, iri, 'delete')
    }
    return await original(resource, iri, ...rest)
  }
}

function wrapDeleteById(db: SolidDatabase, target: any): void {
  if (typeof target.deleteById !== 'function') {
    return
  }

  const original = target.deleteById.bind(target)
  target.deleteById = async (resource: unknown, id: string, ...rest: unknown[]) => {
    if (!isIdpResource(resource)) {
      assertCurrentPodBaseUrl(db, 'delete')
      assertAbsoluteIdBelongsToCurrentPod(db, id, 'delete')
    }
    return await original(resource, id, ...rest)
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

function isIdpResource(resource: unknown): boolean {
  return (resource as any)?.config?.base === 'idp:///profile/card'
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

function createBootstrapReporter(): (event: PodStorageBootstrapEvent) => void {
  return (event) => {
    if (typeof window === 'undefined') {
      return
    }

    const target = window as unknown as {
      __SOLID_DB_BOOTSTRAP__?: {
        status?: string
        stage?: string
        target?: string
        error?: string
        events?: Array<PodStorageBootstrapEvent & { at: string }>
      }
    }
    const previousEvents = Array.isArray(target.__SOLID_DB_BOOTSTRAP__?.events)
      ? target.__SOLID_DB_BOOTSTRAP__?.events ?? []
      : []
    const nextEvent = {
      ...event,
      at: new Date().toISOString(),
    }
    const events = [...previousEvents, nextEvent].slice(-MAX_BOOTSTRAP_EVENTS)
    const isError = event.stage.endsWith(':error')
    const isDone = event.stage === 'database:init:done'

    target.__SOLID_DB_BOOTSTRAP__ = {
      status: isError ? 'error' : isDone ? 'ready' : 'initializing',
      stage: event.stage,
      target: event.target,
      error: event.error,
      events,
    }
  }
}
