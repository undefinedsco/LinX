import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFilesStore } from '../../app/store'
import type { FilesEntry } from '../../domain/resource/resource-model'
import { useFilesListSelectionController } from './useFilesListSelectionController'

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

describe('useFilesListSelectionController', () => {
  beforeEach(() => {
    useFilesStore.setState({
      selectedFileId: null,
      selectedFileIds: new Set(),
    })
  })

  it('owns batch selection labels and context menu chrome outside FilesListPane', () => {
    useFilesStore.setState({
      selectedFileId: beta.uri,
      selectedFileIds: new Set([alpha.uri, beta.uri]),
    })

    const { result } = renderHook(() => useFilesListSelectionController({
      files: [alpha, beta, gamma],
      openFile: vi.fn(),
    }))

    expect(result.current.hasBatchSelection).toBe(true)
    expect(result.current.hasSelectedVisibleFiles).toBe(true)
    expect(result.current.batchSelectionLabel).toBe('已选择 2 项')
    expect(result.current.contextMenuViewForFile(alpha)).toMatchObject({
      copyLabel: '复制所选 URI',
      deleteLabel: '删除所选项',
      isBatchContext: true,
      showSingleFileActions: false,
      targetFiles: [alpha, beta],
    })
    expect(result.current.contextMenuViewForFile(gamma)).toMatchObject({
      copyLabel: '复制 URI',
      deleteLabel: '删除',
      isBatchContext: false,
      showSingleFileActions: true,
      targetFiles: [gamma],
    })
  })
})
