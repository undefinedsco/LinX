/**
 * xpod Module - Manages the Solid Pod server
 *
 * Priority:
 * 1. Use embedded/library runtime when available
 * 2. Fall back to legacy subprocess runtime
 */
import * as fs from 'fs'
import * as path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { getWebServerModule } from './web-server'
import { resolveLinxUserDataDir } from './linx-paths'

const XPOD_PACKAGE_CANDIDATES = ['@undefineds.co/xpod', 'xpod']
const CANONICAL_OIDC_ISSUER_ENV_KEY = 'oidcIssuer'
const DEFAULT_AUTH_MODE = 'acp'

type AuthMode = 'acp' | 'acl' | 'allow-all'

function readOidcIssuerEnv(env: Record<string, string | undefined>): string | undefined {
  const canonical = env[CANONICAL_OIDC_ISSUER_ENV_KEY]?.trim()
  return canonical || undefined
}

function isOidcIssuerPollutionKey(key: string): boolean {
  if (key === CANONICAL_OIDC_ISSUER_ENV_KEY) return false
  const normalized = key.toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normalized.includes('OIDCISSUER') ||
    normalized.includes('IDPURL') ||
    normalized.includes('IDPJWKSURL') ||
    normalized.includes('IDENTITYPROVIDERURL') ||
    normalized.includes('IDENTITYPROVIDERJWKSURL')
}

function removeOidcIssuerEnv(env: Record<string, string | undefined>): void {
  for (const key of Object.keys(env)) {
    if (key === CANONICAL_OIDC_ISSUER_ENV_KEY) delete env[key]
    if (isOidcIssuerPollutionKey(key)) {
      delete env[key]
    }
  }
}

function normalizeOidcIssuerEnv(env: Record<string, string | undefined>): void {
  const oidcIssuer = readOidcIssuerEnv(env)
  removeOidcIssuerEnv(env)
  if (oidcIssuer) {
    env[CANONICAL_OIDC_ISSUER_ENV_KEY] = oidcIssuer
  }
}

function normalizeAuthMode(value: string | undefined): AuthMode {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) return DEFAULT_AUTH_MODE

  if (normalized === 'acp' || normalized === 'acr') return 'acp'
  if (normalized === 'acl' || normalized === 'wac' || normalized === 'webacl') return 'acl'
  if (normalized === 'allow-all' || normalized === 'allowall') return 'allow-all'

  return DEFAULT_AUTH_MODE
}

function cssAuthModeConfigImports(authMode: AuthMode): string[] {
  switch (authMode) {
    case 'acl':
      return [
        'css:config/ldp/authorization/webacl.json',
        'css:config/util/auxiliary/acl.json',
      ]
    case 'allow-all':
      return [
        'css:config/ldp/authorization/allow-all.json',
        'css:config/util/auxiliary/empty.json',
      ]
    case 'acp':
    default:
      return [
        'css:config/ldp/authorization/acp.json',
        'css:config/util/auxiliary/acr.json',
      ]
  }
}

export interface XpodStatus {
  running: boolean
  port?: number
  baseUrl?: string
  publicUrl?: string
  pid?: number
}

interface XpodRuntime {
  source: string
  cwd: string
  entry: string
  packageDir: string
  version?: string
}

interface EmbeddedRuntimeModule {
  PACKAGE_ROOT: string
  GatewayProxy: new (port: number, supervisor: EmbeddedSupervisor, bindHost?: string) => EmbeddedGatewayProxy
  getFreePort: (startPort: number) => Promise<number>
}

interface EmbeddedSupervisor {
  register(config: {
    name: string
    command: string
    args: string[]
    env?: Record<string, string>
    cwd?: string
  }): void
  startAll(): Promise<void>
  stopAll(): Promise<void>
  getAllStatus(): Array<{ name: string; status: string }>
}

interface EmbeddedSupervisorModule {
  Supervisor: new () => EmbeddedSupervisor
}

interface EmbeddedGatewayProxy {
  setTargets(targets: { css?: string; api?: string }): void
  start(): void
  stop(): Promise<void>
}

