import * as fs from 'node:fs'
import * as path from 'node:path'
import type { SolidProvider } from './provider-manager'
import type { XpodManager, XpodStartProgress } from './xpod-manager'
import { desktopFetch } from './desktop-fetch'
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

export interface LocalOnboardingNetworkConfigInput {
  publicDomain?: string | null
  tunnelProvider?: 'cloudflare' | null
  tunnelToken?: string | null
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
type ManagedDomainConfig = NonNullable<SolidProvider['managed']>['domain']

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
    const productLabel = getLocalSpaceProductLabel(spaceKind)
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
        message: '本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。',
        errorCode: 'LOCAL_CLOUD_BINDING_REQUIRED',
        canRetry: true,
        canOpenSettings: true,
      })
    }

    const localEntryUrl = localUrl ?? baseUrl ?? provider.issuerUrl
    const capabilities = await this.fetchCapabilities(localEntryUrl)
    if (
      spaceKind === 'local'
      && publicUrl
      && capabilities.baseUrl
      && !urlsEqual(capabilities.baseUrl, publicUrl)
    ) {
      return this.updateSnapshot({
        state: 'idle',
        spaceKind,
        localUrl,
        baseUrl,
        ...bindingFields,
        capabilities,
        message: '本地空间地址已变化，需要重新启动本地服务。',
        errorCode: 'LOCAL_CANONICAL_MISMATCH',
        canRetry: true,
        canOpenSettings: true,
      })
    }

    return this.updateSnapshot({
      state: 'ready',
      spaceKind,
      localUrl,
      baseUrl,
      ...bindingFields,
      capabilities,
      message: spaceKind === 'standalone'
        ? '独立空间已准备好，接下来会打开本机登录页。'
        : '本地空间已准备好，接下来会打开登录页，数据会写入这台电脑。',
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
    const productLabel = getLocalSpaceProductLabel(spaceKind)

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
      const canonicalMismatch = await this.hasRunningLocalCanonicalMismatch({
        spaceKind,
        localUrl,
        publicUrl,
      })
      if (!canonicalMismatch) {
        return this.refresh()
      }
    }

    this.updateSnapshot({
      state: 'starting',
      spaceKind,
      localUrl,
      baseUrl,
      ...bindingFields,
      capabilities: null,
      message: `检查${productLabel}运行环境`,
      progress: {
        phase: 'resolve-runtime',
        label: `检查${productLabel}运行环境`,
        detail: null,
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
          const userProgress = formatLocalStartupProgress(progress, productLabel)
          this.updateSnapshot({
            state: 'starting',
            spaceKind,
            localUrl,
            baseUrl,
            ...bindingFields,
            capabilities: null,
            message: userProgress.label,
            progress: userProgress,
            errorCode: null,
            canRetry: false,
            canOpenSettings: false,
          })
        },
      )

      return this.refresh()
    } catch (error) {
      const message = formatLocalOnboardingError(error, '本地空间启动失败。请稍后重试。')
      this.lastStartError = {
        spaceKind,
        providerId: provider.id,
        localUrl,
        baseUrl,
        publicUrl,
        message,
        errorCode: 'LOCAL_START_FAILED',
      }
      return this.updateSnapshot({
        state: 'error',
        spaceKind,
        localUrl,
        baseUrl,
        ...bindingFields,
        capabilities: null,
        message,
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
    return this.saveNetworkConfig({
      tunnelProvider: input.provider ?? 'cloudflare',
      tunnelToken: input.token,
    })
  }

  public async saveNetworkConfig(input: LocalOnboardingNetworkConfigInput): Promise<LocalOnboardingSnapshot> {
    const provider = this.ensureBootstrapProvider('local')
    if (!provider.managed) {
      throw new Error(`Provider '${provider.id}' is not a managed pod`)
    }

    const publicDomainConfig = resolvePublicDomainConfig(input.publicDomain, provider.managed.domain)
    if (publicDomainConfig.error) {
      return this.updateSnapshot({
        ...this.snapshot,
        state: this.snapshot.state === 'space_required' ? 'idle' : this.snapshot.state,
        message: publicDomainConfig.error,
        errorCode: 'LOCAL_PUBLIC_DOMAIN_INVALID',
        canRetry: true,
        canOpenSettings: true,
      })
    }

    const hasTunnelTokenInput = typeof input.tunnelToken === 'string'
    const token = hasTunnelTokenInput ? extractCloudflareTunnelToken(input.tunnelToken ?? '') : ''
    if (hasTunnelTokenInput && input.tunnelToken?.trim() && !token) {
      return this.updateSnapshot({
        ...this.snapshot,
        state: this.snapshot.state === 'space_required' ? 'idle' : this.snapshot.state,
        message: '请粘贴隧道 Token，或粘贴完整的隧道启动命令。',
        errorCode: 'LOCAL_TUNNEL_TOKEN_REQUIRED',
        canRetry: true,
        canOpenSettings: true,
      })
    }

    const nextManaged = {
      ...provider.managed,
      spaceKind: 'local' as const,
      domain: publicDomainConfig.domain,
      tunnelToken: token || provider.managed.tunnelToken,
    }
    provider.managed = nextManaged
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

    if (!status.provisioning?.publicUrl || !status.provisioning?.provisionCode || !status.provisioning?.cloudIdentityUrl) {
      return true
    }

    const configuredTunnelToken = provider.managed?.tunnelToken
    if (
      configuredTunnelToken
      && status.provisioning.tunnelToken !== configuredTunnelToken
    ) {
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
    if (
      !domain
      || (domain.type !== 'custom' && domain.type !== 'managed')
      || !domain.value?.trim()
    ) {
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

  private async hasRunningLocalCanonicalMismatch(input: {
    spaceKind: LocalSpaceKind | null;
    localUrl: string | null;
    publicUrl: string | null;
  }): Promise<boolean> {
    if (input.spaceKind !== 'local' || !input.localUrl || !input.publicUrl) {
      return false
    }

    const capabilities = await this.fetchCapabilities(input.localUrl)
    return Boolean(
      capabilities.baseUrl
      && !urlsEqual(capabilities.baseUrl, input.publicUrl),
    )
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

function getLocalSpaceProductLabel(spaceKind: LocalSpaceKind | null): string {
  return spaceKind === 'standalone' ? '独立空间' : '本地空间'
}

function formatLocalOnboardingError(error: unknown, fallback: string): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : ''
  const normalized = message.toLowerCase()

  if (!message) {
    return fallback
  }

  if (/unable to install @undefineds\.co\/xpod|unable to prepare xpod runtime/.test(normalized)) {
    return '本地空间组件下载失败。请检查网络后重试。'
  }

  if (/missing required local login\/startup capabilities|scoped webid|scoped pickwebid|scoped picker|escaped recursive css runtime/.test(normalized)) {
    return '本地空间版本过旧。请重启 LinX 让它自动更新；如果仍失败，请打开本地空间设置修复。'
  }

  if (/local 服务在完成启动前已退出|exceeded max restarts/.test(normalized)) {
    return '本地空间启动失败。请点“重新检查”；如果仍失败，请重启 LinX。'
  }

  if (/等待 local 服务就绪超时|local.*启动超时/.test(normalized)) {
    return '本地空间启动超时。请点“重新检查”；如果仍失败，请重启 LinX。'
  }

  if (/cannot find module|invalid resource iri|jsonld|componentsjs|node_modules|require stack|\/users\/|application support/i.test(message)) {
    return '本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。'
  }

  if (/eaddrinuse|port|address already in use/.test(normalized)) {
    return '本地空间端口被占用。请关闭占用端口的程序，或在本地空间设置里换一个端口。'
  }

  if (/provider '.+' is not a managed pod|not managed|no selected local space/.test(normalized)) {
    return '本地空间配置不完整。请返回空间选择，重新选择。'
  }

  if (/service unavailable|http\s*503/.test(normalized)) {
    return '登录服务暂时不可用。请稍后重试。'
  }

  if (/publicurl is required|canonical|cloud.*绑定|绑定信息/.test(normalized)) {
    return '本地空间还没有完成准备。请回到空间选择页，再点一次“本地空间”。'
  }

  if (/invalid or expired provisioncode|invalid or expired providercode|provisioncode.*expired|providercode.*expired/.test(normalized)) {
    return '这次本地登录已失效。请回到空间选择页，重新点“本地空间”。'
  }

  if (/http\s*401|unauthorized/.test(normalized)) {
    return '登录状态已失效。请重新登录。'
  }

  if (/http\s*403|forbidden/.test(normalized)) {
    return '这个账号还不能写入当前空间。请换一个空间；如果这是你的本地空间，请先完成空间创建。'
  }

  if (message.length > 180 || /stack|\.js:\d+|\.ts:\d+|https?:\/\/|file:\/\/|localhost|127\.0\.0\.1|0\.0\.0\.0|HTTP\s+\d{3}|Pod|Solid|Agent|Secretary|WebID|IRI|RDF|row\.id/i.test(message)) {
    return fallback
  }

  return message
}

function formatLocalStartupProgress(progress: XpodStartProgress, productLabel: string): XpodStartProgress {
  switch (progress.phase) {
    case 'source':
      return {
        phase: progress.phase,
        label: formatRequiredLocalProgressText(progress.label, `定位${productLabel}运行环境`),
        detail: progress.detail ? formatOptionalLocalProgressText(progress.detail) : null,
      }
    case 'version':
      return {
        phase: progress.phase,
        label: formatRequiredLocalProgressText(progress.label, '确定 xpod runtime 版本'),
        detail: progress.detail ? formatOptionalLocalProgressText(progress.detail) : null,
      }
    case 'check-bun':
      return {
        phase: progress.phase,
        label: formatRequiredLocalProgressText(progress.label, '检查 Bun 运行环境'),
        detail: progress.detail ? formatOptionalLocalProgressText(progress.detail) : null,
      }
    case 'check-node':
      return {
        phase: progress.phase,
        label: formatRequiredLocalProgressText(progress.label, '检查 Node/npm 运行环境'),
        detail: progress.detail ? formatOptionalLocalProgressText(progress.detail) : null,
      }
    case 'prepare-runtime-cache':
      return {
        phase: progress.phase,
        label: formatRequiredLocalProgressText(progress.label, '写入 xpod runtime 缓存配置'),
        detail: progress.detail ? formatOptionalLocalProgressText(progress.detail) : null,
      }
    case 'verify-runtime':
      return {
        phase: progress.phase,
        label: formatRequiredLocalProgressText(progress.label, '校验 xpod runtime 启动能力'),
        detail: progress.detail ? formatOptionalLocalProgressText(progress.detail) : null,
      }
    case 'runtime-ready':
      return {
        phase: progress.phase,
        label: formatRequiredLocalProgressText(progress.label, 'xpod runtime 已就绪'),
        detail: progress.detail ? formatOptionalLocalProgressText(progress.detail) : null,
      }
    case 'embedded':
      return {
        phase: progress.phase,
        label: formatRequiredLocalProgressText(progress.label, '使用内置 xpod runtime'),
        detail: progress.detail ? formatOptionalLocalProgressText(progress.detail) : null,
      }
    case 'resolve-runtime':
      return {
        phase: progress.phase,
        label: formatRequiredLocalProgressText(progress.label, `检查${productLabel}运行环境`),
        detail: progress.detail ? formatOptionalLocalProgressText(progress.detail) : null,
      }
    case 'install-bun':
    case 'install-npm':
      return {
        phase: progress.phase,
        label: formatRequiredLocalProgressText(progress.label, '安装 xpod runtime'),
        detail: progress.detail
          ? formatOptionalLocalProgressText(progress.detail)
          : '首次启动需要安装 runtime 包与生产依赖，完成后会自动继续。',
      }
    case 'register-cloud':
      return {
        phase: progress.phase,
        label: formatRequiredLocalProgressText(progress.label, '准备账号绑定'),
        detail: progress.detail
          ? formatOptionalLocalProgressText(progress.detail)
          : '正在为这台电脑准备本地登录入口。',
      }
    case 'prepare-data':
    case 'write-env':
      return {
        phase: progress.phase,
        label: `准备${productLabel}数据`,
        detail: null,
      }
    case 'spawn':
      return {
        phase: progress.phase,
        label: `正在启动${productLabel}`,
        detail: null,
      }
    case 'wait-ready':
      return {
        phase: progress.phase,
        label: `等待${productLabel}就绪`,
        detail: '这一步可能需要几十秒。',
      }
    case 'ready':
      return {
        phase: progress.phase,
        label: `${productLabel}已准备好`,
        detail: null,
      }
    default:
      return {
        phase: progress.phase,
        label: formatRequiredLocalProgressText(progress.label, `正在启动 ${productLabel}…`),
        detail: progress.detail ? formatOptionalLocalProgressText(progress.detail) : null,
      }
  }
}

function formatRequiredLocalProgressText(value: string | null | undefined, fallback: string): string {
  return formatOptionalLocalProgressText(value) ?? fallback
}

function formatOptionalLocalProgressText(value: string | null | undefined): string | null {
  if (!value) return null
  if (isInternalDiagnosticText(value)) return null
  return value
}

function isInternalDiagnosticText(value: string): boolean {
  return /node_modules|\/Users\/|\\Users\\|Application Support|\.js:\d+|\.ts:\d+|Require stack|Cannot find module|jsonld|componentsjs|publicUrl|provisionCode|spDomain|baseUrl|canonical|OIDC|issuer|provider|HTTP\s+\d{3}|\bPod\b|Solid|Agent|Secretary|WebID|IRI|RDF|row\.id|https?:\/\/|file:\/\/|localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(value)
}

function resolvePublicDomainConfig(
  value: string | null | undefined,
  fallback: ManagedDomainConfig,
): {
  domain: ManagedDomainConfig
  error: string | null
} {
  if (typeof value === 'undefined') {
    return { domain: fallback, error: null }
  }

  const raw = value?.trim() ?? ''
  if (!raw) {
    return { domain: { type: 'none' }, error: null }
  }

  const parsed = parsePublicDomain(raw)
  if (!parsed.hostname) {
    return {
      domain: fallback,
      error: parsed.error ?? '请填写可公开访问的 HTTPS 域名。',
    }
  }

  if (isLocalhostHostname(parsed.hostname) || isPrivateIpHostname(parsed.hostname)) {
    return {
      domain: fallback,
      error: '公网域名不能是 localhost、局域网地址或本机 IP。',
    }
  }

  return {
    domain: {
      type: isManagedCloudDomain(parsed.hostname) ? 'managed' : 'custom',
      value: parsed.hostname,
    },
    error: null,
  }
}

function parsePublicDomain(raw: string): { hostname: string | null; error: string | null } {
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      const url = new URL(raw)
      if (url.protocol !== 'https:') {
        return { hostname: null, error: '自有公网域名必须使用 HTTPS。' }
      }
      if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
        return { hostname: null, error: '公网域名只填写 origin，不要包含路径或参数。' }
      }
      return { hostname: url.hostname, error: null }
    }

    if (raw.includes('/') || raw.includes('?') || raw.includes('#')) {
      return { hostname: null, error: '公网域名只填写域名，不要包含路径或参数。' }
    }

    const url = new URL(`https://${raw}`)
    return { hostname: url.hostname, error: null }
  } catch {
    return { hostname: null, error: '请填写可公开访问的 HTTPS 域名。' }
  }
}

function isManagedCloudDomain(hostname: string): boolean {
  return /^node-[a-z0-9-]+\.undefineds\.co$/i.test(hostname)
    || /^[a-z0-9-]+\.nodes\.undefineds\.co$/i.test(hostname)
}

function isLocalhostHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost')
}

function isPrivateIpHostname(hostname: string): boolean {
  if (/^(127\.|10\.|192\.168\.)/.test(hostname)) {
    return true
  }

  const match = hostname.match(/^172\.(\d+)\./)
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31)
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
    const response = await desktopFetch(url, {
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
        ? '独立空间本机入口可用。'
        : '独立空间本机入口不可达。',
    }
  }

  if (!localProbe.reachable) {
    return {
      status: 'failed',
      checkedAt: Date.now(),
      local: localProbe,
      public: publicProbe,
      message: '本机入口不可达，请先确认本地空间已经启动。',
    }
  }

  if (!publicProbe?.url) {
    return {
      status: 'local-only',
      checkedAt: Date.now(),
      local: localProbe,
      public: publicProbe,
      message: '本机入口可用，但还没有完成本地登录准备。',
    }
  }

  if (!publicProbe.reachable) {
    return {
      status: 'local-only',
      checkedAt: Date.now(),
      local: localProbe,
      public: publicProbe,
      message: '本机入口可用，公网入口暂不可达。可以继续本机使用，外网访问需要配置隧道。',
    }
  }

  if (localProbe.sameNode === false || publicProbe.sameNode === false) {
    return {
      status: 'mismatch',
      checkedAt: Date.now(),
      local: localProbe,
      public: publicProbe,
      message: '入口可达，但它们不是同一个本地空间。请检查本地空间设置后重试。',
    }
  }

  return {
    status: 'ready',
    checkedAt: Date.now(),
    local: localProbe,
    public: publicProbe,
    message: '本机入口和公网入口都可达，且指向同一个本地空间。',
  }
}

async function fetchCapabilitiesOnce(baseUrl: string, timeoutMs: number): Promise<LocalOnboardingCapabilities> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const url = new URL('/api/linx/capabilities', ensureTrailingSlash(baseUrl))
    const response = await desktopFetch(url, {
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
    return `${label}不可达，或不是有效的本地空间服务。`
  }
  if (sameNode === false) {
    return `${label}可达，但不是当前本地空间。`
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
