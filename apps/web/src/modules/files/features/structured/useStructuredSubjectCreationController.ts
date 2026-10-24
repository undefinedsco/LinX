import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { StructuredCellCommitResult } from '../../domain/structured/structured-table'
import {
  createStructuredSubjectCreationState,
  planStructuredSubjectCreation,
  structuredSubjectDraftFromName,
  projectStructuredSubjectCreationExistingSubjects,
  projectStructuredSubjectCreationFooterModel,
  projectStructuredSubjectCreationReset,
  projectStructuredSubjectCreationSettled,
  projectStructuredSubjectCreationSubmitted,
} from './structured-subject-creation-model'
import {
  type StructuredProjectionTableRow,
} from './structured-projection-table-model'

type StageCellValueChange = (input: {
  subject: string
  predicate: string
  nextValues: string[]
}) => void | Promise<StructuredCellCommitResult | undefined>

export type StructuredCardCreationResult =
  | { kind: 'created'; subject: string }
  | { kind: 'rejected'; reason: 'missing-class' | 'empty-subject' | 'duplicate-subject' }
  /** The row was staged but did not land in the document (no permission yet, or the write failed). */
  | { kind: 'not-written' }

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
  const { pendingSubjects } = subjectCreationState
  const mountedRef = useRef(false)
  const existingSubjects = useMemo(
    () => projectStructuredSubjectCreationExistingSubjects(projectionRows),
    [projectionRows],
  )
  const footerModel = projectStructuredSubjectCreationFooterModel({ classScope })

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
      return
    }
    setSubjectCreationState((current) => projectStructuredSubjectCreationReset(current))
  }, [documentUri])

  useEffect(() => {
    setSubjectCreationState((current) => projectStructuredSubjectCreationSettled(current, existingSubjects, documentUri))
  }, [documentUri, existingSubjects])

  /**
   * Adds a row named by the person (the inline last row, or the title of a new K2 card): the
   * address is made from the name. Resolves once the write has landed, so callers can open it.
   */
  const createSubjectByName = useCallback(async (name: string): Promise<StructuredCardCreationResult> => {
    const plan = planStructuredSubjectCreation({
      classScope,
      documentUri,
      existingSubjects,
      pendingSubjects,
      subjectDraft: structuredSubjectDraftFromName(name),
    })
    if (plan.kind === 'noop') return { kind: 'rejected', reason: plan.reason }
    setSubjectCreationState((current) => projectStructuredSubjectCreationSubmitted({
      current,
      plan,
    }))
    const result = await stageCellValueChange({
      subject: plan.subject,
      predicate: plan.typePredicate,
      nextValues: plan.typeValues,
    })
    return result === 'written' ? { kind: 'created', subject: plan.subject } : { kind: 'not-written' }
  }, [classScope, documentUri, existingSubjects, pendingSubjects, stageCellValueChange])

  /** Adds a row named by the person (the inline last row); false when the name is empty or taken. */
  const addSubjectByName = useCallback((name: string) => {
    const plan = planStructuredSubjectCreation({
      classScope,
      documentUri,
      existingSubjects,
      pendingSubjects,
      subjectDraft: structuredSubjectDraftFromName(name),
    })
    if (plan.kind === 'noop') return false
    void createSubjectByName(name)
    return true
  }, [classScope, createSubjectByName, documentUri, existingSubjects, pendingSubjects])

  return {
    addSubjectByName,
    createSubjectByName,
    footerModel,
    pendingSubjects,
  }
}
