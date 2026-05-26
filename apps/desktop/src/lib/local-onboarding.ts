import * as fs from 'node:fs'
import * as path from 'node:path'
import type { SolidProvider } from './provider-manager'
import type { XpodManager, XpodStartProgress } from './xpod-manager'
import { ensureLinxLocalHome } from './local-home'

export type LocalOnboardingMode = 'local' | 'standalone'

export type LocalOnboardingState =
  | 'mode_required'
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
  mode: LocalOnboardingMode | null
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
  mode: LocalOnboardingMode | null
  providerId: string | null
}

interface LocalOnboardingControllerOptions {
  xpodManager: Pick<XpodManager, 'getStatus' | 'start'>
  ensureBootstrapProvider: (mode: LocalOnboardingMode | null) => SolidProvider
  stateDir?: string
  onSnapshotChange?: (snapshot: LocalOnboardingSnapshot) => void
  fetchCapabilities?: (baseUrl: string) => Promise<LocalOnboardingCapabilities>
  fetchCapabilitiesTimeoutMs?: number
}

type LocalXpodStatus = Awaited<ReturnType<LocalOnboardingControllerOptions['xpodManager']['getStatus']>>

const DEFAULT_SNAPSHOT: LocalOnboardingSnapshot = {
  state: 'mode_required',
  mode: null,
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
  private readonly ensureBootstrapProvider: (mode: LocalOnboardingMode | null) => SolidProvider
  private readonly statePath: string
  private readonly onSnapshotChange?: (snapshot: LocalOnboardingSnapshot) => void
  private readonly fetchCapabilities: (baseUrl: string) => Promise<LocalOnboardingCapabilities>
  private state: PersistedLocalOnboardingState
  private snapshot: LocalOnboardingSnapshot
  private lastStartError: {
    mode: LocalOnboardingMode
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
      mode: this.state.mode,
      state: this.state.mode ? 'idle' : 'mode_required',
    }
  }

  public getSnapshot(): LocalOnboardingSnapshot {
    return { ...this.snapshot }
  }

  public async refresh(): Promise<LocalOnboardingSnapshot> {
    const provider = this.ensureBootstrapProvider(this.state.mode)
    this.persistResolvedState({
      mode: this.state.mode,
      providerId: provider.id,
    })
    const status = await this.xpodManager.getStatus()
    const mode = this.resolveMode(provider, status)
    const localUrl = status.localUrl ?? provider.issuerUrl ?? null
    const baseUrl = status.baseUrl ?? provider.issuerUrl ?? null
    const provisioning = status.provisioning
    const configuredPublicUrl = this.resolveConfiguredPublicUrl(provider)
    const publicUrl = mode === 'local'
      ? provisioning?.publicUrl ?? configuredPublicUrl ?? status.baseUrl ?? null
      : null
    const bindingFields = {
      publicUrl,
      cloudIdentityUrl: provisioning?.cloudIdentityUrl ?? null,
      provisionCode: provisioning?.provisionCode ?? null,
      provisionUrl: provisioning?.provisionUrl ?? null,
      nodeId: provisioning?.nodeId ?? null,
    }

    const startError = this.matchesLastStartError(provider.id, mode, localUrl, baseUrl, publicUrl)
      ? this.lastStartError
      : null
    if (!status.running && startError) {
      return this.updateSnapshot({
        state: 'error',
        mode,
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

    if (!mode) {
      return this.updateSnapshot({
        state: 'mode_required',
        mode: null,
        localUrl,
        baseUrl,
        ...bindingFields,
        capabilities: null,
        message: '首次使用时先确认 Local 的启动方式。服务准备好后，再继续登录。',
        errorCode: null,
        canRetry: false,
        canOpenSettings: true,
      })
    }

    if (status.status === 'starting') {
      const progress = this.snapshot.state === 'starting' ? this.snapshot.progress ?? null : null
      return this.updateSnapshot({
        state: 'starting',
        mode,
        localUrl,
        baseUrl,
        ...bindingFields,
        capabilities: null,
        message: progress?.label ?? '正在启动 Local…',
        progress,
        errorCode: null,
        canRetry: false,
        canOpenSettings: false,
      })
    }

    if (!status.running) {
      return this.updateSnapshot({
        state: 'idle',
        mode,
        localUrl,
        baseUrl,
        ...bindingFields,
        capabilities: null,
        message: 'Local 尚未运行。你可以先启动 Local，或先配置启动参数。',
        errorCode: null,
        canRetry: true,
        canOpenSettings: true,
      })
    }

    if (mode === 'local' && (!provisioning?.provisionCode || !provisioning?.cloudIdentityUrl)) {
      return this.updateSnapshot({
        state: 'repair_required',
        mode,
        localUrl,
        baseUrl,
        ...bindingFields,
        capabilities: null,
        message: 'Local 已运行，但还没完成 Cloud 绑定。请通过 LinX 重新启动 Local，再继续登录。',
        errorCode: 'LOCAL_CLOUD_BINDING_REQUIRED',
        canRetry: true,
        canOpenSettings: true,
      })
    }

    const localEntryUrl = localUrl ?? baseUrl ?? provider.issuerUrl
    const capabilities = await this.fetchCapabilities(localEntryUrl)

    return this.updateSnapshot({
      state: 'ready',
      mode,
      localUrl,
      baseUrl,
      ...bindingFields,
      capabilities,
      message: 'Local 已准备好，接下来会打开 xpod 登录页。',
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    })
  }

  public async chooseMode(mode: LocalOnboardingMode): Promise<LocalOnboardingSnapshot> {
    const provider = this.ensureBootstrapProvider(mode)
    this.persistResolvedState({
      mode,
      providerId: provider.id,
    })
    return this.refresh()
  }

  public async continue(): Promise<LocalOnboardingSnapshot> {
    const provider = this.ensureBootstrapProvider(this.state.mode)
    const status = await this.xpodManager.getStatus()
    const mode = this.resolveMode(provider, status)

    if (!mode) {
      return this.refresh()
    }

    const localUrl = status.localUrl ?? provider.issuerUrl ?? null
    const baseUrl = status.baseUrl ?? provider.issuerUrl ?? null
    const provisioning = status.provisioning
    const configuredPublicUrl = this.resolveConfiguredPublicUrl(provider)
    const publicUrl = mode === 'local'
      ? provisioning?.publicUrl ?? configuredPublicUrl ?? status.baseUrl ?? null
      : null
    const bindingFields = {
      publicUrl,
      cloudIdentityUrl: provisioning?.cloudIdentityUrl ?? null,
      provisionCode: provisioning?.provisionCode ?? null,
      provisionUrl: provisioning?.provisionUrl ?? null,
      nodeId: provisioning?.nodeId ?? null,
    }

    if (status.running && !this.shouldRestartForMode(provider, status, mode)) {
      return this.refresh()
    }

    this.updateSnapshot({
      state: 'starting',
      mode,
      localUrl,
      baseUrl,
      ...bindingFields,
      capabilities: null,
      message: '检查 xpod 运行环境',
      progress: {
        phase: 'resolve-runtime',
        label: '检查 xpod 运行环境',
        detail: '准备启动 Local',
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
          mode,
          domain: provider.managed.domain,
          tunnelToken: provider.managed.tunnelToken,
        },
        (progress) => {
          this.updateSnapshot({
            state: 'starting',
            mode,
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
        mode,
        providerId: provider.id,
        localUrl,
        baseUrl,
        publicUrl,
        message: error instanceof Error ? error.message : '启动 Local 失败。',
        errorCode: 'LOCAL_START_FAILED',
      }
      return this.updateSnapshot({
        state: 'error',
        mode,
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

  private resolveMode(
    _provider: SolidProvider,
    _status: LocalXpodStatus,
  ): LocalOnboardingMode | null {
    if (this.state.mode) {
      return this.state.mode
    }

    return null
  }

  private shouldRestartForMode(
    provider: SolidProvider,
    status: LocalXpodStatus,
    mode: LocalOnboardingMode,
  ): boolean {
    if (!status.running) {
      return true
    }

    if (mode !== 'local') {
      return false
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

    return !status.provisioning?.provisionCode || !status.provisioning?.cloudIdentityUrl
  }

  private resolveConfiguredPublicUrl(provider: SolidProvider): string | null {
    const domain = provider.managed?.domain
    if (domain?.type !== 'custom' || !domain.value?.trim()) {
      return null
    }

    return domainToPublicUrl(domain.value)
  }

  private persistResolvedMode(mode: LocalOnboardingMode, providerId?: string | null): void {
    const nextProviderId = providerId ?? this.state.providerId
    if (this.state.mode === mode && this.state.providerId === nextProviderId) {
      return
    }

    this.persistResolvedState({
      mode,
      providerId: nextProviderId,
    })
  }

  private persistResolvedState(next: PersistedLocalOnboardingState): void {
    if (this.state.mode === next.mode && this.state.providerId === next.providerId) {
      return
    }

    this.lastStartError = null
    this.state = next
    this.writeState(this.state)
  }

  private matchesLastStartError(
    providerId: string,
    mode: LocalOnboardingMode | null,
    localUrl: string | null,
    baseUrl: string | null,
    publicUrl: string | null,
  ): boolean {
    return Boolean(
      this.lastStartError
      && this.lastStartError.providerId === providerId
      && this.lastStartError.mode === mode
      && urlsEqual(this.lastStartError.localUrl, localUrl)
      && urlsEqual(this.lastStartError.baseUrl, baseUrl)
      && urlsEqual(this.lastStartError.publicUrl, publicUrl),
    )
  }

  private readState(): PersistedLocalOnboardingState {
    try {
      if (!fs.existsSync(this.statePath)) {
        return { mode: null, providerId: null }
      }

      const raw = fs.readFileSync(this.statePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedLocalOnboardingState>
      return {
        mode: parsePersistedMode(parsed.mode),
        providerId: typeof parsed.providerId === 'string' && parsed.providerId.trim().length > 0
          ? parsed.providerId
          : null,
      }
    } catch {
      return { mode: null, providerId: null }
    }
  }

  private writeState(state: PersistedLocalOnboardingState): void {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true })
    fs.writeFileSync(this.statePath, JSON.stringify(state, null, 2), 'utf8')
  }
}

function parsePersistedMode(value: unknown): LocalOnboardingMode | null {
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
