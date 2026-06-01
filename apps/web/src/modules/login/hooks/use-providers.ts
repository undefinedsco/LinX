import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLoginStore, getAllProviders } from '@linx/stores/login'
import { isLocalAccessHostname } from '@/lib/local-access-url'
import type { LoginProviderOption } from '../types'
import type { LocalSpaceKind, LocalOnboardingSnapshot, SolidProvider } from '@/types/electron-api'

const CLOUD_IDENTITY_URL = 'https://id.undefineds.co'
const LOCAL_POD_LABEL = 'Local'
const STANDALONE_POD_LABEL = 'Standalone'
const REFRESH_INTERVAL = 4000
const SERVICE_LOCAL_POLL_INTERVAL = 500
const SERVICE_LOCAL_POLL_ATTEMPTS = 20

interface ServiceStatusResponse {
  pod?: {
    running?: boolean
    port?: number
    baseUrl?: string
    publicUrl?: string
  }
  spaceKind?: LocalSpaceKind
  runtime?: {
    workers?: {
      total?: number
      running?: number
      idle?: number
      active?: number
      paused?: number
      completed?: number
      error?: number
    }
  }
  provisioning?: {
    nodeId?: string
    publicUrl?: string
    provisionCode?: string
    provisionUrl?: string
    cloudIdentityUrl?: string
  }
  setupCompleted?: boolean
}

interface SetupConfigResponse {
  port?: number
  spaceKind?: LocalSpaceKind
}

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '')
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function resolveRuntimeStatus(snapshot: LocalOnboardingSnapshot | null): NonNullable<LoginProviderOption['runtime']>['status'] {
  switch (snapshot?.state) {
    case 'starting':
    case 'checking':
      return 'starting'
    case 'ready':
      return 'running'
    case 'error':
    case 'repair_required':
      return 'error'
    case 'space_required':
      return 'missing'
    case 'idle':
    default:
      return 'stopped'
  }
}

