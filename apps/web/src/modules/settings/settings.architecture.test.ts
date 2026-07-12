import { describe, expect, it } from 'vitest'
import {
  dataForbiddenImports,
  domainForbiddenImports,
  expectExportOnlyFacade,
  expectFilesToExist,
  expectModuleDirectories,
  expectNoForbiddenImports,
  listModuleSourceFiles,
  readModuleSource,
  uiForbiddenImports,
} from '@/test/module-architecture'

const root = 'src/modules/settings'

describe('settings module architecture', () => {
  it('uses the Files-standard layer skeleton', () => {
    expectModuleDirectories(root, ['app', 'data', 'domain', 'features', 'ui'])
    expectFilesToExist([
      `${root}/app/store.ts`,
      `${root}/app/events.ts`,
      `${root}/app/platform-actions.ts`,
      `${root}/data/platform-actions.ts`,
      `${root}/data/setup-client.ts`,
      `${root}/domain/section-model.ts`,
      `${root}/features/list/SettingsListPane.tsx`,
      `${root}/features/content/SettingsContentPane.tsx`,
      `${root}/features/content/useSettingsContentPaneController.ts`,
      `${root}/features/setup/SetupView.tsx`,
      `${root}/features/setup/useSetupViewController.ts`,
      `${root}/features/service/ServiceManagementDialog.tsx`,
      `${root}/features/service/useServiceManagementDialogController.ts`,
      `${root}/features/network/LocalNetworkSettingsCard.tsx`,
      `${root}/features/network/useLocalNetworkSettingsController.ts`,
      `${root}/ui/SettingsNavigation.tsx`,
      `${root}/ui/AdvancedDisclosure.tsx`,
      `${root}/ui/SettingsContentView.tsx`,
      `${root}/ui/SetupView.tsx`,
      `${root}/ui/ServiceManagementDialog.tsx`,
      `${root}/ui/LocalNetworkSettingsCard.tsx`,
    ])
  })

  it('keeps domain, data, and ui imports inside their ownership boundaries', () => {
    expectNoForbiddenImports(`${root}/domain`, domainForbiddenImports)
    expectNoForbiddenImports(`${root}/data`, dataForbiddenImports)
    expectNoForbiddenImports(`${root}/ui`, uiForbiddenImports)
  })

  it('keeps legacy entry files as compatibility facades', () => {
    for (const file of [
      'ServiceManagementDialog.tsx',
      'events.ts',
      'store.ts',
      'types.ts',
      'components/LocalNetworkSettingsCard.tsx',
      'components/SettingsContentPane.tsx',
      'components/SettingsListPane.tsx',
      'components/SetupView.tsx',
    ]) {
      expectExportOnlyFacade(`${root}/${file}`)
    }
  })

  it('keeps window and Electron transport owned by data adapters', () => {
    expectExportOnlyFacade(`${root}/app/platform-actions.ts`)
    expectExportOnlyFacade(`${root}/app/events.ts`)

    for (const filePath of listModuleSourceFiles(root)) {
      if (filePath.startsWith(`${root}/data/`)) continue

      const source = readModuleSource(filePath)
      expect(source, `${filePath} must not access window transport outside data`).not.toMatch(
        /\bwindow(?:\.|\[)/,
      )
      expect(source, `${filePath} must not access Electron transport outside data`).not.toMatch(
        /\bxpodDesktop\b/,
      )
      expect(source, `${filePath} must not issue network requests outside data`).not.toMatch(
        /\bfetch\s*\(/,
      )
    }

    const platformActions = readModuleSource(`${root}/data/platform-actions.ts`)
    expect(platformActions).toContain('window.xpodDesktop?.app?.openExternal')
    expect(platformActions).toContain("window.open(url, '_blank', 'noopener,noreferrer')")
    expect(platformActions).toContain('window.dispatchEvent')

    const serviceController = readModuleSource(
      `${root}/features/service/useServiceManagementDialogController.ts`,
    )
    const contentController = readModuleSource(
      `${root}/features/content/useSettingsContentPaneController.ts`,
    )
    expect(serviceController).toContain("from '../../data/platform-actions'")
    expect(contentController).toContain("from '../../data/platform-actions'")
    expect(serviceController).not.toMatch(
      /from ['"][^'"]*app\/platform-actions['"]/,
    )
    expect(contentController).not.toMatch(
      /from ['"][^'"]*app\/events['"]/,
    )
  })

  it('reuses shared update and runtime snapshots without copying layout logic', () => {
    const source = readModuleSource(`${root}/features/content/useSettingsContentPaneController.ts`)
    expect(source).toContain("@/modules/layout/use-app-update-status")
    expect(source).toContain("@/lib/runtime-shell")
    expect(readModuleSource(`${root}/data/platform-actions.ts`)).not.toContain('useAppUpdateStatus')
  })

  it('keeps transport and platform APIs out of feature renderers', () => {
    for (const filePath of listModuleSourceFiles(`${root}/features`)) {
      const source = readModuleSource(filePath)
      expect(source, `${filePath} must use a data adapter instead of fetch`).not.toMatch(/\bfetch\s*\(/)
      expect(source, `${filePath} must use a data adapter instead of Electron transport`).not.toContain('window.xpodDesktop')
      expect(source, `${filePath} must use data platform actions for external URLs`).not.toContain('window.open')
    }

    const setupClient = readModuleSource(`${root}/data/setup-client.ts`)
    expect(setupClient).toContain("fetch('/api/setup/config'")
    expect(setupClient).toContain('window.xpodDesktop?.xpod')
  })

  it('keeps feature renderers as controller and props-only UI composition', () => {
    const renderers = [
      ['content', `${root}/features/content/SettingsContentPane.tsx`, 'useSettingsContentPaneController', 'SettingsContentView'],
      ['setup', `${root}/features/setup/SetupView.tsx`, 'useSetupViewController', 'SetupView'],
      ['service', `${root}/features/service/ServiceManagementDialog.tsx`, 'useServiceManagementDialogController', 'ServiceManagementDialog'],
      ['network', `${root}/features/network/LocalNetworkSettingsCard.tsx`, 'useLocalNetworkSettingsController', 'LocalNetworkSettingsCard'],
    ] as const

    for (const [name, filePath, controllerName, viewName] of renderers) {
      const source = readModuleSource(filePath)
      expect(source, `${name} renderer must not own React state or effects`).not.toMatch(
        /\buse(?:State|Effect|Memo|Callback|Id)\b/,
      )
      expect(source, `${name} renderer must not render shared UI primitives directly`).not.toMatch(
        /@\/components\/ui\//,
      )
      expect(source, `${name} renderer must not render DOM markup directly`).not.toMatch(
        /<(?:div|span|button|input|section|header|main|nav|p|h[1-6])\b/,
      )
      expect(source).toContain(controllerName)
      expect(source).toContain(viewName)
    }
  })

  it('keeps settings views props-only', () => {
    for (const file of [
      'SettingsContentView.tsx',
      'SetupView.tsx',
      'ServiceManagementDialog.tsx',
      'LocalNetworkSettingsCard.tsx',
    ]) {
      const source = readModuleSource(`${root}/ui/${file}`)
      expect(source, `${file} must render entirely from props`).not.toMatch(
        /\buse(?:State|Effect|Memo|Callback)\b/,
      )
      expect(source, `${file} must not own feature, router, runtime, or store hooks`).not.toMatch(
        /(?:useNavigate|useThemeMode|useAppUpdateStatus|useLocalOnboarding|useSettingsStore|use[A-Z][A-Za-z]+Controller)/,
      )
      expect(source, `${file} must not import feature, data, or app owners`).not.toMatch(
        /from ['"][.]{1,2}\/[^'"]*(?:app|data|features)\//,
      )
    }
  })

  it('keeps the list pane as thin canonical navigation composition', () => {
    const source = readModuleSource(`${root}/features/list/SettingsListPane.tsx`)
    expect(source).toContain('SettingsNavigation')
    expect(source).toContain('SETTINGS_SECTIONS')
    expect(source).not.toMatch(/\buse(?:State|Effect|Memo|Callback)\b/)
    expect(source).not.toMatch(/@\/components\/ui\//)
  })

  it('routes shell composition to canonical feature owners', () => {
    const registry = readModuleSource('src/modules/layout/micro-app-registry.tsx')
    const primaryLayout = readModuleSource('src/modules/layout/PrimaryLayout.tsx')
    expect(registry).toContain("@/modules/settings/features/list/SettingsListPane")
    expect(registry).toContain("@/modules/settings/features/content/SettingsContentPane")
    expect(primaryLayout).toContain("@/modules/settings/features/service/ServiceManagementDialog")
    expect(primaryLayout).toContain("@/modules/settings/app/events")
  })
})
