import { FilesSaveConflictError, type FilesRawTextResource } from '../../domain/resource/resource-model'

export type FileEditorRawSourceState =
  | { kind: 'loading' }
  | { kind: 'unavailable' }
  | { kind: 'ready'; rawResource: FilesRawTextResource }

export interface FileEditorRawSourceChrome {
  loadingMessage: string
  unavailableMessage: string
  contentAriaLabel: string
  rawResourceSummary: {
    label: string
    title: string
  } | null
  proposalSubmitLabel: string
  canonicalSaveLabel: string
}

export interface FileEditorRawSourceDraftState {
  draft: string
  hydratedContent: string
  hydratedResourceSignature: string | null
}

export function projectFileEditorRawSourceState({
  rawError,
  rawLoading,
  rawSourceResource,
}: {
  rawError: unknown
  rawLoading: boolean
  rawSourceResource: FilesRawTextResource | null | undefined
}): FileEditorRawSourceState {
  if (rawSourceResource) return { kind: 'ready', rawResource: rawSourceResource }
  if (rawLoading) return { kind: 'loading' }
  if (rawError) return { kind: 'unavailable' }
  return { kind: 'unavailable' }
}

export function getFileEditorRawSourceResource(sourceState: FileEditorRawSourceState): FilesRawTextResource | undefined {
  return sourceState.kind === 'ready' ? sourceState.rawResource : undefined
}

export function projectFileEditorRawSourceDraft(rawResource: FilesRawTextResource | undefined): string {
  return rawResource?.content ?? ''
}

export function createFileEditorRawSourceResourceSignature(rawResource: FilesRawTextResource | undefined): string | null {
  if (!rawResource) return null
  return `${rawResource.uri}\n${rawResource.etag}\n${rawResource.content}`
}

export function createFileEditorRawSourceDraftState(
  rawResource?: FilesRawTextResource,
): FileEditorRawSourceDraftState {
  const draft = projectFileEditorRawSourceDraft(rawResource)
  return {
    draft,
    hydratedContent: draft,
    hydratedResourceSignature: createFileEditorRawSourceResourceSignature(rawResource),
  }
}

export function projectFileEditorRawSourceDraftPatch({
  current,
  draft,
}: {
  current: FileEditorRawSourceDraftState
  draft: string
}): FileEditorRawSourceDraftState {
  return {
    ...current,
    draft,
  }
}

export function projectFileEditorRawSourceHydration({
  current,
  rawResource,
}: {
  current: FileEditorRawSourceDraftState
  rawResource?: FilesRawTextResource
}): FileEditorRawSourceDraftState {
  const nextSignature = createFileEditorRawSourceResourceSignature(rawResource)
  if (current.hydratedResourceSignature === nextSignature) return current
  if (!rawResource) return current

  const hasLocalEdit = current.draft !== current.hydratedContent

  return {
    draft: hasLocalEdit ? current.draft : rawResource.content,
    hydratedContent: rawResource.content,
    hydratedResourceSignature: nextSignature,
  }
}

export function isFileEditorRawSourceDirty({
  rawResource,
  draft,
}: {
  rawResource: FilesRawTextResource | undefined
  draft: string
}): boolean {
  return !!rawResource && draft !== rawResource.content
}

export function planFileEditorRawSourceSave({
  rawResource,
  draft,
}: {
  rawResource: FilesRawTextResource | undefined
  draft: string
}): {
  resource: FilesRawTextResource
  content: string
  successMessage: string
} | null {
  if (!rawResource) return null

  return {
    resource: rawResource,
    content: draft,
    successMessage: '原始内容已保存',
  }
}

export function projectFileEditorRawSourceChrome({
  sourceState,
  proposalLabel,
  savePending,
}: {
  sourceState: FileEditorRawSourceState
  proposalLabel?: string
  savePending: boolean
}): FileEditorRawSourceChrome {
  const rawResource = getFileEditorRawSourceResource(sourceState)
  const resolvedProposalLabel = proposalLabel ?? 'AI 修改审批'
  const rawResourceSummary = rawResource
    ? {
      label: `${rawResource.mimeType} · ETag ${rawResource.etag}`,
      title: `${rawResource.mimeType} · ${rawResource.etag}`,
    }
    : null

  return {
    loadingMessage: '正在读取完整原始内容...',
    unavailableMessage: '完整原始内容暂时不可用。',
    contentAriaLabel: '原始内容',
    rawResourceSummary,
    proposalSubmitLabel: `提交 ${resolvedProposalLabel}`,
    canonicalSaveLabel: savePending ? '保存中' : '保存原始内容',
  }
}

export function getFileEditorRawSourceSaveErrorMessage(error: unknown): string {
  if (error instanceof FilesSaveConflictError) {
    return '保存冲突：远端内容已变化，请重新读取后再保存。'
  }

  if (error instanceof Error) {
    return error.message
  }

  return '保存失败'
}

export function canSubmitFileEditorRawSourceProposal({
  hasSubmitHandler,
  dirty,
  proposalPending,
}: {
  hasSubmitHandler: boolean
  dirty: boolean
  proposalPending: boolean
}): boolean {
  return hasSubmitHandler && dirty && !proposalPending
}
