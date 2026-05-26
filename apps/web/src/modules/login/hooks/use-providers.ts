import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLoginStore, getAllProviders } from '@linx/stores/login'
import type { LoginProviderOption } from '../types'
import type { LocalOnboardingSnapshot, SolidProvider } from '@/types/electron-api'

const LOCAL_POD_LABEL = '本地空间'
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
    case 'mode_required':
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
    // Cloud providers
    const cloud = getAllProviders(customProviders).map<LoginProviderOption>((p) => ({
      ...p,
      source: p.isDefault ? 'cloud' : 'custom',
    }))

    // Local providers
    const local: LoginProviderOption[] = []
    if (desktopApi) {
      const managed = desktopProviders.filter((p) => p.managed)
      const runtimeStatus = resolveRuntimeStatus(localOnboarding)
      if (managed.length > 0) {
        for (const p of managed) {
          local.push({
            id: p.id,
            url: normalizeUrl(p.issuerUrl),
            label: p.name || LOCAL_POD_LABEL,
            source: 'local',
            runtime: {
              kind: 'local-pod',
              providerId: p.id,
              status: runtimeStatus,
              canStart: !['running', 'starting'].includes(runtimeStatus),
              canCreate: localOnboarding?.state === 'mode_required',
              onboarding: localOnboarding
                ? {
                    state: localOnboarding.state,
                    mode: localOnboarding.mode,
                    message: localOnboarding.message,
                  }
                : undefined,
            },
          })
        }
      } else {
        const fallbackUrl = localOnboarding?.localUrl ?? localOnboarding?.baseUrl ?? 'http://localhost'
        local.push({
          id: 'desktop-local',
          url: normalizeUrl(fallbackUrl),
          label: LOCAL_POD_LABEL,
          source: 'local',
          runtime: {
            kind: 'local-pod',
            status: runtimeStatus,
            canStart: !['running', 'starting'].includes(runtimeStatus),
            canCreate: localOnboarding?.state === 'mode_required',
            onboarding: localOnboarding
              ? {
                  state: localOnboarding.state,
                  mode: localOnboarding.mode,
                  message: localOnboarding.message,
                }
              : undefined,
          },
        })
      }
    } else if (isServiceMode) {
      const runtimeStatus = resolveRuntimeStatus(localOnboarding)
      const fallbackUrl = localOnboarding?.localUrl ?? localOnboarding?.baseUrl ?? 'http://localhost:5737'
      local.push({
        id: 'service-local',
        url: normalizeUrl(fallbackUrl),
        label: LOCAL_POD_LABEL,
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: runtimeStatus,
          canStart: !['running', 'starting'].includes(runtimeStatus),
          canCreate: false,
          onboarding: localOnboarding
            ? {
                state: localOnboarding.state,
                mode: localOnboarding.mode,
                message: localOnboarding.message,
              }
            : undefined,
        },
      })
    }

    // Merge: Cloud first, then Local, then custom
    const primary = cloud.filter((p) => p.isDefault)
    const custom = cloud.filter((p) => !p.isDefault)

    const seen = new Set<string>()
    return [...primary, ...local, ...custom].filter((p) => {
      const key = normalizeUrl(p.url)
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

  const startLocal = useCallback(async () => {
    if (desktopApi?.localOnboarding) {
      const current = await desktopApi.localOnboarding.getSnapshot()
      const mode = current.mode ?? 'device-only'

      if (!current.mode) {
        const chosen = await desktopApi.localOnboarding.chooseMode(mode)
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
          state: 'starting',
          message: '正在启动 Local…',
          progress: {
            phase: 'spawn',
            label: '正在启动 Local…',
            detail: null,
          },
          errorCode: null,
        }
      : {
          state: 'starting',
          mode: 'device-only',
          localUrl: 'http://localhost:5737/',
          baseUrl: 'http://localhost:5737/',
          publicUrl: null,
          capabilities: null,
          cloudIdentityUrl: null,
          provisionCode: null,
          provisionUrl: null,
          nodeId: null,
          message: '正在启动 Local…',
          progress: {
            phase: 'spawn',
            label: '正在启动 Local…',
            detail: null,
          },
          errorCode: null,
          canRetry: false,
          canOpenSettings: true,
        })

    const response = await fetch('/api/service/start', { method: 'POST' })
    if (!response.ok) {
      const error = `start local: HTTP ${response.status}`
      const failedSnapshot = localOnboarding
        ? {
            ...localOnboarding,
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
  const remoteReady = Boolean(
    status.provisioning?.cloudIdentityUrl
    && status.provisioning.provisionCode
    && publicUrl,
  )
  const running = Boolean(status.pod?.running)

  return {
    state: running ? 'ready' : 'idle',
    mode: remoteReady ? 'remote-ready' : 'device-only',
    localUrl,
    baseUrl,
    publicUrl,
    capabilities: null,
    cloudIdentityUrl: status.provisioning?.cloudIdentityUrl ?? null,
    provisionCode: status.provisioning?.provisionCode ?? null,
    provisionUrl: status.provisioning?.provisionUrl ?? null,
    nodeId: status.provisioning?.nodeId ?? null,
    message: running
      ? remoteReady
        ? 'Local 已准备好，接下来会通过 Cloud 登录并写入本地空间。'
        : 'Local 已准备好，接下来会打开本地 Local 登录页。'
      : 'Local 尚未运行。你可以先启动 Local。',
    progress: null,
    errorCode: null,
    canRetry: true,
    canOpenSettings: true,
  }
}
