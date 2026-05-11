import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/ui/use-toast'
import { getBuiltAppVersion, resolveBrowserAppUpdateStatus, type AppUpdateStatus } from '@/lib/app-release'
import { getRuntimeShellInfo } from '@/lib/runtime-shell'

const NOTIFY_KEY_PREFIX = 'linx:app-update:notified'

function createInitialStatus(): AppUpdateStatus {
  return {
    currentVersion: getBuiltAppVersion(),
    latestVersion: null,
    releaseUrl: null,
    checkedAt: null,
    available: false,
    source: 'github-release',
    error: null,
  }
}

export function useAppUpdateStatus() {
  const shell = getRuntimeShellInfo()
  const { toast } = useToast()
  const [status, setStatus] = useState<AppUpdateStatus>(createInitialStatus)
  const [isChecking, setIsChecking] = useState(false)
  const hasAutoCheckedRef = useRef(false)

  const notifyKey = useMemo(
    () => `${NOTIFY_KEY_PREFIX}:${shell.id}:${status.currentVersion}`,
    [shell.id, status.currentVersion],
  )

  const openReleasePage = useCallback(async () => {
    if (!status.releaseUrl) {
      return
    }

    if (shell.id === 'desktop' && window.xpodDesktop?.app) {
      await window.xpodDesktop.app.openExternal(status.releaseUrl)
      return
    }

    window.open(status.releaseUrl, '_blank', 'noopener,noreferrer')
  }, [shell.id, status.releaseUrl])

  const refresh = useCallback(
    async (force = false, reason: 'auto' | 'manual' = 'manual') => {
      setIsChecking(true)

      const nextStatus =
        shell.id === 'desktop' && window.xpodDesktop?.app
          ? await window.xpodDesktop.app.getUpdateStatus(force)
          : await resolveBrowserAppUpdateStatus({
              force,
              storage: typeof window !== 'undefined' ? window.localStorage : undefined,
            })

      setStatus(nextStatus)
      setIsChecking(false)

      if (reason === 'auto' && nextStatus.available && nextStatus.latestVersion && typeof window !== 'undefined') {
        const notifiedVersion = window.localStorage.getItem(notifyKey)
        if (notifiedVersion !== nextStatus.latestVersion) {
          toast({
            title: '发现新版本',
            description: `当前 ${nextStatus.currentVersion}，最新 ${nextStatus.latestVersion}`,
          })
          window.localStorage.setItem(notifyKey, nextStatus.latestVersion)
        }
      }

      if (reason === 'manual') {
        toast({
          title: nextStatus.error ? '检查更新失败' : nextStatus.available ? '发现新版本' : '当前已是最新版本',
          description: nextStatus.error
            ? nextStatus.error
            : nextStatus.available && nextStatus.latestVersion
            ? `当前 ${nextStatus.currentVersion}，最新 ${nextStatus.latestVersion}`
            : `LinX ${nextStatus.currentVersion}`,
          variant: nextStatus.error ? 'destructive' : 'default',
        })
      }

      return nextStatus
    },
    [notifyKey, shell.id, toast],
  )

  useEffect(() => {
    if (import.meta.env.MODE === 'test' || import.meta.env.DEV || hasAutoCheckedRef.current) {
      return
    }

    hasAutoCheckedRef.current = true
    void refresh(false, 'auto')
  }, [refresh])

  return {
    status,
    isChecking,
    openReleasePage,
    refresh,
  }
}