interface EmbeddedRuntimeHandle {
  source: string
  packageDir: string
  version?: string
  port: number
  baseUrl: string
  publicUrl?: string
  supervisor: EmbeddedSupervisor
  proxy: EmbeddedGatewayProxy
}

function parseEnvFile(envPath: string): Record<string, string> {
  const env: Record<string, string> = {}
  if (!fs.existsSync(envPath)) {
    return env
  }

  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (match) {
      env[match[1]] = match[2]
    }
  }
  return env
}

export function buildRuntimeEnv(env: Record<string, string>, overrides: Record<string, string> = {}): Record<string, string> {
  const inherited = { ...process.env } as Record<string, string>
  removeOidcIssuerEnv(inherited)
  const runtimeEnv = {
    ...inherited,
    ...env,
    ...overrides,
  }
  normalizeOidcIssuerEnv(runtimeEnv)
  return runtimeEnv
}

export function buildCssRuntimeEnv(env: Record<string, string>, overrides: Record<string, string> = {}): Record<string, string> {
  const runtimeEnv = buildRuntimeEnv(env, overrides)
  delete runtimeEnv[CANONICAL_OIDC_ISSUER_ENV_KEY]
  return runtimeEnv
}

export function createEmbeddedCssRuntimeConfig(options: {
  configPath: string
  runtimeRoot: string
  authMode?: string
  oidcIssuer?: string
}): { configPath: string; cwd?: string } {
  fs.mkdirSync(options.runtimeRoot, { recursive: true })
  const runtimeConfigPath = path.join(options.runtimeRoot, 'css-runtime.config.json')
  const relativeConfigPath = path.relative(options.runtimeRoot, options.configPath).replace(/\\/g, '/')
  const authMode = normalizeAuthMode(options.authMode)
  fs.writeFileSync(runtimeConfigPath, JSON.stringify({
    '@context': [
      'https://linkedsoftwaredependencies.org/bundles/npm/@solid/community-server/^8.0.0/components/context.jsonld',
      'https://linkedsoftwaredependencies.org/bundles/npm/@undefineds.co/xpod/^0.0.0/components/context.jsonld',
      'https://linkedsoftwaredependencies.org/bundles/npm/asynchronous-handlers/^1.0.0/components/context.jsonld',
    ],
    import: [
      relativeConfigPath.startsWith('.') ? relativeConfigPath : `./${relativeConfigPath}`,
      ...cssAuthModeConfigImports(authMode),
    ],
    '@graph': [],
  }, null, 2), 'utf-8')

  if (options.oidcIssuer) {
    fs.writeFileSync(path.join(options.runtimeRoot, 'package.json'), JSON.stringify({
      private: true,
      name: 'linx-xpod-css-runtime',
    }, null, 2), 'utf-8')
    fs.writeFileSync(path.join(options.runtimeRoot, '.community-solid-server.config.json'), JSON.stringify({
      oidcIssuer: options.oidcIssuer,
    }, null, 2), 'utf-8')
  }

  return {
    configPath: runtimeConfigPath,
    cwd: options.oidcIssuer ? options.runtimeRoot : undefined,
  }
}

