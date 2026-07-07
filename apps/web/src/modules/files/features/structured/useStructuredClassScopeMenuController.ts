import { useCallback, useEffect, useState } from 'react'
import {
  createStructuredClassScopeMenuState,
  projectStructuredClassScopeMenuCreateOpenToggle,
  projectStructuredClassScopeMenuDefinitionOpenToggle,
  projectStructuredClassScopeMenuDraftUri,
  projectStructuredClassScopeMenuSubmittedDraft,
} from './structured-class-scope-menu-model'

export function useStructuredClassScopeMenuController({
  documentUri,
  onCreatePendingClassProposal,
}: {
  documentUri: string
  onCreatePendingClassProposal: (draftUri: string) => boolean
}) {
  const [classScopeMenuState, setClassScopeMenuState] = useState(createStructuredClassScopeMenuState)

  useEffect(() => {
    setClassScopeMenuState(createStructuredClassScopeMenuState())
  }, [documentUri])

  const updateClassDraftUri = useCallback((value: string) => {
    setClassScopeMenuState((current) => projectStructuredClassScopeMenuDraftUri({
      current,
      value,
    }))
  }, [])

  const toggleClassCreateOpen = useCallback(() => {
    setClassScopeMenuState(projectStructuredClassScopeMenuCreateOpenToggle)
  }, [])

  const toggleClassDefinitionOpen = useCallback(() => {
    setClassScopeMenuState(projectStructuredClassScopeMenuDefinitionOpenToggle)
  }, [])

  const submitClassDraft = useCallback(() => {
    const saved = onCreatePendingClassProposal(classScopeMenuState.classDraftUri)
    setClassScopeMenuState((current) => projectStructuredClassScopeMenuSubmittedDraft({
      current,
      saved,
    }))
  }, [classScopeMenuState.classDraftUri, onCreatePendingClassProposal])

  return {
    classCreateOpen: classScopeMenuState.classCreateOpen,
    classDefinitionOpen: classScopeMenuState.classDefinitionOpen,
    classDraftUri: classScopeMenuState.classDraftUri,
    submitClassDraft,
    toggleClassCreateOpen,
    toggleClassDefinitionOpen,
    updateClassDraftUri,
  }
}
