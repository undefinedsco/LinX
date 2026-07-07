import { useCallback, useEffect, useMemo, useState } from 'react'

import { useToast } from '@/components/ui/use-toast'

import { useFilesRouteBridge } from '../../app/FilesRouteContext'
import { clearStructuredSubjectRoute } from '../../app/route-state'
import { useFilesStore } from '../../app/store'
import {
  useCreateAiChangeProposal,
  useCreateSourceUpdateProposal,
  useFilesCurrentPodRootUri,
  useFilesMetaSidecar,
  useRawTextResource,
  useSaveRawTextResource,
} from '../../data/queries'
import { createAiChangeProposal } from '../../domain/proposal/ai-change-approval-model'
import { FilesSaveConflictError, type FilesDetail } from '../../domain/resource/resource-model'
import { createSourceUpdateProposal, type SourceUpdateCardMetadata } from '../../domain/source/source-approval-model'
import {
  createFileEditorMetaTailId,
  createFileEditorSheetState,
  type FileEditorContentViewMode,
  getFileEditorMarkdownNoteTitle,
  projectFileEditorBylineItems,
  projectFileEditorCapabilities,
  projectFileEditorRawSourceResource,
  projectFileEditorRichContentState,
  projectFileEditorRichEditorContent,
  projectFileEditorSheetContentView,
  projectFileEditorSheetChrome,
  projectFileEditorSheetReset,
  projectFileEditorSheetTitle,
  projectFileEditorRichTextSourceInput,
  projectFileEditorSourceLinkedDraft,
  projectFileEditorSourceLinkedPanel,
  projectFileEditorStructuredReturnAction,
  replaceFileEditorMarkdownNoteTitle,
  type FileEditorSourceLinkedDescriptor,
} from './file-editor-sheet-model'
import { projectFileEditorRawSourceState } from './file-editor-raw-source-model'
import { projectResourceMetaSidecarContent } from '../sidecars/resource-meta-sidecar-content-model'

export type { FileEditorSourceLinkedDescriptor } from './file-editor-sheet-model'

