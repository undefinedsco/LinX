import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const detailPanePath = 'src/modules/files/features/detail/FileDetailPane.tsx'
const detailPaneControllerPath = 'src/modules/files/features/detail/useFileDetailPaneController.ts'
const detailPaneModelPath = 'src/modules/files/features/detail/file-detail-pane-model.ts'
const shellModelPath = 'src/modules/files/domain/detail/file-detail-shell-model.ts'
const rootShellModelShimPath = 'src/modules/files/file-detail-shell-model.ts'

describe('FileDetailPane architecture boundary', () => {
  it('keeps detail pane store, route, favorite, and platform workflows in a controller', () => {
    expect(existsSync(detailPaneControllerPath)).toBe(true)
    expect(existsSync(detailPaneModelPath)).toBe(true)
    if (!existsSync(detailPaneControllerPath) || !existsSync(detailPaneModelPath)) return

    const detailPaneSource = readFileSync(detailPanePath, 'utf8')
    const controllerSource = readFileSync(detailPaneControllerPath, 'utf8')
    const modelSource = readFileSync(detailPaneModelPath, 'utf8')

    expect(detailPaneSource).toContain("from './useFileDetailPaneController'")
    expect(detailPaneSource).toContain('useFileDetailPaneController')
    expect(detailPaneSource).not.toContain('useFilesStore')
    expect(detailPaneSource).not.toContain('useFilesRouteBridge')
    expect(detailPaneSource).not.toContain('clearStructuredSubjectRoute')
    expect(detailPaneSource).not.toMatch(/\buseFileDetail\(/)
    expect(detailPaneSource).not.toContain('useFilesFavoriteList')
    expect(detailPaneSource).not.toContain('filesFavoriteHooks')
    expect(detailPaneSource).not.toContain('copyFilesText')
    expect(detailPaneSource).not.toContain('openFilesExternalUri')
    expect(detailPaneSource).not.toContain('openFilesSystemExternalUri')
    expect(detailPaneSource).not.toContain('hasFilesSystemExternalOpen')

    expect(controllerSource).toContain('export function useFileDetailPaneController')
    expect(controllerSource).toContain('useFilesStore')
    expect(controllerSource).toContain('useFilesRouteBridge')
    expect(controllerSource).toContain('clearStructuredSubjectRoute')
    expect(controllerSource).toContain('useFileDetail')
    expect(controllerSource).toContain('useFilesFavoriteList')
    expect(controllerSource).toContain('filesFavoriteHooks')
    expect(controllerSource).toContain('copyFilesText')
    expect(controllerSource).toContain('openFilesExternalUri')
    expect(controllerSource).toContain('openFilesSystemExternalUri')
    expect(controllerSource).toContain('hasFilesSystemExternalOpen')
    expect(controllerSource).toContain("from './file-detail-pane-model'")
    expect(controllerSource).not.toContain('favorites.some')
    expect(controllerSource).not.toContain('JSON.stringify({')
    expect(controllerSource).not.toContain('structuredViewMode ===')
    expect(controllerSource).not.toContain('? getFilesDetailErrorState(error)')
    expect(controllerSource).not.toContain('DropdownMenu')
    expect(controllerSource).not.toContain('ResourceMetaDrawer')
    expect(controllerSource).not.toContain('FileDetailPreview')
    expect(modelSource).toContain('export function projectFileDetailFavoriteState')
    expect(modelSource).toContain('export function planFileDetailFavoriteToggle')
    expect(modelSource).toContain('export function projectFileDetailControllerState')
    expect(modelSource).toContain('export function shouldResetFileDetailHorizontalScroll')
    expect(modelSource).not.toContain('useFilesStore')
    expect(modelSource).not.toContain('useFileDetail')
    expect(modelSource).not.toContain('filesFavoriteHooks')
    expect(modelSource).not.toContain('copyFilesText')
  })

  it('keeps shell open-mode, tabs, actions, and sidecar target decisions in a pure model', () => {
    const detailPaneSource = readFileSync(detailPanePath, 'utf8')
    const controllerSource = readFileSync(detailPaneControllerPath, 'utf8')

    expect(existsSync(shellModelPath)).toBe(true)
    expect(existsSync(rootShellModelShimPath)).toBe(true)
    if (!existsSync(shellModelPath) || !existsSync(rootShellModelShimPath)) return

    const shellModelSource = readFileSync(shellModelPath, 'utf8')
    const detailPaneModelSource = readFileSync(detailPaneModelPath, 'utf8')
    const rootShimSource = readFileSync(rootShellModelShimPath, 'utf8')

    expect(controllerSource).toContain("from './file-detail-pane-model'")
    expect(controllerSource).not.toContain("from '../../domain/detail/file-detail-shell-model'")
    expect(detailPaneModelSource).toContain("from '../../domain/detail/file-detail-shell-model'")
    expect(detailPaneSource).not.toContain("from '../../domain/detail/file-detail-shell-model'")
    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/detail\/file-detail-shell-model'\n?$/)
    expect(detailPaneSource).not.toContain('getFilesEntryOpenMode')
    expect(detailPaneSource).not.toContain('getFilesResourceActions')
    expect(detailPaneSource).not.toContain('resolveFilesSidecarOwnerTarget')
    expect(detailPaneSource).not.toContain("openMode === 'structured-data-table'")
    expect(detailPaneSource).not.toContain("openMode === 'locked-vocab-table'")
    expect(detailPaneSource).not.toContain("openMode !== 'editable-file-sheet'")
    expect(detailPaneSource).not.toContain("detailTab === 'metadata'")

    expect(shellModelSource).toContain('export function projectFileDetailShellState')
    expect(shellModelSource).toContain('getFilesEntryOpenMode')
    expect(shellModelSource).toContain('getFilesResourceActions')
    expect(shellModelSource).toContain('resolveFilesSidecarOwnerTarget')
    expect(shellModelSource).not.toContain('useFilesStore')
    expect(shellModelSource).not.toContain('useFileDetail')
    expect(shellModelSource).not.toContain('ResourceMetaDrawer')
    expect(shellModelSource).not.toContain('<')
  })

  it('keeps Favorites collection access behind Files query adapters', () => {
    const detailPaneSource = readFileSync(detailPanePath, 'utf8')
    const controllerSource = existsSync(detailPaneControllerPath)
      ? readFileSync(detailPaneControllerPath, 'utf8')
      : ''

    expect(controllerSource).toContain('useFilesFavoriteList')
    expect(controllerSource).toContain('filesFavoriteHooks')
    expect(controllerSource).toContain("from '../../data/queries'")
    expect(detailPaneSource).not.toContain('useFilesFavoriteList')
    expect(detailPaneSource).not.toContain('filesFavoriteHooks')
    expect(detailPaneSource).not.toContain('@/modules/favorites/collections')
    expect(detailPaneSource).not.toMatch(/\buseFavoriteList\b/)
    expect(detailPaneSource).not.toMatch(/\bfavoriteHooks\b/)
  })
})
