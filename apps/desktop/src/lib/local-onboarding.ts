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

export interface LocalOnboardingProgress {
  phase: XpodStartProgress['phase']
  label: string
  detail?: string | null
}

export interface LocalOnboardingSnapshot {
  state: LocalOnboardingState
  spaceKind: LocalSpaceKind | null
  localUrl: string | null
  baseUrl: string | null
  publicUrl: string | null
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
    if (!domain || domain.type === 'none' || !domain.value?.trim()) {
      return null
    }

    return domainToPublicUrl(domain.value)
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

    const payload = await response.json() as {
      contract?: string
      baseUrl?: string
      version?: string
    }

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

function urlsEqual(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) {
    return !left && !right
  }

  return ensureTrailingSlash(left) === ensureTrailingSlash(right)
}
