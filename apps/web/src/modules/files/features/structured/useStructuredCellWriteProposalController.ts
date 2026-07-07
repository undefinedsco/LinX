import { useCallback, useEffect, useMemo, useState } from 'react'
import type { StructuredCellWriteProposal } from '../../domain/structured/structured-table'
import { documentCellKey, sameStructuredCellValues } from '../../domain/structured/structured-table-cell-model'
import {
  buildStructuredPersistedCellWriteProposalByKey,
  createStructuredCellWriteProposalWorkflowState,
  projectStructuredCellWriteProposalWorkflowApprovalStaged,
  projectStructuredCellWriteProposalWorkflowDiscarded,
  projectStructuredCellWriteProposalWorkflowReset,
  projectStructuredCellWriteProposalWorkflowStaged,
  projectStructuredCellWriteState,
  projectStructuredLocalCellWriteProposals,
  projectStructuredPendingWriteSubjectList,
  projectStructuredPendingWriteSubjects,
  resolveStructuredCellWriteValues,
  type StructuredCellWriteState,
} from './structured-cell-write-proposal-model'

export type { StructuredCellWriteState } from './structured-cell-write-proposal-model'

export function useStructuredCellWriteProposalController({
  documentUri,
  onCommitCellWriteProposal,
  onLocalCellWriteProposalsChange,
  onPendingWriteSubjectsChange,
  persistedCellWriteProposals,
}: {
  documentUri: string
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => boolean | Promise<boolean>
  onLocalCellWriteProposalsChange?: (proposals: StructuredCellWriteProposal[]) => void
  onPendingWriteSubjectsChange?: (subjects: string[]) => void
  persistedCellWriteProposals: readonly StructuredCellWriteProposal[]
}) {
  const [cellWriteProposalWorkflowState, setCellWriteProposalWorkflowState] = useState(
    createStructuredCellWriteProposalWorkflowState,
  )
  const { cellValueOverrides, cellWriteProposals } = cellWriteProposalWorkflowState

  useEffect(() => {
    setCellWriteProposalWorkflowState((current) => projectStructuredCellWriteProposalWorkflowReset(current))
  }, [documentUri])

  const persistedCellWriteProposalByKey = useMemo(() => (
    buildStructuredPersistedCellWriteProposalByKey({
      documentUri,
      persistedCellWriteProposals,
    })
  ), [documentUri, persistedCellWriteProposals])

  const stageCellWriteProposal = useCallback((proposal: StructuredCellWriteProposal) => {
    if (sameStructuredCellValues(proposal.previousValues, proposal.nextValues)) return
    const key = documentCellKey(proposal.documentUri, proposal.subject, proposal.predicate)
    setCellWriteProposalWorkflowState((current) => projectStructuredCellWriteProposalWorkflowStaged({
      current,
      key,
      proposal,
    }))
    void Promise.resolve(onCommitCellWriteProposal?.(proposal)).then((saved) => {
      if (saved === false) {
        setCellWriteProposalWorkflowState((current) => projectStructuredCellWriteProposalWorkflowDiscarded({
          current,
          key,
        }))
        return
      }
      setCellWriteProposalWorkflowState((current) => projectStructuredCellWriteProposalWorkflowApprovalStaged({
        current,
        key,
      }))
    })
  }, [onCommitCellWriteProposal])

  const discardCellDraft = useCallback((subject: string, predicate: string) => {
    const key = documentCellKey(documentUri, subject, predicate)
    setCellWriteProposalWorkflowState((current) => projectStructuredCellWriteProposalWorkflowDiscarded({
      current,
      key,
    }))
  }, [documentUri])

  const resolveCellValues = useCallback(({
    originalValues,
    predicate,
    subject,
  }: {
    originalValues: readonly string[]
    predicate: string
    subject: string
  }) => {
    return resolveStructuredCellWriteValues({
      cellValueOverrides,
      cellWriteProposals,
      documentUri,
      originalValues,
      persistedCellWriteProposalByKey,
      predicate,
      subject,
    })
  }, [cellValueOverrides, cellWriteProposals, documentUri, persistedCellWriteProposalByKey])

  const getCellWriteState = useCallback((subject: string, predicate: string): StructuredCellWriteState => {
    return projectStructuredCellWriteState({
      cellWriteProposals,
      documentUri,
      persistedCellWriteProposalByKey,
      predicate,
      subject,
    })
  }, [cellWriteProposals, documentUri, persistedCellWriteProposalByKey])

  const pendingWriteSubjects = useMemo(() => (
    projectStructuredPendingWriteSubjects({
      cellWriteProposals,
      persistedCellWriteProposalByKey,
    })
  ), [cellWriteProposals, persistedCellWriteProposalByKey])

  const localCellWriteProposals = useMemo(
    () => projectStructuredLocalCellWriteProposals(cellWriteProposals),
    [cellWriteProposals],
  )

  useEffect(() => {
    onPendingWriteSubjectsChange?.(projectStructuredPendingWriteSubjectList(pendingWriteSubjects))
  }, [onPendingWriteSubjectsChange, pendingWriteSubjects])

  useEffect(() => {
    onLocalCellWriteProposalsChange?.(localCellWriteProposals)
  }, [localCellWriteProposals, onLocalCellWriteProposalsChange])

  return {
    discardCellDraft,
    getCellWriteState,
    localCellWriteProposals,
    pendingWriteSubjects,
    persistedCellWriteProposalByKey,
    resolveCellValues,
    stageCellWriteProposal,
  }
}
