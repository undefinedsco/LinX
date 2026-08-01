import type { FilesDetail, FilesRawTextResource } from '../../domain/resource/resource-model'
import {
  displaySourceIngestVersion,
  type parseSourceLinkedCardTurtle,
} from '../../domain/source/source-ingest'

export type FileEditorSourceLinkedDescriptor = NonNullable<ReturnType<typeof parseSourceLinkedCardTurtle>>
export type FileEditorContentViewMode = 'rich' | 'raw'

export interface FileEditorSheetState {
  noteTitle: string
  contentView: FileEditorContentViewMode
}

export interface FileEditorSheetChrome {
  headerAriaLabel: string
  dialogTitle: string
  resourceSummary: {
    mimeTypeLabel: string
    uri: string
  }
  bylineAriaLabel: string
  contentScrollAriaLabel: string
  contentViewOptions: Array<{
    mode: FileEditorContentViewMode
    label: string
    active: boolean
  }>
}

export interface FileEditorSourceLinkedPanel {
  title: string
  rows: Array<{
    id: 'sourceUri' | 'ingestVersion' | 'manifestUri'
    label: string
    value: string
    breakAll: boolean
  }>
}

export interface FileEditorStructuredReturnAction {
  label: string
}

export function createFileEditorSheetState({
  canUseRichEditor,
  noteTitle,
}: {
  canUseRichEditor: boolean
  noteTitle: string
}): FileEditorSheetState {
  return {
    noteTitle,
    contentView: canUseRichEditor ? 'rich' : 'raw',
  }
}

export function projectFileEditorSheetContentView({
  canUseRichEditor,
  contentView,
  current,
}: {
  canUseRichEditor: boolean
  contentView: FileEditorContentViewMode
  current: FileEditorSheetState
}): FileEditorSheetState {
  const nextContentView = contentView === 'rich' && !canUseRichEditor ? 'raw' : contentView
  return current.contentView === nextContentView ? current : { ...current, contentView: nextContentView }
}

export function projectFileEditorSheetReset({
  canUseRichEditor,
  current,
  noteTitle,
}: {
  canUseRichEditor: boolean
  current: FileEditorSheetState
  noteTitle: string
}): FileEditorSheetState {
  const next = createFileEditorSheetState({ canUseRichEditor, noteTitle })
  return current.noteTitle === next.noteTitle && current.contentView === next.contentView ? current : next
}

