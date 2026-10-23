import {
  formatBytes,
  formatDateTime,
  getFilesEntrySemanticPolicy,
} from '../../domain/detail/detail-metadata'
import type { FilesDetail } from '../../domain/resource/resource-model'
import {
  displayResourceName,
  getFilesEntryOpenMode,
  getFilesEntrySemanticLabel,
  getFilesOpenModeLabel,
  resolveFilesSidecarPlacement,
} from '../../domain/resource/resource-semantics'

export type EditableFilePreviewRow = {
  kind: 'description' | 'uri'
  label: string
  value: string
}

export type EditableFilePreviewModel = {
  title: string
  facts: string[]
  rows: EditableFilePreviewRow[]
  /** MIME type, byte size and address: only shown behind the 详细信息 toggle (专业视图). */
  technicalRows: EditableFilePreviewRow[]
  openLabel: string
  /** Rendered markdown for documents, raw text otherwise. */
  renderMarkdown: boolean
}

export type FileDetailSidecarPreviewRow = {
  kind: 'provider' | 'resource'
  label: string
  value: string
}

export type FileDetailSidecarPreviewModel = {
  title: string
  description: string
  rows: FileDetailSidecarPreviewRow[]
  showRows: boolean
  accessNotice: string | null
  rawText: string | null
}

export type FileDetailLineageRow = {
  kind: 'fact' | 'policy'
  label: string
  value: string
}

export type FileDetailLineageModel = {
  semanticSection: {
    label: string
    value: string
  }
  rows: FileDetailLineageRow[]
}

export type MediaFilePreviewModel = {
  kind: 'image' | 'document' | 'audio' | 'video'
  alt: string
  loadingMessage: string
  mimeType: string | null
  mimeTypeLabel: string
  unavailableReason: string
  uri: string
}

export type ReadonlyFilePreviewModel =
  | {
    kind: 'raw-text'
    rawText: string
  }
  | MediaFilePreviewModel
  | {
    kind: 'unsupported'
    mimeTypeLabel: string
    reason: string
  }

export type AuthenticatedImagePreviewResourceState = {
  error: unknown
  isLoading: boolean
  objectUrl: string | null
}

export type AuthenticatedImagePreviewRenderState =
  | {
    kind: 'loading'
    message: string
  }
  | {
    kind: 'unavailable'
    mimeTypeLabel: string
    reason: string
  }
  | {
    kind: 'ready'
    alt: string
    objectUrl: string
  }

function editableFileKindLabel(mimeType: string | null): string {
  const mime = mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (mime === 'text/markdown' || mime === 'text/x-markdown') return '文档'
  if (mime.startsWith('text/')) return '文本'
  return '文件'
}

export function projectEditableFilePreviewModel(file: FilesDetail): EditableFilePreviewModel {
  return {
    facts: [
      editableFileKindLabel(file.mimeType),
      formatDateTime(file.modifiedAt),
    ].filter((item) => item !== '—'),
    openLabel: '打开文件详情',
    renderMarkdown: editableFileKindLabel(file.mimeType) === '文档',
    rows: [],
    technicalRows: ([
      { kind: 'description', label: '类型', value: file.mimeType ?? 'file' },
      { kind: 'description', label: '大小', value: formatBytes(file.size) },
      { kind: 'uri', label: '地址', value: file.uri },
    ] satisfies EditableFilePreviewRow[]).filter((row) => row.value !== '—'),
    title: displayResourceName(file.name),
  }
}

export function projectReadonlyFilePreviewModel(file: FilesDetail): ReadonlyFilePreviewModel {
  if (file.previewText) {
    return {
      kind: 'raw-text',
      rawText: file.previewText,
    }
  }

  const media = resolveMediaPreview(file)
  if (media) {
    return {
      alt: file.name,
      kind: media.kind,
      loadingMessage: '正在加载预览...',
      mimeType: media.mimeType,
      mimeTypeLabel: media.mimeType,
      unavailableReason: file.previewUnavailableReason ?? '当前资源暂不支持内联预览。',
      uri: file.uri,
    }
  }

  return {
    kind: 'unsupported',
    mimeTypeLabel: file.mimeType ?? '未知类型',
    reason: file.previewUnavailableReason ?? '当前资源暂不支持内联预览。',
  }
}

type MediaExtensionTypes = {
  [extension: string]: { kind: MediaFilePreviewModel['kind']; mimeType: string }
}

