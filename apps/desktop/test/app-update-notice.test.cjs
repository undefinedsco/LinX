const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const {
  shouldNotifyAppUpdate,
  createAppUpdateNotice,
} = require(resolveCompiledDesktopModule('lib/app-update-notice.js'))

test('shouldNotifyAppUpdate returns true for a newly available version', () => {
  assert.equal(
    shouldNotifyAppUpdate(null, {
      currentVersion: '0.2.0',
      latestVersion: '0.3.0',
      releaseUrl: 'https://example.test/releases/v0.3.0',
      checkedAt: '2026-03-25T00:00:00.000Z',
      available: true,
      source: 'github-release',
      error: null,
    }),
    true,
  )
})

test('shouldNotifyAppUpdate suppresses duplicate notifications', () => {
  assert.equal(
    shouldNotifyAppUpdate('0.3.0', {
      currentVersion: '0.2.0',
      latestVersion: '0.3.0',
      releaseUrl: 'https://example.test/releases/v0.3.0',
      checkedAt: '2026-03-25T00:00:00.000Z',
      available: true,
      source: 'github-release',
      error: null,
    }),
    false,
  )
})

test('createAppUpdateNotice builds user-facing text', () => {
  assert.deepEqual(
    createAppUpdateNotice({
      currentVersion: '0.2.0',
      latestVersion: '0.3.0',
      releaseUrl: 'https://example.test/releases/v0.3.0',
      checkedAt: '2026-03-25T00:00:00.000Z',
      available: true,
      source: 'github-release',
      error: null,
    }),
    {
      title: 'LinX 有新版本可用',
      body: '当前 0.2.0，最新 0.3.0',
    },
  )
})
