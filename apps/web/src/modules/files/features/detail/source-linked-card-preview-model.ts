import type { FilesDetail } from '../../domain/resource/resource-model'
import type { SourceLinkedCardDescriptor } from '../../domain/source/source-ingest'
import { formatDateTime } from '../../domain/detail/detail-metadata'
import type { FileEditorRichEditorContent } from '../editor/file-editor-sheet-model'

export function createSourceLinkedCardActionErrorId(uri: string) {
  let hash = 0
  for (let index = 0; index < uri.length; index += 1) {
    hash = ((hash << 5) - hash + uri.charCodeAt(index)) | 0
  }
  return `files-source-linked-card-action-error-${Math.abs(hash).toString(36)}`
}

export function formatSourceLinkedCardIngestChunkProgress(readChunks: number, totalChunks: number) {
  const totalKnown = Number.isFinite(totalChunks) && totalChunks > 0 && totalChunks >= readChunks
  return `${readChunks} / ${totalKnown ? totalChunks : '未知'}`
}

export type SourceLinkedCardPrimaryActionId =
  | 'open-source'
  | 'open-body-resource'
  | 'refresh-source'
  | 'keep-local-edits'
  | 'review-ingest'

export type SourceLinkedCardPrimaryActionIcon =
  | 'external-link'
  | 'file-text'
  | 'refresh'
  | 'edit'
  | 'branch'

export type SourceLinkedCardPrimaryActionModel = {
  id: SourceLinkedCardPrimaryActionId
  label: string
  icon: SourceLinkedCardPrimaryActionIcon
  disabled: boolean
  describedByError: boolean
}

export type SourceLinkedCardIngestRangeActionId =
  | 'request-next-ingest-range'
  | 'request-all-ingest-ranges'

export type SourceLinkedCardIngestRangeActionModel = {
  id: SourceLinkedCardIngestRangeActionId
  label: string
  disabled: boolean
}

export type SourceLinkedCardRichTextWarning = {
  title: string
  description: string
}

export type SourceLinkedCardPreviewContent =
  | {
    kind: 'unavailable'
    title: string
    description: string
    rawText: string | null
  }
  | {
    kind: 'ready'
    title: string
    description: string
    bodyFile: FilesDetail
    bodyRichEditorContent: FileEditorRichEditorContent
    bodyRichTextWarning: SourceLinkedCardRichTextWarning | null
  }

export type SourceLinkedCardEditorSheetModel = {
  file: FilesDetail
  descriptor: SourceLinkedCardDescriptor
  descriptorUri: string
  open: boolean
  stagedSourceText: string | null
} | null

export type SourceLinkedCardActionErrorModel = {
  id: string
  message: string
} | null

export type SourceLinkedCardDetailsPanelModel = {
  badgeLabel: string
  title: string
  description: string
  rows: [string, string][]
  hasPendingIngestRangeActions: boolean
  stagedIngestContent: string | null
  rawText: string | null
} | null

export type SourceLinkedCardPreviewState = {
  sheetOpen: boolean
  sourceDetailsOpen: boolean
}

export function createSourceLinkedCardPreviewState(): SourceLinkedCardPreviewState {
  return {
    sheetOpen: false,
    sourceDetailsOpen: false,
  }
}

export function projectSourceLinkedCardPreviewSheetOpen({
  current,
  open,
}: {
  current: SourceLinkedCardPreviewState
  open: boolean
}): SourceLinkedCardPreviewState {
  return {
    ...current,
    sheetOpen: open,
  }
}

export function projectSourceLinkedCardPreviewSourceDetailsToggled(
  current: SourceLinkedCardPreviewState,
): SourceLinkedCardPreviewState {
  return {
    ...current,
    sourceDetailsOpen: !current.sourceDetailsOpen,
  }
}

