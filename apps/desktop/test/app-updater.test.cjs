const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const {
  AppUpdater,
  compareVersions,
  parseLatestRelease,
  parseLatestReleaseFeed,
} = require(resolveCompiledDesktopModule('lib/app-updater.js'))

test('compareVersions orders semantic versions correctly', () => {
  assert.equal(compareVersions('0.2.0', '0.1.9'), 1)
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  assert.equal(compareVersions('1.0.0-beta.1', '1.0.0'), -1)
})

test('parseLatestRelease supports GitHub release payload', () => {
  assert.deepEqual(
    parseLatestRelease({
      tag_name: 'v0.3.2',
      html_url: 'https://github.com/undefinedsco/linx/releases/tag/v0.3.2',
    }),
    {
      version: '0.3.2',
      releaseUrl: 'https://github.com/undefinedsco/linx/releases/tag/v0.3.2',
    },
  )
})

test('parseLatestReleaseFeed supports GitHub release arrays', () => {
  assert.deepEqual(
    parseLatestReleaseFeed([
      {
        tag_name: 'v0.3.2',
        html_url: 'https://github.com/undefinedsco/LinX/releases/tag/v0.3.2',
      },
    ]),
    {
      version: '0.3.2',
      releaseUrl: 'https://github.com/undefinedsco/LinX/releases/tag/v0.3.2',
    },
  )
})

test('AppUpdater reports available updates and caches result', async () => {
  let calls = 0

  const updater = new AppUpdater({
    currentVersion: '0.2.0',
    releaseRepo: 'undefinedsco/linx',
    releaseFeedUrl: 'https://example.test/releases/latest',
    fetchImpl: async () => {
      calls += 1
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: 'v0.3.0',
          html_url: 'https://example.test/releases/v0.3.0',
        }),
      }
    },
    now: () => 1_700_000_000_000,
    cacheTtlMs: 60_000,
  })

  const first = await updater.getStatus()
  const second = await updater.getStatus()

  assert.equal(first.available, true)
  assert.equal(first.latestVersion, '0.3.0')
  assert.equal(first.releaseUrl, 'https://example.test/releases/v0.3.0')
  assert.equal(second.latestVersion, '0.3.0')
  assert.equal(calls, 1)
})

test('AppUpdater silences missing GitHub release feeds', async () => {
  const updater = new AppUpdater({
    currentVersion: '0.2.0',
    releaseRepo: 'undefinedsco/LinX',
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => [],
    }),
    now: () => 1_700_000_000_000,
    cacheTtlMs: 60_000,
  })

  const status = await updater.getStatus(true)

  assert.equal(status.available, false)
  assert.equal(status.latestVersion, null)
  assert.equal(status.releaseUrl, null)
  assert.equal(status.error, null)
})
