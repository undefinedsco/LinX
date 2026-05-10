export interface AppUpdateStatus {
  currentVersion: string
  latestVersion: string | null
  releaseUrl: string | null
  checkedAt: string | null
  available: boolean
  source: 'github-release' | 'custom-feed'
  error: string | null
}

interface ReleaseDescriptor {
  version: string
  releaseUrl: string | null
}

interface ResolveUpdateOptions {
  currentVersion?: string
  releaseRepo?: string
  releaseFeedUrl?: string
  cacheTtlMs?: number
  force?: boolean
  fetchImpl?: typeof fetch
  now?: number
  storage?: Pick<Storage, 'getItem' | 'setItem'>
}

const globalScope = globalThis as typeof globalThis & {
  __LINX_RELEASE_REPO__?: unknown
  __LINX_APP_VERSION__?: unknown
}

const DEFAULT_RELEASE_REPO =
  typeof globalScope.__LINX_RELEASE_REPO__ === 'string'
    ? globalScope.__LINX_RELEASE_REPO__
    : 'undefinedsco/LinX'
const DEFAULT_APP_VERSION =
  normalizeVersion(
    typeof globalScope.__LINX_APP_VERSION__ === 'string'
      ? globalScope.__LINX_APP_VERSION__
      : '0.0.0',
  ) || '0.0.0'
const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000

export function normalizeVersion(raw: string | null | undefined): string {
  return String(raw ?? '').trim().replace(/^v/i, '')
}

function splitVersion(raw: string) {
  const normalized = normalizeVersion(raw)
  const [core, prerelease = ''] = normalized.split('-', 2)

  return {
    numbers: core.split('.').map((part) => {
      const parsed = Number.parseInt(part, 10)
      return Number.isFinite(parsed) ? parsed : 0
    }),
    prerelease,
  }
}

export function compareVersions(left: string, right: string): number {
  const a = splitVersion(left)
  const b = splitVersion(right)
  const length = Math.max(a.numbers.length, b.numbers.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (a.numbers[index] ?? 0) - (b.numbers[index] ?? 0)
    if (diff !== 0) {
      return diff > 0 ? 1 : -1
    }
  }

  if (a.prerelease && !b.prerelease) return -1
  if (!a.prerelease && b.prerelease) return 1

  return a.prerelease.localeCompare(b.prerelease)
}

export function parseLatestRelease(payload: Record<string, unknown>): ReleaseDescriptor | null {
  const rawVersion = [
    payload.version,
    payload.latestVersion,
    payload.tag,
    payload.tag_name,
  ].find((value) => typeof value === 'string') as string | undefined

  const version = normalizeVersion(rawVersion)
  if (!version) {
    return null
  }

  const releaseUrl = [
    payload.releaseUrl,
    payload.html_url,
    payload.url,
  ].find((value) => typeof value === 'string') as string | undefined

  return {
    version,
    releaseUrl: releaseUrl ?? null,
  }
}

export function parseLatestReleaseFeed(payload: unknown): ReleaseDescriptor | null {
  if (Array.isArray(payload)) {
    const first = payload.find((item) => item && typeof item === 'object') as Record<string, unknown> | undefined
    return first ? parseLatestRelease(first) : null
  }

  if (payload && typeof payload === 'object') {
    return parseLatestRelease(payload as Record<string, unknown>)
  }

  return null
}

export function getBuiltAppVersion(): string {
  return DEFAULT_APP_VERSION
}

function getReleaseFeedUrl(repo: string, explicitUrl?: string): string {
  return explicitUrl ?? `https://api.github.com/repos/${repo}/releases?per_page=1`
}

function shouldSilenceReleaseFeedStatus(
  status: number,
  source: AppUpdateStatus['source'],
): boolean {
  return source === 'github-release' && status === 404
}

function getStorageKey(currentVersion: string, repo: string) {
  return `linx:app-update:${repo}:${currentVersion}`
}

function toEmptyStatus(currentVersion: string, source: AppUpdateStatus['source']): AppUpdateStatus {
  return {
    currentVersion,
    latestVersion: null,
    releaseUrl: null,
    checkedAt: null,
    available: false,
    source,
    error: null,
  }
}

export async function resolveBrowserAppUpdateStatus(options: ResolveUpdateOptions = {}): Promise<AppUpdateStatus> {
  const currentVersion = normalizeVersion(options.currentVersion ?? DEFAULT_APP_VERSION) || '0.0.0'
  const releaseRepo = options.releaseRepo ?? DEFAULT_RELEASE_REPO
  const releaseFeedUrl = getReleaseFeedUrl(releaseRepo, options.releaseFeedUrl)
  const source: AppUpdateStatus['source'] = options.releaseFeedUrl ? 'custom-feed' : 'github-release'
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
  const now = options.now ?? Date.now()
  const storage = options.storage
  const force = options.force ?? false

  if (storage && !force) {
    const cachedRaw = storage.getItem(getStorageKey(currentVersion, releaseRepo))
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw) as AppUpdateStatus
        if (cached.checkedAt && now - Date.parse(cached.checkedAt) < cacheTtlMs) {
          return cached
        }
      } catch {
        // ignore invalid cache
      }
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const response = await fetchImpl(releaseFeedUrl, {
      headers: {
        accept: 'application/json',
      },
    })

    if (!response.ok) {
      if (shouldSilenceReleaseFeedStatus(response.status, source)) {
        const status = {
          ...toEmptyStatus(currentVersion, source),
          checkedAt: new Date(now).toISOString(),
        }

        storage?.setItem(getStorageKey(currentVersion, releaseRepo), JSON.stringify(status))
        return status
      }

      throw new Error(`HTTP ${response.status}`)
    }

    const payload = await response.json() as unknown
    const latestRelease = parseLatestReleaseFeed(payload)

    if (!latestRelease) {
      const status = {
        ...toEmptyStatus(currentVersion, source),
        checkedAt: new Date(now).toISOString(),
      }

      storage?.setItem(getStorageKey(currentVersion, releaseRepo), JSON.stringify(status))
      return status
    }

    const status: AppUpdateStatus = {
      currentVersion,
      latestVersion: latestRelease.version,
      releaseUrl: latestRelease.releaseUrl,
      checkedAt: new Date(now).toISOString(),
      available: compareVersions(latestRelease.version, currentVersion) > 0,
      source,
      error: null,
    }

    storage?.setItem(getStorageKey(currentVersion, releaseRepo), JSON.stringify(status))

    return status
  } catch (error) {
    const status = {
      ...toEmptyStatus(currentVersion, source),
      checkedAt: new Date(now).toISOString(),
      error: error instanceof Error ? error.message : String(error),
    }

    storage?.setItem(getStorageKey(currentVersion, releaseRepo), JSON.stringify(status))

    return status
  }
}
