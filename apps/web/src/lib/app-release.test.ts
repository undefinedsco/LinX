import { describe, expect, it } from 'vitest'
import { compareVersions, parseLatestRelease, parseLatestReleaseFeed, resolveBrowserAppUpdateStatus } from './app-release'

describe('app-release', () => {
  it('compares semantic versions', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1)
  })

  it('parses GitHub release payload', () => {
    expect(
      parseLatestRelease({
        tag_name: 'v0.3.2',
        html_url: 'https://github.com/undefinedsco/linx/releases/tag/v0.3.2',
      }),
    ).toEqual({
      version: '0.3.2',
      releaseUrl: 'https://github.com/undefinedsco/linx/releases/tag/v0.3.2',
    })
  })

  it('parses release feeds returned as arrays', () => {
    expect(
      parseLatestReleaseFeed([
        {
          tag_name: 'v0.3.2',
          html_url: 'https://github.com/undefinedsco/LinX/releases/tag/v0.3.2',
        },
      ]),
    ).toEqual({
      version: '0.3.2',
      releaseUrl: 'https://github.com/undefinedsco/LinX/releases/tag/v0.3.2',
    })
  })

  it('silences missing GitHub release feeds', async () => {
    const storage = createMemoryStorage()

    await expect(
      resolveBrowserAppUpdateStatus({
        currentVersion: '0.1.0',
        releaseRepo: 'undefinedsco/LinX',
        fetchImpl: async () => ({
          ok: true,
          status: 200,
          json: async () => [],
        }) as Response,
        now: 1_700_000_000_000,
        storage,
      }),
    ).resolves.toEqual({
      currentVersion: '0.1.0',
      latestVersion: null,
      releaseUrl: null,
      checkedAt: '2023-11-14T22:13:20.000Z',
      available: false,
      source: 'github-release',
      error: null,
    })
  })

  it('preserves custom release feed errors', async () => {
    await expect(
      resolveBrowserAppUpdateStatus({
        currentVersion: '0.1.0',
        releaseFeedUrl: 'https://example.test/releases/latest',
        fetchImpl: async () => ({
          ok: false,
          status: 404,
          json: async () => ({}),
        }) as Response,
        now: 1_700_000_000_000,
        storage: createMemoryStorage(),
      }),
    ).resolves.toMatchObject({
      currentVersion: '0.1.0',
      available: false,
      source: 'custom-feed',
      error: 'HTTP 404',
    })
  })
})

function createMemoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const map = new Map<string, string>()

  return {
    getItem(key: string) {
      return map.get(key) ?? null
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
  }
}