export function getFileEditorMarkdownNoteTitle(content: string | null | undefined, fallback: string): string {
  const heading = content?.match(/^\uFEFF?#\s+([^\r\n]+)(?:\r?\n|$)/)?.[1]?.trim()
  if (heading) return heading
  return fallback.replace(/\.[^.]+$/, '')
}

export function projectFileEditorSheetChrome({
  file,
  noteTitle,
  canUseRichEditor,
  contentView,
}: {
  file: Pick<FilesDetail, 'name' | 'mimeType' | 'uri'>
  noteTitle: string
  canUseRichEditor: boolean
  contentView: FileEditorContentViewMode
}): FileEditorSheetChrome {
  const contentViewOptions: FileEditorSheetChrome['contentViewOptions'] = [
    canUseRichEditor
      ? { mode: 'rich', label: '富文本', active: contentView === 'rich' }
      : null,
    { mode: 'raw', label: '源码', active: contentView === 'raw' },
  ].filter((option): option is FileEditorSheetChrome['contentViewOptions'][number] => Boolean(option))

  return {
    headerAriaLabel: '文件详情标题',
    dialogTitle: noteTitle || file.name,
    resourceSummary: {
      mimeTypeLabel: file.mimeType ?? 'file',
      uri: file.uri,
    },
    bylineAriaLabel: '文件详情 byline',
    contentScrollAriaLabel: '文件详情内容滚动区',
    contentViewOptions,
  }
}

export function projectFileEditorSourceLinkedDraft(descriptor: FileEditorSourceLinkedDescriptor) {
  const displayIngestVersion = displaySourceIngestVersion(descriptor.ingestVersion)
  return {
    displayIngestVersion,
    draft: [
      `# ${descriptor.title}`,
      '',
      `Source: ${descriptor.sourceUri}`,
      `Ingest: ${displayIngestVersion}`,
      `Ingest 记录: ${descriptor.sourceIngestManifestUri}`,
      '',
      '确认 Ingest 审批后才会写入正文资源。',
    ].join('\n'),
  }
}

export function projectFileEditorSourceLinkedPanel({
  descriptor,
  displayIngestVersion,
}: {
  descriptor?: FileEditorSourceLinkedDescriptor | null
  displayIngestVersion: string
}): FileEditorSourceLinkedPanel | null {
  if (!descriptor) return null

  return {
    title: 'Source',
    rows: [
      {
        id: 'sourceUri',
        label: 'uri',
        value: descriptor.sourceUri,
        breakAll: true,
      },
      {
        id: 'ingestVersion',
        label: 'Ingest',
        value: displayIngestVersion,
        breakAll: false,
      },
      {
        id: 'manifestUri',
        label: 'Ingest 记录',
        value: descriptor.sourceIngestManifestUri,
        breakAll: true,
      },
    ],
  }
}

export function projectFileEditorStructuredReturnAction({
  fileUri,
  returnContext,
}: {
  fileUri: string
  returnContext?: {
    documentUri: string
    subject: string
  } | null
}): FileEditorStructuredReturnAction | null {
  if (!returnContext || fileUri === returnContext.documentUri) return null

  return {
    label: `返回来源表 · ${returnContext.subject}`,
  }
}

export function projectFileEditorRawSourceResource({
  rawResource,
  isSourceLinkedEditor,
  effectiveSourceText,
  fileUri,
}: {
  rawResource: FilesRawTextResource | null | undefined
  isSourceLinkedEditor: boolean
  effectiveSourceText: string | null | undefined
  fileUri: string
}): FilesRawTextResource | null {
  if (rawResource) return rawResource
  if (!isSourceLinkedEditor || !effectiveSourceText) return null
  return {
    uri: fileUri,
    content: effectiveSourceText,
    mimeType: 'text/markdown',
    etag: 'staged-ingest',
    headers: {},
  }
}

export type FileEditorRichContentState =
  | {
    kind: 'loading'
    message: string
  }
  | {
    kind: 'unavailable'
    message: string
  }
  | {
    kind: 'ready'
  }

export type FileEditorRichEditorContent = {
  inputFormat: 'html' | 'markdownish'
  saveFormat: 'markdown' | 'plain-text'
  text: string
}

export function projectFileEditorRichContentState({
  rawLoading,
  rawError,
  hasRawResource,
  hasEffectiveSourceText,
}: {
  rawLoading: boolean
  rawError: unknown
  hasRawResource: boolean
  hasEffectiveSourceText: boolean
}): FileEditorRichContentState {
  if (rawLoading) {
    return {
      kind: 'loading',
      message: '正在读取完整内容...',
    }
  }

  if ((rawError || !hasRawResource) && !hasEffectiveSourceText) {
    return {
      kind: 'unavailable',
      message: '完整内容暂时不可用，不能进入编辑。',
    }
  }

  return { kind: 'ready' }
}

export function projectFileEditorRichEditorContent({
  mimeType,
  previewText,
  sourceText,
}: {
  mimeType: string | null | undefined
  previewText: string | null | undefined
  sourceText: string | null | undefined
}): FileEditorRichEditorContent {
  const text = sourceText ?? previewText ?? ''
  if (mimeType === 'text/html') {
    return {
      inputFormat: 'html',
      saveFormat: 'plain-text',
      text,
    }
  }

  return {
    inputFormat: 'markdownish',
    saveFormat: mimeType === 'text/markdown' || mimeType === 'text/plain' ? 'markdown' : 'plain-text',
    text,
  }
}

export type FileEditorRichTextWarning = {
  title: string
  description: string
}

const SOURCE_MARKER_LINE_PATTERN = /^\s*<!--\s*\/?linx-source-(?:block|conflict)\b[^>]*-->\s*$/
const SOURCE_CONFLICT_MARKER_PATTERN = /^\s*<!--\s*linx-source-conflict\b[^>]*-->\s*$/m

export function projectFileEditorRichTextSourceInput(sourceText: string | null | undefined): {
  sourceText: string | null
  warning: FileEditorRichTextWarning | null
} {
  if (sourceText == null) {
    return {
      sourceText: null,
      warning: null,
    }
  }

  const hasSourceConflict = SOURCE_CONFLICT_MARKER_PATTERN.test(sourceText)
  return {
    sourceText: sourceText
      .split('\n')
      .filter((line) => !SOURCE_MARKER_LINE_PATTERN.test(line))
      .join('\n')
      .trim(),
    warning: hasSourceConflict
      ? {
          title: '来源内容有冲突',
          description: '请先确认 Ingest 更新，再替换本地编辑。',
        }
      : null,
  }
}

export function projectFileEditorCapabilities({
  fileMimeType,
  rawMimeType,
  isSourceLinkedEditor,
}: {
  fileMimeType: string | null
  rawMimeType?: string | null
  isSourceLinkedEditor: boolean
}) {
  const canSaveRichText = !isSourceLinkedEditor && (rawMimeType ?? fileMimeType) === 'text/markdown'
  return {
    canSaveRichText,
    canUseRichEditor: canSaveRichText || isSourceLinkedEditor,
  }
}
