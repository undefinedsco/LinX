import * as fs from 'node:fs'
import * as path from 'node:path'
import type { SolidProvider } from './provider-manager'
import type { XpodManager, XpodStartProgress } from './xpod-manager'
import { ensureLinxLocalHome } from './local-home'

export type LocalSpaceKind = 'local' | 'standalone'

export type LocalOnboardingState =
  | 'space_required'
  | 'idle'
  | 'checking'
  | 'starting'
  | 'repair_required'
  | 'ready'
  | 'error'

export interface LocalOnboardingCapabilities {
  supported: boolean
  contract: string | null
  baseUrl: string | null
  version: string | null
}

interface CapabilityPayload {
  contract?: string
  baseUrl?: string
  version?: string
}

export interface LocalOnboardingProgress {
  phase: XpodStartProgress['phase']
  label: string
  detail?: string | null
}

export type LocalOnboardingRouteKind = 'local' | 'public'

export interface LocalOnboardingRouteProbe {
  kind: LocalOnboardingRouteKind
  url: string | null
  reachable: boolean
  sameNode: boolean | null
  latencyMs: number | null
  baseUrl: string | null
  message: string | null
}

export interface LocalOnboardingConnectivity {
  status: 'unknown' | 'checking' | 'ready' | 'local-only' | 'failed' | 'mismatch'
  checkedAt: number | null
  local: LocalOnboardingRouteProbe | null
  public: LocalOnboardingRouteProbe | null
  message: string | null
}

export interface LocalOnboardingTunnel {
  provider: 'cloudflare' | null
  hasToken: boolean
  endpoint: string | null
}

export interface LocalOnboardingSnapshot {
  state: LocalOnboardingState
  spaceKind: LocalSpaceKind | null
  localUrl: string | null
  baseUrl: string | null
  publicUrl: string | null
  tunnel: LocalOnboardingTunnel | null
  connectivity: LocalOnboardingConnectivity | null
  capabilities: LocalOnboardingCapabilities | null
  cloudIdentityUrl: string | null
  provisionCode: string | null
  provisionUrl: string | null
  nodeId: string | null
  message: string | null
  progress?: LocalOnboardingProgress | null
  errorCode: string | null
  canRetry: boolean
  canOpenSettings: boolean
}

interface PersistedLocalOnboardingState {
  spaceKind: LocalSpaceKind | null
  providerId: string | null
}

interface LocalOnboardingControllerOptions {
  xpodManager: Pick<XpodManager, 'getStatus' | 'start'>
  ensureBootstrapProvider: (spaceKind: LocalSpaceKind | null) => SolidProvider
  updateProvider?: (id: string, updates: Partial<SolidProvider>) => void
  stateDir?: string
  onSnapshotChange?: (snapshot: LocalOnboardingSnapshot) => void
  fetchCapabilities?: (baseUrl: string) => Promise<LocalOnboardingCapabilities>
  fetchCapabilitiesTimeoutMs?: number
}

type LocalXpodStatus = Awaited<ReturnType<LocalOnboardingControllerOptions['xpodManager']['getStatus']>>

const DEFAULT_SNAPSHOT: LocalOnboardingSnapshot = {
  state: 'space_required',
  spaceKind: null,
  localUrl: null,
  baseUrl: null,
  publicUrl: null,
  tunnel: null,
  connectivity: null,
  capabilities: null,
  cloudIdentityUrl: null,
  provisionCode: null,
  provisionUrl: null,
  nodeId: null,
  message: null,
  progress: null,
  errorCode: null,
  canRetry: false,
  canOpenSettings: true,
}

export class LocalOnboardingController {
  private readonly xpodManager: Pick<XpodManager, 'getStatus' | 'start'>
  private readonly ensureBootstrapProvider: (spaceKind: LocalSpaceKind | null) => SolidProvider
  private readonly updateProvider?: (id: string, updates: Partial<SolidProvider>) => void
  private readonly statePath: string
  private readonly onSnapshotChange?: (snapshot: LocalOnboardingSnapshot) => void
  private readonly fetchCapabilities: (baseUrl: string) => Promise<LocalOnboardingCapabilities>
  private state: PersistedLocalOnboardingState
  private snapshot: LocalOnboardingSnapshot
  private lastStartError: {
    spaceKind: LocalSpaceKind
    providerId: string
    localUrl: string | null
    baseUrl: string | null
    publicUrl: string | null
    message: string
    errorCode: string
  } | null = null

