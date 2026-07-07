import {
  formatBytes,
  formatDateTime,
  getFilesEntrySemanticPolicy,
} from '../../domain/detail/detail-metadata'
import type { FilesDetail } from '../../domain/resource/resource-model'
import {
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
  openLabel: string
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

export type ImageFilePreviewModel = {
  kind: 'image'
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
  | ImageFilePreviewModel
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

export function projectEditableFilePreviewModel(file: FilesDetail): EditableFilePreviewModel {
  return {
    facts: [
      file.mimeType ?? 'file',
      formatBytes(file.size),
      formatDateTime(file.modifiedAt),
    ].filter((item) => item !== '—'),
    openLabel: '打开文件详情',
    rows: [
      {
        kind: 'uri',
        label: 'URI',
        value: file.uri,
      },
      {
        kind: 'description',
        label: '内容',
        value: '完整内容将在弹出的文件详情中读取。',
      },
    ],
    title: file.name,
  }
}

export function projectReadonlyFilePreviewModel(file: FilesDetail): ReadonlyFilePreviewModel {
  if (file.previewText) {
    return {
      kind: 'raw-text',
      rawText: file.previewText,
    }
  }

  if (file.mimeType?.startsWith('image/')) {
    return {
      alt: file.name,
      kind: 'image',
      loadingMessage: '正在加载预览...',
      mimeType: file.mimeType,
      mimeTypeLabel: file.mimeType,
      unavailableReason: file.previewUnavailableReason ?? '当前图像暂时不能内联预览。',
      uri: file.uri,
    }
  }

  return {
    kind: 'unsupported',
    mimeTypeLabel: file.mimeType ?? '未知类型',
    reason: file.previewUnavailableReason ?? '当前资源暂不支持内联预览。',
  }
}

export function projectAuthenticatedImagePreviewRenderState(
  preview: ImageFilePreviewModel,
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
