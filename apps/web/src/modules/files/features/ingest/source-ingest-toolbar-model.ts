import type { SourceIngestKind } from '../../domain/source/source-ingest'

export const SOURCE_INGEST_KIND_OPTIONS: readonly {
  value: SourceIngestKind
  label: string
}[] = [
  { value: 'url', label: '网页' },
  { value: 'pdf', label: 'PDF' },
  { value: 'doc', label: 'Word' },
  { value: 'ppt', label: 'PPT' },
]

export type SourceIngestToolbarLocation =
  | { kind: 'all' }
  | { kind: 'recent' }
  | { kind: 'local-workspace'; localPath?: string }
  | { kind: 'container'; containerUri?: string }

export interface SourceIngestToolbarDraft {
  sourceUri: string
  title: string
  sourceKind: SourceIngestKind
}

export interface SourceIngestToolbarFeedbackState {
  createdTargetUri: string | null
  errorMessage: string | null
}

export interface SourceIngestToolbarState {
  open: boolean
  draft: SourceIngestToolbarDraft
  feedback: SourceIngestToolbarFeedbackState
}

export interface SourceIngestSubmitPlan {
  containerUri: string
  sourceUri: string
  title: string
  sourceKind: SourceIngestKind
}

export interface SourceIngestToolbarFeedback {
  success: {
    message: string
    targetUri: string
  } | null
  closedError: string | null
  formError: string | null
}

export interface SourceIngestToolbarChrome {
  triggerLabel: string
  sourceKindLabel: string
  sourceUriLabel: string
  sourceUriPlaceholder: string
  titleLabel: string
  titlePlaceholder: string
  containerLabel: string
  submitLabel: string
}

export function createSourceIngestInitialDraft(): SourceIngestToolbarDraft {
  return {
    sourceUri: '',
    title: '',
    sourceKind: 'url',
  }
}

export function createSourceIngestToolbarState(): SourceIngestToolbarState {
  return {
    open: false,
    draft: createSourceIngestInitialDraft(),
    feedback: {
      createdTargetUri: null,
      errorMessage: null,
    },
  }
}

export function projectSourceIngestToolbarOpenChanged({
  current,
  open,
}: {
  current: SourceIngestToolbarState
  open: boolean
}): SourceIngestToolbarState {
  return current.open === open ? current : { ...current, open }
}

export function parseSourceIngestKind(value: string): SourceIngestKind {
  return SOURCE_INGEST_KIND_OPTIONS.some((option) => option.value === value)
    ? value as SourceIngestKind
    : 'url'
}

export function projectSourceIngestToolbarDraftPatch({
  current,
  patch,
}: {
  current: SourceIngestToolbarState
  patch: Partial<SourceIngestToolbarDraft>
}): SourceIngestToolbarState {
  const draft = {
    ...current.draft,
    ...patch,
  }
  return draft.sourceUri === current.draft.sourceUri
    && draft.title === current.draft.title
    && draft.sourceKind === current.draft.sourceKind
    ? current
    : { ...current, draft }
}

export function projectSourceIngestToolbarKindValue({
  current,
  value,
}: {
  current: SourceIngestToolbarState
  value: string
}): SourceIngestToolbarState {
  return projectSourceIngestToolbarDraftPatch({
    current,
    patch: { sourceKind: parseSourceIngestKind(value) },
  })
}

export function projectSourceIngestToolbarSubmitStarted(
  current: SourceIngestToolbarState,
): SourceIngestToolbarState {
  if (!current.feedback.errorMessage) return current
  return {
    ...current,
    feedback: {
      ...current.feedback,
      errorMessage: null,
    },
  }
}

export function projectSourceIngestToolbarSubmitSucceeded({
  targetResourceUri,
}: {
  current: SourceIngestToolbarState
  targetResourceUri: string
}): SourceIngestToolbarState {
  return {
    open: false,
    draft: createSourceIngestInitialDraft(),
    feedback: {
      createdTargetUri: targetResourceUri,
      errorMessage: null,
    },
  }
}

export function projectSourceIngestToolbarSubmitFailed({
  current,
  error,
}: {
  current: SourceIngestToolbarState
  error: unknown
}): SourceIngestToolbarState {
  return {
    ...current,
    feedback: {
      createdTargetUri: null,
      errorMessage: getSourceIngestCreationErrorMessage(error),
    },
  }
}

export function projectSourceIngestContainerUri(location: SourceIngestToolbarLocation): string | null {
  return location.kind === 'container' && location.containerUri ? location.containerUri : null
}

export function planSourceIngestSubmit({
  containerUri,
  draft,
  isPending,
}: {
  containerUri: string | null
  draft: SourceIngestToolbarDraft
  isPending: boolean
}): SourceIngestSubmitPlan | null {
  const sourceUri = draft.sourceUri.trim()
  const title = draft.title.trim()
  if (!containerUri || !sourceUri || !title || isPending) return null

  return {
    containerUri,
    sourceUri,
    title,
    sourceKind: draft.sourceKind,
  }
}

export function projectSourceIngestToolbarChrome({
  containerUri,
  isPending,
}: {
  containerUri: string | null
  isPending: boolean
}): SourceIngestToolbarChrome {
  return {
    triggerLabel: '添加网页',
    sourceKindLabel: '来源类型',
    sourceUriLabel: '来源地址',
    sourceUriPlaceholder: 'https://...',
    titleLabel: '标题',
    titlePlaceholder: '标题',
    containerLabel: containerUri ?? '先选文件夹',
    submitLabel: isPending ? '添加中...' : '添加网页',
  }
}

export function projectSourceIngestToolbarFeedback({
  createdTargetUri,
  errorMessage,
  open,
}: {
  createdTargetUri: string | null
  errorMessage: string | null
  open: boolean
}): SourceIngestToolbarFeedback {
  return {
    closedError: errorMessage && !open ? errorMessage : null,
    formError: errorMessage,
    success: createdTargetUri
      ? {
        message: '网页已添加',
        targetUri: createdTargetUri,
      }
      : null,
  }
}

export function getSourceIngestCreationErrorMessage(error: unknown): string {
  if (error instanceof Error && /source could not be read/i.test(error.message)) {
    return '网页内容暂不可读'
  }

  if (error instanceof Error && /(Source Ingest|Ingest|queue|parser|manifest)/i.test(error.message)) {
    return '网页处理暂不可用'
  }

  return '网页添加失败'
}