export function useProviders() {
  const { customProviders, addCustomProvider, removeCustomProvider } = useLoginStore()
  const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
  const isServiceMode = typeof window !== 'undefined' && !!(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__
  const [desktopProviders, setDesktopProviders] = useState<SolidProvider[]>([])
  const [localOnboarding, setLocalOnboarding] = useState<LocalOnboardingSnapshot | null>(null)
  const publishDesktopProviders = useCallback((providers: SolidProvider[]) => {
    setDesktopProviders((current) => areSolidProvidersEqual(current, providers) ? current : providers)
  }, [])
  const publishLocalOnboarding = useCallback((snapshot: LocalOnboardingSnapshot | null | undefined) => {
    const next = snapshot ?? null
    setLocalOnboarding((current) => areLocalOnboardingSnapshotsEqual(current, next) ? current : next)
  }, [])

  const refreshProviders = useCallback(async () => {
    if (desktopApi) {
      try {
        const localOnboardingSnapshot = await desktopApi.localOnboarding?.getSnapshot?.().catch(() => undefined)
        const providers = await desktopApi.provider.list()

        publishDesktopProviders(providers)
        publishLocalOnboarding(localOnboardingSnapshot)
        return {
          desktopProviders: providers,
          localOnboarding: localOnboardingSnapshot ?? null,
        }
      } catch {
        // Desktop API unavailable, ignore
        return null
      }
    }

    if (!isServiceMode) {
      return null
    }

    try {
      const [statusResponse, configResponse] = await Promise.all([
        fetch('/api/service/status'),
        fetch('/api/setup/config').catch(() => null),
      ])

      if (!statusResponse.ok) {
        throw new Error(`service status: HTTP ${statusResponse.status}`)
      }

      const status = (await statusResponse.json()) as ServiceStatusResponse
      const config = configResponse?.ok
        ? ((await configResponse.json()) as SetupConfigResponse)
        : null

      const snapshot = buildServiceLocalSnapshot(status, config)
      publishDesktopProviders([])
      publishLocalOnboarding(snapshot)

      return {
        desktopProviders: [],
        localOnboarding: snapshot,
      }
    } catch {
      return null
    }
  }, [desktopApi, isServiceMode, publishDesktopProviders, publishLocalOnboarding])

  useEffect(() => {
    if (!desktopApi && !isServiceMode) return

    void refreshProviders()

    const unsubscribeLocalOnboarding = desktopApi?.localOnboarding?.onStateChange?.((snapshot) => {
      publishLocalOnboarding(snapshot)
    })

    const timer = window.setInterval(() => {
      void refreshProviders()
    }, REFRESH_INTERVAL)

    return () => {
      window.clearInterval(timer)
      unsubscribeLocalOnboarding?.()
    }
  }, [desktopApi, isServiceMode, publishLocalOnboarding, refreshProviders])

  const providers = useMemo<LoginProviderOption[]>(() => {
    // Cloud and Custom providers are combined Solid providers: one URL is both
    // the OIDC issuer and the storage provider.
    const cloud = getAllProviders(customProviders).map<LoginProviderOption>((p) => ({
      ...p,
      source: p.isDefault ? 'cloud' : 'custom',
      oidcProvider: {
        kind: p.isDefault ? 'cloud' : 'custom',
        url: normalizeUrl(p.url),
        label: p.isDefault ? 'Cloud' : p.label,
      },
      storageProvider: {
        kind: p.isDefault ? 'cloud' : 'custom',
        url: normalizeUrl(p.url),
        label: p.isDefault ? 'Cloud' : p.label,
      },
    }))

    // Local and Standalone are product-level local entries. Do not collapse
    // them into device-only/remote-ready runtime states.
    const local: LoginProviderOption[] = []
    if (desktopApi) {
      const managed = desktopProviders.filter((p) => p.managed)
      if (managed.length > 0) {
        for (const p of managed) {
          for (const source of ['local', 'standalone'] as const) {
            const providerSnapshot = projectLocalOnboardingForSource(localOnboarding, source)
            local.push(createLocalLoginProvider({
            id: source,
              providerId: p.id,
              source,
              label: source === 'local' ? LOCAL_POD_LABEL : STANDALONE_POD_LABEL,
              storageUrl: resolveLocalStorageUrl(providerSnapshot, p.issuerUrl, source),
              runtimeStatus: resolveRuntimeStatus(providerSnapshot),
              localOnboarding: providerSnapshot,
            }))
          }
        }
      } else {
        const fallbackUrl = localOnboarding?.localUrl ?? localOnboarding?.baseUrl ?? 'http://localhost'
        for (const source of ['local', 'standalone'] as const) {
          const providerSnapshot = projectLocalOnboardingForSource(localOnboarding, source)
          local.push(createLocalLoginProvider({
            id: source,
            source,
            label: source === 'local' ? LOCAL_POD_LABEL : STANDALONE_POD_LABEL,
            storageUrl: resolveLocalStorageUrl(providerSnapshot, fallbackUrl, source),
            runtimeStatus: resolveRuntimeStatus(providerSnapshot),
            localOnboarding: providerSnapshot,
          }))
        }
      }
    } else if (isServiceMode) {
      const fallbackUrl = localOnboarding?.localUrl ?? localOnboarding?.baseUrl ?? 'http://localhost:5737'
      for (const source of ['local', 'standalone'] as const) {
        const providerSnapshot = projectLocalOnboardingForSource(localOnboarding, source)
        const runtimeStatus = resolveRuntimeStatus(providerSnapshot)
        local.push({
          ...createLocalLoginProvider({
            id: source,
            source,
            label: source === 'local' ? LOCAL_POD_LABEL : STANDALONE_POD_LABEL,
            storageUrl: resolveLocalStorageUrl(providerSnapshot, fallbackUrl, source),
            runtimeStatus,
            localOnboarding: providerSnapshot,
          }),
          runtime: {
            kind: 'local-pod',
            status: runtimeStatus,
            canStart: !['running', 'starting'].includes(runtimeStatus),
            canCreate: false,
            onboarding: providerSnapshot
              ? {
                  state: providerSnapshot.state,
                  spaceKind: source,
                  message: providerSnapshot.message,
                }
              : undefined,
          },
        })
      }
    }

    // Merge: Cloud first, then Local, then custom
    const primary = cloud.filter((p) => p.isDefault)
    const custom = cloud.filter((p) => !p.isDefault)

    const seen = new Set<string>()
    return [...primary, ...local, ...custom].filter((p) => {
      const key = p.id
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [customProviders, desktopApi, desktopProviders, isServiceMode, localOnboarding])

  const addProvider = useCallback(
    (url: string, label?: string) => {
      const normalized = normalizeUrl(url.startsWith('http') ? url : `https://${url}`)
      addCustomProvider({
        id: `custom-${Date.now()}`,
        url: normalized,
        label: label || new URL(normalized).hostname,
      })
    },
    [addCustomProvider],
  )

  const removeProvider = useCallback(
    (url: string) => removeCustomProvider(url),
    [removeCustomProvider],
  )

  const startLocal = useCallback(async (spaceKind: LocalSpaceKind) => {
    if (desktopApi?.localOnboarding) {
      const current = await desktopApi.localOnboarding.getSnapshot()

      if (current.state === 'ready' && current.spaceKind === spaceKind) {
        publishLocalOnboarding(current)
        return current
      }

      if (current.spaceKind !== spaceKind) {
        const chosen = await desktopApi.localOnboarding.chooseSpace(spaceKind)
        publishLocalOnboarding(chosen)
      }

      const next = await desktopApi.localOnboarding.continue()
      publishLocalOnboarding(next)
      return next
    }

    if (!isServiceMode) return null

    setLocalOnboarding((current) => current
      ? {
          ...current,
          spaceKind,
          state: 'starting',
          message: spaceKind === 'standalone' ? '正在启动 Standalone…' : '正在启动 Local…',
          progress: {
            phase: 'spawn',
            label: spaceKind === 'standalone' ? '正在启动 Standalone…' : '正在启动 Local…',
            detail: null,
          },
          errorCode: null,
        }
        : {
          state: 'starting',
          spaceKind,
          localUrl: 'http://localhost:5737/',
          baseUrl: 'http://localhost:5737/',
          publicUrl: null,
          tunnel: null,
          connectivity: null,
          capabilities: null,
          cloudIdentityUrl: null,
          provisionCode: null,
          provisionUrl: null,
          nodeId: null,
          message: spaceKind === 'standalone' ? '正在启动 Standalone…' : '正在启动 Local…',
          progress: {
            phase: 'spawn',
            label: spaceKind === 'standalone' ? '正在启动 Standalone…' : '正在启动 Local…',
            detail: null,
          },
          errorCode: null,
          canRetry: false,
          canOpenSettings: true,
        })

    const response = await fetch('/api/service/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spaceKind }),
    })
    if (!response.ok) {
      const detail = await response.json().catch(() => null) as { error?: string } | null
      const error = detail?.error || `start ${spaceKind}: HTTP ${response.status}`
      const failedSnapshot = localOnboarding
        ? {
            ...localOnboarding,
            spaceKind,
            state: 'error' as const,
            message: error,
            progress: null,
            errorCode: 'LOCAL_START_FAILED',
          }
        : null
      if (failedSnapshot) {
        setLocalOnboarding(failedSnapshot)
      }
      throw new Error(error)
    }

    for (let attempt = 0; attempt < SERVICE_LOCAL_POLL_ATTEMPTS; attempt += 1) {
      const next = await refreshProviders()
      if (next?.localOnboarding?.state === 'ready') {
        return next.localOnboarding
      }
      await new Promise((resolve) => window.setTimeout(resolve, SERVICE_LOCAL_POLL_INTERVAL))
    }

    throw new Error('Local 启动超时，请稍后重试。')
  }, [desktopApi, isServiceMode, localOnboarding, publishLocalOnboarding, refreshProviders])

  return {
    providers,
    addProvider,
    removeProvider,
    refreshProviders,
    localOnboarding,
    startLocal,
  }
}

function createLocalLoginProvider(input: {
  id: string
  providerId?: string
  source: Extract<LoginProviderOption['source'], 'local' | 'standalone'>
  label: string
  storageUrl: string
  runtimeStatus: NonNullable<LoginProviderOption['runtime']>['status']
  localOnboarding: LocalOnboardingSnapshot | null
}): LoginProviderOption {
  const isStandalone = input.source === 'standalone'
  const normalizedStorageUrl = normalizeUrl(input.storageUrl)

  return {
    id: input.id,
    url: normalizedStorageUrl,
    label: input.label,
    source: input.source,
    oidcProvider: {
      kind: isStandalone ? 'local' : 'cloud',
      url: isStandalone ? normalizedStorageUrl : CLOUD_IDENTITY_URL,
      label: isStandalone ? STANDALONE_POD_LABEL : 'Cloud',
    },
    storageProvider: {
      kind: 'local',
      url: normalizedStorageUrl,
      label: input.label,
    },
    runtime: {
      kind: 'local-pod',
      providerId: input.providerId,
      status: input.runtimeStatus,
      canStart: !['running', 'starting'].includes(input.runtimeStatus),
      canCreate: input.localOnboarding?.state === 'space_required',
      onboarding: input.localOnboarding
        ? {
            state: input.localOnboarding.state,
            spaceKind: input.localOnboarding.spaceKind,
            message: input.localOnboarding.message,
          }
        : undefined,
    },
  }
}

function resolveLocalStorageUrl(
  snapshot: LocalOnboardingSnapshot | null,
  fallbackUrl: string,
  source: Extract<LoginProviderOption['source'], 'local' | 'standalone'>,
): string {
  if (source === 'standalone') {
    return snapshot?.localUrl ?? snapshot?.baseUrl ?? fallbackUrl
  }

  return snapshot?.publicUrl
    ?? resolveExternalCanonicalUrl(snapshot?.baseUrl)
    ?? resolveExternalCanonicalUrl(fallbackUrl)
    ?? ''
}

function resolveExternalCanonicalUrl(url?: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (isLocalAccessHostname(parsed.hostname)) {
      return null
    }
    return url
  } catch {
    return null
  }
}

function areSolidProvidersEqual(current: SolidProvider[], next: SolidProvider[]): boolean {
  if (current.length !== next.length) {
    return false
  }

  return current.every((provider, index) => stableStringify(provider) === stableStringify(next[index]))
}

function areLocalOnboardingSnapshotsEqual(
  current: LocalOnboardingSnapshot | null,
  next: LocalOnboardingSnapshot | null,
): boolean {
  if (current === next) {
    return true
  }
  if (!current || !next) {
    return false
  }

  return stableStringify(current) === stableStringify(next)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function buildServiceLocalSnapshot(
  status: ServiceStatusResponse,
  config: SetupConfigResponse | null,
): LocalOnboardingSnapshot {
  const port = status.pod?.port ?? config?.port ?? 5737
  const localUrl = ensureTrailingSlash(`http://localhost:${port}`)
  const baseUrl = status.pod?.baseUrl ? ensureTrailingSlash(status.pod.baseUrl) : localUrl
  const publicUrl = status.provisioning?.publicUrl
    ? ensureTrailingSlash(status.provisioning.publicUrl)
    : status.pod?.publicUrl
      ? ensureTrailingSlash(status.pod.publicUrl)
      : null
  const hasLocalCloudBinding = Boolean(
    status.provisioning?.cloudIdentityUrl
    && status.provisioning.provisionCode
    && publicUrl,
  )
  const running = Boolean(status.pod?.running)
  const spaceKind = status.spaceKind ?? config?.spaceKind ?? (hasLocalCloudBinding ? 'local' : 'standalone')

  return {
    state: running ? 'ready' : 'idle',
    spaceKind,
    localUrl,
    baseUrl,
    publicUrl: spaceKind === 'local' ? publicUrl : null,
    tunnel: null,
    connectivity: null,
    capabilities: null,
    cloudIdentityUrl: status.provisioning?.cloudIdentityUrl ?? null,
    provisionCode: status.provisioning?.provisionCode ?? null,
    provisionUrl: status.provisioning?.provisionUrl ?? null,
    nodeId: status.provisioning?.nodeId ?? null,
    message: running
      ? spaceKind === 'local'
        ? 'Local 已准备好，接下来会通过 Cloud 登录并写入本地空间。'
        : 'Standalone 已准备好，接下来会打开本地登录页。'
      : '本地服务尚未运行。选择 Local 后会启动本地 xpod。',
    progress: null,
    errorCode: null,
    canRetry: true,
    canOpenSettings: true,
  }
}

function projectLocalOnboardingForSource(
  snapshot: LocalOnboardingSnapshot | null,
  source: Extract<LoginProviderOption['source'], 'local' | 'standalone'>,
): LocalOnboardingSnapshot | null {
  if (!snapshot) return null
  if (
    snapshot.spaceKind
    && snapshot.spaceKind !== source
    && ['ready', 'starting', 'checking'].includes(snapshot.state)
  ) {
    return {
      ...snapshot,
      state: 'repair_required',
      spaceKind: source,
      publicUrl: source === 'local' ? snapshot.publicUrl : null,
      message: source === 'local'
        ? '当前按 Standalone 运行。要使用 Local，请先切换为空间类型 Local。'
        : '当前按 Local 运行。要使用 Standalone，请先切换为空间类型 Standalone。',
      errorCode: 'SERVICE_MODE_MISMATCH',
      canRetry: false,
      canOpenSettings: true,
    }
  }

  if (
    source === 'local'
    && snapshot.state === 'ready'
    && (!snapshot.publicUrl || !snapshot.provisionCode || !snapshot.cloudIdentityUrl)
  ) {
    return {
      ...snapshot,
      state: 'repair_required',
      spaceKind: 'local',
      publicUrl: snapshot.publicUrl,
      message: 'Local 已运行，但还没拿到 Cloud 分配的 canonical URL 或绑定信息。请重新启动 Local，再继续登录。',
      errorCode: 'LOCAL_CLOUD_BINDING_REQUIRED',
      canRetry: true,
      canOpenSettings: true,
    }
  }

  return {
    ...snapshot,
    spaceKind: source,
    publicUrl: source === 'local' ? snapshot.publicUrl : null,
    message: resolveLocalProviderMessage(snapshot, source),
  }
}

function resolveLocalProviderMessage(
  snapshot: LocalOnboardingSnapshot,
  source: Extract<LoginProviderOption['source'], 'local' | 'standalone'>,
): string | null {
  if (snapshot.state === 'ready') {
    return source === 'local'
      ? 'Local 已准备好，接下来会通过 Cloud 登录并写入本地空间。'
      : 'Standalone 已准备好，接下来会打开本地登录页。'
  }

  if (snapshot.state === 'idle') {
    return source === 'local'
      ? 'Local 尚未运行。选择后会按 Cloud issuer + 本地 storage 启动。'
      : 'Standalone 尚未运行。选择后会按本地 issuer + 本地 storage 启动。'
  }

  return snapshot.message
}
