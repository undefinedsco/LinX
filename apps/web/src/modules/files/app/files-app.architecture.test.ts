import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const filesRootPath = 'src/modules/files'
const componentsPath = 'src/modules/files/components'
const appRouteStatePath = 'src/modules/files/app/route-state.ts'
const rootRouteStateShimPath = 'src/modules/files/route-state.ts'
const appRouteContextPath = 'src/modules/files/app/FilesRouteContext.tsx'
const rootRouteContextShimPath = 'src/modules/files/FilesRouteContext.tsx'
const appWorkspacePanePath = 'src/modules/files/app/FilesWorkspacePane.tsx'
const workspacePaneShimPath = 'src/modules/files/components/FilesWorkspacePane.tsx'
const appFeatureFlagsPath = 'src/modules/files/app/feature-flags.ts'
const rootFeatureFlagsShimPath = 'src/modules/files/feature-flags.ts'
const appStorePath = 'src/modules/files/app/store.ts'
const rootStoreShimPath = 'src/modules/files/store.ts'
const rootIndexPath = 'src/modules/files/index.ts'
const microAppRegistryPath = 'src/modules/layout/micro-app-registry.tsx'
const primaryLayoutPath = 'src/modules/layout/PrimaryLayout.tsx'
const routerPath = 'src/router.tsx'
const rootFacadeSourcePattern = /^(?:(?:\/\/[^\n]*(?:\n|$))|\s|export(?:\s+type)?\s+(?:\*\s+from|\{[\s\S]*?\}\s+from)\s+['"]\.\/(?:app|data|domain|features|ui)\/[^'"]+['"];?|export\s+\{\};?)+$/
const componentShimSourcePattern = /^(?:(?:\/\/[^\n]*(?:\n|$))|\s|export(?:\s+type)?\s+(?:\*\s+from|\{[\s\S]*?\}\s+from)\s+['"]\.\.\/(?:app|features|ui)\/[^'"]+['"];?)+$/

const routeStateConsumers = [
  ['src/modules/files/features/editor/useFileEditorSheetController.ts', '../../app/route-state'],
  ['src/modules/files/features/detail/useFileDetailPaneController.ts', '../../app/route-state'],
  ['src/modules/files/features/structured/useLockedVocabPreviewController.ts', '../../app/route-state'],
  ['src/modules/files/features/structured/useStructuredSubjectNavigationController.ts', '../../app/route-state'],
  ['src/modules/files/app/FilesWorkspacePane.tsx', './route-state'],
] as const

const routeContextConsumers = [
  ['src/modules/files/features/editor/useFileEditorSheetController.ts', '../../app/FilesRouteContext'],
  ['src/modules/files/features/detail/useFileDetailPaneController.ts', '../../app/FilesRouteContext'],
  ['src/modules/files/features/structured/useLockedVocabPreviewController.ts', '../../app/FilesRouteContext'],
  ['src/modules/files/features/structured/useStructuredSubjectNavigationController.ts', '../../app/FilesRouteContext'],
  ['src/modules/files/app/FilesWorkspacePane.tsx', './FilesRouteContext'],
] as const

const storeConsumers = [
  ['src/modules/files/app/FilesWorkspacePane.tsx', './store'],
  ['src/modules/files/features/tree/useFilesTreePaneController.ts', '../../app/store'],
  ['src/modules/files/features/list/useFilesListPaneController.ts', '../../app/store'],
  ['src/modules/files/features/detail/useFileDetailPaneController.ts', '../../app/store'],
  ['src/modules/files/features/detail/useEditableFilePreviewController.ts', '../../app/store'],
  ['src/modules/files/features/detail/useSourceLinkedCardWorkflowController.ts', '../../app/store'],
  ['src/modules/files/features/editor/useFileEditorSheetController.ts', '../../app/store'],
  ['src/modules/files/features/folder/useFolderDetailNavigationController.ts', '../../app/store'],
  ['src/modules/files/features/folder/useFolderDetailOperationController.ts', '../../app/store'],
  ['src/modules/files/features/ingest/useSourceIngestToolbarController.ts', '../../app/store'],
  ['src/modules/files/features/structured/useLockedVocabPreviewController.ts', '../../app/store'],
  ['src/modules/files/features/structured/useStructuredSubjectNavigationController.ts', '../../app/store'],
  ['src/modules/files/features/structured/useStructuredViewStateController.ts', '../../app/store'],
] as const

function listRootSourceFiles(rootPath: string): string[] {
  return readdirSync(rootPath).flatMap((entryName) => {
    const entryPath = `${rootPath}/${entryName}`
    if (statSync(entryPath).isDirectory()) return []
    if (!/\.(ts|tsx)$/.test(entryName) || /\.(?:test|architecture\.test)\.(ts|tsx)$/.test(entryName)) return []
    return [entryPath]
  })
}

