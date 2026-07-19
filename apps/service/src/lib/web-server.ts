/**
 * Web Server Module - Serves LinX Web UI
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { randomUUID } from 'crypto'
import { lookup } from 'dns/promises'
import { isIP } from 'net'
import { app } from 'electron'
import express, { Express, Request, Response } from 'express'
import { Server } from 'http'
import { getXpodModule } from './xpod'
import { getRuntimeThreadsModule } from './runtime-threads'
import { resolveLinxDefaultWorkspaceDir, resolveLinxUserDataDir } from './linx-paths'

const OFFICIAL_CLOUD_IDENTITY_ORIGIN = 'https://id.undefineds.co'
const OFFICIAL_CLOUD_API_ORIGIN = 'https://api.undefineds.co'
const MANAGED_CLOUD_REGISTRATION_TIMEOUT_MS = 30000

function formatServiceUserError(error: unknown, fallback: string): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : ''
  const normalized = message.toLowerCase()

  if (!message) {
    return fallback
  }

  if (/publicurl is required|spdomain|canonical|cloud.*local.*绑定|local.*cloud.*绑定/.test(normalized)) {
    return '本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。'
  }

  if (/invalid or expired provisioncode|invalid or expired providercode|provisioncode.*expired|providercode.*expired/.test(normalized)) {
    return '这次本地登录已失效。请回到空间选择页，重新点“本地空间”。'
  }

  if (/无法准备本地空间登录入口|cloud 返回|节点注册结果不完整|local canonical url 不完整/.test(normalized)) {
    return '本地空间入口准备失败。请稍后重试；如果仍失败，请回到空间选择页重新进入。'
  }

  if (/aborterror|timeout|连接.*超时|failed to fetch|network/.test(normalized)) {
    return '无法连接登录服务。请检查网络后重试。'
  }

  if (/(?:http|api error|runtime request failed|request failed)[:\s]*401\b|unauthorized/.test(normalized)) {
    return '登录状态已失效。请重新登录。'
  }

  if (/(?:http|api error|runtime request failed|request failed)[:\s]*403\b|forbidden/.test(normalized)) {
    return '这个账号还不能写入当前空间。请换一个空间；如果这是你的本地空间，请先完成空间创建。'
  }

  if (/(?:http|api error|runtime request failed|request failed)[:\s]*409\b|conflict|already exists|already registered/.test(normalized)) {
    return '这个账号或空间名已经存在。请直接登录，或换一个名字。'
  }

  if (/(?:http|api error|runtime request failed|request failed)[:\s]*429\b|rate limit|too many requests/.test(normalized)) {
    return '请求太频繁。请稍等一会儿再试。'
  }

  if (/(?:http|api error|runtime request failed|request failed)[:\s]*5\d\d\b|service unavailable|internal server error/.test(normalized)) {
    return '服务暂时没有响应。请稍后重试。'
  }

  if (/findbyid|base-relative|full iris|resource id|iri/.test(normalized) && fallback.includes('工作会话')) {
    return fallback
  }

  if (/findbyid|base-relative|full iris|resource id|iri/.test(normalized)) {
    return 'LinX 初始化失败。请刷新页面；如果仍失败，请换一个空间重新登录。'
  }

  if (/cannot find module|invalid resource iri|jsonld|componentsjs|application support|require stack/.test(normalized)) {
    return '本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。'
  }

  if (/unable to install @undefineds\.co\/xpod|unable to prepare xpod runtime/.test(normalized)) {
    return '本地空间组件下载失败。请检查网络后重试。'
  }

  if (/missing required local login\/startup capabilities|scoped webid|scoped pickwebid|scoped picker|escaped recursive css runtime/.test(normalized)) {
    return '本地空间版本过旧。请重启 LinX 让它自动更新；如果仍失败，请打开本地空间设置修复。'
  }

  if (/xpod failed to start|failed to start xpod|local 服务在完成启动前已退出|exceeded max restarts/.test(normalized)) {
    return '本地空间启动失败。请点“重新检查”；如果仍失败，请重启 LinX。'
  }

  if (/\/users\/|\\users\\|application support|node_modules|require stack|cannot find module|jsonld|componentsjs|https?:\/\/|file:\/\/|localhost|127\.0\.0\.1|http\s+\d{3}|pod|solid|webid|oidc|issuer|provider|publicurl|provisioncode|spdomain|canonical|agent|secretary/i.test(message)) {
    return fallback
  }

  return message.length <= 180 ? message : fallback
}

function sendUserError(
  res: Response,
  status: number,
  fallback: string,
  error?: unknown,
  extra?: Record<string, unknown>,
): void {
  res.status(status).json({
    error: formatServiceUserError(error ?? fallback, fallback),
    ...(extra ?? {}),
  })
}

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

function shouldForwardUpstreamHeader(key: string): boolean {
  return ![
    'connection',
    'content-encoding',
    'content-length',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ].includes(key.toLowerCase())
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '')
  if (normalized === '::1' || normalized === '0.0.0.0') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:')) return true
  if (!isIP(normalized)) return false

  const parts = normalized.split('.').map(Number)
  if (parts.length !== 4) return false
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
}

async function validateModelServiceEndpoint(endpoint: string, providerId: string): Promise<URL> {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error('模型服务地址不正确。请检查服务地址后重试。')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('模型服务地址只支持 HTTP 或 HTTPS。')
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const allowLocalOllama = providerId === 'ollama'
    && (hostname === 'localhost' || isPrivateAddress(hostname))
  if (hostname === 'localhost' || isPrivateAddress(hostname)) {
    if (allowLocalOllama) return url
    throw new Error('模型服务地址不能指向本机或内网地址。')
  }

  const addresses = await lookup(hostname, { all: true })
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('模型服务地址解析到了本机或内网地址。')
  }
  return url
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

function readConfiguredEnvValue(env: Record<string, string>, key: string): string | undefined {
  const configured = (env[key] || process.env[key] || '').trim()
  return configured || undefined
}

function buildProvisionUrl(cloudIdentityUrl: string, provisionCode: string): string {
  const url = new URL('/.account/', `${normalizeUrl(cloudIdentityUrl)}/`)
  url.searchParams.set('provisionCode', provisionCode)
  return url.toString()
}

function injectServiceRuntimeScript(html: string): string {
  const injection = [
    '<script src="/linx-service-env.js"></script>',
    '<script>window.__LINX_SERVICE__ = true;</script>',
  ].join('')

  return html.replace('</head>', `${injection}</head>`)
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

function getDeviceIdPath(): string {
  return path.join(getConfigDir(), '.device-id')
}

function normalizeNodeId(value?: string | null): string {
  const normalized = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!normalized) {
    return 'local-node'
  }

  if (normalized.length <= 64) {
    return normalized
  }

  return normalized.slice(0, 64).replace(/-+$/g, '') || 'local-node'
}

function getDefaultNodeId() {
  return normalizeNodeId(
    process.env.LINX_NODE_ID
    || process.env.CSS_NODE_ID
    || process.env.XPOD_NODE_ID
    || os.hostname()
    || 'local',
  )
}

function normalizeDeviceId(value?: string | null): string {
  const normalized = (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')

  if (!normalized) {
    return 'local-device'
  }

  if (normalized.length <= 64) {
    return normalized
  }

  return normalized.slice(0, 64).replace(/-+$/g, '') || 'local-device'
}

function getDefaultDeviceId() {
  const envDeviceId = normalizeDeviceId(process.env.LINX_DEVICE_ID)
  if (envDeviceId !== 'local-device') {
    return envDeviceId
  }

  const deviceIdPath = getDeviceIdPath()
  if (fs.existsSync(deviceIdPath)) {
    const storedDeviceId = normalizeDeviceId(fs.readFileSync(deviceIdPath, 'utf-8'))
    if (storedDeviceId !== 'local-device') {
      return storedDeviceId
    }
  }

  const generatedDeviceId = normalizeDeviceId(`device-${randomUUID()}`)
  fs.mkdirSync(path.dirname(deviceIdPath), { recursive: true })
  fs.writeFileSync(deviceIdPath, `${generatedDeviceId}\n`)
  return generatedDeviceId
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
    const localNodeId = normalizeNodeId(
      provisioning?.nodeId
      || local?.nodeId
      || process.env.XPOD_NODE_ID
      || process.env.LINX_NODE_ID
      || process.env.CSS_NODE_ID
      || getDefaultNodeId(),
    )
    const localDeviceId = normalizeDeviceId(
      local?.deviceId
      || process.env.LINX_DEVICE_ID
      || getDefaultDeviceId(),
    )

    if (provisioning) {
      baseUrl = normalizeUrl(provisioning.publicUrl)
    } else if (spaceKind === 'local' && publicDomain) {
      baseUrl = `https://${publicDomain}`
    } else if (spaceKind === 'standalone' && standalone?.customDomain) {
      baseUrl = `https://${standalone.customDomain}`
    } else {
      baseUrl = `http://localhost:${port}`
    }

    const existingEnv = this.readEnvMap()
    const sparqlEndpoint = readConfiguredEnvValue(existingEnv, 'CSS_SPARQL_ENDPOINT')
      || `sqlite:${path.join(dataDir, 'quadstore.sqlite')}`
    const identityDbUrl = readConfiguredEnvValue(existingEnv, 'CSS_IDENTITY_DB_URL')
      || `sqlite:${path.join(dataDir, 'identity.sqlite')}`
    const usageDbUrl = readConfiguredEnvValue(existingEnv, 'CSS_USAGE_DB_URL')
      || `sqlite:${path.join(dataDir, 'usage.sqlite')}`

    const lines = [
      '# Generated by LinX Service',
      `XPOD_EDITION=local`,
      `CSS_EDITION=local`,
      `CSS_PORT=${port}`,
      `CSS_BASE_URL=${baseUrl}`,
      `CSS_LOGGING_LEVEL=info`,
      `CSS_SHOW_STACK_TRACE=true`,
      `CSS_ROOT_FILE_PATH=${dataDir}`,
      `CSS_SPARQL_ENDPOINT=${sparqlEndpoint}`,
      `CSS_IDENTITY_DB_URL=${identityDbUrl}`,
      `CSS_USAGE_DB_URL=${usageDbUrl}`,
    ]

    if (readConfiguredEnvValue(existingEnv, 'LINX_EXTERNAL_XPOD') === 'true') {
      lines.push('LINX_EXTERNAL_XPOD=true')
    }

    // SP node identity. This is not the runtime device identity used by device:// workspaces.
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
    }
    lines.push(`LINX_DEVICE_ID=${localDeviceId}`)
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

  public isExternalXpodEnabled(): boolean {
    return this.readEnvMap().LINX_EXTERNAL_XPOD === 'true' || process.env.LINX_EXTERNAL_XPOD === 'true'
  }

  private readConfiguredSpaceKind(): ServiceSpaceKind | undefined {
    return parseServiceSpaceKind(this.readEnvMap().LINX_SPACE_KIND)
  }

  private readEffectiveSpaceKind(): ServiceSpaceKind | undefined {
    const configured = this.readConfiguredSpaceKind()
    const hasManagedCloudRegistration = Boolean(this.readManagedCloudRegistration())
    if (configured === 'local' && !hasManagedCloudRegistration) {
      return 'standalone'
    }
    return configured ?? (hasManagedCloudRegistration ? 'local' : 'standalone')
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
        throw new Error(`无法准备本地空间登录入口：${error instanceof Error ? error.message : String(error)}`)
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
    this.app.use('/api', (req: Request, res: Response, next) => {
      const origin = req.get('origin')
      if (!origin) {
        next()
        return
      }
      let parsed: URL
      try {
        parsed = new URL(origin)
      } catch {
        res.status(403).json({ error: '请求来源不可用。' })
        return
      }
      if (
        parsed.protocol !== 'http:'
        || !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
        || parsed.port !== '5173'
      ) {
        res.status(403).json({ error: '请求来源不受信任。' })
        return
      }
      next()
    })

    this.app.get('/auth/client', (req: Request, res: Response) => {
      const origin = `${req.protocol}://${req.get('host')}`
      const clientId = `${origin}/auth/client`
      const redirectUrl = `${origin}/auth/callback`
      const redirectUris = new Set([redirectUrl])
      const host = req.hostname
      if (host === 'host.docker.internal') {
        redirectUris.add(`${req.protocol}://localhost:5173/auth/callback`)
      }

      res.setHeader('Cache-Control', 'no-store')
      res.type('application/ld+json').json({
        '@context': 'https://www.w3.org/ns/solid/oidc-context.jsonld',
        client_id: clientId,
        client_name: 'LinX',
        application_type: 'web',
        redirect_uris: Array.from(redirectUris),
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        scope: 'openid profile webid offline_access',
        token_endpoint_auth_method: 'none',
      })
    })

    this.app.get('/linx-service-env.js', (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-store')
      res.type('application/javascript').send('window.__LINX_SERVICE__ = true;\n')
    })

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
            nodeId: normalizeNodeId(env.XPOD_NODE_ID || env.LINX_NODE_ID || env.CSS_NODE_ID || getDefaultNodeId()),
            deviceId: normalizeDeviceId(env.LINX_DEVICE_ID || getDefaultDeviceId()),
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
            deviceId: getDefaultDeviceId(),
            defaultWorkspacePath: resolveLinxDefaultWorkspaceDir(),
            tunnelProvider: '',
            hasTunnelToken: false,
          })
        }
      } catch (error) {
        console.error('[WebServer] Failed to read config:', error)
        sendUserError(res, 500, '读取本地空间设置失败。请稍后重试。', error)
      }
    })

    // Save setup config - directly write .env file
    this.app.post('/api/setup', async (req: Request, res: Response) => {
      try {
        const data = normalizeSetupData(req.body as SetupData)

        if (data.network?.accessMode === 'tunnel' && !data.network.tunnelProvider) {
          sendUserError(res, 400, '请选择隧道供应商后再保存。')
          return
        }

        if (data.network?.accessMode === 'tunnel' && data.network.tunnelProvider && !data.network.tunnelToken) {
          const envPath = getEnvPath()
          if (!fs.existsSync(envPath)) {
            sendUserError(res, 400, '请填写隧道 Token 后再保存。')
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
            sendUserError(res, 400, '请填写隧道 Token 后再保存。')
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
        res.status(500).json({ error: formatServiceUserError(error, '保存本地空间设置失败。请检查填写内容后重试。') })
      }
    })

    // Get service status
    this.app.get('/api/service/status', async (_req: Request, res: Response) => {
      const xpod = getXpodModule()
      const xpodStatus = xpod.getStatus()
      const externalPodReady = xpodStatus.running ? false : await xpod.healthCheck().catch(() => false)
      const setupCompleted = fs.existsSync(getSetupFlagPath())
      const envPath = getEnvPath()
      const provisioning = this.readManagedCloudRegistration()
      const runtimeWorkers = summarizeRuntimeWorkers(getRuntimeThreadsModule().listSessions())

      res.json({
        pod: {
          port: xpodStatus.port || 5737,
          baseUrl: xpodStatus.baseUrl || 'http://localhost:5737',
          publicUrl: xpodStatus.publicUrl,
          running: xpodStatus.running || externalPodReady,
        },
        spaceKind: this.readEffectiveSpaceKind(),
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
          sendUserError(res, 400, '当前页面和已启动的空间不一致。请回到空间选择页重新进入。')
          return
        }

        const requestedSpaceKind = parseServiceSpaceKind(req.body?.spaceKind)
        const configuredSpaceKind = this.readEffectiveSpaceKind()
        if (requestedSpaceKind && configuredSpaceKind && requestedSpaceKind !== configuredSpaceKind) {
          res.status(409).json({
            error: '当前已经选择了另一种本地空间。请返回空间选择页，切换后再启动。',
            configuredSpaceKind,
            requestedSpaceKind,
          })
          return
        }

        if (!this.isExternalXpodEnabled()) {
          await getXpodModule().start()
        }
        res.json({ success: true })
      } catch (error) {
        console.error('[WebServer] Failed to start xpod:', error)
        sendUserError(res, 500, '本地空间启动失败。请点“重新检查”；如果仍失败，请重启 LinX。', error)
      }
    })

    this.app.post('/api/service/stop', async (_req: Request, res: Response) => {
      try {
        if (!this.isExternalXpodEnabled()) {
          await getXpodModule().stop()
        }
        res.json({ success: true })
      } catch (error) {
        console.error('[WebServer] Failed to stop xpod:', error)
        sendUserError(res, 500, '本地空间没有顺利关闭。请稍后重试。', error)
      }
    })

    this.app.post('/api/service/restart', async (_req: Request, res: Response) => {
      try {
        if (!this.isExternalXpodEnabled()) {
          await getXpodModule().restart()
        }
        res.json({ success: true })
      } catch (error) {
        console.error('[WebServer] Failed to restart xpod:', error)
        sendUserError(res, 500, '本地空间没有顺利重启。请稍后重试。', error)
      }
    })

    this.app.post('/api/ai/chat/completions', async (req: Request, res: Response) => {
      try {
        const xpodStatus = getXpodModule().getStatus()
        if (!xpodStatus.running) {
          sendUserError(res, 503, '本地空间还没有启动。请先启动本地空间后再使用服务端 AI。')
          return
        }

        const baseUrl = ensureTrailingSlash(xpodStatus.baseUrl || `http://localhost:${xpodStatus.port || 5737}`)
        const endpoint = new URL('/v1/chat/completions', baseUrl).toString()
        const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined
        const upstream = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'text/event-stream, text/plain, application/json',
            'Content-Type': 'application/json',
            ...(authorization ? { Authorization: authorization } : {}),
          },
          body: JSON.stringify(req.body ?? {}),
        })

        res.status(upstream.status)
        upstream.headers.forEach((value, key) => {
          if (!shouldForwardUpstreamHeader(key)) return
          res.setHeader(key, value)
        })

        const reader = upstream.body?.getReader()
        if (!reader) {
          res.end(await upstream.text())
          return
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
              res.write(Buffer.from(value))
            }
          }
          res.end()
        } finally {
          reader.releaseLock()
        }
      } catch (error) {
        console.error('[WebServer] Failed to proxy server-originated AI request:', error)
        sendUserError(res, 500, '服务端 AI 请求失败。请稍后重试，或切回客户端运行。', error)
      }
    })

    this.app.post('/api/model-services/models', async (req: Request, res: Response) => {
      const abortController = new AbortController()
      const timeout = setTimeout(() => abortController.abort(), 20000)

      try {
        const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : ''
        const providerId = typeof req.body?.providerId === 'string' ? req.body.providerId.trim() : 'custom'
        const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : ''

        console.log('[WebServer] Model list sync requested:', {
          providerId,
          endpoint,
          apiKeyPresent: Boolean(apiKey),
          apiKeyLength: apiKey.length,
        })

        let url: URL
        try {
          url = await validateModelServiceEndpoint(endpoint, providerId)
        } catch (error) {
          res.status(400).json({ error: formatServiceUserError(error, '模型服务地址不正确。请检查后重试。') })
          return
        }

        const headers: Record<string, string> = { Accept: 'application/json' }
        if (providerId === 'google') {
          if (apiKey) headers['x-goog-api-key'] = apiKey
        } else if (providerId !== 'ollama' && apiKey) {
          headers.Authorization = `Bearer ${apiKey}`
        }

        const upstream = await fetch(url, {
          method: 'GET',
          headers,
          signal: abortController.signal,
        })
        const body = await upstream.text()
        console.log('[WebServer] Model list sync upstream response:', {
          providerId,
          endpoint: url.toString(),
          status: upstream.status,
          contentType: upstream.headers.get('content-type'),
          bodyLength: body.length,
        })

        res.status(upstream.status)
        const contentType = upstream.headers.get('content-type')
        if (contentType) {
          res.setHeader('content-type', contentType)
        }
        res.send(body)
      } catch (error) {
        console.error('[WebServer] Failed to sync model list:', error)
        sendUserError(res, 500, '模型同步失败。请检查密钥、服务地址或网络后重试。', error)
      } finally {
        clearTimeout(timeout)
      }
    })

    this.app.post('/api/model-services/chat/completions', async (req: Request, res: Response) => {
      const abortController = new AbortController()
      const timeout = setTimeout(() => abortController.abort(), 120000)

      try {
        const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : ''
        const providerId = typeof req.body?.providerId === 'string' ? req.body.providerId.trim() : 'custom'
        const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : ''
        const body = req.body?.body && typeof req.body.body === 'object' ? req.body.body : undefined

        console.log('[WebServer] Model chat proxy requested:', {
          providerId,
          endpoint,
          apiKeyPresent: Boolean(apiKey),
          apiKeyLength: apiKey.length,
          model: typeof body?.model === 'string' ? body.model : undefined,
          stream: body?.stream === true,
        })

        let url: URL
        try {
          url = await validateModelServiceEndpoint(endpoint, providerId)
        } catch (error) {
          res.status(400).json({ error: formatServiceUserError(error, '模型服务地址不正确。请检查后重试。') })
          return
        }

        if (!body) {
          res.status(400).json({ error: '模型请求内容为空。请重新发送消息。' })
          return
        }

        const headers: Record<string, string> = {
          Accept: 'text/event-stream, text/plain, application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'LinX/1.0 (OpenAI-compatible model proxy)',
        }
        if (providerId === 'google') {
          if (apiKey) headers['x-goog-api-key'] = apiKey
        } else if (providerId !== 'ollama' && apiKey) {
          headers.Authorization = `Bearer ${apiKey}`
        }

        const upstream = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: abortController.signal,
        })
        console.log('[WebServer] Model chat proxy upstream response:', {
          providerId,
          endpoint: url.toString(),
          status: upstream.status,
          contentType: upstream.headers.get('content-type'),
        })

        res.status(upstream.status)
        upstream.headers.forEach((value, key) => {
          if (!shouldForwardUpstreamHeader(key)) return
          res.setHeader(key, value)
        })

        const reader = upstream.body?.getReader()
        if (!reader) {
          res.end(await upstream.text())
          return
        }

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            if (value) {
              res.write(Buffer.from(value))
            }
          }
          res.end()
        } finally {
          reader.releaseLock()
        }
      } catch (error) {
        console.error('[WebServer] Failed to proxy model chat request:', error)
        sendUserError(res, 500, '模型服务请求失败。请检查密钥、服务地址或网络后重试。', error)
      } finally {
        clearTimeout(timeout)
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
        sendUserError(res, 404, '没有找到这个工作会话。请返回当前聊天后重试。')
        return
      }
      res.json(session)
    })

    this.app.post('/api/runtime/threads', (req: Request, res: Response) => {
      try {
        const { threadId, container, workspaceKind, title, repoPath, folderPath, runnerType, tool, baseRef, branch } = req.body ?? {}
        if (!threadId || !title) {
          sendUserError(res, 400, '请先选择聊天和工作区后再启动。')
          return
        }

        const session = getRuntimeThreadsModule().createSession({
          threadId,
          container,
          workspaceKind,
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
        sendUserError(res, 500, '工作会话创建失败。请重新进入 LinX；如果仍失败，请换一个空间。', error)
      }
    })

    this.app.post('/api/runtime/threads/:id/start', async (req: Request, res: Response) => {
      try {
        const session = await getRuntimeThreadsModule().startSession(routeParam(req.params.id))
        res.json(session)
      } catch (error) {
        console.error('[WebServer] Failed to start runtime session:', error)
        res.status(500).json({ error: formatServiceUserError(error, '运行时会话启动失败。请稍后重试。') })
      }
    })

    this.app.post('/api/runtime/threads/:id/pause', async (req: Request, res: Response) => {
      try {
        const session = await getRuntimeThreadsModule().pauseSession(routeParam(req.params.id))
        res.json(session)
      } catch (error) {
        console.error('[WebServer] Failed to pause runtime session:', error)
        res.status(500).json({ error: formatServiceUserError(error, '运行时会话暂停失败。请稍后重试。') })
      }
    })

    this.app.post('/api/runtime/threads/:id/resume', async (req: Request, res: Response) => {
      try {
        const session = await getRuntimeThreadsModule().resumeSession(routeParam(req.params.id))
        res.json(session)
      } catch (error) {
        console.error('[WebServer] Failed to resume runtime session:', error)
        res.status(500).json({ error: formatServiceUserError(error, '运行时会话恢复失败。请稍后重试。') })
      }
    })

    this.app.post('/api/runtime/threads/:id/stop', async (req: Request, res: Response) => {
      try {
        const session = await getRuntimeThreadsModule().stopSession(routeParam(req.params.id))
        res.json(session)
      } catch (error) {
        console.error('[WebServer] Failed to stop runtime session:', error)
        res.status(500).json({ error: formatServiceUserError(error, '运行时会话停止失败。请稍后重试。') })
      }
    })

    this.app.post('/api/runtime/threads/:id/message', async (req: Request, res: Response) => {
      try {
        const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
        if (!text) {
          sendUserError(res, 400, '请输入要发送的内容。')
          return
        }

        const session = await getRuntimeThreadsModule().sendSessionMessage(routeParam(req.params.id), text)
        res.json(session)
      } catch (error) {
        console.error('[WebServer] Failed to send runtime session message:', error)
        res.status(500).json({ error: formatServiceUserError(error, '消息发送失败。请稍后重试。') })
      }
    })

    this.app.post('/api/runtime/threads/:id/tool-calls/:requestId/respond', async (req: Request, res: Response) => {
      try {
        const output = typeof req.body?.output === 'string' ? req.body.output : ''
        if (!output.trim()) {
          sendUserError(res, 400, '请先填写工具执行结果。')
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
        res.status(500).json({ error: formatServiceUserError(error, '工具结果提交失败。请稍后重试。') })
      }
    })

    this.app.get('/api/runtime/threads/:id/log', (req: Request, res: Response) => {
      try {
        const log = getRuntimeThreadsModule().getSessionLog(routeParam(req.params.id))
        res.type('text/plain').send(log)
      } catch (error) {
        console.error('[WebServer] Failed to get runtime session log:', error)
        sendUserError(res, 500, '工作会话日志读取失败。请稍后重试。', error)
      }
    })

    this.app.get('/api/runtime/threads/:id/events', (req: Request, res: Response) => {
      const runtimeSessions = getRuntimeThreadsModule()
      const sessionId = routeParam(req.params.id)
      const session = runtimeSessions.getSession(sessionId)
      if (!session) {
        sendUserError(res, 404, '没有找到这个工作会话。请返回当前聊天后重试。')
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
        html = injectServiceRuntimeScript(html)

        res.setHeader('Cache-Control', 'no-store')
        res.type('html').send(html)
      })

      this.app.use(express.static(distDir))

      // SPA fallback - also inject for deep links
      this.app.use((req, res) => {
        // Skip API routes
        if (req.path.startsWith('/api/')) {
          sendUserError(res, 404, '没有找到这个服务接口。请刷新页面后重试。')
          return
        }

        const indexPath = path.join(distDir, 'index.html')
        let html = fs.readFileSync(indexPath, 'utf-8')
        html = injectServiceRuntimeScript(html)

        res.setHeader('Cache-Control', 'no-store')
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
      this.server = this.app.listen(5173, '127.0.0.1', () => {
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