type SourceLinkedCardDetailRowsInput = {
  approval?: {
    id?: string | null
    status?: string | null
  } | null
  bodyUri?: string | null
  descriptor?: SourceLinkedCardDescriptor | null
  displayIngestVersion: string
  sourceIngestManifest?: {
    status: string
    readChunks: number
    totalChunks: number
    pendingRanges: Array<{
      start: number | string
      end: number | string
    }>
    lastIngestedAt: string
  } | null
  sourceProposal?: {
    status: string
    summary: string
    diff: string
    targetResourceUri: string
    proposedContent?: string | null
  } | null
}

export function projectSourceLinkedCardDetailRows({
  approval,
  bodyUri,
  descriptor,
  displayIngestVersion,
  sourceIngestManifest,
  sourceProposal,
}: SourceLinkedCardDetailRowsInput): [string, string][] {
  if (!descriptor) return []

  return [
    ['标题', descriptor.title],
    ['来源', descriptor.sourceUri],
    ['类型', descriptor.sourceKind.toUpperCase()],
    ['格式', descriptor.mimeType],
    ['Ingest', displayIngestVersion],
    ['来源 hash', descriptor.sourceHash],
    ['Ingest 记录', descriptor.sourceIngestManifestUri],
    ...(sourceIngestManifest ? [
      ['Ingest 状态', sourceIngestManifest.status],
      ['已 Ingest chunk', formatSourceLinkedCardIngestChunkProgress(sourceIngestManifest.readChunks, sourceIngestManifest.totalChunks)],
      ['待 Ingest', sourceIngestManifest.pendingRanges.map((range) => `${range.start}..${range.end}`).join(', ') || '无'],
      ['最近 Ingest', formatDateTime(sourceIngestManifest.lastIngestedAt)],
    ] satisfies [string, string][] : []),
    ['Ingest 审批', sourceProposal ? sourceProposal.status : '无'],
    ...(sourceProposal ? [
      ['审批摘要', sourceProposal.summary],
      ['审批 diff', sourceProposal.diff],
      ['审批目标', sourceProposal.targetResourceUri],
      ['待审批内容', sourceProposal.proposedContent ? '已准备' : '无'],
    ] satisfies [string, string][] : []),
    ['审批状态', approval?.status ?? '无'],
    ...(approval ? [
      ['审批 ID', approval.id ?? '未知'],
    ] satisfies [string, string][] : []),
    ['正文', bodyUri ?? ''],
    ['创建时间', formatDateTime(descriptor.createdAt)],
    ['写入方式', 'canonical 内容需审批后更新'],
  ]
}

export function projectSourceLinkedCardPreviewContent({
  descriptor,
  bodyUri,
  bodyFile,
  bodyPreviewText,
  bodyRichEditorContent,
  bodyRichTextWarning,
  fallbackRawText,
}: {
  descriptor: SourceLinkedCardDescriptor | null | undefined
  bodyUri: string | null | undefined
  bodyFile: FilesDetail | null | undefined
  bodyPreviewText: string | null | undefined
  bodyRichEditorContent: FileEditorRichEditorContent
  bodyRichTextWarning: SourceLinkedCardRichTextWarning | null
  fallbackRawText: string | null
}): SourceLinkedCardPreviewContent {
  if (!descriptor) {
    return {
      kind: 'unavailable',
      title: 'Source-linked card',
      description: 'Source-linked card metadata 暂不可用或不完整。',
      rawText: fallbackRawText,
    }
  }

  if (!bodyUri || !bodyFile || bodyPreviewText == null) {
    return {
      kind: 'unavailable',
      title: 'Source-linked card',
      description: '未找到这个 source-linked card 的正文资源。',
      rawText: fallbackRawText,
    }
  }

  return {
    kind: 'ready',
    title: descriptor.title,
    description: descriptor.sourceUri,
    bodyFile,
    bodyRichEditorContent,
    bodyRichTextWarning,
  }
}

export function projectSourceLinkedCardActionError({
  id,
  message,
}: {
  id: string
  message: string | null | undefined
}): SourceLinkedCardActionErrorModel {
  if (!message) return null

  return { id, message }
}