function getPackageBinEntry(packageDir: string, pkg: any): string | null {
  const binField = pkg?.bin
  if (!binField) return null

  if (typeof binField === 'string') {
    const resolved = path.join(packageDir, binField)
    return fs.existsSync(resolved) ? resolved : null
  }

  if (typeof binField === 'object') {
    const named = binField.xpod
    if (typeof named === 'string') {
      const resolved = path.join(packageDir, named)
      if (fs.existsSync(resolved)) return resolved
    }

    for (const value of Object.values(binField)) {
      if (typeof value !== 'string') continue
      const resolved = path.join(packageDir, value)
      if (fs.existsSync(resolved)) return resolved
    }
  }

  return null
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function canonicalizeIssuerUrl(url: string): string {
  return ensureTrailingSlash(new URL(url).href)
}

export function resolveExternalOidcIssuer(env: Record<string, string>): string | undefined {
  const issuer = readOidcIssuerEnv(env)
  return issuer ? canonicalizeIssuerUrl(issuer) : undefined
}

export function oidcTokenEndpoint(issuer: string): string {
  return new URL('/.oidc/token', canonicalizeIssuerUrl(issuer)).toString()
}

export function buildEmbeddedCssArgs(options: {
  cssBinary: string
  configPath: string
  cssModuleRoot: string
  cssPort: number
  hostBaseUrl: string
}): string[] {
  return [
    options.cssBinary,
    '-c', options.configPath,
    '-m', options.cssModuleRoot,
    '-p', options.cssPort.toString(),
    '-b', options.hostBaseUrl,
  ]
}

export function assertXpodLoginRuntimeCapabilities(packageDir: string): void {
  const hasScopedPickWebIdHandler =
    fs.existsSync(path.join(packageDir, 'src', 'identity', 'oidc', 'ScopedPickWebIdHandler.ts')) ||
    fs.existsSync(path.join(packageDir, 'dist', 'identity', 'oidc', 'ScopedPickWebIdHandler.js'))
  const hasScopedPickerConfig = hasRequiredStorageScopedPickerConfig(packageDir)

  if (hasScopedPickWebIdHandler && hasScopedPickerConfig) {
    return
  }

  throw new Error([
    `xpod runtime at ${packageDir} does not include scoped WebID selection.`,
    'Cloud IDP + Local SP login would be able to expose Pods from the wrong storage provider.',
    'Install an @undefineds.co/xpod version that contains ScopedPickWebIdHandler.storageBaseUrl before enabling oidcIssuer.',
  ].join('\n'))
}

function hasRequiredStorageScopedPickerConfig(packageDir: string): boolean {
  const configPath = path.join(packageDir, 'config', 'xpod.base.json')
  if (!fs.existsSync(configPath)) {
    return false
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const params = findOverrideParameters(config, 'ScopedPickWebIdHandler')
    return hasVariable(params, 'storageBaseUrl', 'urn:solid-server:default:variable:baseUrl')
  } catch {
    return false
  }
}

function findOverrideParameters(value: unknown, componentType: string): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findOverrideParameters(item, componentType)
      if (match) return match
    }
    return null
  }

  if (!value || typeof value !== 'object') {
    return null
  }

  const record = value as Record<string, unknown>
  const overrideParameters = record.overrideParameters
  if (
    overrideParameters &&
    typeof overrideParameters === 'object' &&
    !Array.isArray(overrideParameters) &&
    (overrideParameters as Record<string, unknown>)['@type'] === componentType
  ) {
    return overrideParameters as Record<string, unknown>
  }

  for (const child of Object.values(record)) {
    const match = findOverrideParameters(child, componentType)
    if (match) return match
  }

  return null
}

function hasVariable(params: Record<string, unknown> | null, key: string, variableId: string): boolean {
  const value = params?.[key]
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>)['@id'] === variableId &&
    (value as Record<string, unknown>)['@type'] === 'Variable',
  )
}

export function getBindHost(baseUrl: string): string {
  try {
    const hostname = new URL(baseUrl).hostname
    if (hostname === 'localhost') return '127.0.0.1'
    if (hostname === '::1') return '::1'
    if (hostname.startsWith('127.')) return hostname
  } catch {
    // ignore
  }

  return '0.0.0.0'
}

export class XpodModule {
  private process: ChildProcess | null = null
  private embedded: EmbeddedRuntimeHandle | null = null
  private ready = false

  private checkNodeVersion(): void {
    const version = process.version
    const majorVersion = parseInt(version.slice(1).split('.')[0], 10)

    if (majorVersion < 20) {
      throw new Error(
        `Node.js version mismatch. xpod requires Node.js 20.x or higher, but current version is ${version}.\n` +
        `Please install Node.js 20.x or higher using: nvm install 22 && nvm use 22`,
      )
    }
  }

  private resolveFromNpmPackage(): XpodRuntime | null {
    for (const packageName of XPOD_PACKAGE_CANDIDATES) {
      try {
        const packageJsonPath = require.resolve(`${packageName}/package.json`)
        const packageDir = path.dirname(packageJsonPath)
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

        const binEntry = getPackageBinEntry(packageDir, pkg)
        if (binEntry) {
          return {
            source: `npm:${packageName}`,
            cwd: packageDir,
            entry: binEntry,
            packageDir,
            version: pkg.version,
          }
        }

        const mainEntry = path.join(packageDir, 'dist', 'main.js')
        if (fs.existsSync(mainEntry)) {
          return {
            source: `npm:${packageName}`,
            cwd: packageDir,
            entry: mainEntry,
            packageDir,
            version: pkg.version,
          }
        }
      } catch {
        // Continue searching next candidate.
      }
    }

    return null
  }

