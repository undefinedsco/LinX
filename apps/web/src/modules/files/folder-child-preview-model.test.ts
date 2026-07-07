import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { FilesDetail, FilesEntry } from './domain/resource/resource-model'
import { projectFolderChildPreviewModel } from './domain/folder/folder-child-preview-model'

const folderChildPreviewModelPath = 'src/modules/files/domain/folder/folder-child-preview-model.ts'

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

describe('folder child preview model', () => {
  it('keeps child preview projection in a pure domain model', () => {
    expect(existsSync(folderChildPreviewModelPath)).toBe(true)
    if (!existsSync(folderChildPreviewModelPath)) return

    const modelSource = readFileSync(folderChildPreviewModelPath, 'utf8')

    expect(modelSource).toContain('export function projectFolderChildPreviewModel')
    expect(modelSource).toContain('getFolderChildPreviewRows')
    expect(modelSource).toContain('resolveFilesSidecarOwnerTarget')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useEffect')
    expect(modelSource).not.toContain('useMemo')
    expect(modelSource).not.toContain('useToast')
  })

  it('projects selected child details, subtitle, summary, sidecar target, and rows', () => {
    const folder = folderDetail()
    const report = childEntry('report.md', { summary: 'Quarterly report draft.' })
    const image = childEntry('diagram.png', { mimeType: 'image/png', semanticKind: 'file' })

    expect(projectFolderChildPreviewModel({ file: folder, child: report, childCount: 2 }))
      .toMatchObject({
        chrome: {
          ariaLabel: 'Folder child preview',
          openSelectedLabel: '打开选中项',
        },
        heading: '选中项',
        childDetail: {
          uri: report.uri,
          headers: {},
          previewText: null,
        },
        childSidecarOwnerTarget: {
          uri: report.uri,
          kind: 'resource',
        },
        childSummary: 'Quarterly report draft.',
      })
    expect(projectFolderChildPreviewModel({ file: folder, child: report, childCount: 2 }).rows.map(([label]) => label)
    ).toContain('名称')
    expect(projectFolderChildPreviewModel({ file: folder, child: report, childCount: 2 }).childSubtitle)
      .toContain('1.0 KB')
    expect(projectFolderChildPreviewModel({ file: folder, child: image, childCount: 2 }).childSummary)
      .toBe('打开后查看预览。')
    expect(projectFolderChildPreviewModel({ file: folder, child: null, childCount: 2 }))
      .toMatchObject({
        chrome: {
          ariaLabel: 'Folder child preview',
          openSelectedLabel: '打开选中项',
        },
        heading: '文件夹预览',
        childDetail: null,
        childSidecarOwnerTarget: null,
        childSubtitle: null,
        childSummary: null,
      })
  })
})
