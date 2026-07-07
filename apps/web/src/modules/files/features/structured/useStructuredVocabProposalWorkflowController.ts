import { useCallback, useEffect, useMemo, useState } from 'react'

import { useToast } from '@/components/ui/use-toast'

import { openFilesExternalUri } from '../../app/platform-actions'
import {
  useCreateVocabTermProposalInboxApproval,
  usePendingVocabTermProposals,
} from '../../data/queries'
import { FilesSaveConflictError } from '../../domain/resource/resource-model'
import {
  type VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  createStructuredVocabProposalWorkflowState,
  createPendingClassApprovalVocabProposal,
  createPendingClassProposalFromDraft,
  projectApprovedPendingClassProposalWorkflowState,
  projectDiscardedPendingClassProposalWorkflowState,
  projectDiscardedReviewableVocabProposalWorkflowState,
  projectPendingClassApprovalProposal,
  projectStagedPendingClassProposalWorkflowState,
  projectStoredLocalReviewableVocabProposalWorkflowState,
  projectStructuredPendingClassScopeProposal,
  projectStructuredReviewableVocabProposals,
  projectStructuredVocabProposalWorkflowStateReset,
  projectStructuredVisiblePendingClassProposals,
} from './structured-vocab-proposal-workflow-model'

export function useStructuredVocabProposalWorkflowController({
  classOptions,
  currentPodRootUri,
  documentUri,
  selectedClassName,
  structuredWritesSupported,
  targetShapesUri,
  targetVocabUri,
}: {
  classOptions: readonly string[]
  currentPodRootUri?: string | null
  documentUri: string
  selectedClassName?: string | null
  structuredWritesSupported: boolean
  targetShapesUri: string
  targetVocabUri: string
}) {
  const createInboxApproval = useCreateVocabTermProposalInboxApproval()
  const pendingVocabTermProposalsQuery = usePendingVocabTermProposals(documentUri, structuredWritesSupported)
  const { toast } = useToast()
  const [vocabProposalWorkflowState, setVocabProposalWorkflowState] = useState(createStructuredVocabProposalWorkflowState)
  const {
    dismissedReviewableVocabProposalIds,
    localReviewableVocabProposals,
    pendingClassProposals,
  } = vocabProposalWorkflowState

  const reviewableVocabProposals = useMemo(
    () => projectStructuredReviewableVocabProposals({
      dismissedProposalIds: dismissedReviewableVocabProposalIds,
      localProposals: localReviewableVocabProposals,
      pendingProposals: pendingVocabTermProposalsQuery.data ?? [],
    }),
    [dismissedReviewableVocabProposalIds, localReviewableVocabProposals, pendingVocabTermProposalsQuery.data],
  )

  const visiblePendingClassProposals = useMemo(
    () => projectStructuredVisiblePendingClassProposals({
      pendingClassProposals,
      reviewableVocabProposals,
    }),
    [pendingClassProposals, reviewableVocabProposals],
  )

  const pendingClassScopeProposal = useMemo(
    () => projectStructuredPendingClassScopeProposal({
      selectedClassName,
      visiblePendingClassProposals,
    }),
    [selectedClassName, visiblePendingClassProposals],
  )

  useEffect(() => {
    setVocabProposalWorkflowState((current) => projectStructuredVocabProposalWorkflowStateReset(current))
  }, [documentUri])

  const createVocabProposalResource = useCallback(async (proposal: VocabTermProposal) => {
    try {
      await createInboxApproval.mutateAsync(proposal)
      setVocabProposalWorkflowState((current) => projectStoredLocalReviewableVocabProposalWorkflowState({
        current,
        proposal,
      }))
      toast({ description: '词表变更已创建' })
      return true
    } catch (error) {
      const description = error instanceof FilesSaveConflictError
        ? '审批记录已存在：请打开现有审批记录继续审阅。'
        : error instanceof Error
          ? error.message
          : '创建词表变更失败'
      toast({ description, variant: 'destructive' })
      return false
    }
  }, [createInboxApproval, toast])

  const createPendingClassProposal = useCallback((draftUri: string) => {
    const pendingClass = createPendingClassProposalFromDraft({
      classOptions,
      currentPodRootUri,
      documentUri,
      draftUri,
      targetVocabUri,
      visiblePendingClassProposals,
    })
    if (!pendingClass) return false
    setVocabProposalWorkflowState((current) => projectStagedPendingClassProposalWorkflowState({
      current,
      proposal: pendingClass,
    }))
    return true
  }, [classOptions, currentPodRootUri, documentUri, targetVocabUri, visiblePendingClassProposals])

  const approvePendingClassProposal = useCallback((classUri: string) => {
    const pendingClass = projectPendingClassApprovalProposal({
      classUri,
      pendingClassProposals,
    })
    if (!pendingClass) return
    const vocabProposal = createPendingClassApprovalVocabProposal({
      currentPodRootUri,
      documentUri,
      pendingClass,
      targetVocabUri,
      targetShapesUri,
    })
    void createVocabProposalResource(vocabProposal).then((saved) => {
      if (!saved) return
      setVocabProposalWorkflowState((current) => projectApprovedPendingClassProposalWorkflowState({
        classUri,
        current,
        vocabProposal,
      }))
    })
  }, [createVocabProposalResource, currentPodRootUri, documentUri, pendingClassProposals, targetShapesUri, targetVocabUri])

  const discardPendingClassProposal = useCallback((classUri: string) => {
    setVocabProposalWorkflowState((current) => projectDiscardedPendingClassProposalWorkflowState({
      classUri,
      current,
      visiblePendingClassProposals,
    }))
  }, [visiblePendingClassProposals])

  const reviewVocabProposal = useCallback((proposal: VocabTermProposal) => {
    openFilesExternalUri(proposal.proposalResourceUri)
  }, [])

  const discardReviewableVocabProposal = useCallback((proposal: VocabTermProposal) => {
    setVocabProposalWorkflowState((current) => projectDiscardedReviewableVocabProposalWorkflowState({
      current,
      proposalId: proposal.id,
    }))
  }, [])

  return {
    approvePendingClassProposal,
    createPendingClassProposal,
    createVocabProposalResource,
    discardPendingClassProposal,
    discardReviewableVocabProposal,
    openClassProposal: openFilesExternalUri,
    pendingClassScopeProposal,
    reviewVocabProposal,
    reviewableVocabProposals,
    visiblePendingClassProposals,
  }
}