  private resolveLegacyRuntime(): XpodRuntime | null {
    const devXpod = path.join(__dirname, '..', '..', '..', '..', '..', 'xpod')
    const siblingXpod = path.join(__dirname, '..', '..', '..', '..', '..', '..', 'xpod')
    const vendorXpod = path.join(__dirname, '..', '..', '..', '..', '..', 'vendor', 'xpod')

    const legacyCandidates = [devXpod, siblingXpod, vendorXpod]
    for (const candidate of legacyCandidates) {
      const distMain = path.join(candidate, 'dist', 'main.js')
      if (fs.existsSync(distMain)) {
        return {
          source: `legacy:${candidate}`,
          cwd: fs.realpathSync(candidate),
          entry: distMain,
          packageDir: fs.realpathSync(candidate),
        }
      }
    }

    const resourcesPath = (process as any).resourcesPath
    if (resourcesPath) {
      const packagedXpod = path.join(resourcesPath, 'xpod')
      const distMain = path.join(packagedXpod, 'dist', 'main.js')
      if (fs.existsSync(distMain)) {
        return {
          source: 'packaged-resource',
          cwd: packagedXpod,
          entry: distMain,
          packageDir: packagedXpod,
        }
      }
    }

    return null
  }

  private resolveRuntime(): XpodRuntime {
    const npmRuntime = this.resolveFromNpmPackage()
    if (npmRuntime) return npmRuntime

    const legacyRuntime = this.resolveLegacyRuntime()
    if (legacyRuntime) return legacyRuntime

    throw new Error(
      'xpod runtime not found. Please install @undefineds.co/xpod (or xpod), or provide a local xpod checkout.',
    )
  }

  private loadEmbeddedModules(runtime: XpodRuntime): {
    runtimeModule: EmbeddedRuntimeModule
    supervisorModule: EmbeddedSupervisorModule
  } | null {
    try {
      const runtimeModule = require(path.join(runtime.packageDir, 'dist', 'runtime')) as EmbeddedRuntimeModule
      const supervisorModule = require(path.join(runtime.packageDir, 'dist', 'supervisor')) as EmbeddedSupervisorModule

      if (!runtimeModule?.GatewayProxy || !runtimeModule?.getFreePort || !supervisorModule?.Supervisor) {
        return null
      }

      return { runtimeModule, supervisorModule }
    } catch {
      return null
    }
  }

