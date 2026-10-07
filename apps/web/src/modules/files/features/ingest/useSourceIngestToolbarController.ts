import { useCallback, useState } from 'react'

import { useFilesStore } from '../../app/store'
import { useCreateSourceIngest, useSelectedFilesLocation } from '../../data/queries'
import {
  SOURCE_INGEST_KIND_OPTIONS,
  createSourceIngestToolbarState,
  planSourceIngestSubmit,
  projectSourceIngestContainerUri,
  projectSourceIngestToolbarChrome,
  projectSourceIngestToolbarDraftPatch,
  projectSourceIngestToolbarFeedback,
  projectSourceIngestToolbarKindValue,
  projectSourceIngestToolbarOpenChanged,
  projectSourceIngestToolbarSubmitFailed,
  projectSourceIngestToolbarSubmitStarted,
  projectSourceIngestToolbarSubmitSucceeded,
} from './source-ingest-toolbar-model'

export function useSourceIngestToolbarController() {
  const selectedTreeNodeId = useFilesStore((state) => state.selectedTreeNodeId)
  const location = useSelectedFilesLocation(selectedTreeNodeId)
  const createIngest = useCreateSourceIngest()
  const selectFile = useFilesStore((state) => state.selectFile)
  const [toolbarState, setToolbarState] = useState(createSourceIngestToolbarState)
  const containerUri = projectSourceIngestContainerUri(location)
  const submitPlan = planSourceIngestSubmit({
    containerUri,
    draft: toolbarState.draft,
    isPending: createIngest.isPending,
  })
  const canIngest = Boolean(submitPlan)
  const chrome = projectSourceIngestToolbarChrome({
    containerUri,
    isPending: createIngest.isPending,
  })
  const feedback = projectSourceIngestToolbarFeedback({
    createdTargetUri: toolbarState.feedback.createdTargetUri,
    errorMessage: toolbarState.feedback.errorMessage,
    open: toolbarState.open,
  })

  const setOpen = useCallback((open: boolean) => {
    setToolbarState((current) => projectSourceIngestToolbarOpenChanged({ current, open }))
  }, [])

  const setSourceUri = useCallback((sourceUri: string) => {
    setToolbarState((current) => projectSourceIngestToolbarDraftPatch({
      current,
      patch: { sourceUri },
    }))
  }, [])

  const setTitle = useCallback((title: string) => {
    setToolbarState((current) => projectSourceIngestToolbarDraftPatch({
      current,
      patch: { title },
    }))
  }, [])

  const setSourceKindValue = useCallback((value: string) => {
    setToolbarState((current) => projectSourceIngestToolbarKindValue({ current, value }))
  }, [])

  const submitIngest = async () => {
    if (!submitPlan) return
    setToolbarState((current) => projectSourceIngestToolbarSubmitStarted(current))
    try {
      const plan = await createIngest.mutateAsync(submitPlan)
      selectFile(plan.targetResourceUri)
      setToolbarState((current) => projectSourceIngestToolbarSubmitSucceeded({
        current,
        targetResourceUri: plan.targetResourceUri,
      }))
    } catch (error) {
      setToolbarState((current) => projectSourceIngestToolbarSubmitFailed({ current, error }))
    }
  }

  return {
    open: toolbarState.open,
    setOpen,
    sourceUri: toolbarState.draft.sourceUri,
    setSourceUri,
    title: toolbarState.draft.title,
    setTitle,
    sourceKind: toolbarState.draft.sourceKind,
    sourceKindOptions: SOURCE_INGEST_KIND_OPTIONS,
    setSourceKind: setSourceKindValue,
    feedback,
    chrome,
    containerUri,
    canIngest,
    isPending: createIngest.isPending,
    submitIngest,
  }
}
