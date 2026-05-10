const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const {
  isDesktopAuthCallbackUrl,
  isLinxAuthCallbackUrl,
  isLoopbackAuthCallbackUrl,
  extractLinxAuthCallbackUrl,
} = require(resolveCompiledDesktopModule('lib/auth-protocol.js'))

test('isLinxAuthCallbackUrl accepts linx auth callback urls', () => {
  assert.equal(
    isLinxAuthCallbackUrl('linx://auth/callback?code=abc&state=xyz'),
    true,
  )
})

test('isLinxAuthCallbackUrl rejects non auth callback urls', () => {
  assert.equal(isLinxAuthCallbackUrl('linx://chat/session/1'), false)
  assert.equal(isLinxAuthCallbackUrl('https://example.com/auth/callback'), false)
})

test('isLoopbackAuthCallbackUrl accepts localhost auth callback urls', () => {
  assert.equal(
    isLoopbackAuthCallbackUrl('http://127.0.0.1:43123/auth/callback?code=abc&state=xyz'),
    true,
  )
  assert.equal(
    isLoopbackAuthCallbackUrl('http://localhost:43123/auth/callback?code=abc&state=xyz'),
    true,
  )
})

test('isDesktopAuthCallbackUrl accepts linx and loopback auth callback urls', () => {
  assert.equal(isDesktopAuthCallbackUrl('linx://auth/callback?code=abc&state=xyz'), true)
  assert.equal(
    isDesktopAuthCallbackUrl('http://127.0.0.1:43123/auth/callback?code=abc&state=xyz'),
    true,
  )
  assert.equal(isDesktopAuthCallbackUrl('https://example.com/auth/callback?code=abc'), false)
})

test('extractLinxAuthCallbackUrl returns first callback url from argv', () => {
  const url = extractLinxAuthCallbackUrl([
    '/Applications/LinX.app/Contents/MacOS/LinX',
    '--some-flag',
    'linx://auth/callback?code=abc',
    'linx://auth/callback?code=def',
  ])

  assert.equal(url, 'linx://auth/callback?code=abc')
})
