import type { LocalOnboardingSnapshot } from '@/types/electron-api'

const LINX_LOCAL_ONBOARDING_CONTRACT = 'linx-local-onboarding/v1'
const DEFAULT_PROBE_TIMEOUT_MS = 900

export type LocalAccessRouteKind = 'local' | 'lan' | 'public' | 'canonical'

export interface LocalAccessRouteProbe {
  url: string
  kind: LocalAccessRouteKind
  ok: boolean
  latencyMs: number | null
  error: string | null
  reportedBaseUrl: string | null
}

export interface LocalAccessRouteSelection {
  canonicalBaseUrl: string
  canonicalPodUrl: string
  accessBaseUrl: string
  accessPodUrl: string
  kind: LocalAccessRouteKind
  latencyMs: number
  probes: LocalAccessRouteProbe[]
  rewriteEnabled?: boolean
  rewriteDisabledReason?: string | null
}

interface ResolveLocalAccessRouteOptions {
  canonicalPodUrl: string | null
  storageProviderLabel?: string | null
  storageProviderUrl?: string | null
  snapshot?: LocalOnboardingSnapshot | null
  fetchImpl?: typeof fetch
  timeoutMs?: number
  now?: () => number
}

interface Candidate {
  url: string
  kind: LocalAccessRouteKind
}

interface ActiveRewriteRoute {
  canonicalBaseUrl: string
  accessBaseUrl: string
}

const activeRoutes = new Map<string, ActiveRewriteRoute>()
let nativeFetch: typeof fetch | null = null

