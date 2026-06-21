const { randomInt } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const http = require('node:http')
const https = require('node:https')
const net = require('node:net')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../../..')
const desktopLocalRegistrationPath = path.join(
  os.homedir(),
  'Library/Application Support/@linx/desktop/local/xpod-cloud-registration.json',
)


function isE2eDebugEnabled() {
  return process.env.LINX_E2E_DEBUG === '1' || process.env.LINX_E2E_DEBUG === 'true'
}

function debugLog(...args) {
  if (isE2eDebugEnabled()) console.log(...args)
}

function debugWarn(...args) {
  if (isE2eDebugEnabled()) console.warn(...args)
}

function pickRunId() {
  return `${Date.now().toString(36)}${randomInt(10_000).toString(36)}`.slice(-10)
}

function reservePort(port = 0) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('无法为 Local xpod 预留端口')))
        return
      }

      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve(address.port)
      })
    })
  })
}

async function isPortFree(port) {
  try {
    await reservePort(port)
    return true
  } catch {
    return false
  }
}

async function findFreePortBlock(size = 3) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const port = await reservePort()
    const ports = Array.from({ length: size }, (_, index) => port + index)
    const available = await Promise.all(ports.map(isPortFree))
    if (available.every(Boolean)) {
      return port
    }
  }

  throw new Error(`无法为 Local xpod 预留连续 ${size} 个端口`)
}

async function resolveRuntimePort(options = {}) {
  const configured = Number.parseInt(process.env.LINX_REAL_LOCAL_PORT ?? '', 10)
  if (Number.isFinite(configured) && configured > 0) {
    const ports = Array.from({ length: 3 }, (_, index) => configured + index)
    const available = await Promise.all(ports.map(isPortFree))
    if (!available.every(Boolean)) {
      throw new Error(`LINX_REAL_LOCAL_PORT=${configured} 需要连续 3 个空闲端口：${ports.join(', ')}`)
    }
    return configured
  }

  if (options.useSavedTunnelToken && resolveSavedTunnelToken()) {
    const fixedCloudflaredIngressPort = 5737
    const ports = Array.from({ length: 3 }, (_, index) => fixedCloudflaredIngressPort + index)
    const available = await Promise.all(ports.map(isPortFree))
    if (!available.every(Boolean)) {
      throw new Error(
        `保存的 Local Cloudflare Tunnel 当前默认要求 ingress 指向 ${fixedCloudflaredIngressPort}。`
        + ` 请释放连续端口 ${ports.join(', ')}，或设置 LINX_REAL_LOCAL_PORT 并同步更新 Cloudflare Tunnel ingress。`,
      )
    }
    return fixedCloudflaredIngressPort
  }

  return findFreePortBlock()
}

function resolveRequiredPublicDomain() {
  const raw = resolveSavedPublicLocalUrl()
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error(
      'Real Local -> Cloud 现网验证需要真实可达的 Local SP 公网/隧道地址。'
      + ` 请先通过桌面 Local 配置生成保存文件：${desktopLocalRegistrationPath}`,
    )
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const parsed = new URL(withScheme)
  if (parsed.protocol !== 'https:') {
    throw new Error('保存的 Local SP 公网入口必须是 HTTPS 地址，Cloud OIDC + Local SP 远程路径不接受 HTTP 公网入口。')
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('保存的 Local SP 公网入口只能是 origin，例如 https://pod.example.com/')
  }

  return parsed.hostname
}

function resolveOptionalPublicDomain() {
  const raw = resolveSavedPublicLocalUrl()
  return raw.trim() ? resolveRequiredPublicDomain() : null
}

function resolveOptionalTunnelToken() {
  const raw = resolveSavedTunnelToken() ?? ''
  const trimmed = raw.trim()
  return trimmed || undefined
}

function resolveSavedPublicLocalOrigin() {
  const raw = resolveSavedPublicLocalUrl()
  const trimmed = raw.trim()
  if (!trimmed) return null

  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    const parsed = new URL(withScheme)
    return parsed.protocol === 'https:' ? parsed.origin : null
  } catch {
    return null
  }
}

function resolveSavedPublicLocalUrl() {
  return readSavedLocalCloudRegistration()?.publicUrl ?? ''
}

function resolveSavedTunnelToken() {
  return readSavedLocalCloudRegistration()?.tunnelToken ?? ''
}

function readSavedLocalCloudRegistration() {
  try {
    const parsed = JSON.parse(fs.readFileSync(desktopLocalRegistrationPath, 'utf8'))
    const registration = parsed?.local
    return registration && typeof registration === 'object' ? registration : null
  } catch {
    return null
  }
}