  public constructor(options: LocalOnboardingControllerOptions) {
    const baseDir = ensureLinxLocalHome(options.stateDir).home
    this.xpodManager = options.xpodManager
    this.ensureBootstrapProvider = options.ensureBootstrapProvider
    this.updateProvider = options.updateProvider
    this.statePath = path.join(baseDir, 'local-onboarding.json')
    this.onSnapshotChange = options.onSnapshotChange
    this.fetchCapabilities = options.fetchCapabilities
      ?? ((baseUrl: string) => fetchLocalCapabilities(baseUrl, options.fetchCapabilitiesTimeoutMs))
    this.state = this.readState()
    this.snapshot = {
      ...DEFAULT_SNAPSHOT,
      spaceKind: this.state.spaceKind,
      state: this.state.spaceKind ? 'idle' : 'space_required',
    }
  }

  public getSnapshot(): LocalOnboardingSnapshot {
    return { ...this.snapshot }
  }

  public async refresh(): Promise<LocalOnboardingSnapshot> {
    const provider = this.ensureBootstrapProvider(this.state.spaceKind)
    this.persistResolvedState({
      spaceKind: this.state.spaceKind,
      providerId: provider.id,
    })
    const status = await this.xpodManager.getStatus()
    const spaceKind = this.resolveSpaceKind(provider, status)
    const productLabel = spaceKind === 'standalone' ? 'Standalone' : 'Local'
    const localUrl = status.localUrl ?? provider.issuerUrl ?? null
    const baseUrl = status.baseUrl ?? provider.issuerUrl ?? null
    const provisioning = status.provisioning
    const configuredPublicUrl = this.resolveConfiguredPublicUrl(provider)
    const publicUrl = spaceKind === 'local'
      ? provisioning?.publicUrl ?? configuredPublicUrl ?? null
      : null
    const bindingFields = {
      publicUrl,
      tunnel: this.resolveTunnel(provider, provisioning),
      connectivity: this.resolveConnectivityForSnapshot(localUrl, publicUrl),
      cloudIdentityUrl: provisioning?.cloudIdentityUrl ?? null,
      provisionCode: provisioning?.provisionCode ?? null,
      provisionUrl: provisioning?.provisionUrl ?? null,
      nodeId: provisioning?.nodeId ?? null,
    }

    const startError = this.matchesLastStartError(provider.id, spaceKind, localUrl, baseUrl, publicUrl)
      ? this.lastStartError
      : null
    if (!status.running && startError) {
      return this.updateSnapshot({
        state: 'error',
        spaceKind,
        localUrl,
        baseUrl,
        ...bindingFields,
        capabilities: null,
        message: startError.message,
        errorCode: startError.errorCode,
        canRetry: true,
        canOpenSettings: true,
      })
    }

    if (!spaceKind) {
      return this.updateSnapshot({
        state: 'space_required',
        spaceKind: null,
        localUrl,
        baseUrl,
        ...bindingFields,
        capabilities: null,
        message: '首次使用时先确认本地空间的启动方式。服务准备好后，再继续登录。',
        errorCode: null,
        canRetry: false,
        canOpenSettings: true,
      })
    }

    if (status.status === 'starting') {
      const progress = this.snapshot.state === 'starting' ? this.snapshot.progress ?? null : null
      return this.updateSnapshot({
        state: 'starting',
        spaceKind,
        localUrl,
        baseUrl,
        ...bindingFields,
        capabilities: null,
        message: progress?.label ?? `正在启动 ${productLabel}…`,
        progress,
        errorCode: null,
        canRetry: false,
        canOpenSettings: false,
      })
    }

    if (!status.running) {
      return this.updateSnapshot({
        state: 'idle',
        spaceKind,
        localUrl,
        baseUrl,
        ...bindingFields,
        capabilities: null,
        message: `${productLabel} 尚未运行。你可以先启动服务，或先配置启动参数。`,
        errorCode: null,
        canRetry: true,
        canOpenSettings: true,
      })
    }

    if (spaceKind === 'local' && (!publicUrl || !provisioning?.provisionCode || !provisioning?.cloudIdentityUrl)) {
      return this.updateSnapshot({
        state: 'repair_required',
        spaceKind,
        localUrl,
        baseUrl,
        ...bindingFields,
        capabilities: null,
        message: 'Local 已运行，但还没拿到 Cloud 分配的 canonical URL 或绑定信息。请通过 LinX 重新启动 Local，再继续登录。',
        errorCode: 'LOCAL_CLOUD_BINDING_REQUIRED',
        canRetry: true,
        canOpenSettings: true,
      })
    }

    const localEntryUrl = localUrl ?? baseUrl ?? provider.issuerUrl
    const capabilities = await this.fetchCapabilities(localEntryUrl)

    return this.updateSnapshot({
      state: 'ready',
      spaceKind,
      localUrl,
      baseUrl,
      ...bindingFields,
      capabilities,
      message: spaceKind === 'standalone'
        ? 'Standalone 已准备好，接下来会打开本机登录页。'
        : 'Local 已准备好，接下来会通过 Cloud 登录并写入本地空间。',
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    })
  }

