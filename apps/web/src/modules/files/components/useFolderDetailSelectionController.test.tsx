import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FilesEntry } from '../domain/resource/resource-model'
import { useFolderDetailSelectionController } from '../features/folder/useFolderDetailSelectionController'

function folderEntry(name: string): FilesEntry {
  const isContainer = !name.includes('.')
  return {
    id: name,
    uri: `https://pod.example/files/${name}${isContainer ? '/' : ''}`,
    name,
    kind: isContainer ? 'container' : 'resource',
    semanticKind: isContainer ? 'container' : 'file',
    parentUri: 'https://pod.example/files/',
    mimeType: isContainer ? null : 'text/markdown',
    size: isContainer ? null : name.length,
    modifiedAt: '2026-06-01T00:00:00.000Z',
  }
}

const alpha = folderEntry('alpha.md')
const beta = folderEntry('beta.md')
const gamma = folderEntry('gamma.md')

describe('useFolderDetailSelectionController', () => {
  it('owns single, toggle, range, cleanup, and context-menu selection state for folder detail', () => {
    const { result, rerender } = renderHook(
      ({ entries }) => useFolderDetailSelectionController({
        visibleChildren: entries,
        sortedChildren: entries,
      }),
      { initialProps: { entries: [alpha, beta, gamma] } },
    )

    expect(result.current.selectedChild).toBeNull()
    expect([...result.current.selectedChildUris]).toEqual([])

    act(() => result.current.selectChild(alpha))
    expect(result.current.selectedChild).toEqual(alpha)
    expect([...result.current.selectedChildUris]).toEqual([alpha.uri])
    expect(result.current.selectedChildCount).toBe(1)
    expect(result.current.hasBatchSelection).toBe(false)
    expect(result.current.batchSelectionLabel).toBe('已选择 1 项')
    expect(result.current.batchSelectionActions).toEqual({
      copyLabel: '复制所选 URI',
      deleteLabel: '删除所选项',
    })

    act(() => result.current.selectChild(gamma, { metaKey: true }))
    expect([...result.current.selectedChildUris]).toEqual([alpha.uri, gamma.uri])
    expect(result.current.selectedChildren.map((entry) => entry.uri)).toEqual([alpha.uri, gamma.uri])
    expect(result.current.selectedChildCount).toBe(2)
    expect(result.current.hasBatchSelection).toBe(true)
    expect(result.current.batchSelectionLabel).toBe('已选择 2 项')

    act(() => result.current.selectChild(beta, { shiftKey: true }))
    expect([...result.current.selectedChildUris]).toEqual([beta.uri, gamma.uri])
    expect(result.current.selectedChildren.map((entry) => entry.uri)).toEqual([beta.uri, gamma.uri])

    act(() => result.current.removeSelectionUris(new Set([beta.uri])))
    expect([...result.current.selectedChildUris]).toEqual([gamma.uri])
    expect(result.current.selectedChild).toBeNull()

    rerender({ entries: [alpha, beta] })
    expect(result.current.selectedChild).toBeNull()
    expect([...result.current.selectedChildUris]).toEqual([])
  })

  it('defers context-menu selection so browser menu selection can settle first', () => {
    vi.useFakeTimers()
    try {
      const { result } = renderHook(() => useFolderDetailSelectionController({
        visibleChildren: [alpha, beta],
        sortedChildren: [alpha, beta],
      }))

      act(() => result.current.selectChild(alpha))
      act(() => result.current.prepareChildContextMenuSelection(beta))

      expect(result.current.selectedChild?.uri).toBe(alpha.uri)

      act(() => vi.runOnlyPendingTimers())

      expect(result.current.selectedChild?.uri).toBe(beta.uri)
      expect([...result.current.selectedChildUris]).toEqual([beta.uri])
    } finally {
      vi.useRealTimers()
    }
  })
})
