import { useCallback, useEffect, useState } from 'react'

import { useToast } from '@/components/ui/use-toast'

import { useSaveRawTextResource } from '../../data/queries'
import {
  canSubmitFileEditorRawSourceProposal,
  createFileEditorRawSourceDraftState,
  getFileEditorRawSourceResource,
  getFileEditorRawSourceSaveErrorMessage,
  isFileEditorRawSourceDirty,
  planFileEditorRawSourceSave,
  projectFileEditorRawSourceChrome,
  projectFileEditorRawSourceDraftPatch,
  projectFileEditorRawSourceHydration,
  type FileEditorRawSourceState,
} from './file-editor-raw-source-model'

export function useFileEditorRawSourceController({
  sourceState,
  onDirtyChange,
  onSavePendingChange,
  onSubmitProposal,
  proposalPending = false,
  proposalLabel,
}: {
  sourceState: FileEditorRawSourceState
  onDirtyChange?: (dirty: boolean) => void
  onSavePendingChange?: (pending: boolean) => void
  onSubmitProposal?: (content: string) => Promise<void>
  proposalPending?: boolean
  proposalLabel?: string
}) {
  const { toast } = useToast()
  const saveRaw = useSaveRawTextResource()
  const rawResource = getFileEditorRawSourceResource(sourceState)
  const [draftState, setDraftState] = useState(() => createFileEditorRawSourceDraftState(rawResource))

  useEffect(() => {
    setDraftState((current) => projectFileEditorRawSourceHydration({
      current,
      rawResource,
    }))
  }, [rawResource])

  const draft = draftState.draft
  const dirty = isFileEditorRawSourceDirty({ rawResource, draft })
  const chrome = projectFileEditorRawSourceChrome({
    sourceState,
    proposalLabel,
    savePending: saveRaw.isPending,
  })

  useEffect(() => {
    onDirtyChange?.(dirty)
    return () => onDirtyChange?.(false)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    onSavePendingChange?.(saveRaw.isPending)
    return () => onSavePendingChange?.(false)
  }, [onSavePendingChange, saveRaw.isPending])

  const handleSave = useCallback(async () => {
    const savePlan = planFileEditorRawSourceSave({ rawResource, draft })
    if (!savePlan) return

    try {
      await saveRaw.mutateAsync({
        resource: savePlan.resource,
        content: savePlan.content,
      })
      toast({ description: savePlan.successMessage })
    } catch (error) {
      toast({
        description: getFileEditorRawSourceSaveErrorMessage(error),
        variant: 'destructive',
      })
    }
  }, [draft, rawResource, saveRaw, toast])

  const handleSubmitProposal = useCallback(async () => {
    const canSubmit = canSubmitFileEditorRawSourceProposal({
      hasSubmitHandler: !!onSubmitProposal,
      dirty,
      proposalPending,
    })
    if (!canSubmit) return

    await onSubmitProposal?.(draft)
  }, [dirty, draft, onSubmitProposal, proposalPending])

  const setDraft = useCallback((nextDraft: string) => {
    setDraftState((current) => projectFileEditorRawSourceDraftPatch({
      current,
      draft: nextDraft,
    }))
  }, [])

  return {
    dirty,
    draft,
    chrome,
    handleSave,
    handleSubmitProposal,
    savePending: saveRaw.isPending,
    setDraft,
  }
}
