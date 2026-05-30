/**
 * Web Server Module - Serves LinX Web UI
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { app } from 'electron'
import express, { Express, Request, Response } from 'express'
import { Server } from 'http'
import { getXpodModule } from './xpod'
import { getRuntimeThreadsModule } from './runtime-threads'
import { resolveLinxDefaultWorkspaceDir, resolveLinxUserDataDir } from './linx-paths'

const OFFICIAL_CLOUD_IDENTITY_ORIGIN = 'https://id.undefineds.co'
const OFFICIAL_CLOUD_API_ORIGIN = 'https://api.undefineds.co'
const MANAGED_CLOUD_REGISTRATION_TIMEOUT_MS = 30000

interface SetupData {
  dataDir: string
  port: number
  autoStart: boolean
  spaceKind: 'local' | 'standalone'
  domainSource?: 'manual'
  network: {
    accessMode: 'auto' | 'tunnel'
    tunnelProvider?: 'cloudflare' | 'sakura'
    tunnelToken?: string
  }
  local?: {
    nodeId?: string
    deviceId?: string
  }
  standalone?: {
    customDomain?: string
    oidcIssuer?: string
  }
  publicDomain?: string
  autoDetectPublicIp?: boolean
  httpsCertPath?: string
}

type ServiceSpaceKind = SetupData['spaceKind']

interface RuntimeStatusSummary {
  total: number
  running: number
  idle: number
  active: number
  paused: number
  completed: number
  error: number
}

function normalizeSetupData(data: SetupData): SetupData {
  if (data.spaceKind === 'local') {
    return {
      ...data,
      domainSource: 'manual',
      publicDomain: normalizeDomain(data.publicDomain),
      httpsCertPath: undefined,
      standalone: undefined,
    }
  }

  return {
    ...data,
    domainSource: 'manual',
    publicDomain: normalizeDomain(data.publicDomain),
    standalone: data.standalone
      ? {
          ...data.standalone,
          customDomain: normalizeDomain(data.standalone.customDomain),
        }
      : data.standalone,
  }
}

interface ManagedCloudRegistration {
  nodeId: string
  nodeToken: string
  serviceToken: string
  provisionCode: string
  publicUrl: string
  provisionUrl: string
  cloudIdentityUrl: string
  cloudApiUrl: string
  spDomain?: string
  tunnelToken?: string
  tunnelProvider?: string
  tunnelEndpoint?: string
}

interface ProvisionNodeRequest {
  publicUrl?: string
  nodeId?: string
  nodeToken?: string
  serviceToken?: string
  localPort?: number
  tunnelToken?: string
  // Cloud provisioning API fields, not LinX Local/Standalone runtime modes.
  tunnelMode?: 'client'
  domainMode?: 'managed' | 'self-managed'
  spDomain?: string
}

interface ProvisionNodeResponse {
  nodeId?: string
  nodeToken?: string
  serviceToken?: string
  provisionCode?: string
  publicUrl?: string
  spDomain?: string
  tunnelToken?: string
  tunnelProvider?: string
  tunnelEndpoint?: string
}

function normalizeUrl(value: string): string {
  return value.replace(/\/$/, '')
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function normalizeDomain(value?: string | null): string | undefined {
  const normalized = (value || '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
  return normalized || undefined
}

function publicUrlFromDomain(domain: string): string {
  const normalized = normalizeDomain(domain)
  if (!normalized) {
    throw new Error('publicDomain is required for Local user-managed canonical domain provisioning')
  }
  return ensureTrailingSlash(`https://${normalized}`)
}

function parseEnvLine(line: string): [string, string] | undefined {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
  return match ? [match[1], match[2]] : undefined
}

function buildProvisionUrl(cloudIdentityUrl: string, provisionCode: string): string {
  const url = new URL('/.account/', `${normalizeUrl(cloudIdentityUrl)}/`)
  url.searchParams.set('provisionCode', provisionCode)
  return url.toString()
}

function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

function parseServiceSpaceKind(value: unknown): ServiceSpaceKind | undefined {
  return value === 'local' || value === 'standalone' ? value : undefined
}

function isInvalidServiceSpaceKind(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '' && !parseServiceSpaceKind(value)
}

function summarizeRuntimeWorkers(rows: Array<{ status?: string }>): RuntimeStatusSummary {
  const summary: RuntimeStatusSummary = {
    total: rows.length,
    running: 0,
    idle: 0,
    active: 0,
    paused: 0,
    completed: 0,
    error: 0,
  }

  for (const row of rows) {
    switch (row.status) {
      case 'active':
        summary.active += 1
        summary.running += 1
        break
      case 'paused':
        summary.paused += 1
        break
      case 'completed':
        summary.completed += 1
        break
      case 'error':
        summary.error += 1
        break
      case 'idle':
      default:
        summary.idle += 1
        break
    }
  }

  return summary
}

function readProvisionPublicUrlFromEnv(env: Record<string, string>): string | undefined {
  const domain = normalizeDomain(env.LINX_PUBLIC_DOMAIN)
  if (domain) return publicUrlFromDomain(domain)

  const baseUrl = env.CSS_BASE_URL?.trim()
  return baseUrl ? ensureTrailingSlash(baseUrl) : undefined
}

function derivePublicUrlFromSpDomain(spDomain?: string): string | undefined {
  const domain = normalizeDomain(spDomain)
  return domain ? publicUrlFromDomain(domain) : undefined
}

function getConfigDir(): string {
  return resolveLinxUserDataDir()
}

function getEnvPath(): string {
  return path.join(getConfigDir(), '.env')
}

function getSetupFlagPath(): string {
  return path.join(getConfigDir(), '.setup-complete')
}

function normalizeNodeId(value?: string | null): string {
  const normalized = (value || '')
    .trim()
    .toLowerCase()
    .replace(/^node-+/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!normalized) {
    return 'local'
  }

  if (normalized.length <= 12) {
    return normalized
  }

  return normalized.slice(0, 12).replace(/-+$/g, '') || 'local'
}

function getDefaultNodeId() {
  return normalizeNodeId(
    process.env.LINX_NODE_ID
    || process.env.LINX_DEVICE_ID
    || process.env.CSS_NODE_ID
    || os.hostname()
    || 'local',
  )
}

export class WebServerModule {
  private app: Express
  private server: Server | null = null

  constructor() {
    this.app = express()
    this.setupRoutes()
  }

  /**
   * Get the web app dist directory
   */
  private getWebDistDir(): string {
    // In development: apps/web/dist
    const devDist = path.join(__dirname, '..', '..', '..', 'web', 'dist')
    if (fs.existsSync(devDist)) {
      return devDist
    }

    // Packaged app
    const resourcesPath = (process as any).resourcesPath
    if (resourcesPath) {
      return path.join(resourcesPath, 'web')
    }

    console.warn('[WebServer] Web dist directory not found, using dev dist path')
    return devDist
  }

  /**
   * Generate .env file content
   */
  private generateEnvContent(data: SetupData, provisioning?: ManagedCloudRegistration): string {
    const normalized = normalizeSetupData(data)
    const { port, dataDir, spaceKind, domainSource, network, local, standalone, publicDomain } = normalized

    // Build base URL
    let baseUrl: string
    const localNodeId = normalizeNodeId(local?.nodeId || local?.deviceId)

    if (provisioning) {
      baseUrl = normalizeUrl(provisioning.publicUrl)
    } else if (spaceKind === 'local' && publicDomain) {
      baseUrl = `https://${publicDomain}`
    } else if (spaceKind === 'standalone' && standalone?.customDomain) {
      baseUrl = `https://${standalone.customDomain}`
    } else {
      baseUrl = `http://localhost:${port}`
    }

    const lines = [
      '# Generated by LinX Service',
      `XPOD_EDITION=local`,
      `CSS_EDITION=local`,
      `CSS_PORT=${port}`,
      `CSS_BASE_URL=${baseUrl}`,
      `CSS_LOGGING_LEVEL=info`,
      `CSS_SHOW_STACK_TRACE=true`,
      `CSS_ROOT_FILE_PATH=${dataDir}`,
      `CSS_SPARQL_ENDPOINT=sqlite:${path.join(dataDir, 'quadstore.sqlite')}`,
      `CSS_IDENTITY_DB_URL=sqlite:${path.join(dataDir, 'identity.sqlite')}`,
      `CSS_USAGE_DB_URL=sqlite:${path.join(dataDir, 'usage.sqlite')}`,
    ]

    // Device ID for DDNS
    if (localNodeId) {
      lines.push(`CSS_NODE_ID=${localNodeId}`)
    }

    if (provisioning) {
      lines.push(`oidcIssuer=${provisioning.cloudIdentityUrl}`)
      lines.push(`XPOD_CLOUD_API_ENDPOINT=${provisioning.cloudApiUrl}`)
      lines.push(`XPOD_NODE_ID=${provisioning.nodeId}`)
      lines.push(`XPOD_NODE_TOKEN=${provisioning.nodeToken}`)
      lines.push(`XPOD_SERVICE_TOKEN=${provisioning.serviceToken}`)
      lines.push(`LINX_PROVISION_CODE=${provisioning.provisionCode}`)
      lines.push(`LINX_PROVISION_URL=${provisioning.provisionUrl}`)
      if (provisioning.spDomain) lines.push(`LINX_SP_DOMAIN=${provisioning.spDomain}`)
      if (provisioning.tunnelEndpoint) lines.push(`LINX_TUNNEL_ENDPOINT=${provisioning.tunnelEndpoint}`)
    }

    // LinX service metadata for runtime UX and future automation
    lines.push(`LINX_SPACE_KIND=${spaceKind}`)
    lines.push(`LINX_DOMAIN_SOURCE=${domainSource || 'manual'}`)
    lines.push(`LINX_AUTO_START=${normalized.autoStart ? 'true' : 'false'}`)
    if (normalized.publicDomain) lines.push(`LINX_PUBLIC_DOMAIN=${normalized.publicDomain}`)
    if (typeof normalized.autoDetectPublicIp === 'boolean') lines.push(`LINX_AUTO_DETECT_PUBLIC_IP=${normalized.autoDetectPublicIp}`)
    if (normalized.httpsCertPath) lines.push(`LINX_HTTPS_CERT_PATH=${normalized.httpsCertPath}`)
    if (localNodeId) {
      lines.push(`LINX_NODE_ID=${localNodeId}`)
      lines.push(`LINX_DEVICE_ID=${localNodeId}`)
    }
    const effectiveTunnelProvider = provisioning?.tunnelProvider || network.tunnelProvider
    if (effectiveTunnelProvider) lines.push(`LINX_TUNNEL_PROVIDER=${effectiveTunnelProvider}`)

    // oidcIssuer means "external IdP". Standalone without this remains full Local.
    if (!provisioning && spaceKind === 'standalone' && standalone?.oidcIssuer) {
      lines.push(`oidcIssuer=${standalone.oidcIssuer}`)
    }

    // Tunnel configuration
    const effectiveTunnelToken = provisioning?.tunnelToken || network.tunnelToken
    if (network.accessMode === 'tunnel' && effectiveTunnelToken) {
      if (effectiveTunnelProvider === 'cloudflare') {
        lines.push(`CLOUDFLARE_TUNNEL_TOKEN=${effectiveTunnelToken}`)
      } else if (effectiveTunnelProvider === 'sakura') {
        lines.push(`SAKURA_TOKEN=${effectiveTunnelToken}`)
      }
    }

    return lines.join('\n')
  }

  private readEnvMap(): Record<string, string> {
    const envPath = getEnvPath()
    if (!fs.existsSync(envPath)) {
      return {}
    }

    const envContent = fs.readFileSync(envPath, 'utf-8')
    const env: Record<string, string> = {}

    for (const line of envContent.split('\n')) {
      const entry = parseEnvLine(line)
      if (entry) {
        env[entry[0]] = entry[1]
      }
    }

    return env
  }

  private readConfiguredSpaceKind(): ServiceSpaceKind | undefined {
    return parseServiceSpaceKind(this.readEnvMap().LINX_SPACE_KIND)
  }

  private async ensureManagedCloudRegistration(data: SetupData): Promise<ManagedCloudRegistration | undefined> {
    const normalized = normalizeSetupData(data)
    if (normalized.spaceKind !== 'local') {
      return undefined
    }

    const env = this.readEnvMap()
    const existing = this.readManagedCloudRegistration()
    const cloudIdentityUrl = normalizeUrl(env.oidcIssuer || process.env.oidcIssuer || OFFICIAL_CLOUD_IDENTITY_ORIGIN)
    const cloudApiUrl = normalizeUrl(env.XPOD_CLOUD_API_ENDPOINT || process.env.XPOD_CLOUD_API_ENDPOINT || OFFICIAL_CLOUD_API_ORIGIN)
    const configuredPublicUrl = normalized.publicDomain ? publicUrlFromDomain(normalized.publicDomain) : undefined
    const expectedPublicUrl = configuredPublicUrl ?? existing?.publicUrl

    if (
      existing
      && existing.cloudIdentityUrl === cloudIdentityUrl
      && existing.cloudApiUrl === cloudApiUrl
      && existing.publicUrl
      && existing.publicUrl === expectedPublicUrl
      && existing.nodeId
      && existing.nodeToken
      && existing.serviceToken
      && existing.provisionCode
    ) {
      return existing
    }

    const request: ProvisionNodeRequest = {
      publicUrl: expectedPublicUrl,
      nodeId: existing?.nodeId,
      nodeToken: existing?.nodeToken,
      serviceToken: existing?.serviceToken,
      localPort: normalized.port,
      tunnelToken: normalized.network.tunnelToken || existing?.tunnelToken,
      tunnelMode: normalized.network.tunnelToken || existing?.tunnelToken ? 'client' : undefined,
      domainMode: configuredPublicUrl ? 'self-managed' : 'managed',
      spDomain: configuredPublicUrl ? undefined : existing?.spDomain,
    }
    const response = await this.registerProvisionedNode(cloudApiUrl, request)
    const resolvedPublicUrl =
      response.publicUrl
      ?? request.publicUrl
      ?? derivePublicUrlFromSpDomain(response.spDomain)
    if (!resolvedPublicUrl) {
      throw new Error('Cloud 返回的 Local canonical URL 不完整。')
    }
    const publicUrl = ensureTrailingSlash(resolvedPublicUrl)

    return {
      nodeId: response.nodeId,
      nodeToken: response.nodeToken,
      serviceToken: response.serviceToken,
      provisionCode: response.provisionCode,
      spDomain: response.spDomain,
      tunnelToken: response.tunnelToken,
      tunnelProvider: response.tunnelProvider,
      tunnelEndpoint: response.tunnelEndpoint,
      publicUrl,
      provisionUrl: buildProvisionUrl(cloudIdentityUrl, response.provisionCode),
      cloudIdentityUrl,
      cloudApiUrl,
    }
  }

  private readManagedCloudRegistration(): ManagedCloudRegistration | undefined {
    const env = this.readEnvMap()
    if (!env.XPOD_NODE_ID || !env.XPOD_NODE_TOKEN || !env.XPOD_SERVICE_TOKEN || !env.LINX_PROVISION_CODE) {
      return undefined
    }

    const cloudIdentityUrl = normalizeUrl(env.oidcIssuer || OFFICIAL_CLOUD_IDENTITY_ORIGIN)
    const cloudApiUrl = normalizeUrl(env.XPOD_CLOUD_API_ENDPOINT || OFFICIAL_CLOUD_API_ORIGIN)
    const publicUrl = readProvisionPublicUrlFromEnv(env)
    if (!publicUrl) {
      return undefined
    }

    return {
      nodeId: env.XPOD_NODE_ID,
      nodeToken: env.XPOD_NODE_TOKEN,
      serviceToken: env.XPOD_SERVICE_TOKEN,
      provisionCode: env.LINX_PROVISION_CODE,
      publicUrl,
      provisionUrl: env.LINX_PROVISION_URL || buildProvisionUrl(cloudIdentityUrl, env.LINX_PROVISION_CODE),
      cloudIdentityUrl,
      cloudApiUrl,
      spDomain: env.LINX_SP_DOMAIN,
      tunnelToken: env.CLOUDFLARE_TUNNEL_TOKEN || env.SAKURA_TOKEN,
      tunnelProvider: env.LINX_TUNNEL_PROVIDER,
      tunnelEndpoint: env.LINX_TUNNEL_ENDPOINT,
    }
  }

  private async registerProvisionedNode(
    cloudApiUrl: string,
    request: ProvisionNodeRequest,
  ): Promise<Required<Pick<ManagedCloudRegistration, 'nodeId' | 'nodeToken' | 'serviceToken' | 'provisionCode'>>
    & Pick<ManagedCloudRegistration, 'spDomain' | 'tunnelToken' | 'tunnelProvider' | 'tunnelEndpoint'>
    & { publicUrl?: string }> {
    const endpoint = new URL('/provision/nodes', ensureTrailingSlash(cloudApiUrl)).toString()
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), MANAGED_CLOUD_REGISTRATION_TIMEOUT_MS)

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        throw new Error(detail || `HTTP ${response.status}`)
      }

      const payload = await response.json() as ProvisionNodeResponse
      if (
        typeof payload.nodeId !== 'string'
        || typeof payload.nodeToken !== 'string'
        || typeof payload.serviceToken !== 'string'
        || typeof payload.provisionCode !== 'string'
      ) {
        throw new Error('Cloud 返回的节点注册结果不完整。')
      }

      return {
        nodeId: payload.nodeId,
        nodeToken: payload.nodeToken,
        serviceToken: payload.serviceToken,
        provisionCode: payload.provisionCode,
        publicUrl: typeof payload.publicUrl === 'string' ? ensureTrailingSlash(payload.publicUrl) : undefined,
        spDomain: typeof payload.spDomain === 'string' ? payload.spDomain : undefined,
        tunnelToken: typeof payload.tunnelToken === 'string' ? payload.tunnelToken : undefined,
        tunnelProvider: typeof payload.tunnelProvider === 'string' ? payload.tunnelProvider : undefined,
        tunnelEndpoint: typeof payload.tunnelEndpoint === 'string' ? payload.tunnelEndpoint : undefined,
      }
    } catch (error) {
      if ((error as Error & { name?: string })?.name === 'AbortError') {
        throw new Error('连接 Cloud 注册 Local 节点超时。')
      }
      throw new Error(`无法完成 Local 的 Cloud 绑定：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      clearTimeout(timeoutId)
    }
  }

  private applyAutoStart(enabled: boolean): void {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true,
    })
  }

  public setAutoStart(enabled: boolean): void {
    this.applyAutoStart(enabled)

    const envPath = getEnvPath()
    if (!fs.existsSync(envPath)) {
      return
    }

    const env = this.readEnvMap()
    env.LINX_AUTO_START = enabled ? 'true' : 'false'

    const nextContent = Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')

    fs.writeFileSync(envPath, `${nextContent}\n`)
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    const distDir = this.getWebDistDir()

    // API routes for service control
    this.app.use(express.json())

    // Check if setup is completed
    this.app.get('/api/setup/status', (_req: Request, res: Response) => {
      const setupCompleted = fs.existsSync(getSetupFlagPath())
      res.json({ setupCompleted })
    })

    // Get current .env config
    this.app.get('/api/setup/config', (_req: Request, res: Response) => {
      try {
        const envPath = getEnvPath()
        const configDir = getConfigDir()
        if (fs.existsSync(envPath)) {
          const env = this.readEnvMap()

          const tunnelProvider = env.LINX_TUNNEL_PROVIDER || (env.CLOUDFLARE_TUNNEL_TOKEN ? 'cloudflare' : env.SAKURA_TOKEN ? 'sakura' : '')

          res.json({
            dataDir: env.CSS_ROOT_FILE_PATH || path.join(configDir, 'pod'),
            port: parseInt(env.CSS_PORT || '5737', 10),
            baseUrl: env.CSS_BASE_URL || 'http://localhost:5737',
            spaceKind: (env.LINX_SPACE_KIND as 'local' | 'standalone') || 'local',
            domainSource: 'manual',
            autoStart: env.LINX_AUTO_START ? env.LINX_AUTO_START === 'true' : app.getLoginItemSettings().openAtLogin,
            publicDomain: env.LINX_PUBLIC_DOMAIN || '',
            autoDetectPublicIp: env.LINX_AUTO_DETECT_PUBLIC_IP === 'true',
            httpsCertPath: env.LINX_HTTPS_CERT_PATH || '',
            nodeId: normalizeNodeId(env.LINX_NODE_ID || env.LINX_DEVICE_ID || env.CSS_NODE_ID || getDefaultNodeId()),
            defaultWorkspacePath: resolveLinxDefaultWorkspaceDir(),
            tunnelProvider,
            hasTunnelToken: Boolean(env.CLOUDFLARE_TUNNEL_TOKEN || env.SAKURA_TOKEN),
          })
        } else {
          // Return defaults
          res.json({
            dataDir: path.join(configDir, 'pod'),
            port: 5737,
            baseUrl: 'http://localhost:5737',
            spaceKind: 'local',
            domainSource: 'manual',
            autoStart: app.getLoginItemSettings().openAtLogin,
            publicDomain: '',
            autoDetectPublicIp: true,
            httpsCertPath: '',
            nodeId: getDefaultNodeId(),
            defaultWorkspacePath: resolveLinxDefaultWorkspaceDir(),
            tunnelProvider: '',
            hasTunnelToken: false,
          })
        }
      } catch (error) {
        console.error('[WebServer] Failed to read config:', error)
        res.status(500).json({ error: 'Failed to read config' })
      }
    })

    // Save setup config - directly write .env file
    this.app.post('/api/setup', async (req: Request, res: Response) => {
      try {
        const data = normalizeSetupData(req.body as SetupData)

        if (data.network?.accessMode === 'tunnel' && !data.network.tunnelProvider) {
          res.status(400).json({ error: 'tunnelProvider is required when accessMode=tunnel' })
          return
        }

        if (data.network?.accessMode === 'tunnel' && data.network.tunnelProvider && !data.network.tunnelToken) {
          const envPath = getEnvPath()
          if (!fs.existsSync(envPath)) {
            res.status(400).json({ error: 'tunnelToken is required for new tunnel configuration' })
            return
          }

          const envContent = fs.readFileSync(envPath, 'utf-8')
          const env: Record<string, string> = {}
          for (const line of envContent.split('\n')) {
            const entry = parseEnvLine(line)
            if (entry) {
              env[entry[0]] = entry[1]
            }
          }

          const tokenKey = data.network.tunnelProvider === 'cloudflare' ? 'CLOUDFLARE_TUNNEL_TOKEN' : 'SAKURA_TOKEN'
          const existingToken = env[tokenKey]
          if (!existingToken) {
            res.status(400).json({ error: 'tunnelToken is required for selected tunnel provider' })
            return
          }
          data.network.tunnelToken = existingToken
        }

        // Ensure config directory exists
        const configDir = getConfigDir()
        const envPath = getEnvPath()
        const setupFlagPath = getSetupFlagPath()
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true })
        }

        // Ensure data directory exists
        if (!fs.existsSync(data.dataDir)) {
          fs.mkdirSync(data.dataDir, { recursive: true })
        }

        const provisioning = await this.ensureManagedCloudRegistration(data)

        // Write .env file
        const envContent = this.generateEnvContent(data, provisioning)
        fs.writeFileSync(envPath, envContent)
        console.log('[WebServer] Generated .env file:', envPath)
        this.applyAutoStart(data.autoStart)

        // Mark setup as complete
        fs.writeFileSync(setupFlagPath, new Date().toISOString())

        res.json({ success: true, envPath, provisioning: provisioning ? {
          nodeId: provisioning.nodeId,
          publicUrl: provisioning.publicUrl,
          provisionCode: provisioning.provisionCode,
          provisionUrl: provisioning.provisionUrl,
          cloudIdentityUrl: provisioning.cloudIdentityUrl,
          cloudApiUrl: provisioning.cloudApiUrl,
          spDomain: provisioning.spDomain,
          tunnelProvider: provisioning.tunnelProvider,
          tunnelEndpoint: provisioning.tunnelEndpoint,
        } : undefined })
      } catch (error) {
        console.error('[WebServer] Failed to save setup:', error)
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save configuration' })
      }
    })

    // Get service status
    this.app.get('/api/service/status', (_req: Request, res: Response) => {
      const xpodStatus = getXpodModule().getStatus()
      const setupCompleted = fs.existsSync(getSetupFlagPath())
      const envPath = getEnvPath()
      const provisioning = this.readManagedCloudRegistration()
      const runtimeWorkers = summarizeRuntimeWorkers(getRuntimeThreadsModule().listSessions())

      res.json({
        pod: {
          port: xpodStatus.port || 5737,
          baseUrl: xpodStatus.baseUrl || 'http://localhost:5737',
          publicUrl: xpodStatus.publicUrl,
          running: xpodStatus.running,
        },
        spaceKind: this.readConfiguredSpaceKind(),
        runtime: {
          workers: runtimeWorkers,
        },
        provisioning: provisioning ? {
          nodeId: provisioning.nodeId,
          publicUrl: provisioning.publicUrl,
          provisionCode: provisioning.provisionCode,
          provisionUrl: provisioning.provisionUrl,
          cloudIdentityUrl: provisioning.cloudIdentityUrl,
          cloudApiUrl: provisioning.cloudApiUrl,
          spDomain: provisioning.spDomain,
          tunnelProvider: provisioning.tunnelProvider,
          tunnelEndpoint: provisioning.tunnelEndpoint,
        } : undefined,
        setupCompleted,
        envPath,
      })
    })

    // Service controls
    this.app.post('/api/service/start', async (req: Request, res: Response) => {
      try {
        if (isInvalidServiceSpaceKind(req.body?.spaceKind)) {
          res.status(400).json({ error: 'spaceKind must be "local" or "standalone"' })
          return
        }

        const requestedSpaceKind = parseServiceSpaceKind(req.body?.spaceKind)
        const configuredSpaceKind = this.readConfiguredSpaceKind()
        if (requestedSpaceKind && configuredSpaceKind && requestedSpaceKind !== configuredSpaceKind) {
          res.status(409).json({
            error: `当前 Service 配置为 ${configuredSpaceKind}，不能按 ${requestedSpaceKind} 启动。请先在设置中切换空间。`,
            configuredSpaceKind,
            requestedSpaceKind,
          })
          return
        }

        await getXpodModule().start()
        res.json({ success: true })
      } catch (error) {
        console.error('[WebServer] Failed to start xpod:', error)
        res.status(500).json({ error: 'Failed to start xpod' })
      }
    })

    this.app.post('/api/service/stop', async (_req: Request, res: Response) => {
      try {
        await getXpodModule().stop()
        res.json({ success: true })
      } catch (error) {
        console.error('[WebServer] Failed to stop xpod:', error)
        res.status(500).json({ error: 'Failed to stop xpod' })
      }
    })

    this.app.post('/api/service/restart', async (_req: Request, res: Response) => {
      try {
        await getXpodModule().restart()
        res.json({ success: true })
      } catch (error) {
        console.error('[WebServer] Failed to restart xpod:', error)
        res.status(500).json({ error: 'Failed to restart xpod' })
      }
    })


    // Runtime session APIs (Phase 3 internal-first)
    this.app.get('/api/runtime/threads', (req: Request, res: Response) => {
      const threadId = typeof req.query.threadId === 'string' ? req.query.threadId : undefined
      const runtimeSessions = getRuntimeThreadsModule().listSessions(threadId)
      res.json({ items: runtimeSessions })
    })

    this.app.get('/api/runtime/threads/:id', (req: Request, res: Response) => {
      const session = getRuntimeThreadsModule().getSession(routeParam(req.params.id))
      if (!session) {
        res.status(404).json({ error: 'Runtime session not found' })
        return
      }
      res.json(session)
    })

    this.app.post('/api/runtime/threads', (req: Request, res: Response) => {
      try {
        const { threadId, workspaceUri, title, repoPath, folderPath, runnerType, tool, baseRef, branch } = req.body ?? {}
        if (!threadId || !title || !repoPath) {
          res.status(400).json({ error: 'threadId, title, and repoPath are required' })
          return
        }

        const session = getRuntimeThreadsModule().createSession({
          threadId,
          workspaceUri,
          title,
          repoPath,
          folderPath,
          runnerType,
          tool,
          baseRef,
          branch,
        })
        res.json(session)
      } catch (error) {
        console.error('[WebServer] Failed to create runtime session:', error)
        res.status(500).json({ error: 'Failed to create runtime session' })
      }
    })

    this.app.post('/api/runtime/threads/:id/start', async (req: Request, res: Response) => {
      try {
        const session = await getRuntimeThreadsModule().startSession(routeParam(req.params.id))
        res.json(session)
      } catch (error) {
        console.error('[WebServer] Failed to start runtime session:', error)
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to start runtime session' })
      }
    })

    this.app.post('/api/runtime/threads/:id/pause', async (req: Request, res: Response) => {
      try {
        const session = await getRuntimeThreadsModule().pauseSession(routeParam(req.params.id))
        res.json(session)
      } catch (error) {
        console.error('[WebServer] Failed to pause runtime session:', error)
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to pause runtime session' })
      }
    })

    this.app.post('/api/runtime/threads/:id/resume', async (req: Request, res: Response) => {
      try {
        const session = await getRuntimeThreadsModule().resumeSession(routeParam(req.params.id))
        res.json(session)
      } catch (error) {
        console.error('[WebServer] Failed to resume runtime session:', error)
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to resume runtime session' })
      }
    })

    this.app.post('/api/runtime/threads/:id/stop', async (req: Request, res: Response) => {
      try {
        const session = await getRuntimeThreadsModule().stopSession(routeParam(req.params.id))
        res.json(session)
      } catch (error) {
        console.error('[WebServer] Failed to stop runtime session:', error)
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to stop runtime session' })
      }
    })

    this.app.post('/api/runtime/threads/:id/message', async (req: Request, res: Response) => {
      try {
        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
        if (!text) {
          res.status(400).json({ error: 'text is required' })
          return
        }

        const session = await getRuntimeThreadsModule().sendSessionMessage(routeParam(req.params.id), text)
        res.json(session)
      } catch (error) {
        console.error('[WebServer] Failed to send runtime session message:', error)
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to send runtime session message' })
      }
    })

    this.app.post('/api/runtime/threads/:id/tool-calls/:requestId/respond', async (req: Request, res: Response) => {
      try {
        const output = typeof req.body?.output === 'string' ? req.body.output : ''
        if (!output.trim()) {
          res.status(400).json({ error: 'output is required' })
          return
        }

        const session = await getRuntimeThreadsModule().respondToSessionToolCall(
          routeParam(req.params.id),
          routeParam(req.params.requestId),
          output,
        )
        res.json(session)
      } catch (error) {
        console.error('[WebServer] Failed to respond runtime tool call:', error)
        res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to respond runtime tool call' })
      }
    })

    this.app.get('/api/runtime/threads/:id/log', (req: Request, res: Response) => {
      try {
        const log = getRuntimeThreadsModule().getSessionLog(routeParam(req.params.id))
        res.type('text/plain').send(log)
      } catch (error) {
        console.error('[WebServer] Failed to get runtime session log:', error)
        res.status(500).json({ error: 'Failed to get runtime session log' })
      }
    })

    this.app.get('/api/runtime/threads/:id/events', (req: Request, res: Response) => {
      const runtimeSessions = getRuntimeThreadsModule()
      const sessionId = routeParam(req.params.id)
      const session = runtimeSessions.getSession(sessionId)
      if (!session) {
        res.status(404).json({ error: 'Runtime session not found' })
        return
      }

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache, no-transform')
      res.setHeader('Connection', 'keep-alive')
      res.flushHeaders?.()

      const unsubscribe = runtimeSessions.subscribeSession(sessionId, (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      })

      res.write(`data: ${JSON.stringify({ type: 'status', ts: Date.now(), threadId: session.id, status: session.status })}\n\n`)

      req.on('close', () => {
        unsubscribe()
        res.end()
      })
    })

    // Serve static files with injection
    if (fs.existsSync(distDir)) {
      // Inject __LINX_SERVICE__ into index.html
      this.app.get('/', (_req, res) => {
        const indexPath = path.join(distDir, 'index.html')
        let html = fs.readFileSync(indexPath, 'utf-8')

        // Inject service flag before </head>
        const injection = `<script>window.__LINX_SERVICE__ = true;</script>`
        html = html.replace('</head>', `${injection}</head>`)

        res.type('html').send(html)
      })

      this.app.use(express.static(distDir))

      // SPA fallback - also inject for deep links
      this.app.use((req, res) => {
        // Skip API routes
        if (req.path.startsWith('/api/')) {
          res.status(404).json({ error: 'Not found' })
          return
        }

        const indexPath = path.join(distDir, 'index.html')
        let html = fs.readFileSync(indexPath, 'utf-8')

        const injection = `<script>window.__LINX_SERVICE__ = true;</script>`
        html = html.replace('</head>', `${injection}</head>`)

        res.type('html').send(html)
      })
    } else {
      // Development: proxy to Vite dev server
      console.log('[WebServer] Production build not found, running in dev mode')
      this.app.use((_req, res) => {
        res.redirect('http://localhost:5174')
      })
    }
  }

  /**
   * Start the web server
   */
  async start(): Promise<void> {
    if (this.server) {
      console.log('[WebServer] Already running')
      return
    }

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(5173, () => {
        console.log('[WebServer] Serving on http://localhost:5173')
        resolve()
      })

      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') {
          console.error('[WebServer] Port 5173 is already in use')
        }
        reject(error)
      })
    })
  }

  /**
   * Stop the web server
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null
        console.log('[WebServer] Stopped')
        resolve()
      })
    })
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    return 'http://localhost:5173'
  }

  /**
   * Check if setup is completed
   */
  isSetupCompleted(): boolean {
    return fs.existsSync(getSetupFlagPath())
  }

  /**
   * Get .env file path
   */
  getEnvPath(): string {
    return getEnvPath()
  }
}

// Singleton
let instance: WebServerModule | null = null

export function getWebServerModule(): WebServerModule {
  if (!instance) {
    instance = new WebServerModule()
  }
  return instance
}
