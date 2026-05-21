const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { resolveCompiledServiceModule } = require('./helpers.cjs')

function loadWebServerWithStubs(t, options = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-service-web-server-'))
  const originalLoad = Module._load
  const originalFetch = global.fetch
  const fetchCalls = []
  const status = options.status ?? {
    running: false,
    port: 5737,
    baseUrl: 'http://localhost:5737',
    publicUrl: undefined,
  }

  global.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init })
    return {
      ok: true,
      status: 200,
      async json() {
        return options.provisionResponse ?? {
          nodeId: 'node-123',
          nodeToken: 'node-token',
          serviceToken: 'service-token',
          provisionCode: 'provision-code',
          tunnelProvider: 'cloudflare',
          tunnelEndpoint: 'https://tunnel.example.com',
        }
      },
      async text() {
        return ''
      },
    }
  }

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => tmpDir,
          getName: () => 'LinX Service Test',
          getLoginItemSettings: () => ({ openAtLogin: false }),
          setLoginItemSettings: () => {},
        },
      }
    }

    if (request.endsWith('/xpod') || request === './xpod') {
      return {
        getXpodModule: () => ({
          getStatus: () => status,
          start: async () => {},
          stop: async () => {},
          restart: async () => {},
        }),
      }
    }

    if (request.endsWith('/runtime-threads') || request === './runtime-threads') {
      return {
        getRuntimeThreadsModule: () => ({
          listSessions: () => [],
          getSession: () => null,
          createSession: () => ({}),
          startSession: async () => ({}),
          pauseSession: async () => ({}),
          resumeSession: async () => ({}),
          stopSession: async () => ({}),
          sendSessionMessage: async () => ({}),
          respondToSessionToolCall: async () => ({}),
          getSessionLog: () => '',
          subscribeSession: () => () => {},
        }),
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  const modulePath = resolveCompiledServiceModule('lib/web-server.js')
  const linxPathsModulePath = resolveCompiledServiceModule('lib/linx-paths.js')
  delete require.cache[require.resolve(modulePath)]
  delete require.cache[require.resolve(linxPathsModulePath)]
  const { WebServerModule } = require(modulePath)
  const server = new WebServerModule()

  t.after(() => {
    Module._load = originalLoad
    global.fetch = originalFetch
    delete require.cache[require.resolve(modulePath)]
    delete require.cache[require.resolve(linxPathsModulePath)]
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  return { server, tmpDir, fetchCalls }
}

function setupPayload(overrides = {}) {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-service-pod-'))
  return {
    dataDir: tmpDataDir,
    port: 5737,
    autoStart: false,
    deploymentMode: 'local',
    network: {
      accessMode: 'auto',
    },
    local: {
      nodeId: 'node-0000',
    },
    ...overrides,
  }
}

async function listenOnRandomPort(server) {
  return await new Promise((resolve, reject) => {
    const listener = server.listen(0, '127.0.0.1', () => {
      const address = listener.address()
      resolve({ listener, origin: `http://127.0.0.1:${address.port}` })
    })
    listener.on('error', reject)
  })
}

async function requestJson(origin, pathname, options = {}) {
  const url = new URL(pathname, origin)
  const body = options.body ? JSON.stringify(options.body) : undefined

  return await new Promise((resolve, reject) => {
    const req = http.request(url, {
      method: options.method ?? 'GET',
      headers: {
        ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(options.headers ?? {}),
      },
    }, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            body: data ? JSON.parse(data) : null,
          })
        } catch (error) {
          reject(error)
        }
      })
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

test('setup writes Cloud+Local provisioning env when Local has a public domain', async (t) => {
  const { server, tmpDir, fetchCalls } = loadWebServerWithStubs(t)
  const { listener, origin } = await listenOnRandomPort(server.app)
  t.after(() => listener.close())

  const response = await requestJson(origin, '/api/setup', {
    method: 'POST',
    body: setupPayload({
      publicDomain: 'https://node-0000.undefineds.co/',
      network: {
        accessMode: 'tunnel',
        tunnelProvider: 'cloudflare',
        tunnelToken: 'cf-token',
      },
    }),
  })

  assert.equal(response.status, 200)
  const body = response.body
  assert.equal(body.success, true)
  assert.equal(body.provisioning.cloudIdentityUrl, 'https://id.undefineds.co')
  assert.equal(body.provisioning.publicUrl, 'https://node-0000.undefineds.co/')

  const cloudCall = fetchCalls.find((call) => call.url === 'https://api.undefineds.co/provision/nodes')
  assert.ok(cloudCall)
  assert.deepEqual(JSON.parse(cloudCall.init.body), {
    publicUrl: 'https://node-0000.undefineds.co/',
    localPort: 5737,
    tunnelToken: 'cf-token',
    tunnelMode: 'client',
    domainMode: 'self-managed',
  })

  const env = fs.readFileSync(path.join(tmpDir, '.env'), 'utf-8')
  assert.match(env, /^CSS_BASE_URL=https:\/\/node-0000\.undefineds\.co$/m)
  assert.match(env, /^oidcIssuer=https:\/\/id\.undefineds\.co$/m)
  assert.doesNotMatch(env, new RegExp(`^${['OIDC', 'ISSUER'].join('_')}=`, 'm'))
  assert.match(env, /^XPOD_CLOUD_API_ENDPOINT=https:\/\/api\.undefineds\.co$/m)
  assert.match(env, /^XPOD_NODE_ID=node-123$/m)
  assert.match(env, /^XPOD_NODE_TOKEN=node-token$/m)
  assert.match(env, /^XPOD_SERVICE_TOKEN=service-token$/m)
  assert.match(env, /^LINX_PROVISION_CODE=provision-code$/m)
  assert.match(env, /^LINX_PROVISION_URL=https:\/\/id\.undefineds\.co\/\.account\/\?provisionCode=provision-code$/m)
  assert.match(env, /^LINX_PUBLIC_DOMAIN=node-0000\.undefineds\.co$/m)
  assert.match(env, /^LINX_TUNNEL_PROVIDER=cloudflare$/m)
  assert.match(env, /^CLOUDFLARE_TUNNEL_TOKEN=cf-token$/m)
})

test('setup does not switch Local device-only into Cloud+Local without a public domain', async (t) => {
  const { server, tmpDir, fetchCalls } = loadWebServerWithStubs(t)
  const { listener, origin } = await listenOnRandomPort(server.app)
  t.after(() => listener.close())

  const response = await requestJson(origin, '/api/setup', {
    method: 'POST',
    body: setupPayload(),
  })

  assert.equal(response.status, 200)
  const body = response.body
  assert.equal(body.success, true)
  assert.equal(body.provisioning, undefined)
  assert.equal(fetchCalls.length, 0)

  const env = fs.readFileSync(path.join(tmpDir, '.env'), 'utf-8')
  assert.doesNotMatch(env, /^oidcIssuer=/m)
  assert.doesNotMatch(env, new RegExp(`^${['OIDC', 'ISSUER'].join('_')}=`, 'm'))
  assert.doesNotMatch(env, /^XPOD_NODE_ID=/m)
  assert.match(env, /^CSS_BASE_URL=http:\/\/localhost:5737$/m)
})

test('service status exposes provisioning from generated env', async (t) => {
  const { server, tmpDir } = loadWebServerWithStubs(t, {
    status: {
      running: true,
      port: 5737,
      baseUrl: 'https://node-0000.undefineds.co/',
      publicUrl: 'https://node-0000.undefineds.co/',
    },
  })
  const { listener, origin } = await listenOnRandomPort(server.app)
  t.after(() => listener.close())

  fs.writeFileSync(path.join(tmpDir, '.env'), [
    'CSS_PORT=5737',
    'CSS_BASE_URL=https://node-0000.undefineds.co',
    'oidcIssuer=https://id.undefineds.co',
    'XPOD_CLOUD_API_ENDPOINT=https://api.undefineds.co',
    'XPOD_NODE_ID=node-123',
    'XPOD_NODE_TOKEN=node-token',
    'XPOD_SERVICE_TOKEN=service-token',
    'LINX_PROVISION_CODE=provision-code',
    'LINX_PROVISION_URL=https://id.undefineds.co/.account/?provisionCode=provision-code',
    'LINX_PUBLIC_DOMAIN=node-0000.undefineds.co',
  ].join('\n'))

  const response = await requestJson(origin, '/api/service/status')
  assert.equal(response.status, 200)
  const body = response.body
  assert.equal(body.pod.running, true)
  assert.equal(body.provisioning.publicUrl, 'https://node-0000.undefineds.co/')
  assert.equal(body.provisioning.cloudIdentityUrl, 'https://id.undefineds.co')
  assert.equal(body.provisioning.provisionCode, 'provision-code')
})

test('stored Cloud registration is ignored when no public URL can be recovered', (t) => {
  const { server, tmpDir } = loadWebServerWithStubs(t)
  fs.writeFileSync(path.join(tmpDir, '.env'), [
    'oidcIssuer=https://id.undefineds.co',
    'XPOD_CLOUD_API_ENDPOINT=https://api.undefineds.co',
    'XPOD_NODE_ID=node-123',
    'XPOD_NODE_TOKEN=node-token',
    'XPOD_SERVICE_TOKEN=service-token',
    'LINX_PROVISION_CODE=provision-code',
  ].join('\n'))

  assert.equal(server.readManagedCloudRegistration(), undefined)
})
