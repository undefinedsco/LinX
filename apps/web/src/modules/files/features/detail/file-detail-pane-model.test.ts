import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { FileDetailTab } from '../../app/store'
import type { FilesDetail } from '../../domain/resource/resource-model'
import {
  planFileDetailFavoriteToggle,
  projectFileDetailControllerState,
  projectFileDetailFavoriteState,
  projectFileDetailStructuredReturnAction,
  shouldResetFileDetailHorizontalScroll,
} from './file-detail-pane-model'

const modelPath = 'src/modules/files/features/detail/file-detail-pane-model.ts'
const controllerPath = 'src/modules/files/features/detail/useFileDetailPaneController.ts'
const featurePath = 'src/modules/files/features/detail/FileDetailPane.tsx'

function file(overrides: Partial<FilesDetail> = {}): FilesDetail {
  return {
    id: overrides.uri ?? 'https://pod.example/files/report.md',
    uri: overrides.uri ?? 'https://pod.example/files/report.md',
    name: overrides.name ?? 'report.md',
    kind: overrides.kind ?? 'resource',
    semanticKind: overrides.semanticKind ?? 'file',
    parentUri: overrides.parentUri ?? 'https://pod.example/files/',
    mimeType: overrides.mimeType ?? 'text/markdown',
    size: overrides.size ?? 120,
    modifiedAt: overrides.modifiedAt ?? null,
    headers: overrides.headers ?? {},
    previewText: overrides.previewText ?? '# Report\n',
  }
}

