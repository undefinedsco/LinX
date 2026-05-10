const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const {
  AUTHORIZATION_SURFACE_HEIGHT,
  AUTHORIZATION_SURFACE_WIDTH,
  EmbeddedAuthorizationSheet,
  extractProvisionCode,
} = require(resolveCompiledDesktopModule('lib/embedded-auth-sheet.js'))

test('EmbeddedAuthorizationSheet exposes dismissed closed state before opening', () => {
  const sheet = new EmbeddedAuthorizationSheet({
    getMainWindow: () => null,
  })

  assert.deepEqual(sheet.getState(), {
    open: false,
    reason: 'dismissed',
    ready: false,
  })
  assert.equal(AUTHORIZATION_SURFACE_WIDTH, 480)
  assert.equal(AUTHORIZATION_SURFACE_HEIGHT, 720)
})

test('extractProvisionCode reads valid authorization query values', () => {
  assert.equal(
    extractProvisionCode('https://id.undefineds.co/.oidc/auth/abc?provisionCode=pc-123'),
    'pc-123',
  )
  assert.equal(extractProvisionCode('https://id.undefineds.co/.oidc/auth/abc'), null)
  assert.equal(extractProvisionCode('not a url'), null)
})