  private async startEmbedded(runtime: XpodRuntime, envPath: string, env: Record<string, string>): Promise<void> {
    const modules = this.loadEmbeddedModules(runtime)
    if (!modules) {
      throw new Error('Embedded xpod runtime API not available')
    }

    const { runtimeModule, supervisorModule } = modules
    const requestedPort = parseInt(env.CSS_PORT || '5737', 10)
    const hostBaseUrl = ensureTrailingSlash(env.CSS_BASE_URL || `http://127.0.0.1:${requestedPort}`)
    const bindHost = getBindHost(hostBaseUrl)
    const oidcIssuer = resolveExternalOidcIssuer(env)
    const cssPort = await runtimeModule.getFreePort(requestedPort + 1)
    const apiPort = await runtimeModule.getFreePort(cssPort + 1)

    process.env.XPOD_ENV_PATH = envPath
    process.env.CSS_BASE_URL = hostBaseUrl

    const supervisor = new supervisorModule.Supervisor()
    const proxy = new runtimeModule.GatewayProxy(requestedPort, supervisor, bindHost)

    const cssBinary = require.resolve('@solid/community-server/bin/server.js')
    const cssModuleRoot = path.dirname(require.resolve('@solid/community-server/package.json'))
    const configPath = path.join(runtime.packageDir, 'config', 'local.json')
    const apiMain = path.join(runtime.packageDir, 'dist', 'api', 'main.js')

    const cssRuntimeConfig = createEmbeddedCssRuntimeConfig({
      configPath,
      runtimeRoot: path.join(resolveLinxUserDataDir(), 'xpod-css-runtime'),
      authMode: env.CSS_AUTH_MODE,
      oidcIssuer,
    })
    const cssArgs = buildEmbeddedCssArgs({
      cssBinary,
      configPath: cssRuntimeConfig.configPath,
      cssModuleRoot,
      cssPort,
      hostBaseUrl,
    })

    supervisor.register({
      name: 'css',
      command: process.execPath,
      args: cssArgs,
      cwd: cssRuntimeConfig.cwd ?? runtime.packageDir,
      env: buildCssRuntimeEnv(env, {
        CSS_PORT: cssPort.toString(),
        CSS_BASE_URL: hostBaseUrl,
      }),
    })

    supervisor.register({
      name: 'api',
      command: process.execPath,
      args: [apiMain],
      cwd: runtime.packageDir,
      env: buildRuntimeEnv(env, {
        API_PORT: apiPort.toString(),
        XPOD_MAIN_PORT: requestedPort.toString(),
        CSS_INTERNAL_URL: `http://localhost:${cssPort}`,
        CSS_BASE_URL: hostBaseUrl,
        CSS_TOKEN_ENDPOINT: oidcIssuer ? oidcTokenEndpoint(oidcIssuer) : `${hostBaseUrl}.oidc/token`,
      }),
    })

    proxy.setTargets({
      css: `http://localhost:${cssPort}`,
      api: `http://localhost:${apiPort}`,
    })

    console.log('[Xpod] Starting embedded runtime from', runtime.source, runtime.version ? `v${runtime.version}` : '')
    await supervisor.startAll()
    proxy.start()
    await this.waitForReady(requestedPort)

    this.embedded = {
      source: runtime.source,
      packageDir: runtime.packageDir,
      version: runtime.version,
      port: requestedPort,
      baseUrl: hostBaseUrl,
      publicUrl: env.CSS_PUBLIC_URL,
      supervisor,
      proxy,
    }
  }