  public async chooseSpace(spaceKind: LocalSpaceKind): Promise<LocalOnboardingSnapshot> {
    const provider = this.ensureBootstrapProvider(spaceKind)
    this.persistResolvedState({
      spaceKind,
      providerId: provider.id,
    })
    return this.refresh()
  }

  public async continue(): Promise<LocalOnboardingSnapshot> {
    const provider = this.ensureBootstrapProvider(this.state.spaceKind)
    const status = await this.xpodManager.getStatus()
    const spaceKind = this.resolveSpaceKind(provider, status)
    const productLabel = spaceKind === 'standalone' ? 'Standalone' : 'Local'

    if (!spaceKind) {
      return this.refresh()
    }

    const localUrl = status.localUrl ?? provider.issuerUrl ?? null
    const baseUrl = status.baseUrl ?? provider.issuerUrl ?? null
    const provisioning = status.provisioning
    const configuredPublicUrl = this.resolveConfiguredPublicUrl(provider)
    const publicUrl = spaceKind === 'local'
      ? provisioning?.publicUrl ?? configuredPublicUrl ?? null
      : null
    const bindingFields = {
      publicUrl,
      tunnel: this.resolveTunnel(provider, provisioning),
      connectivity: this.resolveConnectivityForSnapshot(localUrl, publicUrl),
      cloudIdentityUrl: provisioning?.cloudIdentityUrl ?? null,
      provisionCode: provisioning?.provisionCode ?? null,
      provisionUrl: provisioning?.provisionUrl ?? null,
      nodeId: provisioning?.nodeId ?? null,
    }

    if (status.running && !this.shouldRestartForSpaceKind(provider, status, spaceKind)) {
      return this.refresh()
    }

    this.updateSnapshot({
      state: 'starting',
      spaceKind,
      localUrl,
      baseUrl,
      ...bindingFields,
      capabilities: null,
      message: '检查 xpod 运行环境',
      progress: {
        phase: 'resolve-runtime',
        label: '检查 xpod 运行环境',
        detail: `准备启动 ${productLabel}`,
      },
      errorCode: null,
      canRetry: false,
      canOpenSettings: false,
    })

    try {
      if (!provider.managed) {
        throw new Error(`Provider '${provider.id}' is not a managed pod`)
      }

      this.lastStartError = null
      await this.xpodManager.start(
        {
          providerId: provider.id,
          dataDir: provider.managed.dataDir,
          port: provider.managed.port,
          spaceKind,
          domain: provider.managed.domain,
          tunnelToken: provider.managed.tunnelToken,
        },
        (progress) => {
          this.updateSnapshot({
            state: 'starting',
            spaceKind,
            localUrl,
            baseUrl,
            ...bindingFields,
            capabilities: null,
            message: progress.label,
            progress,
            errorCode: null,
            canRetry: false,
            canOpenSettings: false,
          })
        },
      )

      return this.refresh()
    } catch (error) {
      this.lastStartError = {
        spaceKind,
        providerId: provider.id,
        localUrl,
        baseUrl,
        publicUrl,
        message: error instanceof Error ? error.message : '启动 Local 失败。',
        errorCode: 'LOCAL_START_FAILED',
      }
      return this.updateSnapshot({
        state: 'error',
        spaceKind,
        localUrl,
        baseUrl,
        ...bindingFields,
        capabilities: null,
        message: error instanceof Error ? error.message : '启动 Local 失败。',
        progress: null,
        errorCode: 'LOCAL_START_FAILED',
        canRetry: true,
        canOpenSettings: true,
      })
    }
  }

