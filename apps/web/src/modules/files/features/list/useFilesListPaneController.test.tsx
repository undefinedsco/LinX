import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFilesStore } from '../../app/store'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { useFilesListPaneController } from './useFilesListPaneController'

const { mockUseFilesEntries, mockUseSelectedFilesLocation, mockUseFilesFavoriteList, mockFavoriteChange } = vi.hoisted(() => ({
  mockUseFilesEntries: vi.fn(),
  mockUseSelectedFilesLocation: vi.fn(),
  mockUseFilesFavoriteList: vi.fn(),
  mockFavoriteChange: vi.fn(),
}))

vi.mock('../../data/queries', () => ({
  useFilesEntries: (...args: unknown[]) => mockUseFilesEntries(...args),
  useFilesFavoriteList: (...args: unknown[]) => mockUseFilesFavoriteList(...args),
  useSelectedFilesLocation: () => mockUseSelectedFilesLocation(),
  filesFavoriteHooks: { onStarredChange: (...args: unknown[]) => mockFavoriteChange(...args) },
}))

vi.mock('../../app/platform-actions', () => ({
  copyFilesText: vi.fn(),
}))

function entry(overrides: Partial<FilesEntry> = {}): FilesEntry {
  return {
    id: overrides.uri ?? 'https://pod.example/public/report.md',
    uri: overrides.uri ?? 'https://pod.example/public/report.md',
    name: overrides.name ?? 'report.md',
    kind: overrides.kind ?? 'resource',
    semanticKind: overrides.semanticKind ?? 'file',
    parentUri: overrides.parentUri ?? 'https://pod.example/public/',
    mimeType: overrides.mimeType ?? 'text/markdown',
    size: overrides.size ?? 1200,
    modifiedAt: overrides.modifiedAt ?? '2026-06-01T00:00:00.000Z',
    tags: overrides.tags,
    ...overrides,
  }
}

describe('useFilesListPaneController', () => {
  beforeEach(() => {
    useFilesStore.setState({
      selectedTreeNodeId: 'all',
      selectedFileId: null,
      selectedFileIds: new Set(),
      entryScope: 'all',
      searchText: '',
      sortField: 'modifiedAt',
      sortDirection: 'desc',
      mimeTypeFilter: null,
      tagFilter: null,
      detailTab: 'preview',
      editableFileSheetOpenRequestUri: null,
      folderHistory: [],
    })
    mockUseSelectedFilesLocation.mockReturnValue({ kind: 'all' })
    mockUseFilesFavoriteList.mockReturnValue({ data: [] })
    mockUseFilesEntries.mockReturnValue({
      data: [
        entry({
          uri: 'https://pod.example/public/report.md',
          name: 'report.md',
          parentUri: 'https://pod.example/public/',
          tags: ['work'],
        }),
      ],
      isLoading: false,
      error: null,
    })
  })

  it('owns list row projection, recent scope chrome, visible state, and tag filter availability', () => {
    useFilesStore.setState({ selectedTreeNodeId: 'smart-root:recent' })
    mockUseSelectedFilesLocation.mockReturnValue({ kind: 'recent' })

    const { result } = renderHook(() => useFilesListPaneController())

    expect(result.current.showRecentScopeHeader).toBe(true)
    expect(result.current.hasVisibleFiles).toBe(true)
    expect(result.current.canFilterByTag).toBe(true)
    expect(result.current.visibleRows).toHaveLength(1)
    expect(result.current.visibleRows[0]?.file.name).toBe('report.md')
    expect(result.current.visibleRows[0]?.row).toMatchObject({
      name: 'report.md',
      parentPath: '/public/',
      sizeLabel: '1.2 KB',
    })
  })

  it('enters folders and exposes the current explorer path', () => {
    useFilesStore.setState({
      selectedTreeNodeId: 'container:https://pod.example/public/',
      selectedFileId: 'https://pod.example/public/report.md',
    })
    mockUseSelectedFilesLocation.mockReturnValue({
      kind: 'container',
      containerUri: 'https://pod.example/public/',
    })
    const folder = entry({
      uri: 'https://pod.example/public/docs/',
      name: 'docs',
      kind: 'container',
      semanticKind: 'folder',
      mimeType: 'text/turtle',
    })

    const { result } = renderHook(() => useFilesListPaneController())
    expect(result.current.canGoBack).toBe(false)

    act(() => result.current.openFile(folder, 'double-click'))

    expect(useFilesStore.getState()).toMatchObject({
      selectedFileId: 'https://pod.example/public/docs/',
    })
    expect(useFilesStore.getState().selectedTreeNodeId).toBe('container:https://pod.example/public/docs/')
    expect(useFilesStore.getState().folderHistory).toHaveLength(1)
    expect(result.current.canGoBack).toBe(true)
    expect(result.current.explorerRows.map((row) => row.entry?.name)).toEqual(['report.md'])
  })
})
