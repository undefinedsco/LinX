const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

test('AuthLoopbackServer exposes redirect url and forwards callback query', async (t) => {
  const originalCreateServer = http.createServer
  let requestHandler = null

  http.createServer = (handler) => {
    requestHandler = handler
    return {
      once: () => {},
      listen: (_port, _host, callback) => {
        callback()
      },
      address: () => ({ address: '127.0.0.1', port: 43123 }),
      close: (callback) => {
        callback?.()
      },
    }
  }

  t.after(() => {
    http.createServer = originalCreateServer
  })

  const { AuthLoopbackServer } = require(resolveCompiledDesktopModule('lib/auth-loopback.js'))

  let receivedUrl = null
  const server = new AuthLoopbackServer({
    onCallback: (url) => {
      receivedUrl = url
    },
  })

  t.after(async () => {
    await server.stop().catch(() => undefined)
  })

  const redirectUrl = await server.prepareRedirectUrl()
  const redirectUrlAgain = await server.prepareRedirectUrl()

  assert.equal(redirectUrlAgain, redirectUrl)
  assert.match(redirectUrl, /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/)

  let statusCode = null
  let headers = null
  let body = ''

  await requestHandler(
    { method: 'GET', url: '/auth/callback?code=test-code&state=test-state' },
    {
      writeHead: (status, responseHeaders) => {
        statusCode = status
        headers = responseHeaders
      },
      end: (chunk) => {
        body = String(chunk ?? '')
      },
    },
  )

  assert.equal(statusCode, 200)
  assert.equal(headers['content-type'], 'text/html; charset=utf-8')
  assert.match(body, /登录已完成/)
  assert.equal(receivedUrl, `${redirectUrl}?code=test-code&state=test-state`)
})
