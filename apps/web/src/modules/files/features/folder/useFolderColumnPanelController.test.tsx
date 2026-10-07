import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { FilesEntry } from '../../domain/resource/resource-model'
import { useFolderColumnPanelController } from './useFolderColumnPanelController'

function fileEntry(name: string, size: number): FilesEntry {
  return {
    id: name,
    uri: `https://pod.example/files/${name}`,
    name,
    kind: 'resource',
    semanticKind: 'file',
    parentUri: 'https://pod.example/files/',
    mimeType: 'text/markdown',
    size,
    modifiedAt: '2026-06-01T00:00:00.000Z',
  }
}

const beta = fileEntry('beta.md', 20)
const alpha = fileEntry('alpha.md', 10)

describe('useFolderColumnPanelController', () => {
  it('owns sorted entry projection for Finder column panels', () => {
    const { result, rerender } = renderHook(
      ({ direction }) => useFolderColumnPanelController({
        entries: [beta, alpha],
        sort: { key: 'name', direction },
      }),
      { initialProps: { direction: 'asc' as const } },
    )

    expect(result.current.sortedEntries.map((entry) => entry.name)).toEqual(['alpha.md', 'beta.md'])
    expect(result.current.entryCount).toBe(2)
    expect(result.current.actionMenu.items.map((item) => item.label)).toEqual([
      '打开',
      '复制 URI',
      '重命名',
      '复制到...',
      '移动到...',
      '删除',
    ])

    rerender({ direction: 'desc' })

    expect(result.current.sortedEntries.map((entry) => entry.name)).toEqual(['beta.md', 'alpha.md'])
  })

  it('projects row availability for column panel empty state', () => {
    const { result, rerender } = renderHook(
      ({ entries }) => useFolderColumnPanelController({
        entries,
        sort: { key: 'name', direction: 'asc' },
      }),
      { initialProps: { entries: [] as FilesEntry[] } },
    )

    expect(result.current.hasSortedRows).toBe(false)
    expect(result.current.entryCount).toBe(0)

    rerender({ entries: [alpha] })

    expect(result.current.hasSortedRows).toBe(true)
    expect(result.current.entryCount).toBe(1)
  })
})
