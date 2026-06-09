const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

const {
  installAuthCallbackNavigationInterceptor,
} = require(resolveCompiledDesktopModule('lib/auth-callback-navigation.js'))

test('installAuthCallbackNavigationInterceptor consumes loopback callback navigation', () => {
  const listeners = new Map()
  const target = {
    on(event, listener) {
      listeners.set(event, listener)
    },
  }
  const callbacks = []
  installAuthCallbackNavigationInterceptor(target, (url) => callbacks.push(url))

  let prevented = 0
  const event = {
    preventDefault() {
      prevented += 1
    },
  }
  const callbackUrl = 'http://127.0.0.1:43123/auth/callback?code=abc&state=xyz'
  listeners.get('will-redirect')(event, callbackUrl)
  listeners.get('will-navigate')(event, callbackUrl)

  assert.equal(prevented, 2)
  assert.deepEqual(callbacks, [callbackUrl])
})

test('installAuthCallbackNavigationInterceptor ignores normal auth page navigation', () => {
  const listeners = new Map()
  const target = {
    on(event, listener) {
      listeners.set(event, listener)
    },
  }
  const callbacks = []
  installAuthCallbackNavigationInterceptor(target, (url) => callbacks.push(url))

  let prevented = false
  listeners.get('will-navigate')({
    preventDefault() {
      prevented = true
    },
  }, 'https://node-0000.undefineds.co/.account/oidc/consent/')

  assert.equal(prevented, false)
  assert.deepEqual(callbacks, [])
})