describe('file detail pane model', () => {
  it('keeps detail pane empty/favorite/scroll projection in a pure model', () => {
    expect(existsSync(modelPath)).toBe(true)
    expect(existsSync(controllerPath)).toBe(true)
    expect(existsSync(featurePath)).toBe(true)
    if (!existsSync(modelPath) || !existsSync(controllerPath) || !existsSync(featurePath)) return

    const modelSource = readFileSync(modelPath, 'utf8')
    const controllerSource = readFileSync(controllerPath, 'utf8')
    const featureSource = readFileSync(featurePath, 'utf8')

    expect(modelSource).toContain('export function projectFileDetailFavoriteState')
    expect(modelSource).toContain('export function planFileDetailFavoriteToggle')
    expect(modelSource).toContain('export function projectFileDetailControllerState')
    expect(modelSource).toContain('export function projectFileDetailStructuredReturnAction')
    expect(modelSource).toContain('export function shouldResetFileDetailHorizontalScroll')
    expect(modelSource).not.toContain('useFilesStore')
    expect(modelSource).not.toContain('useFileDetail')
    expect(modelSource).not.toContain('filesFavoriteHooks')
    expect(modelSource).not.toContain('copyFilesText')
    expect(controllerSource).toContain("from './file-detail-pane-model'")
    expect(controllerSource).not.toContain('favorites.some')
    expect(controllerSource).not.toContain('JSON.stringify({')
    expect(controllerSource).not.toContain('structuredViewMode ===')
    expect(controllerSource).not.toContain('? getFilesDetailErrorState(error)')
    expect(controllerSource).toContain('projectFileDetailStructuredReturnAction')
    expect(featureSource).toContain('structuredReturnAction')
    expect(featureSource).not.toContain('structuredSubjectReturnContext && file.uri !== structuredSubjectReturnContext.documentUri')
    expect(featureSource).not.toContain('structuredSubjectReturnContext.subject')
    expect(featureSource).not.toContain('返回来源表 ·')
  })

  it('projects favorite state and toggle metadata without controller-local JSON assembly', () => {
    const currentFile = file()

    expect(projectFileDetailFavoriteState({
      file: currentFile,
      favorites: [{ sourceId: currentFile.uri }],
    })).toBe(true)
    expect(projectFileDetailFavoriteState({
      file: currentFile,
      favorites: [{ sourceId: 'https://pod.example/files/other.md' }],
    })).toBe(false)
    expect(projectFileDetailFavoriteState({
      file: null,
      favorites: [{ sourceId: currentFile.uri }],
    })).toBe(false)

    expect(planFileDetailFavoriteToggle({
      file: currentFile,
      isFavorite: false,
      selectedTreeNodeId: 'container:https://pod.example/files/',
    })).toEqual({
      sourceModule: 'files',
      sourceId: currentFile.uri,
      starred: true,
      metadata: {
        title: 'report.md',
        searchText: 'report.md',
        snapshotContent: '# Report\n',
        snapshotMeta: JSON.stringify({
          fileId: currentFile.uri,
          treeNodeId: 'container:https://pod.example/files/',
        }),
      },
    })
    expect(planFileDetailFavoriteToggle({
      file: { ...currentFile, previewText: null },
      isFavorite: true,
      selectedTreeNodeId: null,
    })).toEqual({
      sourceModule: 'files',
      sourceId: currentFile.uri,
      starred: false,
      metadata: {
        title: 'report.md',
        searchText: 'report.md',
        snapshotContent: undefined,
        snapshotMeta: JSON.stringify({
          fileId: currentFile.uri,
          treeNodeId: null,
        }),
      },
    })
    expect(planFileDetailFavoriteToggle({
      file: null,
      isFavorite: false,
      selectedTreeNodeId: null,
    })).toBeNull()
  })

  it('projects structured return action without renderer-local context checks', () => {
    expect(projectFileDetailStructuredReturnAction({
      file: file(),
      returnContext: null,
    })).toBeNull()

    expect(projectFileDetailStructuredReturnAction({
      file: file({ uri: 'https://pod.example/data/table.ttl' }),
      returnContext: {
        documentUri: 'https://pod.example/data/table.ttl',
        subject: 'https://pod.example/data/table.ttl#row-1',
      },
    })).toBeNull()

    expect(projectFileDetailStructuredReturnAction({
      file: file({ uri: 'https://pod.example/files/body.md' }),
      returnContext: {
        documentUri: 'https://pod.example/data/table.ttl',
        subject: 'https://pod.example/data/table.ttl#row-1',
      },
    })).toEqual({
      label: '返回来源表 · https://pod.example/data/table.ttl#row-1',
    })

    expect(projectFileDetailStructuredReturnAction({
      file: null,
      returnContext: {
        documentUri: 'https://pod.example/data/table.ttl',
        subject: 'https://pod.example/data/table.ttl#row-1',
      },
    })).toBeNull()
  })

  it('projects empty state, shell fallback, and horizontal scroll reset decisions', () => {
    expect(shouldResetFileDetailHorizontalScroll({ structuredViewMode: 'table' })).toBe(false)
    expect(shouldResetFileDetailHorizontalScroll({ structuredViewMode: 'kanban' })).toBe(true)

    expect(projectFileDetailControllerState({
      selectedFileId: null,
      isLoading: false,
      error: null,
      file: null,
      detailTab: 'metadata' as FileDetailTab,
      hasSystemOpen: true,
    })).toEqual({
      activeDetailTab: 'preview',
      emptyState: {},
      resourceActions: [],
      showHeadSidecarActions: false,
      showMetaDrawer: false,
      showSourceLinkedDrawerMetadata: false,
      showTabs: false,
      sidecarOwnerTarget: null,
    })

    expect(projectFileDetailControllerState({
      selectedFileId: 'https://pod.example/files/missing.md',
      isLoading: false,
      error: new Error('missing'),
      file: null,
      detailTab: 'preview' as FileDetailTab,
      hasSystemOpen: false,
    })).toEqual(expect.objectContaining({
      activeDetailTab: 'preview',
      emptyState: expect.objectContaining({
        title: '读取文件失败',
      }),
    }))

    expect(projectFileDetailControllerState({
      selectedFileId: 'https://pod.example/files/report.md',
      isLoading: false,
      error: null,
      file: file(),
      detailTab: 'metadata' as FileDetailTab,
      hasSystemOpen: true,
    })).toEqual(expect.objectContaining({
      activeDetailTab: 'preview',
      emptyState: null,
      showMetaDrawer: false,
      showTabs: false,
      sidecarOwnerTarget: {
        uri: 'https://pod.example/files/report.md',
        kind: 'resource',
      },
    }))
  })
})
