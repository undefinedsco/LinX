import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { FilesDetail, FilesRawTextResource } from '../../domain/resource/resource-model'
import {
  createFileEditorSheetState,
  createFileEditorMetaTailId,
  getFileEditorMarkdownNoteTitle,
  projectFileEditorBylineItems,
  projectFileEditorCapabilities,
  projectFileEditorRawSourceResource,
  projectFileEditorRichContentState,
  projectFileEditorRichEditorContent,
  projectFileEditorRichTextSourceInput,
  projectFileEditorSheetContentView,
  projectFileEditorSheetChrome,
  projectFileEditorSheetReset,
  projectFileEditorSourceLinkedDraft,
  projectFileEditorSourceLinkedPanel,
  projectFileEditorStructuredReturnAction,
  type FileEditorContentViewMode,
  type FileEditorSourceLinkedDescriptor,
} from './file-editor-sheet-model'

const editorModelPath = 'src/modules/files/features/editor/file-editor-sheet-model.ts'
const editorControllerPath = 'src/modules/files/features/editor/useFileEditorSheetController.ts'
const editorFeaturePath = 'src/modules/files/features/editor/FileEditorSheet.tsx'

function file(overrides: Partial<FilesDetail> = {}): FilesDetail {
  return {
    id: overrides.uri ?? 'https://pod.example/files/note.md',
    uri: overrides.uri ?? 'https://pod.example/files/note.md',
    name: overrides.name ?? 'note.md',
    kind: overrides.kind ?? 'resource',
    semanticKind: overrides.semanticKind ?? 'file',
    parentUri: overrides.parentUri ?? 'https://pod.example/files/',
    mimeType: 'mimeType' in overrides ? overrides.mimeType ?? null : 'text/markdown',
    size: overrides.size ?? 120,
    modifiedAt: 'modifiedAt' in overrides ? overrides.modifiedAt ?? null : 'not-a-date',
    headers: overrides.headers ?? {},
    previewText: overrides.previewText ?? '# Preview title\n\nbody',
  }
}

function raw(overrides: Partial<FilesRawTextResource> = {}): FilesRawTextResource {
  return {
    uri: overrides.uri ?? 'https://pod.example/files/note.md',
    content: overrides.content ?? '# Full title\n\nbody',
    mimeType: overrides.mimeType ?? 'text/markdown',
    etag: overrides.etag ?? '"raw-etag"',
    headers: overrides.headers ?? {},
  }
}

function descriptor(overrides: Partial<FileEditorSourceLinkedDescriptor> = {}): FileEditorSourceLinkedDescriptor {
  return {
    title: overrides.title ?? 'Imported report',
    tags: overrides.tags ?? [],
    tagsPreviousValues: overrides.tagsPreviousValues ?? [],
    reviewStatus: overrides.reviewStatus ?? 'pending',
    reviewStatusPreviousValues: overrides.reviewStatusPreviousValues ?? [],
    sourceUri: overrides.sourceUri ?? 'https://source.example/report',
    mimeType: overrides.mimeType ?? 'text/html',
    sourceKind: overrides.sourceKind ?? 'url',
    sourceIngestManifestUri: overrides.sourceIngestManifestUri ?? 'https://pod.example/.index/ingest/report.ttl',
    ingestVersion: overrides.ingestVersion ?? 'parser-v2',
    sourceHash: overrides.sourceHash ?? 'sha256:abc',
    bodyResourceUri: overrides.bodyResourceUri ?? 'https://pod.example/files/report.md',
    createdAt: overrides.createdAt ?? '2026-06-01T00:00:00.000Z',
    writesCanonicalContent: overrides.writesCanonicalContent ?? false,
  }
}

