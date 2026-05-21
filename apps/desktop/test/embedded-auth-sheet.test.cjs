const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const {
  AUTHORIZATION_SURFACE_HEIGHT,
  AUTHORIZATION_SURFACE_WIDTH,
  EmbeddedAuthorizationSheet,
  extractProvisionCode,
  resolveAuthorizationWindowTitle,
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

test('resolveAuthorizationWindowTitle shows the active login provider', () => {
  assert.equal(resolveAuthorizationWindowTitle('Cloud'), 'Cloud 登录')
  assert.equal(resolveAuthorizationWindowTitle('Local'), 'Local 登录')
  assert.equal(resolveAuthorizationWindowTitle(''), 'LinX 登录')
})
