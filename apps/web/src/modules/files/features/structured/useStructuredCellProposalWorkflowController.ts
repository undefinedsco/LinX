import { useCallback, useEffect, useMemo, useState } from 'react'

import { useToast } from '@/components/ui/use-toast'

import {
  useCreateStructuredCellChangeProposal,
  usePendingStructuredCellChangeProposals,
} from '../../data/queries'
import { createStructuredCellChangeProposal } from '../../domain/proposal/structured-cell-approval-model'
import { FilesSaveConflictError } from '../../domain/resource/resource-model'
import {
  type StructuredCellWriteProposal,
} from '../../domain/structured/structured-table'
import {
  createStructuredCellProposalWorkflowState,
  projectAllStructuredPendingWriteSubjects,
  projectEffectiveStructuredCellWriteProposals,
  projectPersistedStructuredCellWriteProposals,
  projectPersistedStructuredPendingWriteSubjects,
  projectStructuredCellProposalWorkflowStateReset,
  projectStructuredCellProposalWorkflowStateTableProposals,
  projectStructuredCellProposalWorkflowStateTableSubjects,
  projectStructuredCellProposalWorkflowStateViewProposal,
} from './structured-cell-proposal-workflow-model'

export function useStructuredCellProposalWorkflowController({
  currentPodRootUri,
  documentUri,
  structuredWritesSupported,
}: {
  currentPodRootUri?: string | null
  documentUri: string
  structuredWritesSupported: boolean
}) {
  const createCellProposal = useCreateStructuredCellChangeProposal()
  const pendingStructuredCellProposalsQuery = usePendingStructuredCellChangeProposals(documentUri, structuredWritesSupported)
  const { toast } = useToast()
  const [cellProposalWorkflowState, setCellProposalWorkflowState] = useState(createStructuredCellProposalWorkflowState)
  const {
    localCellWriteProposals,
    localPendingWriteSubjects,
    localViewCellWriteProposals,
  } = cellProposalWorkflowState
  const persistedCellWriteProposals = useMemo(
    () => projectPersistedStructuredCellWriteProposals(pendingStructuredCellProposalsQuery.data),
    [pendingStructuredCellProposalsQuery.data],
  )
  const effectiveCellWriteProposals = useMemo(() => (
    projectEffectiveStructuredCellWriteProposals({
      localCellWriteProposals,
      localViewCellWriteProposals,
      persistedCellWriteProposals,
    })
  ), [localCellWriteProposals, localViewCellWriteProposals, persistedCellWriteProposals])
  const persistedPendingWriteSubjects = useMemo(() => (
    projectPersistedStructuredPendingWriteSubjects(persistedCellWriteProposals)
  ), [persistedCellWriteProposals])
  const allPendingWriteSubjects = useMemo(() => (
    projectAllStructuredPendingWriteSubjects({
      localPendingWriteSubjects,
      persistedPendingWriteSubjects,
    })
  ), [localPendingWriteSubjects, persistedPendingWriteSubjects])

  useEffect(() => {
    setCellProposalWorkflowState((current) => projectStructuredCellProposalWorkflowStateReset(current))
  }, [documentUri])

  const setLocalPendingWriteSubjectsFromTable = useCallback((subjects: string[]) => {
    setCellProposalWorkflowState((current) => projectStructuredCellProposalWorkflowStateTableSubjects({
      current,
      subjects,
    }))
  }, [])

  const syncLocalCellWriteProposalsFromTable = useCallback((proposals: StructuredCellWriteProposal[]) => {
    setCellProposalWorkflowState((current) => projectStructuredCellProposalWorkflowStateTableProposals({
      current,
      proposals,
    }))
  }, [])

  const commitCellWriteProposal = useCallback(async (proposal: StructuredCellWriteProposal) => {
    try {
      await createCellProposal.mutateAsync(createStructuredCellChangeProposal({
        documentUri: proposal.documentUri,
        subject: proposal.subject,
        predicate: proposal.predicate,
        vocabTermProposalResourceUri: proposal.vocabTermProposalResourceUri,
        previousValues: proposal.previousValues,
        nextValues: proposal.nextValues,
        reason: 'Structured cell change staged from Files table.',
        podRootUri: currentPodRootUri,
      }))
      toast({ description: '单元格变更已提交审批' })
      return true
    } catch (error) {
      const description = error instanceof FilesSaveConflictError
        ? '审批记录已存在：请打开现有审批记录继续审阅。'
        : error instanceof Error
          ? error.message
          : '创建单元格变更审批失败'
      toast({ description, variant: 'destructive' })
      return false
    }
  }, [createCellProposal, currentPodRootUri, toast])

  const commitViewCellWriteProposal = useCallback(async (proposal: StructuredCellWriteProposal) => {
    const saved = await commitCellWriteProposal(proposal)
    if (saved !== false) {
      setCellProposalWorkflowState((current) => projectStructuredCellProposalWorkflowStateViewProposal({
        current,
        proposal,
      }))
    }
    return saved
  }, [commitCellWriteProposal])

  return {
    allPendingWriteSubjects,
    commitCellWriteProposal,
    commitViewCellWriteProposal,
    effectiveCellWriteProposals,
    persistedCellWriteProposals,
    setLocalPendingWriteSubjectsFromTable,
    syncLocalCellWriteProposalsFromTable,
  }
}