describe('Files app shell architecture boundary', () => {
  it('keeps components as compatibility shims to owner layers', () => {
    const componentFiles = listRootSourceFiles(componentsPath)

    expect(componentFiles.length).toBeGreaterThan(0)

    for (const filePath of componentFiles) {
      const source = readFileSync(filePath, 'utf8')

      expect(source.trim().length, `${filePath} should contain shim exports`).toBeGreaterThan(0)
      expect(
        source,
        `${filePath} must only re-export app/features/ui owners; do not put implementation in components/`,
      ).toMatch(componentShimSourcePattern)
      expect(source, `${filePath} must not import data/domain/store from the compatibility components directory`).not.toContain('import ')
      expect(source, `${filePath} must not define implementation in the compatibility components directory`).not.toMatch(/\b(?:function|const|class)\s+[A-Z_a-z]/)
    }
  })

  it('keeps root module files as compatibility facades, not implementation owners', () => {
    const rootFiles = listRootSourceFiles(filesRootPath)

    expect(rootFiles).toEqual(expect.arrayContaining([
      rootIndexPath,
      rootStoreShimPath,
      rootFeatureFlagsShimPath,
      rootRouteStateShimPath,
      rootRouteContextShimPath,
    ]))

    for (const filePath of rootFiles) {
      const source = readFileSync(filePath, 'utf8')

      expect(source.trim().length, `${filePath} should contain facade exports`).toBeGreaterThan(0)
      expect(
        source,
        `${filePath} must only contain comments, no-op export, or re-exports from owner layers`,
      ).toMatch(rootFacadeSourcePattern)
    }
  })

  it('keeps module feature flags in the app layer with a root compatibility shim', () => {
    expect(existsSync(appFeatureFlagsPath)).toBe(true)
    expect(existsSync(rootFeatureFlagsShimPath)).toBe(true)
    if (!existsSync(appFeatureFlagsPath) || !existsSync(rootFeatureFlagsShimPath)) return

    const appFeatureFlagsSource = readFileSync(appFeatureFlagsPath, 'utf8')
    const rootFeatureFlagsShimSource = readFileSync(rootFeatureFlagsShimPath, 'utf8')

    expect(appFeatureFlagsSource).toContain('export const FILES_CP1_ENABLED')
    expect(rootFeatureFlagsShimSource).toMatch(/^export \* from '.\/app\/feature-flags'\n?$/)
  })

  it('keeps workspace shell and micro-app routing in the app layer', () => {
    expect(existsSync(appWorkspacePanePath)).toBe(true)
    expect(existsSync(workspacePaneShimPath)).toBe(true)
    if (!existsSync(appWorkspacePanePath) || !existsSync(workspacePaneShimPath)) return

    const appWorkspaceSource = readFileSync(appWorkspacePanePath, 'utf8')
    const shimSource = readFileSync(workspacePaneShimPath, 'utf8')
    const microAppRegistrySource = readFileSync(microAppRegistryPath, 'utf8')

    expect(appWorkspaceSource).toContain('export function FilesWorkspacePane')
    expect(appWorkspaceSource).toContain('FilesWorkspacePaneContent')
    expect(appWorkspaceSource).not.toContain('FilesRouteBridgeProvider')
    expect(shimSource).toMatch(/^export \{ FilesWorkspacePane \} from '..\/app\/FilesWorkspacePane'\nexport \{ default \} from '..\/app\/FilesWorkspacePane'\n?$/)
    expect(microAppRegistrySource).toContain("import('@/modules/files/app/FilesWorkspacePane')")
    expect(microAppRegistrySource).toContain("import('@/modules/files/features/tree/FilesTreePane')")
    expect(microAppRegistrySource).not.toContain("import('@/modules/files/components/FilesWorkspacePane')")
    expect(microAppRegistrySource).not.toContain("import('@/modules/files/components/FilesTreePane')")
  })

  it('keeps Files routing and entry scope out of the reusable layout shell', () => {
    const primaryLayoutSource = readFileSync(primaryLayoutPath, 'utf8')
    const routerSource = readFileSync(routerPath, 'utf8')

    expect(primaryLayoutSource).not.toContain('@/modules/files')
    expect(primaryLayoutSource).not.toContain('filesRouteBridge')
    expect(primaryLayoutSource).not.toContain('chat-files')
    expect(routerSource).toContain('FilesRouteBridgeProvider')
    expect(routerSource).toContain('openChatFilesScope')
    expect(routerSource).toContain('openAllFilesScope')
  })

  it('keeps root module exports pointed at owner layers instead of component shims', () => {
    const indexSource = readFileSync(rootIndexPath, 'utf8')

    expect(indexSource).toContain("from './features/tree/FilesTreePane'")
    expect(indexSource).toContain("from './features/list/FilesListPane'")
    expect(indexSource).toContain("from './features/detail/FileDetailPane'")
    expect(indexSource).toContain("from './app/store'")
    expect(indexSource).not.toContain("from './components/FilesTreePane'")
    expect(indexSource).not.toContain("from './components/FilesListPane'")
    expect(indexSource).not.toContain("from './components/FileDetailPane'")
  })

  it('keeps Zustand UI store ownership in the app layer with a root compatibility shim', () => {
    expect(existsSync(appStorePath)).toBe(true)
    expect(existsSync(rootStoreShimPath)).toBe(true)
    if (!existsSync(appStorePath) || !existsSync(rootStoreShimPath)) return

    const appStoreSource = readFileSync(appStorePath, 'utf8')
    const rootStoreShimSource = readFileSync(rootStoreShimPath, 'utf8')
    const indexSource = readFileSync(rootIndexPath, 'utf8')

    expect(appStoreSource).toContain('export const useFilesStore')
    expect(appStoreSource).toContain('zustand')
    expect(appStoreSource).toContain("from '../domain/list/entry-scope'")
    expect(appStoreSource).toContain("from '../domain/resource/resource-semantics'")
    expect(appStoreSource).toContain('DEFAULT_STRUCTURED_VIEW_CONFIG')
    expect(appStoreSource).toContain('normalizeStructuredViewConfig')
    expect(appStoreSource).toContain('normalizeStructuredWhiteboardLayouts')
    expect(appStoreSource).toContain("from '../domain/structured/structured-view-metadata'")
    expect(appStoreSource).toContain('shouldRequestEditableSheetForStructuredSubjectTarget')
    expect(appStoreSource).not.toContain('STRUCTURED_RESOURCE_EXTENSIONS')
    expect(appStoreSource).not.toMatch(/\nfunction shouldRequestEditableSheetForStructuredSubjectTarget\(/)
    expect(appStoreSource).not.toMatch(/\nconst DEFAULT_STRUCTURED_VIEW_CONFIG\b/)
    expect(appStoreSource).not.toMatch(/\nfunction normalizeStructured(?:SortDirection|ViewMode|ColumnSizing|KanbanOrder|ViewConfig)\(/)
    expect(appStoreSource).not.toMatch(/\nfunction isStructuredWhiteboardPosition\(/)
    expect(appStoreSource).not.toMatch(/\nfunction normalizeStructuredWhiteboardLayouts\(/)
    expect(rootStoreShimSource).toMatch(/^export \* from '.\/app\/store'\n?$/)
    expect(indexSource).toContain("from './app/store'")
    expect(indexSource).not.toContain("from './store'")

    for (const [filePath, expectedImport] of storeConsumers) {
      const source = readFileSync(filePath, 'utf8')
      expect(source, `${filePath} should import Files store from app layer`).toContain(`from '${expectedImport}'`)
      expect(source, `${filePath} should not import the root store shim`).not.toContain("from '../../store'")
      expect(source, `${filePath} should not import the root store shim`).not.toContain("from '../store'")
    }
  })

  it('keeps route bridge and browser history ownership in the app layer', () => {
    expect(existsSync(appRouteStatePath)).toBe(true)
    expect(existsSync(rootRouteStateShimPath)).toBe(true)
    expect(existsSync(appRouteContextPath)).toBe(true)
    expect(existsSync(rootRouteContextShimPath)).toBe(true)
    if (!existsSync(appRouteStatePath) || !existsSync(rootRouteStateShimPath) || !existsSync(appRouteContextPath) || !existsSync(rootRouteContextShimPath)) return

    const routeStateSource = readFileSync(appRouteStatePath, 'utf8')
    const rootRouteStateShimSource = readFileSync(rootRouteStateShimPath, 'utf8')
    const routeContextSource = readFileSync(appRouteContextPath, 'utf8')
    const rootRouteContextShimSource = readFileSync(rootRouteContextShimPath, 'utf8')

    expect(routeStateSource).toContain('export function pushStructuredSubjectRoute')
    expect(routeStateSource).toContain('window.history')
    expect(routeStateSource).toContain("from '../domain/structured/structured-view-metadata'")
    expect(routeContextSource).toContain("from './route-state'")
    expect(rootRouteStateShimSource).toMatch(/^export \* from '.\/app\/route-state'\n?$/)
    expect(rootRouteContextShimSource).toMatch(/^export \* from '.\/app\/FilesRouteContext'\n?$/)

    for (const [filePath, expectedImport] of routeStateConsumers) {
      const source = readFileSync(filePath, 'utf8')
      expect(source, `${filePath} should import route state from app layer`).toContain(`from '${expectedImport}'`)
      expect(source, `${filePath} should not import route state from the root shim`).not.toContain("from '../../route-state'")
      expect(source, `${filePath} should not import route state from the root shim`).not.toContain("from '../route-state'")
    }

    for (const [filePath, expectedImport] of routeContextConsumers) {
      const source = readFileSync(filePath, 'utf8')
      expect(source, `${filePath} should import route context from app layer`).toContain(`from '${expectedImport}'`)
      expect(source, `${filePath} should not import route context from the root shim`).not.toContain("from '../../FilesRouteContext'")
      expect(source, `${filePath} should not import route context from the root shim`).not.toContain("from '../FilesRouteContext'")
    }
  })
})
