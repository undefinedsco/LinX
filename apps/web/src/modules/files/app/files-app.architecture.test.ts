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
const featureDetailPanePath = 'src/modules/files/features/detail/FileDetailPane.tsx'
const appFeatureFlagsPath = 'src/modules/files/app/feature-flags.ts'
const rootFeatureFlagsShimPath = 'src/modules/files/feature-flags.ts'
const appStorePath = 'src/modules/files/app/store.ts'
const rootStoreShimPath = 'src/modules/files/store.ts'
const rootIndexPath = 'src/modules/files/index.ts'
const appletRegistryPath = 'src/modules/layout/applet-registry.tsx'
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

  it('keeps workspace shell and applet routing in the app layer', () => {
    expect(existsSync(appWorkspacePanePath)).toBe(true)
    expect(existsSync(workspacePaneShimPath)).toBe(true)
    if (!existsSync(appWorkspacePanePath) || !existsSync(workspacePaneShimPath)) return

    const appWorkspaceSource = readFileSync(appWorkspacePanePath, 'utf8')
    const shimSource = readFileSync(workspacePaneShimPath, 'utf8')
    const appletRegistrySource = readFileSync(appletRegistryPath, 'utf8')

    expect(appWorkspaceSource).toContain('export function FilesWorkspacePane')
    expect(appWorkspaceSource).toContain('FilesWorkspacePaneContent')
    expect(appWorkspaceSource).not.toContain('FilesRouteBridgeProvider')
    expect(shimSource).toMatch(/^export \{ FilesWorkspacePane \} from '..\/app\/FilesWorkspacePane'\nexport \{ default \} from '..\/app\/FilesWorkspacePane'\n?$/)
    expect(appletRegistrySource).toContain("import('@/modules/files/app/FilesWorkspacePane')")
    expect(appletRegistrySource).toContain("import('@/modules/files/features/tree/FilesTreePane')")
    expect(appletRegistrySource).not.toContain("import('@/modules/files/features/list/FilesListPane')")
    expect(appletRegistrySource).not.toContain("import('@/modules/files/components/FilesWorkspacePane')")
    expect(appletRegistrySource).not.toContain("import('@/modules/files/components/FilesTreePane')")
  })

  it('locks the desktop shell to one persistent resource tree beside one selected-resource workspace', () => {
    const appWorkspaceSource = readFileSync(appWorkspacePanePath, 'utf8')
    const detailPaneSource = readFileSync(featureDetailPanePath, 'utf8')
    const appletRegistrySource = readFileSync(appletRegistryPath, 'utf8')
    const desktopBranchStart = appWorkspaceSource.indexOf('if (!compact)')
    const desktopBranch = appWorkspaceSource.match(/if \(!compact\) \{([\s\S]*?)\n  \}\n\n  return \(/)?.[1] ?? ''

    expect(desktopBranchStart, `${appWorkspacePanePath} should have an explicit desktop branch`).toBeGreaterThanOrEqual(0)
    expect(appletRegistrySource, 'desktop Files should mount the persistent resource tree through the shared left list pane').toContain("import('@/modules/files/features/tree/FilesTreePane')")
    expect(desktopBranch, 'desktop Files should mount one selected-resource workspace beside the tree').toContain("renderDetailSurface('flex')")
    expect(desktopBranch, 'desktop Files must not keep a third persistent list/preview pane between tree and workspace').not.toMatch(/<FilesListPane(?:\s|>)/)
    expect(desktopBranch, 'desktop Files must not add a second persistent resource tree inside the workspace').not.toMatch(/<FilesTreePane(?:\s|>)/)
    expect(detailPaneSource, 'workspace title should be projected from the selected resource, not a fixed generic Files label').toContain('data-resource-title="true"')
    expect(detailPaneSource, 'selected-resource workspace title should use the selected resource name').toContain('name={file.name}')
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

const layoutConfigBridgePath = 'src/modules/files/app/FilesLayoutConfigBridge.tsx'
const explorerRowPath = 'src/modules/files/ui/FilesExplorerRow.tsx'
const explorerControllerPath = 'src/modules/files/features/list/useFilesExplorerController.ts'
const folderDetailModelPath = 'src/modules/files/domain/folder/folder-detail-model.ts'
const folderDetailPreviewPath = 'src/modules/files/features/folder/FolderDetailPreview.tsx'
const documentEditorModalPath = 'src/modules/files/features/editor/DocumentEditorModal.tsx'
const fileEditorSheetPath = 'src/modules/files/features/editor/FileEditorSheet.tsx'
const filesEmptyStatePath = 'src/modules/files/ui/FilesEmptyState.tsx'
const structuredToolbarPath = 'src/modules/files/features/structured/StructuredResourceToolbar.tsx'
const metaDrawerPath = 'src/modules/files/features/sidecars/ResourceSidecars.tsx'

describe('Files shell alignment contract (2026-07-20 design)', () => {
  it('clamps the resource tree width to 232-360px and persists it', () => {
    expect(existsSync(layoutConfigBridgePath)).toBe(true)
    if (!existsSync(layoutConfigBridgePath)) return

    const source = readFileSync(layoutConfigBridgePath, 'utf8')

    expect(source, 'tree width lower bound must be 232px').toContain('232')
    expect(source, 'tree width upper bound must be 360px').toContain('360')
    expect(source, 'tree width must persist across reloads').toMatch(/localStorage|persist|storage/i)
  })

  it('shows tree row actions only on hover, focus, menu-open, or selected state', () => {
    expect(existsSync(explorerRowPath)).toBe(true)
    if (!existsSync(explorerRowPath)) return

    const source = readFileSync(explorerRowPath, 'utf8')

    expect(source, 'row actions must be hidden until hover/focus/selected').toMatch(/group-hover|focus-within/)
  })

  it('uses one quiet selected background for tree rows, never fill plus inset outline', () => {
    expect(existsSync(explorerRowPath)).toBe(true)
    if (!existsSync(explorerRowPath)) return

    const source = readFileSync(explorerRowPath, 'utf8')

    expect(source, 'selected rows must not combine a fill with an inset outline').not.toMatch(/ring-inset|shadow-\[inset/)
  })

  it('moves DOM focus with arrow-key selection in the resource tree (roving focus)', () => {
    expect(existsSync(explorerControllerPath)).toBe(true)
    if (!existsSync(explorerControllerPath)) return

    const source = readFileSync(explorerControllerPath, 'utf8')
    const arrowBranch = source.match(/Arrow(?:Up|Down)[\s\S]{0,600}/)?.[0] ?? ''

    expect(arrowBranch, 'arrow-key selection must also move DOM focus to the target row').toMatch(/\.focus\(\)/)
  })

  it('keeps folder projections to Table and Grid only, with no Columns view', () => {
    expect(existsSync(folderDetailModelPath)).toBe(true)
    if (!existsSync(folderDetailModelPath)) return

    const modelSource = readFileSync(folderDetailModelPath, 'utf8')
    const previewSource = existsSync(folderDetailPreviewPath) ? readFileSync(folderDetailPreviewPath, 'utf8') : ''

    expect(modelSource, 'folder view modes must not include columns').not.toMatch(/'columns'|"columns"/)
    expect(previewSource, 'folder workspace must not render a Columns view').not.toContain('FolderDetailColumnView')
  })

  it('owns ordinary-file editing in one centered DocumentEditorModal and delegates the legacy sheet', () => {
    expect(existsSync(documentEditorModalPath), 'DocumentEditorModal must exist as the single ordinary-file editing surface').toBe(true)
    expect(existsSync(fileEditorSheetPath)).toBe(true)
    if (!existsSync(fileEditorSheetPath)) return

    const sheetSource = readFileSync(fileEditorSheetPath, 'utf8')

    expect(sheetSource, 'legacy FileEditorSheet must delegate to DocumentEditorModal instead of keeping its own editor markup').toContain('DocumentEditorModal')
  })

  it('opens .meta as a right sidebar that is collapsed by default, never an overlay covering the workspace', () => {
    expect(existsSync(metaDrawerPath)).toBe(true)
    if (!existsSync(metaDrawerPath)) return

    const source = readFileSync(metaDrawerPath, 'utf8')

    expect(source, '.meta surface must default to collapsed').toMatch(/defaultOpen\s*=\s*false|collapsed.*default|useState\(false\)/)
  })

  it('gives every empty state a concrete next action slot', () => {
    expect(existsSync(filesEmptyStatePath)).toBe(true)
    if (!existsSync(filesEmptyStatePath)) return

    const source = readFileSync(filesEmptyStatePath, 'utf8')

    expect(source, 'FilesEmptyState must accept an action so empty states are actionable').toMatch(/action\??:/)
  })

  it('wires the namespace switch and column visibility inside the structured toolbar column menu', () => {
    expect(existsSync(structuredToolbarPath)).toBe(true)
    if (!existsSync(structuredToolbarPath)) return

    const source = readFileSync(structuredToolbarPath, 'utf8')

    expect(source, 'namespace change handler must be wired, not discarded').not.toMatch(/onShowNamespacesChange\s*[=,]\s*_\b/)
    expect(source, 'column visibility handler must be wired, not discarded').not.toMatch(/onTogglePredicateVisibility\s*[=,]\s*_\b/)
    expect(source, 'namespace switch must not be a standalone toolbar control').not.toContain('namespace-switch')
  })

  it('shows the current resource path in the workspace head without a back button', () => {
    expect(existsSync(folderDetailPreviewPath)).toBe(true)
    if (!existsSync(folderDetailPreviewPath)) return

    const source = readFileSync(folderDetailPreviewPath, 'utf8')

    expect(source, 'folder workspace must not render a back button; the tree owns navigation').not.toMatch(/goBackFolder|返回|aria-label="back"/i)

    const detailPaneModelPath = 'src/modules/files/features/detail/file-detail-pane-model.ts'
    expect(existsSync(detailPaneModelPath)).toBe(true)
    if (!existsSync(detailPaneModelPath)) return
    const detailPaneModelSource = readFileSync(detailPaneModelPath, 'utf8')
    expect(detailPaneModelSource, 'workspace head should show the current path').toContain('fileDetailPathLabel')
  })
})
