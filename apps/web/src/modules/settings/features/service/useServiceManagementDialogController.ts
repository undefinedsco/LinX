import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import type { ServiceStatus } from '../../domain/service-model'
import { serviceBaseUrl } from '../../domain/service-model'
import {
  buildSetupPayload,
  createSetupDraft,
  validateSetupDraft,
  type SetupDraft,
} from '../../domain/setup-model'
import {
  desktopXpodBridge,
  detectPublicIpReachability,
  isServiceSetupMode,
  loadServiceSetup,
  loadServiceStatus,
  runServiceAction,
  saveSetupConfig,
  upgradeDesktopRuntime,
} from '../../data/setup-client'
import { openSettingsExternalUrl } from '../../data/platform-actions'

export function useServiceManagementDialogController(open: boolean) {
  const isServiceMode = isServiceSetupMode()
  const desktopXpodApi = desktopXpodBridge()
  const isDesktopMode = !isServiceMode && Boolean(desktopXpodApi)
  const supportsServiceManagement = isServiceMode || isDesktopMode
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<ServiceStatus | null>(null)
  const [draft, setDraft] = useState<SetupDraft>(() => createSetupDraft())
  const [serviceSetupReady, setServiceSetupReady] = useState(false)
  const [hasPublicIp, setHasPublicIp] = useState<boolean | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const updateDraft = useCallback((patch: Partial<SetupDraft>) => {
    setDraft((current) => ({ ...current, ...patch }))
  }, [])

  const refreshStatus = useCallback(async () => {
    if (!supportsServiceManagement) return
    setStatus(await loadServiceStatus())
  }, [supportsServiceManagement])

  useEffect(() => {
    if (!open) return

    let cancelled = false
    const abortController = new AbortController()

    const load = async () => {
      setLoading(true)
      setError(null)
      setServiceSetupReady(false)
      setAdvancedOpen(false)

      if (!supportsServiceManagement) {
        setLoading(false)
        return
      }

      try {
        if (isDesktopMode) {
          const nextStatus = await loadServiceStatus()
          if (!cancelled) setStatus(nextStatus)
          return
        }

        const next = await loadServiceSetup(abortController.signal)
        if (cancelled) return
        if (next.status) setStatus(next.status)
        if (next.config) setDraft(createSetupDraft(next.config))
        setServiceSetupReady(true)
      } catch (loadError) {
        if (!cancelled) {
          setError(formatLoginErrorForUser(loadError, '读取本机空间设置失败。请稍后重试。'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
      abortController.abort()
    }
  }, [open, isDesktopMode, supportsServiceManagement])

  const running = Boolean(status?.pod?.running)

  useEffect(() => {
    if (!open || !isServiceMode || draft.spaceKind !== 'local' || !draft.autoDetectPublicIp || running) {
      if (draft.spaceKind !== 'local') setHasPublicIp(null)
      if (!draft.autoDetectPublicIp) setHasPublicIp(false)
      return
    }

    let cancelled = false
    void detectPublicIpReachability().then((reachable) => {
      if (!cancelled) setHasPublicIp(reachable)
    })
    return () => {
      cancelled = true
    }
  }, [open, isServiceMode, draft.spaceKind, draft.autoDetectPublicIp, running])

  const runRuntimeAction = useCallback(async (action: 'stop' | 'restart') => {
    setSubmitting(true)
    setError(null)
    try {
      await runServiceAction(action)
      await refreshStatus()
    } catch (actionError) {
      setError(formatLoginErrorForUser(actionError, '本机空间操作失败。请稍后重试。'))
    } finally {
      setSubmitting(false)
    }
  }, [refreshStatus])

  const upgradeRuntime = useCallback(async () => {
    setSubmitting(true)
    setError(null)
    try {
      await upgradeDesktopRuntime()
      await refreshStatus()
    } catch (upgradeError) {
      setError(formatLoginErrorForUser(upgradeError, 'xpod 升级失败。请稍后重试。'))
    } finally {
      setSubmitting(false)
    }
  }, [refreshStatus])

  const saveAndStart = useCallback(async () => {
    const validationError = validateSetupDraft(draft)
    if (validationError) {
      setError(validationError.message === '请填写数据目录' ? '请填写数据地址' : validationError.message)
      if (validationError.revealAdvanced) setAdvancedOpen(true)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await saveSetupConfig(buildSetupPayload(draft))
      await runServiceAction('start')
      await refreshStatus()
    } catch (startError) {
      setError(formatLoginErrorForUser(startError, '保存并启动本机空间失败。请检查配置后重试。'))
    } finally {
      setSubmitting(false)
    }
  }, [draft, refreshStatus])

  const podBaseUrl = useMemo(() => serviceBaseUrl(status), [status])
  const runtime = status?.pod?.runtime

  return {
    loading,
    submitting,
    error,
    status,
    draft,
    serviceSetupReady,
    hasPublicIp,
    advancedOpen,
    running,
    podBaseUrl,
    runtime,
    isServiceMode,
    isDesktopMode,
    supportsServiceManagement,
    canUpgradeXpod: isDesktopMode && Boolean(runtime?.upgradeAvailable),
    tunnelSuggested: draft.spaceKind === 'local'
      && (!draft.autoDetectPublicIp || hasPublicIp === false),
    updateDraft,
    setAdvancedOpen,
    saveAndStart,
    runRuntimeAction,
    upgradeRuntime,
    openExternalUrl: openSettingsExternalUrl,
  }
}
