import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { getRuntimeShellInfo } from '@/lib/runtime-shell'
import { useAppUpdateStatus } from '@/modules/layout/use-app-update-status'
import { useThemeMode } from '@/modules/layout/use-theme-mode'
import type { ThemeMode } from '@/modules/layout/applet-registry'
import { requestOpenServiceManagement } from '../../data/platform-actions'
import { useSettingsStore } from '../../app/store'

export function useSettingsContentPaneController() {
  const selectedSection = useSettingsStore((state) => state.selectedSection)
  const [theme, toggleTheme, setTheme] = useThemeMode()
  const appUpdate = useAppUpdateStatus()
  const {
    status: updateStatus,
    isChecking: updateChecking,
    refresh: refreshUpdates,
    openReleasePage: openUpdateReleasePage,
  } = appUpdate
  const navigate = useNavigate()
  const shell = getRuntimeShellInfo()

  const checkForUpdates = useCallback(async () => {
    await refreshUpdates(true, 'manual')
  }, [refreshUpdates])

  const openReleasePage = useCallback(async () => {
    await openUpdateReleasePage()
  }, [openUpdateReleasePage])

  const openAiConnections = useCallback(() => {
    void navigate({ to: '/$appletId', params: { appletId: 'ai-connections' } })
  }, [navigate])

  const selectTheme = useCallback((value: ThemeMode) => {
    setTheme(value)
  }, [setTheme])

  return {
    selectedSection,
    theme,
    updateStatus,
    updateChecking,
    releaseAvailable: Boolean(updateStatus.releaseUrl),
    updateCheckedAtLabel: updateStatus.checkedAt
      ? new Date(updateStatus.checkedAt).toLocaleString()
      : null,
    shell: {
      description: shell.description,
      authLabel: shell.authLabel,
    },
    selectTheme,
    toggleTheme,
    checkForUpdates,
    openReleasePage,
    openAiConnections,
    openServiceManagement: requestOpenServiceManagement,
  }
}
