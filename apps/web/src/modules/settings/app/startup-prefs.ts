import { useCallback, useEffect, useState } from 'react'
import { readStartupView, writeStartupView, type StartupView } from '@/lib/micro-apps/startup'
import { isAutoLaunchAvailable, readAutoLaunch, writeAutoLaunch } from '../data/auto-launch'

/**
 * 开机自动打开. `available` is false on the web (the row is hidden); `enabled`
 * is null until the desktop answers.
 */
export function useAutoLaunch() {
  const available = isAutoLaunchAvailable()
  const [enabled, setEnabledState] = useState<boolean | null>(null)

  useEffect(() => {
    if (!available) return undefined
    let active = true
    void readAutoLaunch().then((value) => {
      if (active) setEnabledState(value)
    }).catch(() => undefined)
    return () => {
      active = false
    }
  }, [available])

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    void writeAutoLaunch(next).then((value) => setEnabledState(value ?? next)).catch(() => setEnabledState(!next))
  }, [])

  return { available, enabled, setEnabled }
}

/** 启动时打开: 上次的位置 / 聊天, remembered on this device. */
export function useStartupView(): [StartupView, (view: StartupView) => void] {
  const [view, setView] = useState<StartupView>(() => readStartupView())
  const update = useCallback((next: StartupView) => {
    writeStartupView(next)
    setView(next)
  }, [])
  return [view, update]
}
