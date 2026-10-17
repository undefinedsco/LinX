import { useCallback, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { getRuntimeShellInfo } from '@/lib/runtime-shell'
import { useAppUpdateStatus } from '@/modules/layout/use-app-update-status'
import { useThemePreference, type ThemePreference } from '@/modules/layout/use-theme-mode'
import { requestOpenServiceManagement } from '../../data/platform-actions'
import { useAutoLaunch, useStartupView } from '../../app/startup-prefs'
import { useNotificationPrefs } from '../../app/notification-prefs'
import { useSettingsStore } from '../../app/store'
import { useSettingsNavigationHints } from '../list/useSettingsNavigationHints'

export function useSettingsContentPaneController({ compact = false }: { compact?: boolean } = {}) {
  const selectedSection = useSettingsStore((state) => state.selectedSection)
  const compactLevel = useSettingsStore((state) => state.compactLevel)
  const selectSection = useSettingsStore((state) => state.selectSection)
  const showSectionList = useSettingsStore((state) => state.showSectionList)
  const navigationHints = useSettingsNavigationHints()
  const [runtimeAdvancedOpen, setRuntimeAdvancedOpen] = useState(false)
  const [themePreference, setThemePreference] = useThemePreference()
  const notificationPrefs = useNotificationPrefs((state) => state.prefs)
  const setNotificationPref = useNotificationPrefs((state) => state.setPref)
  const autoLaunch = useAutoLaunch()
  const [startupView, setStartupView] = useStartupView()
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

  const openModelServices = useCallback(() => {
    void navigate({ to: '/$microAppId', params: { microAppId: 'model-services' } })
  }, [navigate])

  const selectTheme = useCallback((value: ThemePreference) => {
    setThemePreference(value)
  }, [setThemePreference])

  return {
    selectedSection,
    compact,
    showSectionList: compactLevel === 'list',
    navigationHints,
    onSelectSection: selectSection,
    onBack: showSectionList,
    runtimeAdvancedOpen,
    setRuntimeAdvancedOpen,
    themePreference,
    notificationPrefs,
    setNotificationPref,
    autoLaunch,
    startupView,
    setStartupView,
    isDesktop: shell.id === 'desktop',
    updateStatus,
    updateChecking,
    releaseAvailable: Boolean(updateStatus.releaseUrl),
    updateCheckedAtLabel: updateStatus.checkedAt
      ? new Date(updateStatus.checkedAt).toLocaleString()
      : null,
    shell: {
      label: shell.label,
      description: shell.description,
      authLabel: shell.authLabel,
    },
    selectTheme,
    checkForUpdates,
    openReleasePage,
    openModelServices,
    openServiceManagement: requestOpenServiceManagement,
  }
}
