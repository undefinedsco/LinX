import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { FileDetailTab } from '../../app/store'
import type { FilesDetail } from '../../domain/resource/resource-model'
import {
  planFileDetailFavoriteToggle,
  projectFileDetailChrome,
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
        title: 'report',
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
        title: 'report',
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

  it('titles a favorited .data folder 数据, as the Files tree does', () => {
    const plan = planFileDetailFavoriteToggle({
      file: file({ uri: 'https://pod.example/.data/', name: '.data', kind: 'container', semanticKind: 'container', parentUri: 'https://pod.example/' }),
      isFavorite: false,
      selectedTreeNodeId: null,
    })
    expect(plan?.metadata.title).toBe('数据')
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

  it('projects detail chrome subtitle and footer from available resource facts', () => {
    expect(projectFileDetailChrome(file({
      mimeType: 'text/markdown',
      parentUri: 'https://pod.example/files/cards/',
      size: 6144,
      modifiedAt: '2026-07-25T08:40:00.000Z',
    }))).toEqual({
      title: 'report',
      subtitle: '文档 · 我的空间 / files / cards',
      footer: '6 KB · 2026-07-25 08:40',
    })

    expect(projectFileDetailChrome({
      ...file(),
      kind: 'container',
      mimeType: null,
      parentUri: 'https://pod.example/files/',
      size: 0,
      modifiedAt: null,
      childEntries: [{}, {}] as FilesDetail['childEntries'],
    })).toMatchObject({
      subtitle: '文件夹 · 我的空间 / files',
      footer: '2 项',
    })

    expect(projectFileDetailChrome({
      ...file(),
      mimeType: 'text/turtle',
      size: null,
      modifiedAt: 'not-a-date',
    })).toMatchObject({
      subtitle: '表格 · 我的空间 / files',
      footer: '',
    })
  })

  it('shows a table by its name and a readable location, never the extension or encoded path', () => {
    expect(projectFileDetailChrome(file({
      mimeType: 'text/turtle',
      name: '任务.ttl',
      uri: 'https://pod.example/test/.data/%E4%BB%BB%E5%8A%A1.ttl',
      parentUri: 'https://pod.example/test/.data/',
      size: null,
      modifiedAt: null,
    }), 'https://pod.example/test/')).toEqual({
      title: '任务',
      subtitle: '表格 · 我的空间 / 数据',
      footer: '120 B',
    })
  })

  it('names the .data folder 数据', () => {
    expect(projectFileDetailChrome({
      ...file(),
      uri: 'https://pod.example/.data/',
      name: '.data',
      kind: 'container',
      childEntries: [],
    }).title).toBe('数据')
    expect(projectFileDetailChrome({
      ...file(),
      uri: 'https://pod.example/.data/',
      name: '.data',
      kind: 'container',
      parentUri: 'https://pod.example/',
      childEntries: [],
    }).subtitle).toBe('各应用共用的数据 · 我的空间')
  })

  it('projects empty state, shell fallback, and horizontal scroll reset decisions', () => {
    expect(shouldResetFileDetailHorizontalScroll({ structuredViewMode: 'table' })).toBe(true)
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
      showFileDrawerMetadata: false,
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
      showFileDrawerMetadata: true,
      showTabs: false,
      sidecarOwnerTarget: {
        uri: 'https://pod.example/files/report.md',
        kind: 'resource',
      },
    }))
  })
})