  public async saveTunnelToken(input: {
    provider?: 'cloudflare'
    token: string
  }): Promise<LocalOnboardingSnapshot> {
    const token = extractCloudflareTunnelToken(input.token)
    if (!token) {
      return this.updateSnapshot({
        ...this.snapshot,
        state: this.snapshot.state === 'space_required' ? 'idle' : this.snapshot.state,
        message: '请粘贴 Cloudflare Tunnel token，或粘贴完整的 cloudflared run 命令。',
        errorCode: 'LOCAL_TUNNEL_TOKEN_REQUIRED',
        canRetry: true,
        canOpenSettings: true,
      })
    }

    const provider = this.ensureBootstrapProvider('local')
    if (!provider.managed) {
      throw new Error(`Provider '${provider.id}' is not a managed pod`)
    }

    const nextManaged = {
      ...provider.managed,
      spaceKind: 'local' as const,
      tunnelToken: token,
    }
    this.updateProvider?.(provider.id, { managed: nextManaged })
    this.persistResolvedState({
      spaceKind: 'local',
      providerId: provider.id,
    })

    return this.continue()
  }

  public async testConnectivity(): Promise<LocalOnboardingSnapshot> {
    const provider = this.ensureBootstrapProvider(this.state.spaceKind)
    const status = await this.xpodManager.getStatus()
    const spaceKind = this.resolveSpaceKind(provider, status)
    const localUrl = status.localUrl ?? provider.issuerUrl ?? null
    const baseUrl = status.baseUrl ?? provider.issuerUrl ?? null
    const provisioning = status.provisioning
    const configuredPublicUrl = this.resolveConfiguredPublicUrl(provider)
    const publicUrl = spaceKind === 'local'
      ? provisioning?.publicUrl ?? configuredPublicUrl ?? null
      : null
    const expectedBaseUrl = spaceKind === 'local'
      ? publicUrl
      : baseUrl

    this.updateSnapshot({
      ...this.snapshot,
      spaceKind,
      localUrl,
      baseUrl,
      publicUrl,
      tunnel: this.resolveTunnel(provider, provisioning),
      connectivity: {
        status: 'checking',
        checkedAt: null,
        local: null,
        public: null,
        message: '正在测试本机入口和公网入口...',
      },
      message: this.snapshot.message,
    })

    const [localProbe, publicProbe] = await Promise.all([
      probeRoute(localUrl, expectedBaseUrl, 'local'),
      spaceKind === 'local' && publicUrl
        ? probeRoute(publicUrl, expectedBaseUrl, 'public')
        : Promise.resolve(null),
    ])
    const connectivity = summarizeConnectivity(spaceKind, localProbe, publicProbe)

    return this.updateSnapshot({
      ...this.snapshot,
      spaceKind,
      localUrl,
      baseUrl,
      publicUrl,
      tunnel: this.resolveTunnel(provider, provisioning),
      connectivity,
    })
  }

  private updateSnapshot(next: LocalOnboardingSnapshot): LocalOnboardingSnapshot {
    this.snapshot = next
    this.onSnapshotChange?.(this.getSnapshot())
    return this.getSnapshot()
  }

  private resolveSpaceKind(
    _provider: SolidProvider,
    _status: LocalXpodStatus,
  ): LocalSpaceKind | null {
    if (this.state.spaceKind) {
      return this.state.spaceKind
    }

    return null
  }

  private shouldRestartForSpaceKind(
    provider: SolidProvider,
    status: LocalXpodStatus,
    spaceKind: LocalSpaceKind,
  ): boolean {
    if (!status.running) {
      return true
    }

    if (spaceKind !== 'local') {
      return false
    }

    const desiredTunnelToken = provider.managed?.tunnelToken
    if (desiredTunnelToken && status.provisioning?.tunnelToken !== desiredTunnelToken) {
      return true
    }

    if (!status.provisioning?.publicUrl || !status.provisioning?.provisionCode || !status.provisioning?.cloudIdentityUrl) {
      return true
    }

    const configuredPublicUrl = this.resolveConfiguredPublicUrl(provider)
    if (!configuredPublicUrl) {
      return false
    }

    if (!urlsEqual(status.baseUrl, configuredPublicUrl)) {
      return true
    }

    if (!urlsEqual(status.provisioning?.publicUrl, configuredPublicUrl)) {
      return true
    }

    return false
  }

  private resolveConfiguredPublicUrl(provider: SolidProvider): string | null {
    const domain = provider.managed?.domain
    if (!domain || domain.type !== 'custom' || !domain.value?.trim()) {
      return null
    }

    return domainToPublicUrl(domain.value)
  }

