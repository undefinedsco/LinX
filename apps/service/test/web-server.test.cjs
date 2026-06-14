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
  const startCalls = []
  const runtimeSessions = options.runtimeSessions ?? []

  global.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init })
    if (options.aiResponse && String(url).endsWith('/v1/chat/completions')) {
      return options.aiResponse(url, init)
    }
    const statusCode = options.provisionStatus ?? 200
    return {
      ok: statusCode >= 200 && statusCode < 300,
      status: statusCode,
      async json() {
        return options.provisionResponse ?? {
          nodeId: 'node-123',
          nodeToken: 'node-token',
          serviceToken: 'service-token',
          provisionCode: 'provision-code',
          publicUrl: 'https://node-0000.undefineds.co/',
          spDomain: 'node-0000.undefineds.co',
          tunnelProvider: 'cloudflare',
          tunnelEndpoint: 'https://tunnel.example.com',
        }
      },
      async text() {
        return options.provisionText ?? ''
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
          start: async () => {
            startCalls.push({})
            if (options.xpodStartError) throw options.xpodStartError
          },
          stop: async () => {
            if (options.xpodStopError) throw options.xpodStopError
          },
          restart: async () => {
            if (options.xpodRestartError) throw options.xpodRestartError
          },
        }),
      }
    }

    if (request.endsWith('/runtime-threads') || request === './runtime-threads') {
      return {
        getRuntimeThreadsModule: () => ({
          listSessions: () => runtimeSessions,
          getSession: () => null,
          createSession: () => {
            if (options.runtimeCreateError) throw options.runtimeCreateError
            return {}
          },
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

  return { server, tmpDir, fetchCalls, startCalls }
}

function setupPayload(overrides = {}) {
  const tmpDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linx-service-pod-'))
  return {
    dataDir: tmpDataDir,
    port: 5737,
    autoStart: false,
    spaceKind: 'local',
    network: {
      accessMode: 'auto',
    },
    local: {
      nodeId: 'node-0000',
      deviceId: 'device-0000',
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

test('setup writes Cloud+Local user-managed canonical domain env when Local has a public domain', async (t) => {
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
  assert.equal(Object.hasOwn(JSON.parse(cloudCall.init.body), 'spDomain'), false)

  const env = fs.readFileSync(path.join(tmpDir, '.env'), 'utf-8')
  assert.match(env, /^CSS_BASE_URL=https:\/\/node-0000\.undefineds\.co$/m)
  assert.match(env, /^oidcIssuer=https:\/\/id\.undefineds\.co$/m)
  assert.doesNotMatch(env, new RegExp(`^${['OIDC', 'ISSUER'].join('_')}=`, 'm'))
  assert.match(env, /^XPOD_CLOUD_API_ENDPOINT=https:\/\/api\.undefineds\.co$/m)
  assert.match(env, /^XPOD_NODE_ID=node-123$/m)
  assert.match(env, /^LINX_NODE_ID=node-123$/m)
  assert.match(env, /^LINX_DEVICE_ID=device-0000$/m)
  assert.match(env, /^XPOD_NODE_TOKEN=node-token$/m)
  assert.match(env, /^XPOD_SERVICE_TOKEN=service-token$/m)
  assert.match(env, /^LINX_PROVISION_CODE=provision-code$/m)
  assert.match(env, /^LINX_PROVISION_URL=https:\/\/id\.undefineds\.co\/\.account\/\?provisionCode=provision-code$/m)
  assert.match(env, /^LINX_PUBLIC_DOMAIN=node-0000\.undefineds\.co$/m)
  assert.match(env, /^LINX_TUNNEL_PROVIDER=cloudflare$/m)
  assert.match(env, /^CLOUDFLARE_TUNNEL_TOKEN=cf-token$/m)
})

test('setup writes Cloud+Local Cloud-managed canonical domain env without a user domain', async (t) => {
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
  assert.equal(body.provisioning.cloudIdentityUrl, 'https://id.undefineds.co')
  assert.equal(body.provisioning.publicUrl, 'https://node-0000.undefineds.co/')

  const cloudCall = fetchCalls.find((call) => call.url === 'https://api.undefineds.co/provision/nodes')
  assert.ok(cloudCall)
  assert.deepEqual(JSON.parse(cloudCall.init.body), {
    localPort: 5737,
    domainMode: 'managed',
  })

  const env = fs.readFileSync(path.join(tmpDir, '.env'), 'utf-8')
  assert.match(env, /^CSS_BASE_URL=https:\/\/node-0000\.undefineds\.co$/m)
  assert.match(env, /^oidcIssuer=https:\/\/id\.undefineds\.co$/m)
  assert.doesNotMatch(env, new RegExp(`^${['OIDC', 'ISSUER'].join('_')}=`, 'm'))
  assert.match(env, /^XPOD_NODE_ID=node-123$/m)
  assert.match(env, /^LINX_NODE_ID=node-123$/m)
  assert.match(env, /^LINX_DEVICE_ID=device-0000$/m)
  assert.match(env, /^XPOD_NODE_TOKEN=node-token$/m)
  assert.match(env, /^XPOD_SERVICE_TOKEN=service-token$/m)
  assert.match(env, /^LINX_PROVISION_CODE=provision-code$/m)
  assert.match(env, /^LINX_SP_DOMAIN=node-0000\.undefineds\.co$/m)
  assert.doesNotMatch(env, /^LINX_PUBLIC_DOMAIN=/m)
})

test('setup returns user-facing copy when Local binding fails', async (t) => {
  const { server } = loadWebServerWithStubs(t, {
    provisionStatus: 400,
    provisionText: '{"error":"publicUrl is required","provisionCode":"secret-code"}',
  })
  const { listener, origin } = await listenOnRandomPort(server.app)
  t.after(() => listener.close())

  const response = await requestJson(origin, '/api/setup', {
    method: 'POST',
    body: setupPayload(),
  })

  assert.equal(response.status, 500)
  assert.equal(response.body.error, '本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。')
  assert.doesNotMatch(response.body.error, /publicUrl|provisionCode|secret-code/i)
})

test('service status exposes provisioning from generated env', async (t) => {
  const { server, tmpDir } = loadWebServerWithStubs(t, {
    status: {
      running: true,
      port: 5737,
      baseUrl: 'https://node-0000.undefineds.co/',
      publicUrl: 'https://node-0000.undefineds.co/',
    },
    runtimeSessions: [
      { id: 'idle', status: 'idle' },
      { id: 'active-1', status: 'active' },
      { id: 'active-2', status: 'active' },
      { id: 'paused', status: 'paused' },
      { id: 'error', status: 'error' },
    ],
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
    'LINX_SPACE_KIND=local',
  ].join('\n'))

  const response = await requestJson(origin, '/api/service/status')
  assert.equal(response.status, 200)
  const body = response.body
  assert.equal(body.pod.running, true)
  assert.equal(body.spaceKind, 'local')
  assert.equal(body.provisioning.publicUrl, 'https://node-0000.undefineds.co/')
  assert.equal(body.provisioning.cloudIdentityUrl, 'https://id.undefineds.co')
  assert.equal(body.provisioning.provisionCode, 'provision-code')
  assert.deepEqual(body.runtime.workers, {
    total: 5,
    running: 2,
    idle: 1,
    active: 2,
    paused: 1,
    completed: 0,
    error: 1,
  })
})

test('setup config separates SP node identity from runtime device identity', async (t) => {
  const { server, tmpDir } = loadWebServerWithStubs(t)
  const { listener, origin } = await listenOnRandomPort(server.app)
  t.after(() => listener.close())

  fs.writeFileSync(path.join(tmpDir, '.env'), [
    'CSS_ROOT_FILE_PATH=/tmp/linx-pod',
    'CSS_PORT=5737',
    'XPOD_NODE_ID=node-123',
    'LINX_NODE_ID=legacy-node',
    'LINX_DEVICE_ID=device-abc',
    'CSS_NODE_ID=css-node',
    'LINX_SPACE_KIND=local',
  ].join('\n'))

  const response = await requestJson(origin, '/api/setup/config')

  assert.equal(response.status, 200)
  assert.equal(response.body.nodeId, 'node-123')
  assert.equal(response.body.deviceId, 'device-abc')
})

test('setup config persists a generated runtime device identity', async (t) => {
  const previousDeviceId = process.env.LINX_DEVICE_ID
  delete process.env.LINX_DEVICE_ID
  t.after(() => {
    if (previousDeviceId === undefined) {
      delete process.env.LINX_DEVICE_ID
    } else {
      process.env.LINX_DEVICE_ID = previousDeviceId
    }
  })

  const { server, tmpDir } = loadWebServerWithStubs(t)
  const { listener, origin } = await listenOnRandomPort(server.app)
  t.after(() => listener.close())

  const first = await requestJson(origin, '/api/setup/config')
  const second = await requestJson(origin, '/api/setup/config')

  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.match(first.body.deviceId, /^device-[a-z0-9-]+$/)
  assert.equal(second.body.deviceId, first.body.deviceId)
  assert.equal(fs.readFileSync(path.join(tmpDir, '.device-id'), 'utf-8').trim(), first.body.deviceId)
})

test('service start accepts the configured Local space', async (t) => {
  const { server, tmpDir, startCalls } = loadWebServerWithStubs(t)
  const { listener, origin } = await listenOnRandomPort(server.app)
  t.after(() => listener.close())

  fs.writeFileSync(path.join(tmpDir, '.env'), [
    'LINX_SPACE_KIND=local',
    'CSS_PORT=5737',
  ].join('\n'))

  const response = await requestJson(origin, '/api/service/start', {
    method: 'POST',
    body: { spaceKind: 'local' },
  })

  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.equal(startCalls.length, 1)
})

test('service start rejects a requested space that does not match generated config', async (t) => {
  const { server, tmpDir, startCalls } = loadWebServerWithStubs(t)
  const { listener, origin } = await listenOnRandomPort(server.app)
  t.after(() => listener.close())

  fs.writeFileSync(path.join(tmpDir, '.env'), [
    'LINX_SPACE_KIND=local',
    'CSS_PORT=5737',
  ].join('\n'))

  const response = await requestJson(origin, '/api/service/start', {
    method: 'POST',
    body: { spaceKind: 'standalone' },
  })

  assert.equal(response.status, 409)
  assert.equal(response.body.configuredSpaceKind, 'local')
  assert.equal(response.body.requestedSpaceKind, 'standalone')
  assert.equal(startCalls.length, 0)
})

test('service start rejects invalid space values', async (t) => {
  const { server, startCalls } = loadWebServerWithStubs(t)
  const { listener, origin } = await listenOnRandomPort(server.app)
  t.after(() => listener.close())

  const response = await requestJson(origin, '/api/service/start', {
    method: 'POST',
    body: { spaceKind: 'legacy-local' },
  })

  assert.equal(response.status, 400)
  assert.equal(response.body.error, '当前页面和已启动的空间不一致。请回到空间选择页重新进入。')
  assert.equal(startCalls.length, 0)
})

test('service start failure returns user-facing copy without runtime details', async (t) => {
  const { server, tmpDir } = loadWebServerWithStubs(t, {
    xpodStartError: new Error("Cannot find module 'jsonld'\nRequire stack:\n- /Users/ganlu/Library/Application Support/@linx/xpod.js"),
  })
  const { listener, origin } = await listenOnRandomPort(server.app)
  t.after(() => listener.close())

  fs.writeFileSync(path.join(tmpDir, '.env'), [
    'LINX_SPACE_KIND=local',
    'CSS_PORT=5737',
  ].join('\n'))

  const response = await requestJson(origin, '/api/service/start', {
    method: 'POST',
    body: { spaceKind: 'local' },
  })

  assert.equal(response.status, 500)
  assert.equal(response.body.error, '本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。')
  assert.doesNotMatch(response.body.error, /jsonld|Require stack|Application Support|\/Users|xpod/i)
})

test('runtime API failures return user-facing copy without internal fields', async (t) => {
  const { server } = loadWebServerWithStubs(t, {
    runtimeCreateError: new Error('findById requires a base-relative resource id. Use findByIri(resource, iri) for full IRIs.'),
  })
  const { listener, origin } = await listenOnRandomPort(server.app)
  t.after(() => listener.close())

  const response = await requestJson(origin, '/api/runtime/threads', {
    method: 'POST',
    body: {
      threadId: 'thread-1',
      title: '测试会话',
      repoPath: '/tmp/repo',
    },
  })

  assert.equal(response.status, 500)
  assert.equal(response.body.error, '工作会话创建失败。请重新进入 LinX；如果仍失败，请换一个空间。')
  assert.doesNotMatch(response.body.error, /findById|resource id|IRI/i)
})

test('server AI proxy targets the running xpod runtime and ignores caller supplied upstream URLs', async (t) => {
  const { server, fetchCalls } = loadWebServerWithStubs(t, {
    status: {
      running: true,
      port: 5737,
      baseUrl: 'http://127.0.0.1:5737',
      publicUrl: undefined,
    },
    aiResponse: async () => new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  })
  const { listener, origin } = await listenOnRandomPort(server.app)
  t.after(() => listener.close())

  const response = await requestJson(origin, '/api/ai/chat/completions', {
    method: 'POST',
    body: {
      model: 'linx-lite',
      messages: [{ role: 'user', content: 'hi' }],
      upstreamUrl: 'https://evil.example/v1/chat/completions',
    },
  })

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { choices: [{ message: { content: 'ok' } }] })

  const aiCall = fetchCalls.find((call) => call.url === 'http://127.0.0.1:5737/v1/chat/completions')
  assert.ok(aiCall)
  assert.equal(fetchCalls.some((call) => call.url.includes('evil.example')), false)
  assert.equal(JSON.parse(aiCall.init.body).model, 'linx-lite')
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
