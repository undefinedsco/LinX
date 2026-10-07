import { describe, expect, it } from 'vitest'
import {
  formatBytes,
  formatDateTime,
  getFileMetaRows,
  getFilesEntrySemanticPolicy,
  getFolderChildPreviewRows,
  getFolderMetaRows,
  getMetaSidecarRows,
} from './domain/detail/detail-metadata'
import { existsSync, readFileSync } from 'node:fs'
import type { FilesDetail, FilesEntry, FilesMetaSidecar } from './domain/resource/resource-model'

const rootDetailMetadataShimPath = 'src/modules/files/detail-metadata.ts'
const detailMetadataModelPath = 'src/modules/files/domain/detail/detail-metadata.ts'

const file: FilesDetail = {
  id: 'https://pod.example/public/README.md',
  uri: 'https://pod.example/public/README.md',
  name: 'README.md',
  kind: 'resource',
  semanticKind: 'file',
  parentUri: 'https://pod.example/public/',
  mimeType: 'text/markdown',
  size: 1536,
  modifiedAt: '2026-03-01T10:00:00Z',
  headers: {},
  previewText: '# Hello',
}

const folder: FilesDetail = {
  id: 'https://pod.example/public/',
  uri: 'https://pod.example/public/',
  name: 'public',
  kind: 'container',
  semanticKind: 'container',
  parentUri: 'https://pod.example/',
  mimeType: 'inode/container',
  size: null,
  modifiedAt: '2026-03-02T10:00:00Z',
  headers: {},
  previewText: null,
}

const child: FilesEntry = {
  id: 'https://pod.example/public/README.md',
  uri: 'https://pod.example/public/README.md',
  name: 'README.md',
  kind: 'resource',
  semanticKind: 'file',
  parentUri: 'https://pod.example/public/',
  mimeType: 'text/markdown',
  size: 1536,
  modifiedAt: '2026-03-01T10:00:00Z',
  summary: 'Project overview and setup notes.',
}

describe('detail metadata helpers', () => {
  it('keeps detail metadata projection in domain/detail with a root compatibility shim', () => {
    expect(existsSync(detailMetadataModelPath)).toBe(true)
    expect(existsSync(rootDetailMetadataShimPath)).toBe(true)
    if (!existsSync(detailMetadataModelPath) || !existsSync(rootDetailMetadataShimPath)) return

    const rootShimSource = readFileSync(rootDetailMetadataShimPath, 'utf8')
    const modelSource = readFileSync(detailMetadataModelPath, 'utf8')

    expect(rootShimSource).toMatch(/^export \* from '.\/domain\/detail\/detail-metadata'\n?$/)
    expect(modelSource).not.toContain("from './browser'")
    expect(modelSource).not.toContain("from '../browser'")
  })

  it('formats bytes for compact file metadata rows', () => {
    expect(formatBytes(null)).toBe('—')
    expect(formatBytes(320)).toBe('320 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB')
  })

  it('keeps invalid dates readable instead of throwing', () => {
    expect(formatDateTime(null)).toBe('—')
    expect(formatDateTime('not-a-date')).toBe('not-a-date')
  })

  it('builds consistent file metadata rows from FilesDetail', () => {
    expect(getFileMetaRows(file)).toEqual([
      ['ID', 'https://pod.example/public/README.md'],
      ['名称', 'README.md'],
      ['URI', 'https://pod.example/public/README.md'],
      ['MIME 类型', 'text/markdown'],
      ['语义类型', '文件'],
      ['打开方式', '预览 sheet'],
      ['大小', '1.5 KB'],
      ['类别', '文件'],
      ['父容器', 'https://pod.example/public/'],
      ['修改时间', formatDateTime('2026-03-01T10:00:00Z')],
    ])
  })

  it('builds meta sidecar status rows without UI dependencies', () => {
    const meta: FilesMetaSidecar = {
      ownerUri: file.uri,
      metaUri: `${file.uri}.meta`,
      state: 'exists',
      status: 200,
      mimeType: 'text/turtle',
      etag: '"meta-1"',
      size: 320,
      content: '<#meta> <#source> <https://source.example/readme> .',
    }

    expect(getMetaSidecarRows(meta)).toEqual([
      ['owner', 'https://pod.example/public/README.md'],
      ['.meta', 'https://pod.example/public/README.md.meta'],
      ['state', 'exists'],
      ['status', '200'],
      ['MIME', 'text/turtle'],
      ['ETag', '"meta-1"'],
      ['size', '320 B'],
    ])
  })

  it('builds folder preview rows when no child is selected', () => {
    expect(getFolderChildPreviewRows(folder, null, 3)).toEqual([
      ['容器', 'https://pod.example/public/'],
      ['包含', '3 项'],
      ['类型', 'inode/container'],
      ['修改', formatDateTime('2026-03-02T10:00:00Z')],
    ])
  })

  it('builds folder metadata rows with owner and sync state', () => {
    const meta: FilesMetaSidecar = {
      ownerUri: folder.uri,
      metaUri: `${folder.uri}.meta`,
      state: 'exists',
      status: 200,
      mimeType: 'text/turtle',
      etag: '"folder-meta-1"',
      size: 42,
      content: '<#container> <#summary> "Folder metadata" .',
    }

    expect(getFolderMetaRows(folder, 3, meta)).toEqual([
      ['容器', 'https://pod.example/public/'],
      ['包含', '3 项'],
      ['类型', 'inode/container'],
      ['修改', formatDateTime('2026-03-02T10:00:00Z')],
      ['owner', 'https://pod.example/public/'],
      ['sync state', 'exists · 200'],
    ])
    expect(getFolderMetaRows(folder, 3, null)).toContainEqual(['sync state', 'unknown'])
  })

  it('builds selected folder child preview rows', () => {
    expect(getFolderChildPreviewRows(folder, child, 3)).toEqual([
      ['名称', 'README.md'],
      ['类型', 'text/markdown'],
      ['摘要', 'Project overview and setup notes.'],
      ['语义', '文件'],
      ['大小', '1.5 KB'],
      ['修改', formatDateTime('2026-03-01T10:00:00Z')],
      ['URI', 'https://pod.example/public/README.md'],
    ])
  })

  it('keeps folder child preview summary explicit instead of reading content', () => {
    expect(getFolderChildPreviewRows(folder, { ...child, summary: undefined }, 3)).toContainEqual(['摘要', '—'])
  })

  it('maps semantic kinds to lineage policy copy', () => {
    expect(getFilesEntrySemanticPolicy('access-policy-sidecar')).toBe('这是文件级 ACL/ACR sidecar。')
    expect(getFilesEntrySemanticPolicy('vocab-terms')).toBe('这是 locked vocabulary registry，写入应通过 proposal/approval。')
    expect(getFilesEntrySemanticPolicy('vocab-shapes')).toBe('这是 locked vocabulary registry，写入应通过 proposal/approval。')
    expect(getFilesEntrySemanticPolicy('vocab-namespaces')).toBe('这是 locked vocabulary registry，写入应通过 proposal/approval。')
    expect(getFilesEntrySemanticPolicy('structured-data')).toBe('这是个人 `.data` 结构化数据，schema 变更应提升到 `/.vocab/`。')
    expect(getFilesEntrySemanticPolicy('meta-sidecar')).toBe('这是文件级 `.meta` sidecar。')
    expect(getFilesEntrySemanticPolicy('file')).toBe('按 Pod resource 路径浏览。')
  })
})