  private resolveTunnel(
    provider: SolidProvider,
    provisioning: LocalXpodStatus['provisioning'],
  ): LocalOnboardingTunnel | null {
    const hasToken = Boolean(provider.managed?.tunnelToken || provisioning?.tunnelToken)
    const providerName = hasToken || provisioning?.tunnelProvider === 'cloudflare'
      ? 'cloudflare'
      : null

    return {
      provider: providerName,
      hasToken,
      endpoint: provisioning?.tunnelEndpoint ?? null,
    }
  }

  private resolveConnectivityForSnapshot(
    localUrl: string | null,
    publicUrl: string | null,
  ): LocalOnboardingConnectivity | null {
    const current = this.snapshot.connectivity
    if (!current) {
      return unknownConnectivity()
    }

    if (current.local?.url !== localUrl || current.public?.url !== publicUrl) {
      return unknownConnectivity()
    }

    return current
  }

  private persistResolvedState(next: PersistedLocalOnboardingState): void {
    if (this.state.spaceKind === next.spaceKind && this.state.providerId === next.providerId) {
      return
    }

    this.lastStartError = null
    this.state = next
    this.writeState(this.state)
  }

  private matchesLastStartError(
    providerId: string,
    spaceKind: LocalSpaceKind | null,
    localUrl: string | null,
    baseUrl: string | null,
    publicUrl: string | null,
  ): boolean {
    return Boolean(
      this.lastStartError
      && this.lastStartError.providerId === providerId
      && this.lastStartError.spaceKind === spaceKind
      && urlsEqual(this.lastStartError.localUrl, localUrl)
      && urlsEqual(this.lastStartError.baseUrl, baseUrl)
      && urlsEqual(this.lastStartError.publicUrl, publicUrl),
    )
  }

  private readState(): PersistedLocalOnboardingState {
    try {
      if (!fs.existsSync(this.statePath)) {
        return { spaceKind: null, providerId: null }
      }

      const raw = fs.readFileSync(this.statePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedLocalOnboardingState>
      return {
        spaceKind: parsePersistedSpaceKind(parsed.spaceKind),
        providerId: typeof parsed.providerId === 'string' && parsed.providerId.trim().length > 0
          ? parsed.providerId
          : null,
      }
    } catch {
      return { spaceKind: null, providerId: null }
    }
  }

  private writeState(state: PersistedLocalOnboardingState): void {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true })
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf8')
  }
}

function parsePersistedSpaceKind(value: unknown): LocalSpaceKind | null {
  if (value === 'local' || value === 'standalone') {
    return value
  }

  return null
}

function extractCloudflareTunnelToken(input: string): string {
  const raw = input.trim()
  if (!raw) return ''

  const tokenFlagMatch = raw.match(/(?:^|\s)--token(?:=|\s+)(?:"([^"]+)"|'([^']+)'|([^\s]+))/)
  const token = tokenFlagMatch?.[1] ?? tokenFlagMatch?.[2] ?? tokenFlagMatch?.[3]
  if (token) {
    return token.trim()
  }

  return raw
}

async function fetchLocalCapabilities(baseUrl: string, timeoutMs = 3000): Promise<LocalOnboardingCapabilities> {
  const deadline = Date.now() + timeoutMs
  let lastResult = unsupportedCapabilities()

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) {
      break
    }

    lastResult = await fetchLocalCapabilitiesOnce(baseUrl, Math.min(1000, remainingMs))
    if (lastResult.supported) {
      return lastResult
    }

    const delayMs = Math.min(250, deadline - Date.now())
    if (delayMs <= 0) {
      break
    }
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  return lastResult
}