export function projectSourceLinkedCardPendingIngestRangeAvailability(
  sourceIngestManifest: SourceLinkedCardDetailRowsInput['sourceIngestManifest'],
) {
  return Boolean(sourceIngestManifest?.pendingRanges.length)
}

export function projectSourceLinkedCardStagedIngestContent(
  sourceProposal: SourceLinkedCardDetailRowsInput['sourceProposal'],
) {
  return sourceProposal?.proposedContent ?? null
}

export function projectSourceLinkedCardEditorSheet({
  content,
  descriptor,
  descriptorUri,
  open,
  sourceProposal,
}: {
  content: SourceLinkedCardPreviewContent
  descriptor: SourceLinkedCardDescriptor | null | undefined
  descriptorUri: string
  open: boolean
  sourceProposal: SourceLinkedCardDetailRowsInput['sourceProposal']
}): SourceLinkedCardEditorSheetModel {
  if (content.kind !== 'ready' || !descriptor) return null

  return {
    file: content.bodyFile,
    descriptor,
    descriptorUri,
    open,
    stagedSourceText: projectSourceLinkedCardStagedIngestContent(sourceProposal),
  }
}

export function projectSourceLinkedCardDetailsPanel({
  open,
  rows,
  sourceIngestManifest,
  sourceProposal,
  rawText,
}: {
  open: boolean
  rows: [string, string][]
  sourceIngestManifest: SourceLinkedCardDetailRowsInput['sourceIngestManifest']
  sourceProposal: SourceLinkedCardDetailRowsInput['sourceProposal']
  rawText: string | null
}): SourceLinkedCardDetailsPanelModel {
  if (!open) return null

  return {
    badgeLabel: 'Source-linked card',
    title: 'Source-linked card',
    description: 'Ingest 输出需审批后才更新 card 内容。',
    rows,
    hasPendingIngestRangeActions: projectSourceLinkedCardPendingIngestRangeAvailability(sourceIngestManifest),
    stagedIngestContent: projectSourceLinkedCardStagedIngestContent(sourceProposal),
    rawText,
  }
}

export function projectSourceLinkedCardPrimaryActions({
  expectedSourceProposal,
  hasActionError,
  pendingSourceProposalsLoading,
  refreshPending,
  resolveSourceApprovalPending,
  sourceCreatePending,
}: {
  expectedSourceProposal: boolean
  hasActionError: boolean
  pendingSourceProposalsLoading: boolean
  refreshPending: boolean
  resolveSourceApprovalPending: boolean
  sourceCreatePending: boolean
}): SourceLinkedCardPrimaryActionModel[] {
  return [
    {
      disabled: false,
      describedByError: false,
      icon: 'external-link',
      id: 'open-source',
      label: '打开来源',
    },
    {
      disabled: false,
      describedByError: false,
      icon: 'file-text',
      id: 'open-body-resource',
      label: '打开正文资源',
    },
    {
      disabled: refreshPending,
      describedByError: hasActionError,
      icon: 'refresh',
      id: 'refresh-source',
      label: '刷新来源',
    },
    {
      disabled: !expectedSourceProposal || sourceCreatePending || resolveSourceApprovalPending,
      describedByError: hasActionError,
      icon: 'edit',
      id: 'keep-local-edits',
      label: '保留本地编辑',
    },
    {
      disabled: !expectedSourceProposal || pendingSourceProposalsLoading || refreshPending,
      describedByError: hasActionError,
      icon: 'branch',
      id: 'review-ingest',
      label: '审阅 Ingest',
    },
  ]
}

export function projectSourceLinkedCardIngestRangeActions({
  requestPending,
}: {
  requestPending: boolean
}): SourceLinkedCardIngestRangeActionModel[] {
  return [
    {
      disabled: requestPending,
      id: 'request-next-ingest-range',
      label: requestPending ? '排队中' : 'Ingest 下一段',
    },
    {
      disabled: requestPending,
      id: 'request-all-ingest-ranges',
      label: 'Ingest 全部',
    },
  ]
}
