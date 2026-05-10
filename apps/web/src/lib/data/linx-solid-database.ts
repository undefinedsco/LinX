import { drizzle } from '@undefineds.co/drizzle-solid'
import type { SolidDatabase } from '@undefineds.co/models'
import { schema } from '@undefineds.co/models'
import { installBrowserSparqlEngine } from './browser-sparql-engine'
import { initializeLinxPodStorage } from './pod-storage-bootstrap'

export interface CreateLinxSolidDatabaseOptions {
  initTimeoutMs?: number
  podUrl?: string | null
}

const DEFAULT_INIT_TIMEOUT_MS = 30_000

/**
 * Creates a LinX-ready Solid database.
 *
 * Callers should treat the returned DB as already connected and bootstrapped:
 * Solid session -> drizzle DB -> schema init -> LinX Pod containers.
 */
export async function createLinxSolidDatabase(
  session: unknown,
  options: CreateLinxSolidDatabaseOptions = {},
): Promise<SolidDatabase> {
  installBrowserSparqlEngine()

  const instance = drizzle(session as any, {
    disableInteropDiscovery: true,
    podUrl: normalizePodUrl(options.podUrl),
    schema,
  } as any) as unknown as SolidDatabase

  applyPodUrlOverride(instance, options.podUrl)

  await withTimeout(
    initializeLinxPodStorage(instance),
    options.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS,
    'Pod init timed out',
  )

  return instance
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
