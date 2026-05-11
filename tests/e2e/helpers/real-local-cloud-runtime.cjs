const { randomInt } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const net = require('node:net')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '../..')

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

async function resolveRuntimePort() {
  const configured = Number.parseInt(process.env.LINX_REAL_LOCAL_PORT ?? '', 10)
  if (Number.isFinite(configured) && configured > 0) {
    const ports = Array.from({ length: 3 }, (_, index) => configured + index)
    const available = await Promise.all(ports.map(isPortFree))
    if (!available.every(Boolean)) {
      throw new Error(`LINX_REAL_LOCAL_PORT=${configured} 需要连续 3 个空闲端口：${ports.join(', ')}`)
    }
    return configured
  }

  if (process.env.LINX_REAL_LOCAL_TUNNEL_TOKEN) {
    const fixedCloudflaredIngressPort = 5737
    const ports = Array.from({ length: 3 }, (_, index) => fixedCloudflaredIngressPort + index)
    const available = await Promise.all(ports.map(isPortFree))
    if (!available.every(Boolean)) {
      throw new Error(
        `LINX_REAL_LOCAL_TUNNEL_TOKEN 当前默认要求 Cloudflare Tunnel ingress 指向 ${fixedCloudflaredIngressPort}。`
        + ` 请释放连续端口 ${ports.join(', ')}，或设置 LINX_REAL_LOCAL_PORT 并同步更新 Cloudflare Tunnel ingress。`,
      )
    }
    return fixedCloudflaredIngressPort
  }

  return findFreePortBlock()
}

function resolveRequiredPublicDomain() {
  const raw = process.env.LINX_REAL_LOCAL_PUBLIC_URL ?? process.env.LINX_REAL_LOCAL_DOMAIN ?? ''
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error(
      'Real Local -> Cloud 现网验证需要真实可达的 Local SP 公网/隧道地址。'
      + ' 请设置 LINX_REAL_LOCAL_PUBLIC_URL=https://your-domain.example/，'
      + '并把该域名转发到本机 LINX_REAL_LOCAL_PORT（默认随机，可设为 5737）。',
    )
  }

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const parsed = new URL(withScheme)
  if (parsed.protocol !== 'https:') {
    throw new Error('LINX_REAL_LOCAL_PUBLIC_URL 必须是 HTTPS 地址，Cloud OIDC + Local SP 远程路径不接受 HTTP 公网入口。')
  }
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('LINX_REAL_LOCAL_PUBLIC_URL 只能填写 origin，例如 https://pod.example.com/')
  }

  return parsed.hostname
}

function resolveOptionalTunnelToken() {
  const raw = process.env.LINX_REAL_LOCAL_TUNNEL_TOKEN ?? ''
  const trimmed = raw.trim()
  return trimmed || undefined
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

async function startRealLocalCloudRuntime(page) {
  return startRealLocalRuntime(page, {
    requirePublicDomain: true,
    startupMode: 'remote-ready',
    tmpPrefix: 'linx-prod-local-cloud-',
  })
}

async function startRealLocalDeviceRuntime(page) {
  return startRealLocalRuntime(page, {
    requirePublicDomain: false,
    startupMode: 'device-only',
    tmpPrefix: 'linx-prod-local-device-',
  })
}

async function startRealLocalRuntime(page, options) {
  const runId = pickRunId()
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), options.tmpPrefix))
  // xpod uses the requested port as a gateway, then allocates CSS/API on the
  // next ports. Pick a free block so CSS does not collide with another process.
  const port = await resolveRuntimePort()
  const publicDomain = options.requirePublicDomain ? resolveRequiredPublicDomain() : null
  const tunnelToken = options.requirePublicDomain ? resolveOptionalTunnelToken() : undefined
  const provider = {
    id: 'local',
    name: 'Local',
    issuerUrl: `http://127.0.0.1:${port}/`,
    managed: {
      status: 'stopped',
      dataDir: path.join(tmpDir, 'pod'),
      port,
      domain: publicDomain
        ? { type: 'custom', value: publicDomain }
        : { type: 'none' },
      tunnelToken,
    },
  }

  const restoreElectron = installElectronStub(tmpDir)

  let manager
  let controller
  let addEmbeddedAuthQuery
  let installXpodAuthEnhancer
  let pendingProvisionCode = null

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
      console.warn('[real-local-cloud] Failed to install auth enhancer:', error)
      return false
    })
  }

  page.on('load', () => {
    void installAuthEnhancerOnPage()
  })
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      void installAuthEnhancerOnPage()
    }
  })

  await page.exposeBinding('__linxDesktopInvoke', async (_source, payload) => {
    const args = payload.args ?? []
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
          startupMode: args[0]?.startupMode ?? options.startupMode,
        })
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
      case 'local:getSnapshot':
        return controller.getSnapshot()
      case 'local:chooseMode':
        return controller.chooseMode(args[0])
      case 'local:continue':
        return controller.continue()
      case 'local:refresh':
        return controller.refresh()
      case 'auth:getEmbeddedAuthorizationState':
        return { open: false, reason: 'dismissed', ready: false }
      case 'runtime:getDebugState': {
        const logPaths = manager.getLogPaths()
        const snapshot = await controller.refresh()
        return {
          snapshot,
          provider,
          logPaths,
          stdoutLog: readFileIfExists(logPaths.stdout),
          stderrLog: readFileIfExists(logPaths.stderr),
        }
      }
      default:
        throw new Error(`unknown desktop bridge method: ${payload.method}`)
    }
  })

  await page.addInitScript(() => {
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
          consumePendingRedirect: async () => null,
          onAuthorizationWindowState: () => () => undefined,
          onEmbeddedAuthorizationState: () => () => undefined,
          onRedirect: () => () => undefined,
        },
        localOnboarding: {
          getSnapshot: () => invoke('local:getSnapshot'),
          chooseMode: (mode) => invoke('local:chooseMode', mode),
          continue: () => invoke('local:continue'),
          refresh: () => invoke('local:refresh'),
          onStateChange: () => () => undefined,
        },
      },
    })
  })

  return {
    email: `linx-prod-${runId}@example.com`,
    password: 'TestIntegration123!',
    username: `linx${runId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`.slice(0, 20),
    getSnapshot: () => controller.refresh(),
    getDebugState: async () => {
      const logPaths = manager.getLogPaths()
      const snapshot = await controller.refresh()
      return {
        snapshot,
        provider,
        logPaths,
        stdoutLog: readFileIfExists(logPaths.stdout),
        stderrLog: readFileIfExists(logPaths.stderr),
      }
    },
    stop: async () => {
      await manager.stop().catch(() => undefined)
      restoreElectron()
      if (process.env.LINX_REAL_LOCAL_KEEP_RUNTIME === '1') {
        console.log(`[real-local-runtime] kept temporary runtime directory: ${tmpDir}`)
        return
      }
      fs.rmSync(tmpDir, { recursive: true, force: true })
    },
  }
}

module.exports = {
  startRealLocalDeviceRuntime,
  startRealLocalCloudRuntime,
}
