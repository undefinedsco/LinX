import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { FilesEntry } from '../../domain/resource/resource-model'
import { useFolderDetailViewController } from './useFolderDetailViewController'

function folderEntry(name: string, overrides: Partial<FilesEntry> = {}): FilesEntry {
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
    ...overrides,
  }
}

const beta = folderEntry('beta.md', { modifiedAt: '2026-06-03T00:00:00.000Z', size: 20 })
const alpha = folderEntry('alpha.md', { modifiedAt: '2026-06-02T00:00:00.000Z', size: 10 })
const sidecar = folderEntry('alpha.md.meta', { semanticKind: 'meta-sidecar', mimeType: 'text/turtle' })

describe('useFolderDetailViewController', () => {
  it('owns Finder view mode, sidecar visibility, and sort projection for folder detail', () => {
    const { result, rerender } = renderHook(
      ({ children }) => useFolderDetailViewController({ children }),
      { initialProps: { children: [beta, sidecar, alpha] } },
    )

    expect(result.current.viewMode).toBe('list')
    expect(result.current.viewModeOptions).toEqual([
      { mode: 'list', label: '列表', iconKind: 'list', active: true },
      { mode: 'icons', label: '网格', iconKind: 'icons', active: false },
    ])
    expect(result.current.toolbarChrome).toEqual({
      createFolderLabel: '新建文件夹',
      createMarkdownLabel: '新建 Markdown 文件',
      uploadInputLabel: '选择上传文件',
      uploadLabel: '上传文件',
    })
    expect(result.current.sort).toEqual({ key: 'name', direction: 'asc' })
    expect(result.current.visibleChildren.map((entry) => entry.name)).toEqual(['beta.md', 'alpha.md'])
    expect(result.current.visibleChildCount).toBe(2)
    expect(result.current.hasVisibleChildren).toBe(true)
    expect(result.current.childActionMenu.items.map((item) => item.label)).toEqual([
      '打开',
      '复制 URI',
      '重命名',
      '复制到...',
      '移动到...',
      '删除',
    ])
    expect(result.current.contentState).toEqual({ kind: 'collection', viewMode: 'list' })
    expect(result.current.sortedChildren.map((entry) => entry.name)).toEqual(['alpha.md', 'beta.md'])

    act(() => result.current.setSortKey('name'))
    expect(result.current.sort).toEqual({ key: 'name', direction: 'desc' })
    expect(result.current.sortedChildren.map((entry) => entry.name)).toEqual(['beta.md', 'alpha.md'])

    act(() => result.current.setSortKey('modified'))
    expect(result.current.sort).toEqual({ key: 'modified', direction: 'asc' })
    expect(result.current.sortedChildren.map((entry) => entry.name)).toEqual(['alpha.md', 'beta.md'])

    act(() => result.current.setViewMode('icons'))
    expect(result.current.viewMode).toBe('icons')
    expect(result.current.viewModeOptions).toEqual([
      { mode: 'list', label: '列表', iconKind: 'list', active: false },
      { mode: 'icons', label: '网格', iconKind: 'icons', active: true },
    ])
    expect(result.current.contentState).toEqual({ kind: 'collection', viewMode: 'icons' })

    rerender({ children: [folderEntry('gamma.md'), sidecar] })
    expect(result.current.viewMode).toBe('icons')
    expect(result.current.visibleChildren.map((entry) => entry.name)).toEqual(['gamma.md'])
    expect(result.current.visibleChildCount).toBe(1)
    expect(result.current.hasVisibleChildren).toBe(true)
  })

  it('does not expose or enter the removed Folder Columns view', () => {
    const { result } = renderHook(
      () => useFolderDetailViewController({ children: [alpha] }),
    )

    expect(result.current.viewModeOptions.map((option) => option.mode)).toEqual(['list', 'icons'])
    expect(result.current.viewModeOptions.map((option) => option.label)).toEqual(['列表', '网格'])

    act(() => result.current.setViewMode('columns' as never))

    expect(result.current.viewMode).toBe('list')
    expect(result.current.contentState).toEqual({ kind: 'collection', viewMode: 'list' })
  })

  it('projects visible child availability after sidecar filtering', () => {
    const { result } = renderHook(
      () => useFolderDetailViewController({ children: [sidecar] }),
    )

    expect(result.current.visibleChildren).toEqual([])
    expect(result.current.visibleChildCount).toBe(0)
    expect(result.current.hasVisibleChildren).toBe(false)
    expect(result.current.contentState).toEqual({
      kind: 'empty',
      emptyState: {
        message: '当前容器没有可浏览子项。',
      },
    })
  })
})
