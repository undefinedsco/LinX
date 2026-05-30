import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  LocalSpaceKind,
  LocalOnboardingSnapshot,
} from '@/types/electron-api'

export function useLocalOnboarding() {
  const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
  const [snapshot, setSnapshot] = useState<LocalOnboardingSnapshot | null>(null)
  const [loading, setLoading] = useState(Boolean(desktopApi))
  const [acting, setActing] = useState(false)

  const unavailableSnapshot = useMemo<LocalOnboardingSnapshot>(() => ({
    state: 'error',
    spaceKind: null,
    localUrl: null,
    baseUrl: null,
    publicUrl: null,
    capabilities: null,
    cloudIdentityUrl: null,
    provisionCode: null,
    provisionUrl: null,
    nodeId: null,
    message: 'Local 引导只在桌面端可用。',
    errorCode: 'LOCAL_DESKTOP_ONLY',
    canRetry: false,
    canOpenSettings: false,
  }), [])

  const refresh = useCallback(async () => {
    if (!desktopApi?.localOnboarding) {
      setSnapshot(unavailableSnapshot)
      setLoading(false)
      return unavailableSnapshot
    }

    setLoading(true)
    try {
      const next = await desktopApi.localOnboarding.getSnapshot()
      setSnapshot(next)
      return next
    } finally {
      setLoading(false)
    }
  }, [desktopApi, unavailableSnapshot])

  useEffect(() => {
    if (!desktopApi?.localOnboarding) {
      setSnapshot(unavailableSnapshot)
      setLoading(false)
      return
    }

    void refresh()
    return desktopApi.localOnboarding.onStateChange((next) => {
      setSnapshot(next)
      setLoading(false)
    })
  }, [desktopApi, refresh, unavailableSnapshot])

  const chooseSpace = useCallback(async (spaceKind: LocalSpaceKind) => {
    if (!desktopApi?.localOnboarding) return unavailableSnapshot
    setActing(true)
    try {
      const next = await desktopApi.localOnboarding.chooseSpace(spaceKind)
      setSnapshot(next)
      return next
    } finally {
      setActing(false)
    }
  }, [desktopApi, unavailableSnapshot])

  const continueLocal = useCallback(async () => {
    if (!desktopApi?.localOnboarding) return unavailableSnapshot
    setActing(true)
    try {
      const next = await desktopApi.localOnboarding.continue()
      setSnapshot(next)
      return next
    } finally {
      setActing(false)
    }
  }, [desktopApi, unavailableSnapshot])

  const openAdvancedSettings = useCallback(async () => {
    if (!desktopApi?.app?.openConfigWindow) return
    await desktopApi.app.openConfigWindow()
  }, [desktopApi])

  return {
    snapshot: snapshot ?? unavailableSnapshot,
    loading,
    acting,
    refresh,
    chooseSpace,
    continueLocal,
    openAdvancedSettings,
    isDesktop: Boolean(desktopApi?.localOnboarding),
  }
}
