import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { FilesDetail } from '../../domain/resource/resource-model'
import {
  projectAuthenticatedImagePreviewRenderState,
  projectEditableFilePreviewModel,
  projectFileDetailLineageModel,
  projectFileDetailSidecarPreviewModel,
  projectReadonlyFilePreviewModel,
} from './file-detail-preview-model'

const modelPath = 'src/modules/files/features/detail/file-detail-preview-model.ts'

function detail(overrides: Partial<FilesDetail>): FilesDetail {
  return {
    headers: {},
    id: overrides.uri ?? 'https://pod.example/files/report.md',
    kind: 'resource',
    metadataState: 'available',
    mimeType: 'text/turtle',
    modifiedAt: null,
    name: 'report.md',
    parentUri: 'https://pod.example/files/',
    previewText: '<#meta> <title> "Report" .',
    semanticKind: 'file',
    size: 128,
    uri: 'https://pod.example/files/report.md',
    ...overrides,
  }
}

describe('file detail preview model', () => {
  it('projects editable file facts and detail rows outside the preview renderer', () => {
    const model = projectEditableFilePreviewModel(detail({
      mimeType: 'text/markdown',
      modifiedAt: '2026-06-29T10:00:00.000Z',
      name: 'note.md',
      size: 1536,
      uri: 'https://pod.example/files/note.md',
    }))

    expect(model.title).toBe('note.md')
    expect(model.facts).toEqual([
      'text/markdown',
      '1.5 KB',
      '2026/6/29 18:00:00',
    ])
    expect(model.rows).toEqual([
      {
        kind: 'uri',
        label: 'URI',
        value: 'https://pod.example/files/note.md',
      },
      {
        kind: 'description',
        label: '内容',
        value: '完整内容将在弹出的文件详情中读取。',
      },
    ])
    expect(model.openLabel).toBe('打开文件详情')
  })

  it('projects file lineage rows outside the lineage renderer', () => {
    const model = projectFileDetailLineageModel(detail({
      mimeType: 'text/turtle',
      modifiedAt: '2026-06-29T10:00:00.000Z',
      parentUri: 'https://pod.example/.data/',
      semanticKind: 'structured-data',
      uri: 'https://pod.example/.data/notes.ttl',
    }))

    expect(model.semanticSection).toEqual({
      label: '资源类别',
      value: '.data 表',
    })
    expect(model.rows).toEqual([
      {
        kind: 'policy',
        label: '处理语义',
        value: '这是个人 `.data` 结构化数据，schema 变更应提升到 `/.vocab/`。',
      },
      {
        kind: 'fact',
        label: '打开方式',
        value: '结构化表格',
      },
      {
        kind: 'fact',
        label: '父容器',
        value: 'https://pod.example/.data/',
      },
      {
        kind: 'fact',
        label: '最近修改',
        value: '2026/6/29 18:00:00',
      },
    ])
  })

  it('projects readonly preview branches and fallback copy outside the renderer', () => {
    expect(projectReadonlyFilePreviewModel(detail({
      mimeType: 'application/json',
      previewText: '{"ok":true}',
    }))).toEqual({
      kind: 'raw-text',
      rawText: '{"ok":true}',
    })

    expect(projectReadonlyFilePreviewModel(detail({
      mimeType: 'image/png',
      name: 'scan.png',
      previewText: null,
      previewUnavailableReason: '需要登录后读取。',
      uri: 'https://pod.example/files/scan.png',
    }))).toEqual({
      alt: 'scan.png',
      kind: 'image',
      loadingMessage: '正在加载预览...',
      mimeType: 'image/png',
      mimeTypeLabel: 'image/png',
      unavailableReason: '需要登录后读取。',
      uri: 'https://pod.example/files/scan.png',
    })

    expect(projectReadonlyFilePreviewModel(detail({
      mimeType: 'application/pdf',
      name: 'report.pdf',
      previewText: null,
      uri: 'https://pod.example/files/report.pdf',
    }))).toEqual({
      alt: 'report.pdf',
      kind: 'document',
      loadingMessage: '正在加载预览...',
      mimeType: 'application/pdf',
      mimeTypeLabel: 'application/pdf',
      unavailableReason: '当前资源暂不支持内联预览。',
      uri: 'https://pod.example/files/report.pdf',
    })

    expect(projectReadonlyFilePreviewModel(detail({
      mimeType: 'application/octet-stream',
      name: 'recording.m4a',
      previewText: null,
      uri: 'https://pod.example/files/recording.m4a',
    }))).toMatchObject({
      kind: 'audio',
      mimeType: 'audio/mp4',
    })

    expect(projectReadonlyFilePreviewModel(detail({
      mimeType: null,
      name: 'demo.mp4',
      previewText: null,
      uri: 'https://pod.example/files/demo.mp4',
    }))).toMatchObject({
      kind: 'video',
      mimeType: 'video/mp4',
    })
  })

  it('projects authenticated image loading, unavailable, and ready states outside the renderer', () => {
    const preview = projectReadonlyFilePreviewModel(detail({
      mimeType: 'image/png',
      name: 'scan.png',
      previewText: null,
      previewUnavailableReason: '需要登录后读取。',
      uri: 'https://pod.example/files/scan.png',
    }))

    expect(preview.kind).toBe('image')
    if (preview.kind !== 'image') return

    expect(projectAuthenticatedImagePreviewRenderState(preview, {
      error: null,
      isLoading: true,
      objectUrl: null,
    })).toEqual({
      kind: 'loading',
      message: '正在加载预览...',
    })

    expect(projectAuthenticatedImagePreviewRenderState(preview, {
      error: new Error('HTTP 401'),
      isLoading: false,
      objectUrl: null,
    })).toEqual({
      kind: 'unavailable',
      mimeTypeLabel: 'image/png',
      reason: '需要登录后读取。',
    })

    expect(projectAuthenticatedImagePreviewRenderState(preview, {
      error: null,
      isLoading: false,
      objectUrl: 'blob:https://pod.example/scan',
    })).toEqual({
      alt: 'scan.png',
      kind: 'ready',
      objectUrl: 'blob:https://pod.example/scan',
    })
  })

  it('projects .meta sidecar preview without making the renderer resolve sidecar semantics', () => {
    const model = projectFileDetailSidecarPreviewModel(detail({
      name: 'report.md.meta',
      semanticKind: 'meta-sidecar',
      uri: 'https://pod.example/files/report.md.meta',
    }))

    expect(model.title).toBe('`.meta` sidecar')
    expect(model.description).toBe('https://pod.example/files/report.md')
    expect(model.rows).toEqual([
      {
        kind: 'resource',
        label: 'owner',
        value: 'https://pod.example/files/report.md',
      },
      {
        kind: 'resource',
        label: 'sidecar',
        value: 'https://pod.example/files/report.md.meta',
      },
    ])
    expect(model.showRows).toBe(true)
    expect(model.accessNotice).toBeNull()
    expect(model.rawText).toBe('<#meta> <title> "Report" .')

    expect(projectFileDetailSidecarPreviewModel(detail({
      semanticKind: 'file',
      uri: 'https://pod.example/files/report.md',
    })).showRows).toBe(false)
  })

  it('projects ACL/ACR sidecar preview as access-only metadata', () => {
    const model = projectFileDetailSidecarPreviewModel(detail({
      name: 'report.md.acr',
      previewText: '<#acl> <mode> "Read" .',
      semanticKind: 'access-policy-sidecar',
      uri: 'https://pod.example/files/report.md.acr',
    }))

    expect(model.title).toBe('ACL/ACR sidecar')
    expect(model.description).toBe('https://pod.example/files/report.md')
    expect(model.rows).toEqual([
      {
        kind: 'resource',
        label: 'owner',
        value: 'https://pod.example/files/report.md',
      },
      {
        kind: 'resource',
        label: 'sidecar',
        value: 'https://pod.example/files/report.md.acr',
      },
      {
        kind: 'provider',
        label: 'provider',
        value: 'acr',
      },
    ])
    expect(model.showRows).toBe(true)
    expect(model.accessNotice).toBe('权限策略通过 Access 查看。')
    expect(model.rawText).toBeNull()
  })

  it('stays a pure feature projection model without React or component imports', () => {
    const source = readFileSync(modelPath, 'utf8')

    expect(source).toContain('export function projectEditableFilePreviewModel')
    expect(source).toContain('export function projectFileDetailLineageModel')
    expect(source).toContain('export function projectReadonlyFilePreviewModel')
    expect(source).toContain('export function projectAuthenticatedImagePreviewRenderState')
    expect(source).toContain('export function projectFileDetailSidecarPreviewModel')
    expect(source).toContain('resolveFilesSidecarPlacement')
    expect(source).not.toContain('useState')
    expect(source).not.toContain('ModeCard')
    expect(source).not.toContain('<')
  })
})
