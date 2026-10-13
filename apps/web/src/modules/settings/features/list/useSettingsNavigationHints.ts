import { useMemo } from 'react'
import { getRuntimeShellInfo } from '@/lib/runtime-shell'
import { useAppUpdateStatus } from '@/modules/layout/use-app-update-status'
import { useLocalOnboarding } from '../../data/use-local-onboarding'
import type { SettingsSectionId } from '../../domain/section-model'

/** The small right-hand words in the settings list (运行中 / 未开启 / 新版本). */
export function useSettingsNavigationHints(): Partial<Record<SettingsSectionId, string>> {
  const { status } = useAppUpdateStatus()
  const onboarding = useLocalOnboarding()
  const isDesktop = getRuntimeShellInfo().id === 'desktop'
  const state = onboarding.snapshot?.state
  const publicUrl = onboarding.snapshot?.publicUrl

  return useMemo(() => {
    const hints: Partial<Record<SettingsSectionId, string>> = {}
    if (isDesktop) {
      hints.runtime = state === 'ready' ? '运行中' : onboarding.loading ? '' : '未运行'
      hints.network = publicUrl ? '已开启' : '未开启'
    }
    if (status.available) hints.updates = '新版本'
    return hints
  }, [isDesktop, state, onboarding.loading, publicUrl, status.available])
}
