import { describe, expect, it } from 'vitest'
import type { FilesEntry } from '../resource/resource-model'
import {
  createFilesListInteractionState,
  projectFilesListInteractionAnchor,
  projectFilesListInteractionContextTarget,
  projectFilesListInteractionReset,
  projectFilesListContextMenuView,
  projectFilesListContextSelection,
  projectFilesListRangeSelectionUris,
  projectFilesListSelectionProjection,
  shouldApplyFilesListContextSelection,
} from './files-list-selection-model'

function entry(name: string): FilesEntry {
  return {
    id: `https://pod.example/public/${name}`,
    uri: `https://pod.example/public/${name}`,
    name,
    kind: 'resource',
    semanticKind: 'file',
    parentUri: 'https://pod.example/public/',
    mimeType: 'text/markdown',
    size: 100,
    modifiedAt: '2026-06-01T00:00:00.000Z',
  }
}

const alpha = entry('alpha.md')
const beta = entry('beta.md')
const gamma = entry('gamma.md')

describe('files list selection model', () => {
  it('projects list interaction state transitions as one state container', () => {
    const initial = createFilesListInteractionState()

    expect(initial).toEqual({
      contextMenuTargetUri: null,
      selectionAnchorId: null,
    })

    const anchored = projectFilesListInteractionAnchor({
      current: initial,
      selectionAnchorId: alpha.uri,
    })
    expect(anchored).toEqual({
      contextMenuTargetUri: null,
      selectionAnchorId: alpha.uri,
    })

    const contextTargeted = projectFilesListInteractionContextTarget({
      current: anchored,
      contextMenuTargetUri: beta.uri,
    })
    expect(contextTargeted).toEqual({
      contextMenuTargetUri: beta.uri,
      selectionAnchorId: alpha.uri,
    })

    expect(projectFilesListInteractionContextTarget({
      current: contextTargeted,
      contextMenuTargetUri: null,
    })).toEqual(anchored)

    expect(projectFilesListInteractionReset(contextTargeted)).toEqual(initial)
  })

  it('projects visible selection, range selection, and context menu chrome without React state', () => {
    const selectedFileIds = new Set([alpha.uri, beta.uri, 'https://pod.example/public/stale.md'])
    const projection = projectFilesListSelectionProjection({
      files: [alpha, beta, gamma],
      selectedFileIds,
    })

    expect(projection).toMatchObject({
      selectedVisibleFiles: [alpha, beta],
      selectedVisibleCount: 2,
      hasBatchSelection: true,
      hasSelectedVisibleFiles: true,
      batchSelectionLabel: '已选择 2 项',
      batchSelectionActions: {
        copyLabel: '复制所选 URI',
        deleteLabel: '删除所选项',
      },
    })

    expect(projectFilesListRangeSelectionUris({
      files: [alpha, beta, gamma],
      anchorUri: alpha.uri,
      fileUri: gamma.uri,
    })).toEqual([alpha.uri, beta.uri, gamma.uri])
    expect(projectFilesListRangeSelectionUris({
      files: [alpha, beta, gamma],
      anchorUri: 'https://pod.example/public/missing.md',
      fileUri: gamma.uri,
    })).toBeNull()

    expect(projectFilesListContextSelection({
      file: alpha,
      selectedFileIds,
      selectedVisibleFiles: projection.selectedVisibleFiles,
    })).toEqual([alpha, beta])
    expect(projectFilesListContextSelection({
      file: gamma,
      selectedFileIds,
      selectedVisibleFiles: projection.selectedVisibleFiles,
    })).toEqual([gamma])

    expect(projectFilesListContextMenuView({
      file: alpha,
      selectedFileIds,
      selectedVisibleFiles: projection.selectedVisibleFiles,
    })).toMatchObject({
      copyLabel: '复制所选 URI',
      deleteLabel: '删除所选项',
      isBatchContext: true,
      showSingleFileActions: false,
      targetFiles: [alpha, beta],
    })
    expect(projectFilesListContextMenuView({
      file: gamma,
      selectedFileIds,
      selectedVisibleFiles: projection.selectedVisibleFiles,
    })).toMatchObject({
      copyLabel: '复制 URI',
      copyToLabel: '复制到...',
      deleteLabel: '删除',
      isBatchContext: false,
      moveToLabel: '移动到...',
      openLabel: '打开',
      renameLabel: '重命名',
      showSingleFileActions: true,
      targetFiles: [gamma],
    })
  })

  it('plans whether a context-menu close should rewrite selection', () => {
    expect(shouldApplyFilesListContextSelection({
      file: alpha,
      selectedFileId: alpha.uri,
      selectedFileIds: new Set([alpha.uri]),
      selectedVisibleCount: 1,
    })).toBe(false)

    expect(shouldApplyFilesListContextSelection({
      file: alpha,
      selectedFileId: alpha.uri,
      selectedFileIds: new Set([alpha.uri, beta.uri]),
      selectedVisibleCount: 2,
    })).toBe(false)

    expect(shouldApplyFilesListContextSelection({
      file: gamma,
      selectedFileId: alpha.uri,
      selectedFileIds: new Set([alpha.uri, beta.uri]),
      selectedVisibleCount: 2,
    })).toBe(true)
  })
})
