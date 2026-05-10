import buildMeta from '../generated/build-meta.json';

export interface AppUpdateStatus {
  currentVersion: string;
  latestVersion: string | null;
  releaseUrl: string | null;
  checkedAt: string | null;
  available: boolean;
  source: 'github-release' | 'custom-feed';
  error: string | null;
}

interface ReleaseDescriptor {
  version: string;
  releaseUrl: string | null;
}

interface AppUpdaterOptions {
  currentVersion?: string;
  releaseRepo?: string;
  releaseFeedUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  cacheTtlMs?: number;
}

const DEFAULT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function normalizeVersion(raw: string | null | undefined): string {
  return String(raw ?? '').trim().replace(/^v/i, '');
}

function splitVersion(raw: string) {
  const normalized = normalizeVersion(raw);
  const [core, prerelease = ''] = normalized.split('-', 2);

  return {
    numbers: core.split('.').map((part) => {
      const parsed = Number.parseInt(part, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }),
    prerelease,
  };
}

export function compareVersions(left: string, right: string): number {
  const a = splitVersion(left);
  const b = splitVersion(right);
  const length = Math.max(a.numbers.length, b.numbers.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (a.numbers[index] ?? 0) - (b.numbers[index] ?? 0);
    if (diff !== 0) {
      return diff > 0 ? 1 : -1;
    }
  }

  if (a.prerelease && !b.prerelease) {
    return -1;
  }
  if (!a.prerelease && b.prerelease) {
    return 1;
  }

  return a.prerelease.localeCompare(b.prerelease);
}

export function parseLatestRelease(payload: Record<string, unknown>): ReleaseDescriptor | null {
  const rawVersion = [
    payload.version,
    payload.latestVersion,
    payload.tag,
    payload.tag_name,
  ].find((value) => typeof value === 'string') as string | undefined;

  const version = normalizeVersion(rawVersion);
  if (!version) {
    return null;
  }

  const releaseUrl = [
    payload.releaseUrl,
    payload.html_url,
    payload.url,
  ].find((value) => typeof value === 'string') as string | undefined;

  return {
    version,
    releaseUrl: releaseUrl ?? null,
  };
}

export function parseLatestReleaseFeed(payload: unknown): ReleaseDescriptor | null {
  if (Array.isArray(payload)) {
    const first = payload.find((item) => item && typeof item === 'object');
    return first ? parseLatestRelease(first) : null;
  }

  if (payload && typeof payload === 'object') {
    return parseLatestRelease(payload as Record<string, unknown>);
  }

  return null;
}

function defaultReleaseFeedUrl(repo: string): string {
  return `https://api.github.com/repos/${repo}/releases?per_page=1`;
}

function shouldSilenceReleaseFeedStatus(
  status: number,
  source: AppUpdateStatus['source'],
): boolean {
  return source === 'github-release' && status === 404;
}

function createEmptyStatus(currentVersion: string, source: AppUpdateStatus['source']): AppUpdateStatus {
  return {
    currentVersion,
    latestVersion: null,
    releaseUrl: null,
    checkedAt: null,
    available: false,
    source,
    error: null,
  };
}

export class AppUpdater {
  private readonly currentVersion: string;
  private readonly releaseRepo: string;
  private readonly releaseFeedUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly cacheTtlMs: number;
  private readonly source: AppUpdateStatus['source'];
  private cachedStatus: AppUpdateStatus;

  constructor(options: AppUpdaterOptions = {}) {
    this.currentVersion = normalizeVersion(options.currentVersion ?? buildMeta.version) || '0.0.0';
    this.releaseRepo = options.releaseRepo ?? buildMeta.releaseRepo;
    this.releaseFeedUrl = options.releaseFeedUrl ?? defaultReleaseFeedUrl(this.releaseRepo);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.source = options.releaseFeedUrl ? 'custom-feed' : 'github-release';
    this.cachedStatus = createEmptyStatus(this.currentVersion, this.source);
  }

  getCurrentVersion(): string {
    return this.currentVersion;
  }

  async getStatus(force = false): Promise<AppUpdateStatus> {
    if (!force && this.cachedStatus.checkedAt) {
      const age = this.now() - Date.parse(this.cachedStatus.checkedAt);
      if (age < this.cacheTtlMs) {
        return this.cachedStatus;
      }
    }

    try {
      const response = await this.fetchImpl(this.releaseFeedUrl, {
        headers: {
          accept: 'application/json',
          'user-agent': 'LinX Desktop',
        },
      });

      if (!response.ok) {
        if (shouldSilenceReleaseFeedStatus(response.status, this.source)) {
          this.cachedStatus = {
            ...createEmptyStatus(this.currentVersion, this.source),
            checkedAt: new Date(this.now()).toISOString(),
          };
          return this.cachedStatus;
        }

        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json() as unknown;
      const latestRelease = parseLatestReleaseFeed(payload);

      if (!latestRelease) {
        this.cachedStatus = {
          ...createEmptyStatus(this.currentVersion, this.source),
          checkedAt: new Date(this.now()).toISOString(),
        };
        return this.cachedStatus;
      }

      this.cachedStatus = {
        currentVersion: this.currentVersion,
        latestVersion: latestRelease.version,
        releaseUrl: latestRelease.releaseUrl,
        checkedAt: new Date(this.now()).toISOString(),
        available: compareVersions(latestRelease.version, this.currentVersion) > 0,
        source: this.source,
        error: null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.cachedStatus = {
        ...this.cachedStatus,
        checkedAt: new Date(this.now()).toISOString(),
        error: message,
      };
    }

    return this.cachedStatus;
  }
}