export function hasLocalAccessRouteSource(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return Boolean(
    window.xpodDesktop?.localOnboarding?.getSnapshot
    || (window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__,
  )
}

export async function resolveBestLocalAccessRoute(
  options: ResolveLocalAccessRouteOptions,
): Promise<LocalAccessRouteSelection | null> {
  if (!isLocalProvider(options.storageProviderLabel) || !options.canonicalPodUrl) {
    return null
  }

  const snapshot = options.snapshot ?? await loadLocalOnboardingSnapshot()
  if (snapshot?.state !== 'ready') {
    return null
  }

  const canonicalBaseUrl = normalizeBaseUrl(options.storageProviderUrl)
    ?? baseUrlFromPodUrl(options.canonicalPodUrl)
  const canonicalPodUrl = normalizePodUrl(options.canonicalPodUrl)
  if (!canonicalBaseUrl || !canonicalPodUrl) {
    return null
  }

  const fetchImpl = options.fetchImpl ?? getNativeFetch()
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS
  const now = options.now ?? (() => performance.now())
  const candidates = collectCandidates(snapshot, canonicalBaseUrl)
  if (candidates.length === 0) {
    return null
  }

  const probes = await Promise.all(
    candidates.map((candidate) => probeCandidate(candidate, canonicalBaseUrl, fetchImpl, timeoutMs, now)),
  )
  const successful = probes
    .filter((probe) => probe.ok && probe.latencyMs !== null)
    .sort((left, right) => {
      const latencyDelta = (left.latencyMs ?? Number.MAX_SAFE_INTEGER) - (right.latencyMs ?? Number.MAX_SAFE_INTEGER)
      if (latencyDelta !== 0) {
        return latencyDelta
      }
      return routePriority(left.kind) - routePriority(right.kind)
    })

  const best = successful[0]
  if (!best || best.latencyMs === null) {
    return null
  }

  return {
    canonicalBaseUrl,
    canonicalPodUrl,
    accessBaseUrl: best.url,
    accessPodUrl: rewriteUrlBase(canonicalPodUrl, canonicalBaseUrl, best.url) ?? canonicalPodUrl,
    kind: best.kind,
    latencyMs: best.latencyMs,
    probes,
  }
}

export function installLocalAccessRoute(selection: LocalAccessRouteSelection | null): void {
  if (typeof window === 'undefined' || typeof globalThis.fetch !== 'function') {
    return
  }

  activeRoutes.clear()

  if (!selection) {
    publishRoute(null)
    return
  }

  if (selection.accessBaseUrl === selection.canonicalBaseUrl) {
    publishRoute({
      ...selection,
      rewriteEnabled: false,
      rewriteDisabledReason: 'canonical-route',
    })
    return
  }

  const rewriteSafety = resolveFetchRewriteSafety(selection)
  publishRoute({
    ...selection,
    rewriteEnabled: rewriteSafety.enabled,
    rewriteDisabledReason: rewriteSafety.reason,
  })
  if (!rewriteSafety.enabled) {
    return
  }

  ensureFetchInterceptor()
  activeRoutes.set(selection.canonicalBaseUrl, {
    canonicalBaseUrl: selection.canonicalBaseUrl,
    accessBaseUrl: selection.accessBaseUrl,
  })
}

export function clearLocalAccessRoutesForTests(): void {
  activeRoutes.clear()
  if (nativeFetch) {
    globalThis.fetch = nativeFetch
    nativeFetch = null
  }
  publishRoute(null)
}

async function loadLocalOnboardingSnapshot(): Promise<LocalOnboardingSnapshot | null> {
  if (typeof window === 'undefined') {
    return null
  }

  const desktopSnapshot = await window.xpodDesktop?.localOnboarding?.getSnapshot?.().catch(() => null)
  if (desktopSnapshot) {
    return desktopSnapshot
  }

  const serviceWindow = window as Window & { __LINX_SERVICE__?: boolean }
  if (!serviceWindow.__LINX_SERVICE__) {
    return null
  }

  try {
    const response = await getNativeFetch()('/api/service/status', {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      return null
    }
    const status = await response.json()
    const port = typeof status?.pod?.port === 'number' ? status.pod.port : 5737
    const localUrl = ensureTrailingSlash(`http://localhost:${port}`)
    const baseUrl = normalizeBaseUrl(status?.pod?.baseUrl) ?? localUrl
    const publicUrl = normalizeBaseUrl(status?.provisioning?.publicUrl)
      ?? normalizeBaseUrl(status?.pod?.publicUrl)
    const running = Boolean(status?.pod?.running)

    return {
      state: running ? 'ready' : 'idle',
      mode: publicUrl ? 'local' : 'standalone',
      localUrl,
      baseUrl,
      publicUrl,
      capabilities: null,
      cloudIdentityUrl: status?.provisioning?.cloudIdentityUrl ?? null,
      provisionCode: status?.provisioning?.provisionCode ?? null,
      provisionUrl: status?.provisioning?.provisionUrl ?? null,
      nodeId: status?.provisioning?.nodeId ?? null,
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    }
  } catch {
    return null
  }
}

function collectCandidates(snapshot: LocalOnboardingSnapshot, canonicalBaseUrl: string): Candidate[] {
  const publicBaseUrl = normalizeBaseUrl(snapshot.publicUrl)
  const candidates: Candidate[] = [
    { url: snapshot.localUrl ?? '', kind: 'local' },
    { url: snapshot.baseUrl ?? '', kind: resolveBaseUrlKind(snapshot.baseUrl, canonicalBaseUrl, publicBaseUrl) },
    { url: snapshot.publicUrl ?? '', kind: 'public' },
    { url: canonicalBaseUrl, kind: 'canonical' },
  ]
  const seen = new Set<string>()
  return candidates.flatMap((candidate) => {
    const normalized = normalizeBaseUrl(candidate.url)
    if (!normalized || seen.has(normalized)) {
      return []
    }
    seen.add(normalized)
    return [{ ...candidate, url: normalized }]
  })
}

function resolveBaseUrlKind(
  baseUrl: string | null | undefined,
  canonicalBaseUrl: string,
  publicBaseUrl: string | null,
): LocalAccessRouteKind {
  const normalized = normalizeBaseUrl(baseUrl)
  if (normalized === canonicalBaseUrl || normalized === publicBaseUrl) {
    return 'public'
  }
  return isLoopbackUrl(baseUrl) ? 'local' : 'lan'
}

async function probeCandidate(
  candidate: Candidate,
  canonicalBaseUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  now: () => number,
): Promise<LocalAccessRouteProbe> {
  const startedAt = now()
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(new URL('/api/linx/capabilities', candidate.url).toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    const latencyMs = Math.max(0, Math.round(now() - startedAt))
    const payload = response.ok ? await response.json().catch(() => null) : null
    const reportedBaseUrl = normalizeBaseUrl(payload?.baseUrl)
    const sameNode = payload?.contract === LINX_LOCAL_ONBOARDING_CONTRACT
      && reportedBaseUrl === canonicalBaseUrl

    return {
      url: candidate.url,
      kind: candidate.kind,
      ok: response.ok && sameNode,
      latencyMs,
      error: response.ok
        ? sameNode
          ? null
          : 'capabilities baseUrl mismatch'
        : `HTTP ${response.status}`,
      reportedBaseUrl,
    }
  } catch (error) {
    return {
      url: candidate.url,
      kind: candidate.kind,
      ok: false,
      latencyMs: null,
      error: error instanceof Error ? error.message : String(error),
      reportedBaseUrl: null,
    }
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function ensureFetchInterceptor(): void {
  if (nativeFetch) {
    return
  }

  nativeFetch = globalThis.fetch.bind(globalThis)
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const originalUrl = getRequestUrl(input)
    const rewrittenUrl = originalUrl ? resolveAccessUrl(originalUrl) : null

    if (!rewrittenUrl || rewrittenUrl === originalUrl) {
      return nativeFetch!(input, init)
    }

    if (typeof Request !== 'undefined' && input instanceof Request) {
      return nativeFetch!(rewrittenUrl, {
        body: init?.body ?? (input.method === 'GET' || input.method === 'HEAD' ? undefined : input.clone().body),
        cache: init?.cache ?? input.cache,
        credentials: init?.credentials ?? input.credentials,
        headers: init?.headers ?? input.headers,
        integrity: init?.integrity ?? input.integrity,
        keepalive: init?.keepalive ?? input.keepalive,
        method: init?.method ?? input.method,
        mode: init?.mode ?? input.mode,
        redirect: init?.redirect ?? input.redirect,
        referrer: init?.referrer ?? input.referrer,
        referrerPolicy: init?.referrerPolicy ?? input.referrerPolicy,
        signal: init?.signal ?? input.signal,
      })
    }

    return nativeFetch!(rewrittenUrl, init)
  }) as typeof fetch
}

function resolveFetchRewriteSafety(
  selection: LocalAccessRouteSelection,
): { enabled: boolean; reason: string | null } {
  try {
    const canonical = new URL(selection.canonicalBaseUrl)
    const access = new URL(selection.accessBaseUrl)
    const pageProtocol = typeof window !== 'undefined' ? window.location.protocol : ''

    if (canonical.protocol === 'https:' && access.protocol !== 'https:') {
      return { enabled: false, reason: 'https-canonical-to-http-access' }
    }

    if (pageProtocol === 'https:' && access.protocol === 'http:') {
      return { enabled: false, reason: 'mixed-content-risk' }
    }

    return { enabled: true, reason: null }
  } catch {
    return { enabled: false, reason: 'invalid-route-url' }
  }
}

function getNativeFetch(): typeof fetch {
  return nativeFetch ?? globalThis.fetch.bind(globalThis)
}

function resolveAccessUrl(requestUrl: string): string | null {
  for (const route of activeRoutes.values()) {
    const rewritten = rewriteUrlBase(requestUrl, route.canonicalBaseUrl, route.accessBaseUrl)
    if (rewritten) {
      return rewritten
    }
  }
  return null
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

function publishRoute(selection: LocalAccessRouteSelection | null): void {
  if (typeof window === 'undefined') {
    return
  }
  ;(window as any).__LINX_ACCESS_ROUTE__ = selection
}

function routePriority(kind: LocalAccessRouteKind): number {
  switch (kind) {
    case 'local':
      return 0
    case 'lan':
      return 1
    case 'public':
      return 2
    case 'canonical':
    default:
      return 3
  }
}

function isLocalProvider(storageProviderLabel?: string | null): boolean {
  return storageProviderLabel?.trim().toLowerCase() === 'local'
}

function isLoopbackUrl(url?: string | null): boolean {
  try {
    const hostname = new URL(url ?? '').hostname
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
  } catch {
    return false
  }
}

function baseUrlFromPodUrl(podUrl: string): string | null {
  try {
    const parsed = new URL(podUrl)
    parsed.pathname = '/'
    parsed.search = ''
    parsed.hash = ''
    return ensureTrailingSlash(parsed.toString())
  } catch {
    return null
  }
}

function normalizeBaseUrl(url?: unknown): string | null {
  if (typeof url !== 'string' || !url.trim()) {
    return null
  }
  try {
    const parsed = new URL(url)
    parsed.pathname = '/'
    parsed.search = ''
    parsed.hash = ''
    return ensureTrailingSlash(parsed.toString())
  } catch {
    return null
  }
}

function normalizePodUrl(url?: string | null): string | null {
  if (typeof url !== 'string' || !url.trim()) {
    return null
  }
  try {
    return ensureTrailingSlash(new URL(url).toString())
  } catch {
    return null
  }
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}
