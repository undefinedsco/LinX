import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { FilesDetail, FilesEntry } from '../../domain/resource/resource-model'
import { useFolderChildPreviewController } from './useFolderChildPreviewController'

function folderDetail(): FilesDetail {
  return {
    id: 'folder',
    uri: 'https://pod.example/files/',
    name: 'files',
    kind: 'container',
    semanticKind: 'container',
    parentUri: 'https://pod.example/',
    mimeType: null,
    size: null,
    modifiedAt: '2026-06-01T00:00:00.000Z',
    headers: {},
    previewText: null,
    childEntries: [],
  }
}

function childEntry(name: string, overrides: Partial<FilesEntry> = {}): FilesEntry {
  const isContainer = !name.includes('.')
  return {
    id: name,
    uri: `https://pod.example/files/${name}${isContainer ? '/' : ''}`,
    name,
    kind: isContainer ? 'container' : 'resource',
    semanticKind: isContainer ? 'container' : 'file',
    parentUri: 'https://pod.example/files/',
    mimeType: isContainer ? null : 'text/markdown',
    size: isContainer ? null : 1024,
    modifiedAt: '2026-06-02T00:00:00.000Z',
    ...overrides,
  }
}

describe('useFolderChildPreviewController', () => {
  it('owns child preview rows, summary, sidecar target, and meta drawer reset', () => {
    const file = folderDetail()
    const report = childEntry('report.md', { summary: 'Quarterly report draft.' })
    const image = childEntry('diagram.png', { mimeType: 'image/png', semanticKind: 'file' })

    const { result, rerender } = renderHook(
      ({ child }) => useFolderChildPreviewController({ file, child, childCount: 2 }),
      { initialProps: { child: report as FilesEntry | null } },
    )

    expect(result.current.heading).toBe('选中项')
    expect(result.current.rows.map(([label]) => label)).toContain('名称')
    expect(result.current.childSubtitle).toContain('1.0 KB')
    expect(result.current.childSummary).toBe('Quarterly report draft.')
    expect(result.current.childDetail).toMatchObject({
      uri: report.uri,
      headers: {},
      previewText: null,
    })
    expect(result.current.childSidecarOwnerTarget).toMatchObject({
      uri: report.uri,
      kind: 'resource',
    })

    act(() => result.current.openMetaDrawer())
    expect(result.current.metaDrawerOpen).toBe(true)

    rerender({ child: image })
    expect(result.current.metaDrawerOpen).toBe(false)
    expect(result.current.childSummary).toBe('打开后查看预览。')

    rerender({ child: null })
    expect(result.current.heading).toBe('文件夹预览')
    expect(result.current.childDetail).toBeNull()
    expect(result.current.childSidecarOwnerTarget).toBeNull()
    expect(result.current.childSummary).toBeNull()
  })
})
