import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { StructuredCellCommitResult, StructuredCellWriteProposal } from '../../domain/structured/structured-table'
import { documentCellKey, sameStructuredCellValues } from '../../domain/structured/structured-table-cell-model'
import {
  createStructuredSaveState,
  projectStructuredSaveFailed,
  projectStructuredSaveFinished,
  projectStructuredSaveSettled,
  projectStructuredSaveStarted,
} from './structured-save-state-model'
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
  onCommitCellWriteProposal?: (proposal: StructuredCellWriteProposal) => StructuredCellCommitResult | Promise<StructuredCellCommitResult>
  onLocalCellWriteProposalsChange?: (proposals: StructuredCellWriteProposal[]) => void
  onPendingWriteSubjectsChange?: (subjects: string[]) => void
  persistedCellWriteProposals: readonly StructuredCellWriteProposal[]
}) {
  const [cellWriteProposalWorkflowState, setCellWriteProposalWorkflowState] = useState(
    createStructuredCellWriteProposalWorkflowState,
  )
  const { cellValueOverrides, cellWriteProposals } = cellWriteProposalWorkflowState
  // R6 K6d: 保存中 / 已保存 / 没保存成功 重试 for the last cell edit.
  const [saveState, setSaveState] = useState(createStructuredSaveState)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current) }, [])

  useEffect(() => {
    setCellWriteProposalWorkflowState((current) => projectStructuredCellWriteProposalWorkflowReset(current))
  }, [documentUri])

  const persistedCellWriteProposalByKey = useMemo(() => (
    buildStructuredPersistedCellWriteProposalByKey({
      documentUri,
      persistedCellWriteProposals,
    })
  ), [documentUri, persistedCellWriteProposals])

  /** Resolves with the commit result (undefined when nothing was committed) so callers can wait for the write. */
  const stageCellWriteProposal = useCallback((proposal: StructuredCellWriteProposal): Promise<StructuredCellCommitResult | undefined> => {
    if (sameStructuredCellValues(proposal.previousValues, proposal.nextValues)) return Promise.resolve(undefined)
    const key = documentCellKey(proposal.documentUri, proposal.subject, proposal.predicate)
    if (settleTimer.current) clearTimeout(settleTimer.current)
    if (onCommitCellWriteProposal) setSaveState((current) => projectStructuredSaveStarted(current))
    setCellWriteProposalWorkflowState((current) => projectStructuredCellWriteProposalWorkflowStaged({
      current,
      key,
      proposal,
    }))
    return Promise.resolve(onCommitCellWriteProposal?.(proposal)).then((saved) => {
      if (onCommitCellWriteProposal) {
        if (saved === false) {
          setSaveState((current) => projectStructuredSaveFailed(current, proposal))
        } else {
          setSaveState((current) => projectStructuredSaveFinished(current))
          settleTimer.current = setTimeout(() => setSaveState((current) => projectStructuredSaveSettled(current)), 2000)
        }
      }
      // Not saved, or written straight into the document (the data is already
      // re-read by then): either way there is no draft or pending marker left.
      if (saved === false || saved === 'written') {
        setCellWriteProposalWorkflowState((current) => projectStructuredCellWriteProposalWorkflowDiscarded({
          current,
          key,
        }))
        return saved
      }
      setCellWriteProposalWorkflowState((current) => projectStructuredCellWriteProposalWorkflowApprovalStaged({
        current,
        key,
      }))
      return saved
    })
  }, [onCommitCellWriteProposal])

  const retryFailedWrite = useCallback(() => {
    const failed = saveState.failedProposal
    if (failed) stageCellWriteProposal(failed)
  }, [saveState.failedProposal, stageCellWriteProposal])

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
    retryFailedWrite,
    saveState,
    stageCellWriteProposal,
  }
}