export function useFileEditorSheetController({
  file,
  open,
  sourceLinkedDescriptor,
  sourceLinkedDescriptorUri,
  stagedSourceText,
}: {
  file: FilesDetail
  open: boolean
  sourceLinkedDescriptor?: FileEditorSourceLinkedDescriptor | null
  sourceLinkedDescriptorUri?: string
  stagedSourceText?: string | null
}) {
  const { toast } = useToast()
  const currentPodRootUri = useFilesCurrentPodRootUri()
  const saveRichText = useSaveRawTextResource()
  const createAiProposal = useCreateAiChangeProposal()
  const createSourceProposal = useCreateSourceUpdateProposal()
  const rawQuery = useRawTextResource(file.uri, open)
  const metaQuery = useFilesMetaSidecar(file, open)
  const metaContent = projectResourceMetaSidecarContent({
    file,
    isLoading: metaQuery.isLoading,
    error: metaQuery.error,
    meta: metaQuery.data,
  })
  const metaTailId = useMemo(() => createFileEditorMetaTailId(file.uri), [file.uri])
  const filesRouteBridge = useFilesRouteBridge()
  const structuredSubjectReturnContext = useFilesStore((state) => state.structuredSubjectReturnContext)
  const returnToStructuredSubject = useFilesStore((state) => state.returnToStructuredSubject)
  const rawResource = rawQuery.data
  const isSourceLinkedEditor = !!sourceLinkedDescriptor
  const sourceLinkedDraftProjection = sourceLinkedDescriptor
    ? projectFileEditorSourceLinkedDraft(sourceLinkedDescriptor)
    : null
  const sourceLinkedDisplayIngestVersion = sourceLinkedDraftProjection?.displayIngestVersion ?? ''
  const sourceLinkedPanel = projectFileEditorSourceLinkedPanel({
    descriptor: sourceLinkedDescriptor,
    displayIngestVersion: sourceLinkedDisplayIngestVersion,
  })
  const sourceLinkedDraft = sourceLinkedDraftProjection?.draft ?? null
  const {
    canSaveRichText,
    canUseRichEditor,
  } = projectFileEditorCapabilities({
    fileMimeType: file.mimeType,
    rawMimeType: rawResource?.mimeType,
    isSourceLinkedEditor,
  })
  const effectiveSourceText = rawResource?.content ?? (isSourceLinkedEditor ? stagedSourceText ?? null : null)
  const rawSourceResource = useMemo(() => projectFileEditorRawSourceResource({
    rawResource,
    isSourceLinkedEditor,
    effectiveSourceText,
    fileUri: file.uri,
  }), [effectiveSourceText, file.uri, isSourceLinkedEditor, rawResource])
  const richContentState = projectFileEditorRichContentState({
    rawLoading: rawQuery.isLoading,
    rawError: rawQuery.error,
    hasRawResource: !!rawResource,
    hasEffectiveSourceText: !!effectiveSourceText,
  })
  const rawSourceEditorState = projectFileEditorRawSourceState({
    rawError: rawQuery.error,
    rawLoading: rawQuery.isLoading,
    rawSourceResource,
  })
  const currentNoteTitle = useMemo(
    () => getFileEditorMarkdownNoteTitle(effectiveSourceText ?? file.previewText, sourceLinkedDescriptor?.title ?? file.name),
    [effectiveSourceText, file.name, file.previewText, sourceLinkedDescriptor?.title],
  )
  const [sheetState, setSheetState] = useState(() => createFileEditorSheetState({
    canUseRichEditor,
    noteTitle: currentNoteTitle,
  }))
  const setNoteTitle = useCallback((noteTitle: string) => {
    setSheetState((current) => projectFileEditorSheetTitle({ current, noteTitle }))
  }, [])
  const setContentView = useCallback((contentView: FileEditorContentViewMode) => {
    setSheetState((current) => projectFileEditorSheetContentView({
      canUseRichEditor,
      contentView,
      current,
    }))
  }, [canUseRichEditor])
  const structuredReturnAction = projectFileEditorStructuredReturnAction({
    fileUri: file.uri,
    returnContext: structuredSubjectReturnContext,
  })
  const richTextSourceInput = useMemo(
    () => projectFileEditorRichTextSourceInput(effectiveSourceText),
    [effectiveSourceText],
  )
  const richEditorContent = projectFileEditorRichEditorContent({
    mimeType: sourceLinkedDescriptor ? 'text/markdown' : rawResource?.mimeType ?? file.mimeType,
    previewText: sourceLinkedDescriptor ? sourceLinkedDraft : file.previewText,
    sourceText: richTextSourceInput.sourceText,
  })
  const bylineItems = projectFileEditorBylineItems({
    file,
    rawLoading: rawQuery.isLoading,
    hasRawResource: !!rawResource,
    metaLoading: metaContent.status === 'loading',
    metaState: metaContent.metaState ?? undefined,
    isSourceLinkedEditor,
    canSaveRichText,
  })
  const sheetChrome = projectFileEditorSheetChrome({
    file,
    noteTitle: sheetState.noteTitle,
    canUseRichEditor,
    contentView: sheetState.contentView,
  })

  useEffect(() => {
    setSheetState((current) => projectFileEditorSheetReset({
      canUseRichEditor,
      current,
      noteTitle: currentNoteTitle,
    }))
  }, [canUseRichEditor, currentNoteTitle, file.uri])

  const returnToSourceStructuredSubject = useCallback(() => {
    if (filesRouteBridge) filesRouteBridge.clearStructuredSubjectRoute()
    else clearStructuredSubjectRoute()
    returnToStructuredSubject()
  }, [filesRouteBridge, returnToStructuredSubject])

  const saveRichTextContent = useCallback(async (content: string) => {
    if (!rawResource || content === rawResource.content || saveRichText.isPending) return

    try {
      await saveRichText.mutateAsync({
        resource: rawResource,
        content,
      })
      toast({ description: '内容已保存' })
    } catch (error) {
      const description = error instanceof FilesSaveConflictError
        ? '保存冲突：远端内容已变化，请重新读取后再保存。'
        : error instanceof Error
          ? error.message
          : '保存失败'
      toast({ description, variant: 'destructive' })
    }
  }, [rawResource, saveRichText, toast])

  const saveNoteTitle = useCallback(async () => {
    if (!canSaveRichText || !rawResource || saveRichText.isPending) return
    const nextTitle = sheetState.noteTitle.trim()
    if (!nextTitle || nextTitle === getFileEditorMarkdownNoteTitle(rawResource.content, file.name)) return
    await saveRichTextContent(replaceFileEditorMarkdownNoteTitle(rawResource.content, nextTitle))
  }, [canSaveRichText, file.name, rawResource, saveRichText.isPending, saveRichTextContent, sheetState.noteTitle])

  const submitChangeProposal = useCallback(async (
    content: string,
    cardMetadata?: Partial<SourceUpdateCardMetadata> | null,
  ) => {
    const baselineContent = rawResource?.content ?? (isSourceLinkedEditor ? stagedSourceText ?? null : null)
    if (!baselineContent || content === baselineContent) return

    if (isSourceLinkedEditor) {
      if (!sourceLinkedDescriptor || !sourceLinkedDescriptorUri || createSourceProposal.isPending) return
      try {
        await createSourceProposal.mutateAsync(createSourceUpdateProposal({
          documentUri: sourceLinkedDescriptorUri,
          subject: `${sourceLinkedDescriptorUri}#card`,
          targetResourceUri: file.uri,
          sourceUri: sourceLinkedDescriptor.sourceUri,
          sourceIngestManifestUri: sourceLinkedDescriptor.sourceIngestManifestUri,
          ingestVersion: sourceLinkedDescriptor.ingestVersion,
          sourceHash: sourceLinkedDescriptor.sourceHash,
          operation: 'replace-blocks',
          proposedContent: content,
          cardMetadata,
          summary: `审阅 ${sourceLinkedDescriptor.title} 的本地编辑。`,
          diff: `本地富文本草稿与 ${sourceLinkedDescriptor.sourceUri} 不一致。`,
        }))
        toast({ description: 'Ingest 审批已提交' })
      } catch (error) {
        const description = error instanceof Error ? error.message : 'Ingest 审批提交失败'
        toast({ description, variant: 'destructive' })
      }
      return
    }

    if (createAiProposal.isPending) return

    try {
      await createAiProposal.mutateAsync(createAiChangeProposal({
        targetResourceUri: file.uri,
        documentUri: structuredSubjectReturnContext?.documentUri ?? null,
        subject: structuredSubjectReturnContext?.subject ?? file.uri,
        operation: 'replace-content',
        proposedContent: content,
        summary: `AI 修改：${file.name}`,
        diff: 'Staged raw draft differs from the current resource content.',
        reason: 'Submitted from the Files editor sheet.',
        podRootUri: currentPodRootUri,
      }))
      toast({ description: 'AI 修改审批已提交' })
    } catch (error) {
      const description = error instanceof Error ? error.message : 'AI 修改审批提交失败'
      toast({ description, variant: 'destructive' })
    }
  }, [
    createAiProposal,
    createSourceProposal,
    currentPodRootUri,
    file.name,
    file.uri,
    isSourceLinkedEditor,
    rawResource?.content,
    sourceLinkedDescriptor,
    sourceLinkedDescriptorUri,
    stagedSourceText,
    structuredSubjectReturnContext?.documentUri,
    structuredSubjectReturnContext?.subject,
    toast,
  ])

  return {
    metaContent,
    metaTailId,
    rawSourceEditorState,
    richContentState,
    noteTitle: sheetState.noteTitle,
    setNoteTitle,
    bylineItems,
    sheetChrome,
    richEditorContent,
    richEditorWarning: richTextSourceInput.warning,
    contentView: sheetState.contentView,
    setContentView,
    canSaveRichText,
    canUseRichEditor,
    isSourceLinkedEditor,
    sourceLinkedPanel,
    structuredReturnAction,
    returnToSourceStructuredSubject,
    saveRichTextContent,
    saveNoteTitle,
    submitChangeProposal,
    proposalPending: isSourceLinkedEditor ? createSourceProposal.isPending : createAiProposal.isPending,
    proposalLabel: isSourceLinkedEditor ? 'Ingest 审批' : 'AI 修改审批',
  }
}