  private async startLegacySubprocess(runtime: XpodRuntime, envPath: string, env: Record<string, string>): Promise<void> {
    const port = parseInt(env.CSS_PORT || '5737', 10)

    console.log('[Xpod] Runtime source:', runtime.source)
    console.log('[Xpod] Runtime cwd:', runtime.cwd)
    console.log('[Xpod] Runtime entry:', runtime.entry)
    console.log('[Xpod] Gateway port:', port)
    console.log('[Xpod] Using env file:', envPath)

    const args = [
      runtime.entry,
      '--port', port.toString(),
      '--env', envPath,
    ]

    const nodePath = process.execPath
    console.log('[Xpod] Using Node.js:', nodePath, '(version:', process.version + ')')

    this.process = spawn(nodePath, args, {
      cwd: runtime.cwd,
      env: buildRuntimeEnv(env, {
        CSS_PORT: port.toString(),
      }),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    this.process.stdout?.on('data', (data) => {
      console.log('[Xpod]', data.toString().trim())
    })

    this.process.stderr?.on('data', (data) => {
      console.error('[Xpod]', data.toString().trim())
    })

    this.process.on('exit', (code) => {
      console.log('[Xpod] Process exited with code:', code)
      this.process = null
      this.ready = false
    })

    this.process.on('error', (error) => {
      console.error('[Xpod] Process error:', error)
      this.process = null
      this.ready = false
    })

    await this.waitForReady(port)
  }

  async start(): Promise<void> {
    if (this.process || this.embedded) {
      console.log('[Xpod] Already running')
      return
    }

    this.checkNodeVersion()

    const envPath = getWebServerModule().getEnvPath()
    if (!fs.existsSync(envPath)) {
      throw new Error(`Env file not found: ${envPath}. Please run setup first.`)
    }

    const env = parseEnvFile(envPath)
    const dataDir = env.CSS_ROOT_FILE_PATH || path.join(resolveLinxUserDataDir(), 'pod')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
      console.log('[Xpod] Created data directory:', dataDir)
    }

    const runtime = this.resolveRuntime()
    if (resolveExternalOidcIssuer(env)) {
      assertXpodLoginRuntimeCapabilities(runtime.packageDir)
    }

    try {
      await this.startEmbedded(runtime, envPath, env)
      this.ready = true
      console.log('[Xpod] Embedded runtime is ready')
      return
    } catch (error) {
      console.warn('[Xpod] Embedded runtime unavailable, falling back to subprocess:', error)
    }

    await this.startLegacySubprocess(runtime, envPath, env)
    this.ready = true
    console.log('[Xpod] Legacy subprocess runtime is ready')
  }

  async stop(): Promise<void> {
    if (this.embedded) {
      const runtime = this.embedded
      this.embedded = null
      this.ready = false
      try {
        await runtime.proxy.stop()
      } finally {
        await runtime.supervisor.stopAll()
      }
      return
    }

    if (!this.process) {
      return
    }

    return new Promise((resolve) => {
      this.process!.on('exit', () => {
        this.process = null
        this.ready = false
        resolve()
      })

      this.process!.kill('SIGTERM')

      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL')
        }
      }, 5000)
    })
  }

  async restart(): Promise<void> {
    await this.stop()
    await this.start()
  }

  getStatus(): XpodStatus {
    const envPath = getWebServerModule().getEnvPath()
    const env = parseEnvFile(envPath)
    const port = parseInt(env.CSS_PORT || '5737', 10)
    const baseUrl = env.CSS_BASE_URL || `http://localhost:${port}`

    let publicUrl: string | undefined
    if (baseUrl.startsWith('https://') && !baseUrl.includes('localhost')) {
      publicUrl = baseUrl
    }

    if (this.embedded && this.ready) {
      return {
        running: true,
        port: this.embedded.port,
        baseUrl: this.embedded.baseUrl,
        publicUrl: this.embedded.publicUrl,
        pid: process.pid,
      }
    }

    if (!this.process || !this.ready) {
      return { running: false, port, baseUrl, publicUrl }
    }

    return {
      running: true,
      port,
      baseUrl,
      publicUrl,
      pid: this.process.pid,
    }
  }

  async healthCheck(): Promise<boolean> {
    const envPath = getWebServerModule().getEnvPath()
    const env = parseEnvFile(envPath)
    const port = parseInt(env.CSS_PORT || '5737', 10)

    try {
      const response = await fetch(`http://localhost:${port}/service/status`, {
        signal: AbortSignal.timeout(3000),
      })
      const status = await response.json() as Array<{ name: string; status: string }>
      // External xpod may return 503 while both workers in its structured
      // status payload are already running. Worker state is authoritative.
      return isXpodStatusReady(status)
    } catch {
      return false
    }
  }

  private async waitForReady(port: number, maxRetries = 60): Promise<void> {
    const gatewayUrl = `http://localhost:${port}/service/status`
    const rootUrl = `http://localhost:${port}/`

    for (let i = 0; i < maxRetries; i++) {
      try {
        const gatewayResponse = await fetch(gatewayUrl, {
          signal: AbortSignal.timeout(2000),
        })
        if (gatewayResponse.ok) {
          const status = await gatewayResponse.json() as Array<{ name: string; status: string }>
          if (isXpodStatusReady(status)) {
            return
          }
        } else {
          // /service/status exists but reports a degraded runtime; do not
          // hide API child failures behind the root CSS fallback.
          await new Promise((resolve) => setTimeout(resolve, 1000))
          continue
        }
      } catch {
        try {
          const rootResponse = await fetch(rootUrl, {
            signal: AbortSignal.timeout(2000),
            method: 'HEAD',
          })
          if (rootResponse.ok) {
            return
          }
        } catch {
          // Continue retrying.
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    throw new Error('xpod failed to start within timeout')
  }
}

export function isXpodStatusReady(status: Array<{ name?: string; status?: string }>): boolean {
  const cssStatus = status.find((item) => item.name === 'css')
  const apiStatus = status.find((item) => item.name === 'api')
  return cssStatus?.status === 'running' && apiStatus?.status === 'running'
}

let instance: XpodModule | null = null

export function getXpodModule(): XpodModule {
  if (!instance) {
    instance = new XpodModule()
  }
  return instance
}