async function fetchLocalCapabilitiesOnce(baseUrl: string, timeoutMs: number): Promise<LocalOnboardingCapabilities> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = new URL('/api/linx/capabilities', ensureTrailingSlash(baseUrl))
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      return unsupportedCapabilities()
    }

    const payload = await response.json() as CapabilityPayload

    return {
      supported: payload.contract === 'linx-local-onboarding/v1',
      contract: payload.contract ?? null,
      baseUrl: payload.baseUrl ?? null,
      version: payload.version ?? null,
    }
  } catch {
    return unsupportedCapabilities()
  } finally {
    clearTimeout(timeoutId)
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

function unsupportedCapabilities(): LocalOnboardingCapabilities {
  return {
    supported: false,
    contract: null,
    baseUrl: null,
    version: null,
  }
}

function domainToPublicUrl(domain: string): string {
  return ensureTrailingSlash(`https://${domain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')}`)
}

function unknownConnectivity(): LocalOnboardingConnectivity {
  return {
    status: 'unknown',
    checkedAt: null,
    local: null,
    public: null,
    message: '尚未测试公网联通性。',
  }
}

async function probeRoute(
  url: string | null,
  expectedBaseUrl: string | null,
  kind: LocalOnboardingRouteKind,
): Promise<LocalOnboardingRouteProbe> {
  if (!url) {
    return {
      kind,
      url: null,
      reachable: false,
      sameNode: null,
      latencyMs: null,
      baseUrl: null,
      message: kind === 'local' ? '本机入口未准备好。' : '公网入口未准备好。',
    }
  }

  const start = Date.now()
  const capability = await fetchCapabilitiesOnce(url, 5000)
  const latencyMs = Date.now() - start
  const expected = normalizeComparableUrl(expectedBaseUrl)
  const actual = normalizeComparableUrl(capability.baseUrl)
  const sameNode = capability.supported && expected && actual
    ? expected === actual
    : capability.supported
      ? null
      : false

  return {
    kind,
    url: ensureTrailingSlash(url),
    reachable: capability.supported,
    sameNode,
    latencyMs: capability.supported ? latencyMs : null,
    baseUrl: capability.baseUrl,
    message: buildProbeMessage(kind, capability, sameNode),
  }
}

function summarizeConnectivity(
  spaceKind: LocalSpaceKind | null,
  localProbe: LocalOnboardingRouteProbe,
  publicProbe: LocalOnboardingRouteProbe | null,
): LocalOnboardingConnectivity {
  if (spaceKind !== 'local') {
    return {
      status: localProbe.reachable ? 'ready' : 'failed',
      checkedAt: Date.now(),
      local: localProbe,
      public: null,
      message: localProbe.reachable
        ? 'Standalone 本机入口可用。'
        : 'Standalone 本机入口不可达。',
    }
  }

  if (!localProbe.reachable) {
    return {
      status: 'failed',
      checkedAt: Date.now(),
      local: localProbe,
      public: publicProbe,
      message: 'Local 本机入口不可达，请先确认 xpod 已启动。',
    }
  }

  if (!publicProbe?.url) {
    return {
      status: 'local-only',
      checkedAt: Date.now(),
      local: localProbe,
      public: publicProbe,
      message: '本机入口可用，但还没有公网 canonical URL。',
    }
  }

  if (!publicProbe.reachable) {
    return {
      status: 'local-only',
      checkedAt: Date.now(),
      local: localProbe,
      public: publicProbe,
      message: '本机入口可用，公网入口暂不可达。配置并启动 tunnel 后再重试。',
    }
  }

  if (localProbe.sameNode === false || publicProbe.sameNode === false) {
    return {
      status: 'mismatch',
      checkedAt: Date.now(),
      local: localProbe,
      public: publicProbe,
      message: '入口可达，但返回的 canonical baseUrl 不一致，已阻止当作同一 Local 节点。',
    }
  }

  return {
    status: 'ready',
    checkedAt: Date.now(),
    local: localProbe,
    public: publicProbe,
    message: '本机入口和公网入口都可达，且指向同一个 Local 节点。',
  }
}

async function fetchCapabilitiesOnce(baseUrl: string, timeoutMs: number): Promise<LocalOnboardingCapabilities> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = new URL('/api/linx/capabilities', ensureTrailingSlash(baseUrl))
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })

    if (!response.ok) {
      return unsupportedCapabilities()
    }

    return parseCapabilities(await response.json() as CapabilityPayload)
  } catch {
    return unsupportedCapabilities()
  } finally {
    clearTimeout(timeoutId)
  }
}

function parseCapabilities(payload: CapabilityPayload): LocalOnboardingCapabilities {
  return {
    supported: payload.contract === 'linx-local-onboarding/v1',
    contract: payload.contract ?? null,
    baseUrl: payload.baseUrl ?? null,
    version: payload.version ?? null,
  }
}

function buildProbeMessage(
  kind: LocalOnboardingRouteKind,
  capability: LocalOnboardingCapabilities,
  sameNode: boolean | null,
): string {
  const label = kind === 'local' ? '本机入口' : '公网入口'
  if (!capability.supported) {
    return `${label}不可达或未返回 Local capabilities。`
  }
  if (sameNode === false) {
    return `${label}可达，但不是当前 Local canonical 节点。`
  }
  return `${label}可达。`
}

function normalizeComparableUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    return ensureTrailingSlash(new URL(value).toString())
  } catch {
    return ensureTrailingSlash(value)
  }
}

function urlsEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) {
    return !left && !right
  }

  return ensureTrailingSlash(left) === ensureTrailingSlash(right)
}
