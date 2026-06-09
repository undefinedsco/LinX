const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const Module = require('node:module')
const { resolveCompiledDesktopModule } = require('./helpers.cjs')

function loadRouteModule(electronMock) {
  const modulePath = resolveCompiledDesktopModule('lib/local-sp-session-route.js')
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return electronMock
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  try {
    delete require.cache[modulePath]
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

function createProtocolSession(handlers) {
  return {
    protocol: {
      interceptStreamProtocol(scheme, handler) {
        assert.equal(scheme, 'https')
        handlers.push(handler)
        return true
      },
    },
    getBlobData: async () => Buffer.alloc(0),
  }
}

function createNetRequest(capturedRequests) {
  return (options) => {
    capturedRequests.push(options)
    const request = new EventEmitter()
    request.write = () => true
    request.abort = () => {
      request.aborted = true
    }
    request.end = () => {
      const response = new PassThrough()
      response.statusCode = 303
      response.headers = {
        location: 'http://localhost:5737/.account/',
        'set-cookie': 'sid=local; Path=/; HttpOnly',
      }

      process.nextTick(() => {
        request.emit('response', response)
        response.end('')
      })
    }
    return request
  }
}

function createRedirectNetRequest(capturedRequests) {
  return (options) => {
    capturedRequests.push(options)
    const request = new EventEmitter()
    request.write = () => true
    request.abort = () => {
      request.aborted = true
    }
    request.end = () => {
      process.nextTick(() => {
        request.emit('redirect', 303, 'GET', 'http://localhost:5737/.account/', {
          location: ['http://localhost:5737/.account/'],
          'set-cookie': ['sid=local; Path=/; HttpOnly'],
        })
        request.emit('error', Object.assign(new Error('net::ERR_ABORTED'), { code: 'ERR_ABORTED' }))
      })
    }
    return request
  }
}

function createJsonNetRequest(capturedRequests, payload) {
  return (options) => {
    capturedRequests.push(options)
    const request = new EventEmitter()
    request.write = () => true
    request.abort = () => {
      request.aborted = true
    }
    request.end = () => {
      const response = new PassThrough()
      response.statusCode = 200
      response.headers = {
        'content-type': 'application/json',
      }

      process.nextTick(() => {
        request.emit('response', response)
        response.end(JSON.stringify(payload))
      })
    }
    return request
  }
}

test('Local SP session route keeps canonical URL while forwarding transport to loopback', async () => {
  const handlers = []
  const capturedRequests = []
  const defaultSession = createProtocolSession(handlers)
  const authSession = createProtocolSession(handlers)
  const routeModule = loadRouteModule({
    session: {
      defaultSession,
      fromPartition(partition) {
        assert.equal(partition, 'persist:linx-auth')
        return authSession
      },
    },
    net: {
      request: createRedirectNetRequest(capturedRequests),
    },
  })

  routeModule.installLocalSpSessionRoutes()
  routeModule.updateLocalSpSessionRoute({
    canonicalBaseUrl: 'https://node-0000.undefineds.co/',
    accessBaseUrl: 'http://localhost:5737/',
  })

  const response = await new Promise((resolve) => {
    handlers[0]({
      url: 'https://node-0000.undefineds.co/.oidc/auth?client_id=abc',
      method: 'GET',
      referrer: '',
      headers: {
        accept: 'text/html',
        host: 'node-0000.undefineds.co',
      },
      uploadData: [],
    }, resolve)
  })

  assert.equal(capturedRequests.length, 1)
  assert.equal(capturedRequests[0].url, 'http://localhost:5737/.oidc/auth?client_id=abc')
  assert.equal(capturedRequests[0].headers.host, undefined)
  assert.equal(capturedRequests[0].headers['x-forwarded-host'], 'node-0000.undefineds.co')
  assert.equal(capturedRequests[0].headers['x-forwarded-proto'], 'https')
  assert.equal(response.statusCode, 303)
  assert.deepEqual(response.headers.location, ['https://node-0000.undefineds.co/.account/'])
  assert.equal(routeModule.rewriteLocalSpUrl('https://node-0000.undefineds.co/alice/'), 'http://localhost:5737/alice/')
})

test('Local SP OIDC discovery uses loopback transport and returns the canonical issuer', async () => {
  const handlers = []
  const capturedRequests = []
  const defaultSession = createProtocolSession(handlers)
  const authSession = createProtocolSession(handlers)
  const routeModule = loadRouteModule({
    session: {
      defaultSession,
      fromPartition: () => authSession,
    },
    net: {
      request: createJsonNetRequest(capturedRequests, {
        issuer: 'https://node-0000.undefineds.co/',
      }),
    },
  })

  routeModule.installLocalSpSessionRoutes()
  routeModule.updateLocalSpSessionRoute({
    canonicalBaseUrl: 'https://node-0000.undefineds.co/',
    accessBaseUrl: 'http://localhost:5737/',
  })

  const issuer = await routeModule.resolveLocalSpOidcIssuer('https://node-0000.undefineds.co/')

  assert.equal(issuer, 'https://node-0000.undefineds.co')
  assert.equal(capturedRequests.length, 1)
  assert.equal(capturedRequests[0].url, 'http://localhost:5737/.well-known/openid-configuration')
  assert.equal(capturedRequests[0].headers.host, undefined)
  assert.equal(capturedRequests[0].headers['x-forwarded-proto'], 'https')
})

test('Local SP session route explicitly passes through non-local and non-canonical requests', async () => {
  const handlers = []
  const capturedRequests = []
  const defaultSession = createProtocolSession(handlers)
  const authSession = createProtocolSession(handlers)
  const routeModule = loadRouteModule({
    session: {
      defaultSession,
      fromPartition: () => authSession,
    },
    net: {
      request: createNetRequest(capturedRequests),
    },
  })

  routeModule.installLocalSpSessionRoutes()
  routeModule.updateLocalSpSessionRoute({
    canonicalBaseUrl: 'https://node-0000.undefineds.co/',
    accessBaseUrl: 'http://localhost:5737/',
  })

  const response = await new Promise((resolve) => {
    handlers[0]({
      url: 'https://id.undefineds.co/.account/',
      method: 'GET',
      referrer: '',
      headers: {},
      uploadData: [],
    }, resolve)
  })

  assert.equal(capturedRequests.length, 1)
  assert.equal(capturedRequests[0].url, 'https://id.undefineds.co/.account/')
  assert.equal(capturedRequests[0].bypassCustomProtocolHandlers, true)
  assert.equal(response.statusCode, 303)
  assert.equal(routeModule.rewriteLocalSpUrl('https://id.undefineds.co/ganlu/'), null)
})
