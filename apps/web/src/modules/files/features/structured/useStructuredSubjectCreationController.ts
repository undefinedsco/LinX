import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import {
  canSubmitStructuredSubjectCreation,
  createStructuredSubjectCreationState,
  planStructuredSubjectCreation,
  projectStructuredSubjectCreationDialogModel,
  projectStructuredSubjectCreationDraftPatch,
  projectStructuredSubjectCreationExistingSubjects,
  projectStructuredSubjectCreationFooterModel,
  projectStructuredSubjectCreationOpenPatch,
  projectStructuredSubjectCreationOpened,
  projectStructuredSubjectCreationReset,
  projectStructuredSubjectCreationSubmitted,
} from './structured-subject-creation-model'
import {
  type StructuredProjectionTableRow,
} from './structured-projection-table-model'

type StageCellValueChange = (input: {
  subject: string
  predicate: string
  nextValues: string[]
}) => void

export function useStructuredSubjectCreationController({
  classScope,
  documentUri,
  projectionRows,
  stageCellValueChange,
}: {
  classScope?: string | null
  documentUri: string
  projectionRows: readonly Pick<StructuredProjectionTableRow, 'subject'>[]
  stageCellValueChange: StageCellValueChange
}) {
  const [subjectCreationState, setSubjectCreationState] = useState(createStructuredSubjectCreationState)
  const { createSubjectOpen, pendingSubjects, subjectDraft } = subjectCreationState
  const mountedRef = useRef(false)
  const existingSubjects = useMemo(
    () => projectStructuredSubjectCreationExistingSubjects(projectionRows),
    [projectionRows],
  )
  const submitDisabled = !canSubmitStructuredSubjectCreation({
    classScope,
    existingSubjects,
    pendingSubjects,
    subjectDraft,
  })
  const footerModel = projectStructuredSubjectCreationFooterModel({ classScope })
  const dialogModel = projectStructuredSubjectCreationDialogModel({ classScope })

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    setSubjectCreationState((current) => projectStructuredSubjectCreationReset(current))
  }, [documentUri])

  const openCreateSubjectDialog = useCallback(() => {
    if (!classScope) return
    setSubjectCreationState((current) => projectStructuredSubjectCreationOpened({
      current,
      existingSubjects,
    }))
  }, [classScope, existingSubjects])

  const submitCreateSubjectProposal = useCallback(() => {
    const plan = planStructuredSubjectCreation({
      classScope,
      existingSubjects,
      pendingSubjects,
      subjectDraft,
    })
    if (plan.kind === 'noop') return
    setSubjectCreationState((current) => projectStructuredSubjectCreationSubmitted({
      current,
      plan,
    }))
    stageCellValueChange({
      subject: plan.subject,
      predicate: plan.typePredicate,
      nextValues: plan.typeValues,
    })
  }, [classScope, existingSubjects, pendingSubjects, stageCellValueChange, subjectDraft])

  const setCreateSubjectOpen = useCallback((nextCreateSubjectOpen: boolean) => {
    setSubjectCreationState((current) => projectStructuredSubjectCreationOpenPatch({
      current,
      createSubjectOpen: nextCreateSubjectOpen,
    }))
  }, [])

  const setSubjectDraft = useCallback((nextSubjectDraft: string) => {
    setSubjectCreationState((current) => projectStructuredSubjectCreationDraftPatch({
      current,
      subjectDraft: nextSubjectDraft,
    }))
  }, [])

  const handleSubjectDraftKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    submitCreateSubjectProposal()
  }, [submitCreateSubjectProposal])

  return {
    createSubjectOpen,
    dialogModel,
    footerModel,
    handleSubjectDraftKeyDown,
    openCreateSubjectDialog,
    pendingSubjects,
    setCreateSubjectOpen,
    setSubjectDraft,
    subjectDraft,
    submitDisabled,
    submitCreateSubjectProposal,
  }
}
