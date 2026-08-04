import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFilesStore } from '../../app/store'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { useFilesExplorerController } from './useFilesExplorerController'

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

describe('useFilesExplorerController', () => {
  beforeEach(() => {
    useFilesStore.setState({
      selectedTreeNodeId: 'all',
      selectedFileId: null,
      selectedFileIds: new Set(),
      folderHistory: [],
      searchText: '',
      detailTab: 'preview',
      editableFileSheetOpenRequestUri: null,
    })
  })

  it('expands folders lazily without entering folder history', () => {
    const folder = entry({
      uri: 'https://pod.example/public/docs/',
      name: 'docs',
      kind: 'container',
      semanticKind: 'folder',
    })

    const { result, rerender } = renderHook(() => useFilesExplorerController({
      rootEntries: [folder],
      searchText: '',
      childEntriesByContainerUri: {
        'https://pod.example/public/docs/': [entry({
          uri: 'https://pod.example/public/docs/guide.md',
          name: 'guide.md',
          parentUri: 'https://pod.example/public/docs/',
        })],
      },
    }))

    act(() => result.current.toggleFolder(folder.uri))
    rerender()

    expect(useFilesStore.getState().folderHistory).toEqual([])
    expect(result.current.rows.map((row) => row.entry?.name)).toEqual(['docs', 'guide.md'])
  })

  it('selects folders and opens files through existing detail and sheet state', () => {
    const folder = entry({
      uri: 'https://pod.example/public/docs/',
      name: 'docs',
      kind: 'container',
      semanticKind: 'folder',
    })
    const file = entry({
      uri: 'https://pod.example/public/docs/guide.md',
      name: 'guide.md',
      parentUri: 'https://pod.example/public/docs/',
    })

    const { result } = renderHook(() => useFilesExplorerController({
      rootEntries: [folder, file],
      searchText: '',
    }))

    act(() => result.current.openEntry(folder, 'click'))
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/docs/')
    expect(useFilesStore.getState().selectedTreeNodeId).toBe('all')

    act(() => result.current.openEntry(folder, 'double-click'))
    expect(result.current.expandedUris.has(folder.uri)).toBe(true)
    expect(useFilesStore.getState().selectedTreeNodeId).toBe('container:https://pod.example/public/docs/')
    expect(useFilesStore.getState().folderHistory).toHaveLength(1)

    act(() => result.current.openEntry(file, 'double-click'))
    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/public/docs/guide.md')
    expect(useFilesStore.getState().editableFileSheetOpenRequestUri).toBe('https://pod.example/public/docs/guide.md')
  })

  it('moves focus with arrows and expands or collapses with keyboard commands', () => {
    const folder = entry({
      uri: 'https://pod.example/public/docs/',
      name: 'docs',
      kind: 'container',
      semanticKind: 'folder',
    })
    const file = entry({
      uri: 'https://pod.example/public/readme.md',
      name: 'readme.md',
      parentUri: 'https://pod.example/public/',
    })

    const { result } = renderHook(() => useFilesExplorerController({
      rootEntries: [folder, file],
      searchText: '',
    }))

    act(() => result.current.handleRowKeyDown(folder.uri, 'ArrowDown'))
    expect(useFilesStore.getState().selectedFileId).toBe(file.uri)

    act(() => result.current.handleRowKeyDown(folder.uri, 'ArrowRight'))
    expect(result.current.expandedUris.has(folder.uri)).toBe(true)

    act(() => result.current.handleRowKeyDown(folder.uri, 'ArrowLeft'))
    expect(result.current.expandedUris.has(folder.uri)).toBe(false)
  })
})