const MEDIA_EXTENSION_TYPES: MediaExtensionTypes = {
  '.avif': { kind: 'image', mimeType: 'image/avif' },
  '.gif': { kind: 'image', mimeType: 'image/gif' },
  '.jpeg': { kind: 'image', mimeType: 'image/jpeg' },
  '.jpg': { kind: 'image', mimeType: 'image/jpeg' },
  '.png': { kind: 'image', mimeType: 'image/png' },
  '.svg': { kind: 'image', mimeType: 'image/svg+xml' },
  '.webp': { kind: 'image', mimeType: 'image/webp' },
  '.pdf': { kind: 'document', mimeType: 'application/pdf' },
  '.aac': { kind: 'audio', mimeType: 'audio/aac' },
  '.flac': { kind: 'audio', mimeType: 'audio/flac' },
  '.m4a': { kind: 'audio', mimeType: 'audio/mp4' },
  '.mp3': { kind: 'audio', mimeType: 'audio/mpeg' },
  '.oga': { kind: 'audio', mimeType: 'audio/ogg' },
  '.ogg': { kind: 'audio', mimeType: 'audio/ogg' },
  '.wav': { kind: 'audio', mimeType: 'audio/wav' },
  '.m4v': { kind: 'video', mimeType: 'video/mp4' },
  '.mov': { kind: 'video', mimeType: 'video/quicktime' },
  '.mp4': { kind: 'video', mimeType: 'video/mp4' },
  '.ogv': { kind: 'video', mimeType: 'video/ogg' },
  '.webm': { kind: 'video', mimeType: 'video/webm' },
}

function resolveMediaPreview(file: FilesDetail) {
  const normalizedMimeType = file.mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (normalizedMimeType.startsWith('image/')) return { kind: 'image' as const, mimeType: normalizedMimeType }
  if (normalizedMimeType === 'application/pdf') return { kind: 'document' as const, mimeType: normalizedMimeType }
  if (normalizedMimeType.startsWith('audio/')) return { kind: 'audio' as const, mimeType: normalizedMimeType }
  if (normalizedMimeType.startsWith('video/')) return { kind: 'video' as const, mimeType: normalizedMimeType }

  const normalizedName = file.name.toLowerCase()
  const extension = Object.keys(MEDIA_EXTENSION_TYPES).find((candidate) => normalizedName.endsWith(candidate))
  return extension ? MEDIA_EXTENSION_TYPES[extension] : null
}

export function projectAuthenticatedImagePreviewRenderState(
  preview: MediaFilePreviewModel,
  resource: AuthenticatedImagePreviewResourceState,
): AuthenticatedImagePreviewRenderState {
  if (resource.isLoading) {
    return {
      kind: 'loading',
      message: preview.loadingMessage,
    }
  }

  if (!resource.objectUrl || resource.error) {
    return {
      kind: 'unavailable',
      mimeTypeLabel: preview.mimeTypeLabel,
      reason: preview.unavailableReason,
    }
  }

  return {
    alt: preview.alt,
    kind: 'ready',
    objectUrl: resource.objectUrl,
  }
}

export function projectFileDetailSidecarPreviewModel(file: FilesDetail): FileDetailSidecarPreviewModel {
  const placement = resolveFilesSidecarPlacement(file)
  const isAccessSidecar = placement?.kind === 'access-policy'
  const rows = placement
    ? [
      {
        kind: 'resource',
        label: 'owner',
        value: placement.ownerUri,
      },
      {
        kind: 'resource',
        label: 'sidecar',
        value: placement.sidecarUri,
      },
      ...(placement.provider
        ? [{
            kind: 'provider',
            label: 'provider',
            value: placement.provider,
          }] satisfies FileDetailSidecarPreviewRow[]
        : []),
    ] satisfies FileDetailSidecarPreviewRow[]
    : []

  return {
    accessNotice: isAccessSidecar ? '权限策略通过 Access 查看。' : null,
    description: placement ? placement.ownerUri : file.parentUri,
    rawText: isAccessSidecar ? null : file.previewText,
    rows,
    showRows: rows.length > 0,
    title: isAccessSidecar ? 'ACL/ACR sidecar' : '`.meta` sidecar',
  }
}

export function projectFileDetailLineageModel(file: FilesDetail): FileDetailLineageModel {
  const openMode = getFilesEntryOpenMode(file)
  return {
    semanticSection: {
      label: '资源类别',
      value: getFilesEntrySemanticLabel(file.semanticKind),
    },
    rows: [
      {
        kind: 'policy',
        label: '处理语义',
        value: getFilesEntrySemanticPolicy(file.semanticKind),
      },
      {
        kind: 'fact',
        label: '打开方式',
        value: getFilesOpenModeLabel(openMode),
      },
      {
        kind: 'fact',
        label: '父容器',
        value: file.parentUri,
      },
      {
        kind: 'fact',
        label: '最近修改',
        value: formatDateTime(file.modifiedAt),
      },
    ],
  }
}
