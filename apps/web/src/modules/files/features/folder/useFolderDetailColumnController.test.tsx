import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'
import { useFolderDetailColumnController } from './useFolderDetailColumnController'

function fileEntry(name: string): FilesEntry {
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

const folderFile: FilesDetail = {
  id: 'https://pod.example/files/',
  uri: 'https://pod.example/files/',
  name: 'files',
  kind: 'container',
  semanticKind: 'container',
  parentUri: 'https://pod.example/',
  mimeType: null,
  size: null,
  modifiedAt: '2026-06-01T00:00:00.000Z',
  headers: {},
  previewText: '',
  childEntries: [],
}

const alpha = fileEntry('alpha.md')
const beta = fileEntry('beta.md')
const nested = fileEntry('nested')

describe('useFolderDetailColumnController', () => {
  it('owns column preview sibling count projection', () => {
    const selectOnlyChild = vi.fn()
    const { result } = renderHook(() => useFolderDetailColumnController({
      file: folderFile,
      visibleChildren: [alpha, beta],
      childUriSet: new Set([alpha.uri, beta.uri, nested.uri]),
      selectedChild: alpha,
      selectedChildUri: alpha.uri,
      selectOnlyChild,
      prepareContextMenuSelection: (select) => select(),
    }))

    expect(result.current.columnPreviewChildCount).toBe(2)

    act(() => result.current.selectColumnChild(folderFile, [nested], nested, 0))

    expect(selectOnlyChild).toHaveBeenCalledWith(nested)
    expect(result.current.columnPreviewChildCount).toBe(1)
  })
})