describe('file editor sheet model', () => {
  it('keeps editor sheet projection helpers in a pure model', () => {
    expect(existsSync(editorModelPath)).toBe(true)
    expect(existsSync(editorControllerPath)).toBe(true)
    expect(existsSync(editorFeaturePath)).toBe(true)
    if (!existsSync(editorModelPath) || !existsSync(editorControllerPath) || !existsSync(editorFeaturePath)) return

    const modelSource = readFileSync(editorModelPath, 'utf8')
    const controllerSource = readFileSync(editorControllerPath, 'utf8')
    const featureSource = readFileSync(editorFeaturePath, 'utf8')

    expect(modelSource).toContain('export function createFileEditorMetaTailId')
    expect(modelSource).toContain('export function createFileEditorSheetState')
    expect(modelSource).toContain('export function projectFileEditorSheetContentView')
    expect(modelSource).toContain('export function projectFileEditorSheetReset')
    expect(modelSource).toContain('export function projectFileEditorSheetChrome')
    expect(modelSource).toContain('export function getFileEditorMarkdownNoteTitle')
    expect(modelSource).toContain('export function projectFileEditorSourceLinkedDraft')
    expect(modelSource).toContain('export function projectFileEditorSourceLinkedPanel')
    expect(modelSource).toContain('export function projectFileEditorStructuredReturnAction')
    expect(modelSource).toContain('export function projectFileEditorRawSourceResource')
    expect(modelSource).toContain('export function projectFileEditorRichContentState')
    expect(modelSource).toContain('export function projectFileEditorRichEditorContent')
    expect(modelSource).toContain('export function projectFileEditorBylineItems')
    expect(modelSource).toContain('export function projectFileEditorCapabilities')
    expect(modelSource).not.toContain('useToast')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useMemo')
    expect(controllerSource).toContain("from './file-editor-sheet-model'")
    expect(controllerSource).not.toMatch(/\nfunction resourceMetaTailId\(/)
    expect(controllerSource).not.toMatch(/\nfunction getMarkdownNoteTitle\(/)
    expect(controllerSource).not.toMatch(/\nfunction replaceMarkdownNoteTitle\(/)
    expect(controllerSource).not.toContain("useState<FileEditorContentViewMode>(canUseRichEditor ? 'rich' : 'raw')")
    expect(controllerSource).not.toContain("setContentView(canUseRichEditor ? 'rich' : 'raw')")
    expect(controllerSource).not.toContain('displaySourceIngestVersion')
    expect(controllerSource).toContain('projectFileEditorSheetChrome')
    expect(controllerSource).toContain('projectFileEditorRichEditorContent')
    expect(featureSource).toContain('editor.sheetChrome')
    expect(featureSource).not.toContain('aria-label="文件详情标题"')
    expect(featureSource).not.toContain('aria-label="笔记标题"')
    expect(featureSource).not.toContain('aria-label="文件详情 byline"')
    expect(featureSource).not.toContain('aria-label="文件详情内容滚动区"')
    expect(featureSource).not.toContain("file.mimeType ?? 'file'")
    expect(featureSource).not.toContain("mode === 'rich' ? '富文本' : '源码'")
    expect(featureSource).toContain('editor.sourceLinkedPanel')
    expect(featureSource).not.toContain('sourceLinkedDescriptor.sourceUri')
    expect(featureSource).not.toContain('sourceLinkedDescriptor.sourceIngestManifestUri')
    expect(featureSource).not.toContain('editor.sourceLinkedDisplayIngestVersion')
    expect(featureSource).not.toContain('>Source</p>')
    expect(featureSource).not.toContain('>Ingest 记录</span>')
    expect(featureSource).toContain('editor.structuredReturnAction')
    expect(featureSource).toContain('editor.richEditorContent')
    expect(featureSource).not.toContain('editor.structuredSubjectReturnContext?.subject')
    expect(featureSource).not.toContain('返回来源表 ·')
  })

  it('projects generic rich editor content outside the UI surface', () => {
    expect(projectFileEditorRichEditorContent({
      mimeType: 'text/markdown',
      previewText: '# Preview',
      sourceText: '# Source',
    })).toEqual({
      inputFormat: 'markdownish',
      saveFormat: 'markdown',
      text: '# Source',
    })

    expect(projectFileEditorRichEditorContent({
      mimeType: 'text/plain',
      previewText: 'Open [source](https://source.example/report.pdf)',
      sourceText: null,
    })).toEqual({
      inputFormat: 'markdownish',
      saveFormat: 'markdown',
      text: 'Open [source](https://source.example/report.pdf)',
    })

    expect(projectFileEditorRichEditorContent({
      mimeType: 'text/html',
      previewText: '<h1>Preview</h1>',
      sourceText: '<h1>Source</h1>',
    })).toEqual({
      inputFormat: 'html',
      saveFormat: 'plain-text',
      text: '<h1>Source</h1>',
    })

    expect(projectFileEditorRichEditorContent({
      mimeType: 'application/octet-stream',
      previewText: 'Preview text',
      sourceText: undefined,
    })).toEqual({
      inputFormat: 'markdownish',
      saveFormat: 'plain-text',
      text: 'Preview text',
    })
  })

  it('projects source-linked draft copy and staged raw source resources', () => {
    const sourceDraft = projectFileEditorSourceLinkedDraft(descriptor())

    expect(sourceDraft.displayIngestVersion).toBe('ingest-v2')
    expect(sourceDraft.draft).toBe([
      '# Imported report',
      '',
      'Source: https://source.example/report',
      'Ingest: ingest-v2',
      'Ingest 记录: https://pod.example/.index/ingest/report.ttl',
      '',
      '确认 Ingest 审批后才会写入正文资源。',
    ].join('\n'))

    const rawResource = raw()
    expect(projectFileEditorRawSourceResource({
      rawResource,
      isSourceLinkedEditor: false,
      effectiveSourceText: null,
      fileUri: 'https://pod.example/files/note.md',
    })).toBe(rawResource)
    expect(projectFileEditorRawSourceResource({
      rawResource: null,
      isSourceLinkedEditor: true,
      effectiveSourceText: '# Staged\n',
      fileUri: 'https://pod.example/files/report.md',
    })).toEqual({
      uri: 'https://pod.example/files/report.md',
      content: '# Staged\n',
      mimeType: 'text/markdown',
      etag: 'staged-ingest',
      headers: {},
    })
    expect(projectFileEditorRawSourceResource({
      rawResource: null,
      isSourceLinkedEditor: false,
      effectiveSourceText: '# Staged\n',
      fileUri: 'https://pod.example/files/report.md',
    })).toBeNull()
  })

  it('projects source-linked summary panel outside the sheet renderer', () => {
    expect(projectFileEditorSourceLinkedPanel({
      descriptor: null,
      displayIngestVersion: '',
    })).toBeNull()

    expect(projectFileEditorSourceLinkedPanel({
      descriptor: descriptor(),
      displayIngestVersion: 'ingest-v2',
    })).toEqual({
      title: 'Source',
      rows: [
        {
          id: 'sourceUri',
          label: 'uri',
          value: 'https://source.example/report',
          breakAll: true,
        },
        {
          id: 'ingestVersion',
          label: 'Ingest',
          value: 'ingest-v2',
          breakAll: false,
        },
        {
          id: 'manifestUri',
          label: 'Ingest 记录',
          value: 'https://pod.example/.index/ingest/report.ttl',
          breakAll: true,
        },
      ],
    })
  })

  it('projects structured return action outside the sheet renderer', () => {
    expect(projectFileEditorStructuredReturnAction({
      fileUri: 'https://pod.example/files/note.md',
      returnContext: null,
    })).toBeNull()

    expect(projectFileEditorStructuredReturnAction({
      fileUri: 'https://pod.example/data/table.ttl',
      returnContext: {
        documentUri: 'https://pod.example/data/table.ttl',
        subject: 'https://pod.example/data/table.ttl#row-1',
      },
    })).toBeNull()

    expect(projectFileEditorStructuredReturnAction({
      fileUri: 'https://pod.example/files/body.md',
      returnContext: {
        documentUri: 'https://pod.example/data/table.ttl',
        subject: 'https://pod.example/data/table.ttl#row-1',
      },
    })).toEqual({
      label: '返回来源表 · https://pod.example/data/table.ttl#row-1',
    })
  })

  it('projects title, capabilities, and byline without controller-local branching', () => {
    expect(createFileEditorMetaTailId('https://pod.example/files/note.md')).toMatch(/^files-file-meta-tail-[a-z0-9]+$/)
    expect(getFileEditorMarkdownNoteTitle('# Full title\n\nbody', 'note.md')).toBe('Full title')
    expect(getFileEditorMarkdownNoteTitle('body only', 'note.md')).toBe('note')
    expect(getFileEditorMarkdownNoteTitle('intro\n\n# Later section', 'note.md')).toBe('note')

    expect(projectFileEditorCapabilities({
      fileMimeType: 'text/markdown',
      rawMimeType: undefined,
      isSourceLinkedEditor: false,
    })).toEqual({
      canSaveRichText: true,
      canUseRichEditor: true,
    })
    expect(projectFileEditorCapabilities({
      fileMimeType: 'application/pdf',
      rawMimeType: 'text/plain',
      isSourceLinkedEditor: false,
    })).toEqual({
      canSaveRichText: false,
      canUseRichEditor: false,
    })
    expect(projectFileEditorCapabilities({
      fileMimeType: 'application/pdf',
      rawMimeType: undefined,
      isSourceLinkedEditor: true,
    })).toEqual({
      canSaveRichText: false,
      canUseRichEditor: true,
    })

    expect(projectFileEditorBylineItems({
      file: file(),
      rawLoading: false,
      hasRawResource: true,
      metaLoading: false,
      metaState: 'exists',
      isSourceLinkedEditor: false,
      canSaveRichText: true,
    })).toEqual([
      'note.md',
      '更新 not-a-date',
      '完整内容',
      '.meta 已连接',
      '失焦保存',
    ])
    expect(projectFileEditorBylineItems({
      file: file({ name: 'report.pdf', mimeType: 'application/pdf', modifiedAt: null }),
      rawLoading: true,
      hasRawResource: false,
      metaLoading: true,
      metaState: 'missing',
      isSourceLinkedEditor: true,
      canSaveRichText: false,
    })).toEqual([
      'report.pdf',
      '读取内容中',
      'meta 检查中',
      '审批写入',
    ])
  })

  it('projects sheet chrome and content view options outside the renderer', () => {
    const contentView: FileEditorContentViewMode = 'rich'
    expect(projectFileEditorSheetChrome({
      file: file(),
      noteTitle: 'Full title',
      canUseRichEditor: true,
      contentView,
    })).toEqual({
      headerAriaLabel: '文件详情标题',
      dialogTitle: 'Full title',
      resourceSummary: {
        mimeTypeLabel: 'text/markdown',
        uri: 'https://pod.example/files/note.md',
      },
      bylineAriaLabel: '文件详情 byline',
      contentScrollAriaLabel: '文件详情内容滚动区',
      contentViewOptions: [
        { mode: 'rich', label: '富文本', active: true },
        { mode: 'raw', label: '源码', active: false },
      ],
    })

    expect(projectFileEditorSheetChrome({
      file: file({ mimeType: null, name: 'asset.bin' }),
      noteTitle: '',
      canUseRichEditor: false,
      contentView: 'raw',
    })).toMatchObject({
      dialogTitle: 'asset.bin',
      resourceSummary: {
        mimeTypeLabel: 'file',
        uri: 'https://pod.example/files/note.md',
      },
      contentViewOptions: [
        { mode: 'raw', label: '源码', active: true },
      ],
    })
  })

  it('projects editor sheet content view state transitions outside the controller', () => {
    const initialState = createFileEditorSheetState({
      canUseRichEditor: true,
      noteTitle: 'Full title',
    })

    expect(initialState).toEqual({
      noteTitle: 'Full title',
      contentView: 'rich',
    })
    expect(createFileEditorSheetState({
      canUseRichEditor: false,
      noteTitle: 'Asset',
    })).toEqual({
      noteTitle: 'Asset',
      contentView: 'raw',
    })
    expect(projectFileEditorSheetContentView({
      canUseRichEditor: true,
      current: initialState,
      contentView: 'raw',
    })).toEqual({
      noteTitle: 'Full title',
      contentView: 'raw',
    })
    expect(projectFileEditorSheetContentView({
      canUseRichEditor: false,
      current: initialState,
      contentView: 'rich',
    })).toEqual({
      noteTitle: 'Full title',
      contentView: 'raw',
    })
    expect(projectFileEditorSheetReset({
      canUseRichEditor: false,
      current: initialState,
      noteTitle: 'Document title',
    })).toEqual({
      noteTitle: 'Document title',
      contentView: 'raw',
    })
  })

  it('projects rich text source marker cleanup and source conflict warning outside the UI editor', () => {
    const sourceInput = projectFileEditorRichTextSourceInput([
      '<!-- linx-source-block id="chunk:1" hash="source-v1" origin="user" -->',
      '# Imported note',
      '<!-- linx-source-conflict id="chunk:1" source-hash="source-v2" -->',
      '<!-- linx-source-block id="chunk:1" hash="source-v2" origin="source" -->',
      'Updated source paragraph',
      '<!-- /linx-source-conflict -->',
    ].join('\n'))

    expect(sourceInput).toEqual({
      sourceText: '# Imported note\nUpdated source paragraph',
      warning: {
        title: '来源内容有冲突',
        description: '请先确认 Ingest 更新，再替换本地编辑。',
      },
    })
  })

  it('projects editor raw query state before the sheet renderer consumes it', () => {
    expect(projectFileEditorRichContentState({
      rawLoading: true,
      rawError: null,
      hasRawResource: false,
      hasEffectiveSourceText: false,
    })).toEqual({
      kind: 'loading',
      message: '正在读取完整内容...',
    })

    expect(projectFileEditorRichContentState({
      rawLoading: false,
      rawError: new Error('HTTP 404'),
      hasRawResource: false,
      hasEffectiveSourceText: false,
    })).toEqual({
      kind: 'unavailable',
      message: '完整内容暂时不可用，不能进入编辑。',
    })

    expect(projectFileEditorRichContentState({
      rawLoading: false,
      rawError: new Error('HTTP 404'),
      hasRawResource: false,
      hasEffectiveSourceText: true,
    })).toEqual({ kind: 'ready' })

    expect(projectFileEditorRichContentState({
      rawLoading: false,
      rawError: null,
      hasRawResource: true,
      hasEffectiveSourceText: false,
    })).toEqual({ kind: 'ready' })

  })
})