function seedSavedLocalCloudRegistration(tmpDir) {
  const registration = readSavedLocalCloudRegistration()
  if (!registration) return

  fs.writeFileSync(
    path.join(tmpDir, 'xpod-cloud-registration.json'),
    JSON.stringify({ local: registration }, null, 2),
    { encoding: 'utf8', mode: 0o600 },
  )
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`
}

function resolveRuntimeDomainConfig(publicDomain, options = {}) {
  if (!publicDomain) {
    return { type: 'none' }
  }

  const normalized = publicDomain.trim().toLowerCase()
  if (options.treatAsExplicitPublicUrl) {
    return { type: 'custom', value: normalized }
  }

  if (/^node-[a-z0-9-]+\.undefineds\.co$/.test(normalized) || normalized.endsWith('.nodes.undefineds.co')) {
    return { type: 'managed', value: normalized }
  }

  return { type: 'custom', value: publicDomain }
}

function readFileIfExists(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
  } catch {
    return ''
  }
}

function resolveYarnBinary() {
  return process.platform === 'win32' ? 'yarn.cmd' : 'yarn'
}

function ensureDesktopModules() {
  const { resolveCompiledDesktopModule } = require('../../../apps/desktop/test/helpers.cjs')

  try {
    ensureCompiledDesktopBuildMetaFresh(resolveCompiledDesktopModule)
    return {
      xpodManagerPath: resolveCompiledDesktopModule('lib/xpod-manager.js'),
      localOnboardingPath: resolveCompiledDesktopModule('lib/local-onboarding.js'),
      xpodAuthEnhancerPath: resolveCompiledDesktopModule('lib/xpod-auth-enhancer.js'),
    }
  } catch {
    execFileSync(
      resolveYarnBinary(),
      ['workspace', '@linx/desktop', 'build'],
      {
        cwd: repoRoot,
        stdio: 'inherit',
        env: process.env,
      },
    )

    return {
      xpodManagerPath: resolveCompiledDesktopModule('lib/xpod-manager.js'),
      localOnboardingPath: resolveCompiledDesktopModule('lib/local-onboarding.js'),
      xpodAuthEnhancerPath: resolveCompiledDesktopModule('lib/xpod-auth-enhancer.js'),
    }
  }
}

function ensureCompiledDesktopBuildMetaFresh(resolveCompiledDesktopModule) {
  const sourceBuildMetaPath = path.resolve(repoRoot, 'apps/desktop/src/generated/build-meta.json')
  let compiledBuildMetaPath
  try {
    compiledBuildMetaPath = resolveCompiledDesktopModule('generated/build-meta.json')
  } catch {
    runDesktopBuild()
    return
  }

  const sourceVersion = readBuildMetaXpodVersion(sourceBuildMetaPath)
  const compiledVersion = readBuildMetaXpodVersion(compiledBuildMetaPath)
  const compiledXpodManagerPath = resolveCompiledDesktopModule('lib/xpod-manager.js')
  const sourceFiles = [
    path.resolve(repoRoot, 'apps/desktop/src/lib/xpod-manager.ts'),
    path.resolve(repoRoot, 'apps/desktop/src/lib/local-onboarding.ts'),
    path.resolve(repoRoot, 'apps/desktop/src/lib/xpod-auth-enhancer.ts'),
  ]
  const sourceChanged = sourceFiles.some((sourceFile) => isNewerThan(sourceFile, compiledXpodManagerPath))
  if (sourceVersion && compiledVersion && sourceVersion === compiledVersion && !sourceChanged) {
    return
  }

  debugLog(`[real-local-runtime] desktop build is stale: src=${sourceVersion ?? 'unknown'} compiled=${compiledVersion ?? 'unknown'} sourceChanged=${sourceChanged}`)
  runDesktopBuild()
}

function isNewerThan(sourcePath, targetPath) {
  try {
    return fs.statSync(sourcePath).mtimeMs > fs.statSync(targetPath).mtimeMs
  } catch {
    return true
  }
}

function readBuildMetaXpodVersion(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return typeof parsed?.xpodVersion === 'string' ? parsed.xpodVersion : null
  } catch {
    return null
  }
}

function runDesktopBuild() {
  execFileSync(
    resolveYarnBinary(),
    ['workspace', '@linx/desktop', 'build'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    },
  )
}

function installElectronStub(baseDir) {
  const originalLoad = Module._load

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') {
      return {
        app: {
          getPath: () => baseDir,
          isPackaged: false,
        },
      }
    }

    return originalLoad.call(this, request, parent, isMain)
  }

  return () => {
    Module._load = originalLoad
  }
}

async function startRealLocalCloudRuntime(page, overrides = {}) {
  return startRealLocalRuntime(page, {
    // Production Cloud creates/binds the Pod by calling the selected Local SP
    // from the server side. A Playwright browser route can help browser fetches,
    // but it cannot make the SP reachable from Cloud.
    requirePublicDomain: true,
    spaceKind: 'local',
    tmpPrefix: 'linx-prod-local-cloud-',
    ...overrides,
  })
}

async function startRealLocalDeviceRuntime(page, overrides = {}) {
  return startRealLocalRuntime(page, {
    requirePublicDomain: false,
    spaceKind: 'standalone',
    tmpPrefix: 'linx-prod-local-device-',
    ...overrides,
  })
}

async function startRealLocalRuntime(page, options) {
  const runId = pickRunId()
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), options.tmpPrefix))
  if (options.spaceKind === 'local' && options.requirePublicDomain) {
    seedSavedLocalCloudRegistration(tmpDir)
  }
  // xpod uses the requested port as a gateway, then allocates CSS/API on the
  // next ports. Pick a free block so CSS does not collide with another process.
  const port = await resolveRuntimePort({
    useSavedTunnelToken: Boolean(options.requirePublicDomain),
  })
  const configuredBaseUrl = typeof options.baseUrl === 'function'
    ? options.baseUrl(port)
    : options.baseUrl
  const publicDomain = options.spaceKind === 'local'
    ? options.requirePublicDomain
      ? resolveRequiredPublicDomain()
      : resolveOptionalPublicDomain()
    : null
  const tunnelToken = options.requirePublicDomain ? resolveOptionalTunnelToken() : undefined
  const provider = {
    id: 'local',
    name: 'Local',
    issuerUrl: `http://127.0.0.1:${port}/`,
    managed: {
      status: 'stopped',
      dataDir: path.join(tmpDir, 'pod'),
      port,
      domain: resolveRuntimeDomainConfig(publicDomain),
      tunnelToken,
    },
  }

  const restoreElectron = installElectronStub(tmpDir)

  let manager
  let controller
  let addEmbeddedAuthQuery
  let installXpodAuthEnhancer
  let pendingProvisionCode = null
  let pendingRedirectUrl = null
  let loopbackServer = null
  const bridgeCalls = []
  const installedBrowserRouteOrigins = new Set()

  try {
    const { xpodManagerPath, localOnboardingPath, xpodAuthEnhancerPath } = ensureDesktopModules()
    const xpodManagerModule = require(xpodManagerPath)
    const localOnboardingModule = require(localOnboardingPath)
    const xpodAuthEnhancerModule = require(xpodAuthEnhancerPath)
    const XpodManager = xpodManagerModule.XpodManager ?? xpodManagerModule.default?.XpodManager
    const LocalOnboardingController =
      localOnboardingModule.LocalOnboardingController
      ?? localOnboardingModule.default?.LocalOnboardingController
    addEmbeddedAuthQuery =
      xpodAuthEnhancerModule.addEmbeddedAuthQuery
      ?? xpodAuthEnhancerModule.default?.addEmbeddedAuthQuery
    installXpodAuthEnhancer =
      xpodAuthEnhancerModule.installXpodAuthEnhancer
      ?? xpodAuthEnhancerModule.default?.installXpodAuthEnhancer

    if (!XpodManager || !LocalOnboardingController || !addEmbeddedAuthQuery || !installXpodAuthEnhancer) {
      throw new Error('无法加载桌面端 Local onboarding 运行时')
    }

    const providerManager = {
      updateManagedStatus: (providerId, status) => {
        if (providerId === provider.id) {
          provider.managed.status = status
        }
      },
      getManagedPods: () => [provider],
      get: (providerId) => (providerId === provider.id ? provider : undefined),
      getDefault: () => undefined,
    }

    manager = new XpodManager(
      {},
      {
        getConfigPath: () => path.join(tmpDir, '.env.local'),
        getAll: () => ({
          CSS_EDITION: 'local',
          XPOD_MODE: 'local',
          ...(configuredBaseUrl ? { CSS_BASE_URL: configuredBaseUrl } : {}),
        }),
      },
      providerManager,
      tmpDir,
    )

    controller = new LocalOnboardingController({
      stateDir: tmpDir,
      xpodManager: manager,
      ensureBootstrapProvider: () => provider,
    })
    await controller.refresh()
    if (publicDomain && options.spaceKind === 'local') {
      await ensureBrowserRouteForOrigins({
        canonicalOrigin: `https://${publicDomain}`,
        accessOrigin: `http://127.0.0.1:${port}`,
      })
    }
  } catch (error) {
    restoreElectron()
    fs.rmSync(tmpDir, { recursive: true, force: true })
    throw error
  }

  async function installAuthEnhancerOnPage() {
    if (pendingProvisionCode) {
      await page.evaluate((provisionCode) => {
        window.sessionStorage.setItem('provisionCode', provisionCode)
      }, pendingProvisionCode).catch(() => undefined)
    }

    await installXpodAuthEnhancer({
      getURL: () => page.url(),
      executeJavaScript: (code) => page.evaluate((script) => {
        // eslint-disable-next-line no-eval
        return eval(script)
      }, code),
    }).catch((error) => {
      debugWarn('[real-local-cloud] Failed to install auth enhancer:', error)
      return false
    })
  }

  page.on('load', () => {
    void installAuthEnhancerOnPage()
  })
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      const url = frame.url()
      if (/\/auth\/callback(?:\?|$)/.test(url) && /[?&](?:code|error)=/.test(url)) {
        pendingRedirectUrl = url
        void emitAuthRedirectAvailable()
      }
      void installAuthEnhancerOnPage()
    }
  })

  await page.context().route('http://127.0.0.1:43123/auth/callback**', async (route) => {
    const callbackUrl = route.request().url()
    pendingRedirectUrl = callbackUrl
    debugLog(`[real-local-cloud] loopback callback ${redactSensitiveText(callbackUrl)}`)
    const appCallbackUrl = 'http://localhost:5173/auth/callback'
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: `<!doctype html><meta charset="utf-8"><script>location.replace(${JSON.stringify(appCallbackUrl)})</script>`,
    })
    void emitAuthRedirectAvailable()
  })

  loopbackServer = http.createServer((request, response) => {
    const requestUrl = `http://127.0.0.1:43123${request.url || '/'}`
    if (request.url?.startsWith('/auth/callback')) {
      pendingRedirectUrl = requestUrl
      debugLog(`[real-local-cloud] loopback callback ${redactSensitiveText(requestUrl)}`)
      const appCallbackUrl = 'http://localhost:5173/auth/callback'
      response.writeHead(302, { Location: appCallbackUrl })
      response.end()
      void emitAuthRedirectAvailable()
      return
    }

    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not Found')
  })
  await new Promise((resolve, reject) => {
    loopbackServer.once('error', reject)
    loopbackServer.listen(43123, '127.0.0.1', resolve)
  })

  async function ensureBrowserRouteForOrigins({ canonicalOrigin, accessOrigin, forceSameOrigin = false }) {
    const canonical = normalizeUrl(canonicalOrigin)
    if (!canonical || installedBrowserRouteOrigins.has(canonical.origin)) {
      return false
    }

    debugLog(`[real-local-cloud] installing browser route ${canonical.origin} -> ${accessOrigin}`)
    await installLocalSpBrowserRoute(page, {
      canonicalOrigin: canonical.origin,
      accessOrigin,
      forceSameOrigin,
    })
    installedBrowserRouteOrigins.add(canonical.origin)
    return true
  }

  async function ensureBrowserRoute() {
    if (options.spaceKind !== 'local' && options.spaceKind !== 'standalone') {
      return false
    }

    const snapshot = await controller.refresh()
    return ensureBrowserRouteForSnapshot(snapshot)
  }

  async function ensureBrowserRouteForSnapshot(snapshot) {
    if (options.spaceKind !== 'local' && options.spaceKind !== 'standalone') {
      return false
    }

    const canonical = normalizeUrl(snapshot.publicUrl ?? snapshot.baseUrl)
    const access = normalizeUrl(snapshot.localUrl ?? `http://127.0.0.1:${port}/`)
    const forceSameOrigin = options.spaceKind === 'standalone'
    if (!canonical || !access || (canonical.origin === access.origin && !forceSameOrigin)) {
      return false
    }

    return ensureBrowserRouteForOrigins({
      canonicalOrigin: canonical.origin,
      accessOrigin: access.origin,
      forceSameOrigin,
    })
  }

  async function withLocalBrowserRoute(snapshot) {
    await ensureBrowserRouteForSnapshot(snapshot).catch((error) => {
      debugWarn('[real-local-cloud] Failed to install browser route for snapshot:', error)
      return false
    })
    return snapshot
  }

  async function emitAuthRedirectAvailable() {
    await page.evaluate(() => {
      const emitter = window.__linxE2eEmitAuthRedirect
      if (typeof emitter === 'function') {
        emitter()
      }
    }).catch(() => undefined)
  }

  await page.exposeBinding('__linxDesktopInvoke', async (_source, payload) => {
    const args = payload.args ?? []
    bridgeCalls.push({
      method: payload.method,
      args: redactBridgeArgs(payload.method, args),
      at: new Date().toISOString(),
    })
    switch (payload.method) {
      case 'provider:list':
        return [provider]
      case 'provider:get':
        return args[0] === provider.id ? provider : undefined
      case 'provider:getDefault':
        return undefined
      case 'provider:add':
      case 'provider:update':
      case 'provider:remove':
      case 'provider:setDefault':
        return { success: true }
      case 'provider:detect':
        return { success: false }
      case 'xpod:start':
        await manager.start({
          ...args[0],
          spaceKind: args[0]?.spaceKind ?? options.spaceKind,
        })
        await ensureBrowserRoute()
        return { success: true }
      case 'xpod:stop':
        await manager.stop()
        return { success: true }
      case 'xpod:restart':
        await manager.restart()
        return { success: true }
      case 'xpod:status':
        return manager.getStatus()
      case 'xpod:healthCheck':
        return manager.healthCheck()
      case 'config:getAll':
        return { CSS_PORT: String(port) }
      case 'config:getSchema':
        return {}
      case 'config:getPath':
        return path.join(tmpDir, '.env.local')
      case 'config:update':
      case 'config:reset':
        return { success: true }
      case 'supervisor:getStatus':
        return []
      case 'dialog:selectDirectory':
        return null
      case 'app:getVersion':
        return '0.1.0-test'
      case 'app:getConfigWindowState':
        return { open: false, reason: 'closed', ready: false }
      case 'app:getUpdateStatus':
        return {
          currentVersion: '0.1.0-test',
          latestVersion: null,
          releaseUrl: null,
          checkedAt: null,
          available: false,
          source: 'github-release',
          error: null,
        }
      case 'app:openExternal':
      case 'app:openConfigWindow':
      case 'app:closeConfigWindow':
        return { success: true }
      case 'auth:rememberProvisionCode': {
        const value = typeof args[0] === 'string' ? args[0].trim() : ''
        pendingProvisionCode = value || null
        return { success: true }
      }
      case 'auth:prepareLoopbackRedirect':
        return 'http://127.0.0.1:43123/auth/callback'
      case 'auth:resolveOidcIssuer':
        await ensureBrowserRoute()
        return resolveOidcIssuerViaLocalTransport(args[0], controller)
      case 'local:getSnapshot':
        return controller.getSnapshot()
      case 'local:chooseMode':
      case 'local:chooseSpace':
        return controller.chooseSpace(args[0])
      case 'local:continue':
        return withLocalBrowserRoute(await controller.continue())
      case 'local:refresh':
        return withLocalBrowserRoute(await controller.refresh())
      case 'local:saveTunnelToken':
        return controller.saveTunnelToken(args[0] ?? {})
      case 'local:testConnectivity':
        return controller.testConnectivity()
      case 'auth:getEmbeddedAuthorizationState':
        return { open: false, reason: 'dismissed', ready: false }
      case 'auth:consumePendingRedirect': {
        const value = pendingRedirectUrl
        pendingRedirectUrl = null
        return value
      }
      case 'runtime:getDebugState': {
        const logPaths = manager.getLogPaths()
        const snapshot = await controller.refresh()
        return {
          snapshot: redactSnapshot(snapshot),
          provider: redactProvider(provider),
          logPaths,
          stdoutLog: redactSensitiveText(readFileIfExists(logPaths.stdout)),
          stderrLog: redactSensitiveText(readFileIfExists(logPaths.stderr)),
        }
      }
      default:
        throw new Error(`unknown desktop bridge method: ${payload.method}`)
    }
  })

  await page.addInitScript(() => {
    const authRedirectListeners = new Set()
    Object.defineProperty(window, '__linxE2eEmitAuthRedirect', {
      configurable: true,
      value: () => {
        for (const listener of Array.from(authRedirectListeners)) {
          try {
            listener()
          } catch {
            // Keep desktop bridge event delivery best-effort like Electron IPC.
          }
        }
      },
    })
    const withEmbeddedAuth = (url) => {
      try {
        const parsed = new URL(url)
        const pathname = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`
        if (
          pathname === '/.account/account/'
          || pathname === '/.account/oidc/consent/'
          || pathname === '/.account/login/password/'
          || pathname === '/.account/login/password/register/'
        ) {
          parsed.searchParams.set('embedded', '1')
        }
        return parsed.toString()
      } catch {
        return url
      }
    }
    const invoke = (method, ...args) => window.__linxDesktopInvoke({ method, args })

    Object.defineProperty(window, 'xpodDesktop', {
      configurable: true,
      value: {
        provider: {
          list: () => invoke('provider:list'),
          get: (id) => invoke('provider:get', id),
          getDefault: () => invoke('provider:getDefault'),
          add: (provider) => invoke('provider:add', provider),
          update: (id, updates) => invoke('provider:update', id, updates),
          remove: (id) => invoke('provider:remove', id),
          setDefault: (id) => invoke('provider:setDefault', id),
          detect: (url) => invoke('provider:detect', url),
        },
        xpod: {
          start: (options) => invoke('xpod:start', options),
          stop: () => invoke('xpod:stop'),
          restart: () => invoke('xpod:restart'),
          status: () => invoke('xpod:status'),
          healthCheck: () => invoke('xpod:healthCheck'),
        },
        config: {
          getAll: () => invoke('config:getAll'),
          getSchema: () => invoke('config:getSchema'),
          getPath: () => invoke('config:getPath'),
          update: (updates) => invoke('config:update', updates),
          reset: () => invoke('config:reset'),
        },
        supervisor: {
          getStatus: () => invoke('supervisor:getStatus'),
          onStatusChange: () => () => undefined,
        },
        dialog: {
          selectDirectory: () => invoke('dialog:selectDirectory'),
        },
        app: {
          getVersion: () => invoke('app:getVersion'),
          getConfigWindowState: () => invoke('app:getConfigWindowState'),
          getUpdateStatus: (force) => invoke('app:getUpdateStatus', force),
          openExternal: async (url) => {
            window.location.assign(url)
          },
          openConfigWindow: () => invoke('app:openConfigWindow'),
          closeConfigWindow: () => invoke('app:closeConfigWindow'),
          onConfigWindowState: () => () => undefined,
        },
        auth: {
          getEmbeddedAuthorizationState: () => invoke('auth:getEmbeddedAuthorizationState'),
          resolveOidcIssuer: (url) => invoke('auth:resolveOidcIssuer', url),
          prepareLoopbackRedirect: () => invoke('auth:prepareLoopbackRedirect'),
          openAuthorizationWindow: async (url) => {
            window.location.assign(url)
          },
          openEmbeddedAuthorization: async (url) => {
            try {
              const provisionCode = new URL(url).searchParams.get('provisionCode')
              if (provisionCode) {
                await invoke('auth:rememberProvisionCode', provisionCode)
              }
            } catch {
              // ignore
            }
            window.location.assign(withEmbeddedAuth(url))
          },
          closeEmbeddedAuthorization: async () => undefined,
          consumePendingRedirect: () => invoke('auth:consumePendingRedirect'),
          onAuthorizationWindowState: () => () => undefined,
          onEmbeddedAuthorizationState: () => () => undefined,
          onRedirect: (callback) => {
            authRedirectListeners.add(callback)
            return () => {
              authRedirectListeners.delete(callback)
            }
          },
        },
        localOnboarding: {
          getSnapshot: () => invoke('local:getSnapshot'),
          chooseSpace: (spaceKind) => invoke('local:chooseSpace', spaceKind),
          continue: () => invoke('local:continue'),
          refresh: () => invoke('local:refresh'),
          saveTunnelToken: (input) => invoke('local:saveTunnelToken', input),
          testConnectivity: () => invoke('local:testConnectivity'),
          onStateChange: () => () => undefined,
        },
      },
    })
  })

  const username = `linx${runId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`.slice(0, 20)
  return {
    email: `linx-prod-${runId}@example.com`,
    password: 'TestIntegration123!',
    username,
    localPodName: `${username.slice(0, 16)}pod`,
    port,
    baseUrl: configuredBaseUrl ? ensureTrailingSlash(configuredBaseUrl) : null,
    start: async () => {
      const current = await controller.refresh()
      if (current?.spaceKind !== options.spaceKind) {
        await controller.chooseSpace(options.spaceKind)
      }
      return withLocalBrowserRoute(await controller.continue())
    },
    getSnapshot: () => controller.refresh(),
    ensureBrowserRoute,
    getDebugState: async () => {
      const logPaths = manager.getLogPaths()
      const snapshot = await controller.refresh()
      return {
        snapshot: redactSnapshot(snapshot),
        provider: redactProvider(provider),
        bridgeCalls,
        logPaths,
        stdoutLog: redactSensitiveText(readFileIfExists(logPaths.stdout)),
        stderrLog: redactSensitiveText(readFileIfExists(logPaths.stderr)),
      }
    },
    stop: async () => {
      await manager.stop().catch(() => undefined)
      if (loopbackServer) {
        await new Promise((resolve) => loopbackServer.close(() => resolve()))
        loopbackServer = null
      }
      restoreElectron()
      if (process.env.LINX_REAL_LOCAL_KEEP_RUNTIME === '1') {
        debugLog(`[real-local-runtime] kept temporary runtime directory: ${tmpDir}`)
        return
      }
      fs.rmSync(tmpDir, { recursive: true, force: true })
    },
  }
}

async function resolveOidcIssuerViaLocalTransport(entryUrl, controller) {
  const entry = normalizeUrl(entryUrl)
  if (!entry) {
    return null
  }

  const snapshot = await controller.refresh()
  const canonical = normalizeUrl(snapshot.publicUrl ?? snapshot.baseUrl)
  const access = normalizeUrl(snapshot.localUrl)
  if (!canonical || !access || entry.origin !== canonical.origin) {
    return null
  }

  const configUrl = new URL('/.well-known/openid-configuration', access).href
  const response = await fetch(configUrl, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Forwarded-Host': canonical.host,
      'X-Forwarded-Proto': canonical.protocol.replace(':', ''),
    },
  })
  if (!response.ok) {
    throw new Error(`Local OIDC discovery failed: HTTP ${response.status}`)
  }

  const payload = await response.json().catch(() => null)
  const issuer = typeof payload?.issuer === 'string' && payload.issuer.trim().length > 0
    ? payload.issuer.trim()
    : canonical.href
  return issuer.replace(/\/$/, '')
}

function normalizeUrl(url) {
  if (typeof url !== 'string' || url.trim().length === 0) {
    return null
  }
  try {
    const parsed = new URL(url)
    return parsed
  } catch {
    return null
  }
}

async function installLocalSpBrowserRoute(page, { canonicalOrigin, accessOrigin, forceSameOrigin = false }) {
  const canonical = normalizeUrl(canonicalOrigin)
  const access = normalizeUrl(accessOrigin)
  if (!canonical || !access || (canonical.origin === access.origin && !forceSameOrigin)) {
    return
  }

  await page.context().route((url) => url.origin === canonical.origin, async (route) => {
    const request = route.request()
    debugLog(`[real-local-cloud] route ${request.method()} ${request.url()}`)
    const requestUrl = normalizeUrl(request.url())
    if (!requestUrl || requestUrl.origin !== canonical.origin) {
      await route.continue()
      return
    }

    if (request.method().toUpperCase() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: createCorsHeaders(request.headers()),
        body: '',
      })
      return
    }

    const forwardedUrl = rewriteUrlOrigin(requestUrl, access.origin)
    const requestHeaders = createForwardHeaders(request.headers(), canonical)
    const init = {
      method: request.method(),
      headers: requestHeaders,
      redirect: 'manual',
    }
    const body = request.postDataBuffer()
    if (body && !['GET', 'HEAD'].includes(request.method().toUpperCase())) {
      init.body = body
      requestHeaders['content-length'] = String(body.byteLength)
    }
    try {
      const response = await forwardHttpRequest(forwardedUrl, init)
      const location = response.headers.get('location')
      debugLog(`[real-local-cloud] route response ${response.status} ${request.url()} <- ${response.url}${location ? ` location=${location}` : ''}`)
      const headers = createFulfillHeaders(response.headers, request.headers(), canonical, access)
      if (isDocumentRedirect(response.status, location, request)) {
        const redirectUrl = resolveCanonicalRedirectLocation(location, requestUrl, canonical, access)
        for (const key of Object.keys(headers)) {
          if (key.toLowerCase() === 'location') {
            delete headers[key]
          }
        }
        await route.fulfill({
          status: 200,
          headers: {
            ...headers,
            'content-type': 'text/html; charset=utf-8',
          },
          body: buildRedirectShim(redirectUrl),
        })
        return
      }
      const responseBody = response.body
      logOidcKeyMaterial(requestUrl, response, responseBody)
      await route.fulfill({
        status: response.status,
        headers,
        body: responseBody,
      })
    } catch (error) {
      debugWarn('[real-local-cloud] Local SP browser route failed:', error)
      await route.abort('connectionrefused')
    }
  })
}

function forwardHttpRequest(rawUrl, init) {
  const url = new URL(rawUrl)
  const transport = url.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: init.method,
      headers: init.headers,
      insecureHTTPParser: true,
      timeout: 30_000,
    }, (response) => {
      if (shouldResolveWithoutBody(init.method, response)) {
        response.resume()
        resolve({
          status: response.statusCode || 0,
          headers: wrapNodeResponseHeaders(response.headers),
          url: rawUrl,
          body: Buffer.alloc(0),
        })
        return
      }

      const chunks = []
      response.on('data', (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      response.on('end', () => {
        resolve({
          status: response.statusCode || 0,
          headers: wrapNodeResponseHeaders(response.headers),
          url: rawUrl,
          body: Buffer.concat(chunks),
        })
      })
    })

    request.on('timeout', () => {
      request.destroy(new Error(`Local SP proxy request timed out: ${rawUrl}`))
    })
    request.on('error', reject)

    if (init.body) {
      request.write(init.body)
    }
    request.end()
  })
}

function shouldResolveWithoutBody(method, response) {
  const status = response.statusCode || 0
  if (String(method).toUpperCase() === 'HEAD') {
    return true
  }
  if (status === 204 || status === 205 || status === 304) {
    return true
  }
  const length = response.headers['content-length']
  if (length === '0') {
    return true
  }
  return status === 201 && !length
}

function wrapNodeResponseHeaders(headers) {
  const normalized = new Map()
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'undefined') {
      continue
    }
    normalized.set(key.toLowerCase(), value)
  }

  return {
    *entries() {
      for (const [key, value] of normalized.entries()) {
        if (Array.isArray(value)) {
          yield [key, value.join(', ')]
        } else {
          yield [key, String(value)]
        }
      }
    },
    get(name) {
      const value = normalized.get(String(name).toLowerCase())
      if (Array.isArray(value)) {
        return value.join(', ')
      }
      return typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : null
    },
    getSetCookie() {
      const value = normalized.get('set-cookie')
      if (Array.isArray(value)) {
        return value
      }
      return typeof value === 'string' ? [value] : []
    },
  }
}

function logOidcKeyMaterial(requestUrl, response, body) {
  if (!process.env.LINX_DEBUG_OIDC_KEYS) {
    return
  }

  try {
    if (requestUrl.pathname === '/.oidc/token') {
      const payload = JSON.parse(body.toString('utf8'))
      const idToken = typeof payload.id_token === 'string' ? payload.id_token : ''
      const accessToken = typeof payload.access_token === 'string' ? payload.access_token : ''
      debugLog(`[real-local-cloud] oidc-token status=${response.status} id=${describeJwt(idToken)} access=${describeJwt(accessToken)}`)
      return
    }

    if (requestUrl.pathname === '/.oidc/jwks') {
      const payload = JSON.parse(body.toString('utf8'))
      const keys = Array.isArray(payload.keys)
        ? payload.keys.map((key) => ({
            kid: key && typeof key.kid === 'string' ? key.kid : null,
            alg: key && typeof key.alg === 'string' ? key.alg : null,
            kty: key && typeof key.kty === 'string' ? key.kty : null,
            crv: key && typeof key.crv === 'string' ? key.crv : null,
          }))
        : []
      debugLog(`[real-local-cloud] oidc-jwks status=${response.status} keys=${JSON.stringify(keys)}`)
    }
  } catch (error) {
    debugWarn('[real-local-cloud] failed to inspect OIDC key material:', error)
  }
}

function describeJwt(token) {
  if (!token) {
    return 'none'
  }

  try {
    const [headerPart, payloadPart] = token.split('.')
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'))
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'))
    return JSON.stringify({
      kid: typeof header.kid === 'string' ? header.kid : null,
      alg: typeof header.alg === 'string' ? header.alg : null,
      iss: typeof payload.iss === 'string' ? payload.iss : null,
      webid: typeof payload.webid === 'string' ? payload.webid : null,
      sub: typeof payload.sub === 'string' ? payload.sub : null,
    })
  } catch {
    return 'unparseable'
  }
}

function rewriteUrlOrigin(url, targetOrigin) {
  const target = new URL(url.href)
  const origin = new URL(targetOrigin)
  target.protocol = origin.protocol
  target.host = origin.host
  return target.href
}

function createForwardHeaders(headers, canonical) {
  const forwarded = { ...headers }
  delete forwarded.connection
  delete forwarded['content-length']
  delete forwarded['transfer-encoding']
  forwarded.host = canonical.host
  forwarded['x-forwarded-host'] = canonical.host
  forwarded['x-forwarded-proto'] = canonical.protocol.replace(':', '')
  forwarded['accept-encoding'] = 'identity'
  return forwarded
}

function createFulfillHeaders(responseHeaders, requestHeaders, canonical, access) {
  const headers = {}
  for (const [key, value] of responseHeaders.entries()) {
    const lower = key.toLowerCase()
    if (
      lower === 'content-encoding'
      || lower === 'content-length'
      || lower === 'transfer-encoding'
      || lower === 'connection'
    ) {
      continue
    }
    if (lower === 'location') {
      headers[key] = rewriteHeaderUrl(value, access.origin, canonical.origin)
      continue
    }
    headers[key] = value
  }
  const setCookie = readSetCookieHeaders(responseHeaders)
  if (setCookie.length === 1) {
    headers['set-cookie'] = setCookie[0]
  } else if (setCookie.length > 1) {
    headers['set-cookie'] = setCookie.join('\n')
  }

  return {
    ...headers,
    ...createCorsHeaders(requestHeaders),
  }
}

function readSetCookieHeaders(headers) {
  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie()
  }
  const value = headers.get?.('set-cookie')
  return value ? [value] : []
}

function createCorsHeaders(requestHeaders) {
  const origin = requestHeaders.origin || '*'
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': requestHeaders['access-control-request-headers'] || 'authorization,content-type,accept,dpop',
    vary: 'Origin',
  }
}

function isDocumentRedirect(status, location, request) {
  return status >= 300
    && status < 400
    && typeof location === 'string'
    && location.length > 0
    && request.resourceType() === 'document'
}

function resolveCanonicalRedirectLocation(location, requestUrl, canonical, access) {
  const resolved = new URL(location, requestUrl.href).href
  return rewriteHeaderUrl(resolved, access.origin, canonical.origin)
}

function buildRedirectShim(url) {
  const serialized = JSON.stringify(url)
  const escaped = escapeHtml(url)
  return `<!doctype html><meta charset="utf-8"><title>Redirecting</title><script>window.location.replace(${serialized});</script><a href="${escaped}">Continue</a>`
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function rewriteHeaderUrl(value, fromOrigin, toOrigin) {
  if (typeof value !== 'string' || value.length === 0) {
    return value
  }
  return value.replaceAll(fromOrigin, toOrigin)
}

function redactBridgeArgs(method, args) {
  if (!Array.isArray(args)) return []
  if (!String(method).includes('xpod:start')) return args
  return args.map((arg) => {
    if (!arg || typeof arg !== 'object') return arg
    return {
      ...arg,
      tunnelToken: arg.tunnelToken ? '<redacted>' : arg.tunnelToken,
    }
  })
}

function redactProvider(provider) {
  if (!provider || typeof provider !== 'object') return provider
  const managed = provider.managed && typeof provider.managed === 'object'
    ? {
        ...provider.managed,
        tunnelToken: provider.managed.tunnelToken ? '<redacted>' : provider.managed.tunnelToken,
      }
    : provider.managed
  return {
    ...provider,
    managed,
  }
}

function redactSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot
  return redactSensitiveValue(snapshot)
}

function redactSensitiveValue(value) {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveValue)
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    isSensitiveKey(key) && nested
      ? '<redacted>'
      : redactSensitiveValue(nested),
  ]))
}

function redactSensitiveText(value) {
  return String(value || '')
    .replace(/(CLOUDFLARE_TUNNEL_TOKEN:)[^\s\]]+/g, '$1<redacted>')
    .replace(/(token:)\s*[^,\s\]]+/gi, '$1 <redacted>')
}

function isSensitiveKey(key) {
  return /token|secret|password|provisionCode/i.test(key)
}

module.exports = {
  resolveSavedPublicLocalOrigin,
  startRealLocalDeviceRuntime,
  startRealLocalCloudRuntime,
}
