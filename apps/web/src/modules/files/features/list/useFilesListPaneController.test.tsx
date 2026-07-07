import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFilesStore } from '../../app/store'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { useFilesListPaneController } from './useFilesListPaneController'

const { mockUseFilesEntries, mockUseSelectedFilesLocation } = vi.hoisted(() => ({
  mockUseFilesEntries: vi.fn(),
  mockUseSelectedFilesLocation: vi.fn(),
}))

vi.mock('../../data/queries', () => ({
  useFilesEntries: (...args: unknown[]) => mockUseFilesEntries(...args),
  useSelectedFilesLocation: () => mockUseSelectedFilesLocation(),
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
    })
    mockUseSelectedFilesLocation.mockReturnValue({ kind: 'all' })
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
})
