import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  type StructuredVocabDefinitionIndex,
  type VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  createStructuredPendingPredicateColumnsState,
  createStructuredPendingPredicateApprovalProposal,
  createStructuredPendingPredicateColumnProposalFromDraft,
  findStructuredVisiblePendingPredicateProposal,
  projectApprovedStructuredPendingPredicateColumnsState,
  projectDiscardedStructuredPendingPredicateColumnsState,
  projectPendingPredicateApprovalProposal,
  projectStagedStructuredPendingPredicateColumnsState,
  projectStructuredPendingPredicateColumnsStateReset,
  projectStructuredPendingPredicateDefinition,
  projectStructuredPendingPredicateIds,
  projectStructuredPendingPredicateProposalByPredicate,
  projectStructuredVisiblePendingPredicateProposals,
  resolveVocabTermProposalResourceUriForPredicate,
  type StructuredPendingPredicateDefinitionDraft,
} from './structured-pending-predicate-columns-model'
import type { StructuredPredicateColumnProposal } from './structured-predicate-column-header-model'

export function useStructuredPendingPredicateColumns({
  classScope,
  currentPodRootUri,
  documentUri,
  onCreateVocabTermProposal,
  projectionPredicates,
  reviewableVocabProposals,
  targetShapesUri,
  targetVocabUri,
  vocabDefinitionIndex,
}: {
  classScope?: string | null
  currentPodRootUri?: string | null
  documentUri: string
  onCreateVocabTermProposal?: (proposal: VocabTermProposal) => boolean | Promise<boolean>
  projectionPredicates: readonly string[]
  reviewableVocabProposals: readonly VocabTermProposal[]
  targetShapesUri?: string | null
  targetVocabUri?: string | null
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex
}) {
  const [pendingPredicateColumnsState, setPendingPredicateColumnsState] = useState(createStructuredPendingPredicateColumnsState)
  const {
    dismissedHydratedPredicateProposalIds,
    pendingPredicateProposals,
  } = pendingPredicateColumnsState

  useEffect(() => {
    setPendingPredicateColumnsState((current) => projectStructuredPendingPredicateColumnsStateReset(current))
  }, [documentUri])

  const visiblePendingPredicateProposals = useMemo(() => (
    projectStructuredVisiblePendingPredicateProposals({
      classScope,
      dismissedHydratedPredicateProposalIds,
      documentUri,
      pendingPredicateProposals,
      projectionPredicates,
      reviewableVocabProposals,
    })
  ), [classScope, dismissedHydratedPredicateProposalIds, documentUri, pendingPredicateProposals, projectionPredicates, reviewableVocabProposals])

  const pendingProposalByPredicate = useMemo(
    () => projectStructuredPendingPredicateProposalByPredicate(visiblePendingPredicateProposals),
    [visiblePendingPredicateProposals],
  )
  const pendingPredicateIds = useMemo(
    () => projectStructuredPendingPredicateIds(visiblePendingPredicateProposals),
    [visiblePendingPredicateProposals],
  )

  const findVisiblePendingPredicateProposal = useCallback((predicate: string) => (
    findStructuredVisiblePendingPredicateProposal({
      predicate,
      visiblePendingPredicateProposals,
    })
  ), [visiblePendingPredicateProposals])

  const vocabTermProposalResourceUriForPredicate = useCallback((predicate: string) => (
    resolveVocabTermProposalResourceUriForPredicate({
      pendingProposalByPredicate,
      predicate,
      visiblePendingPredicateProposals,
    })
  ), [pendingProposalByPredicate, visiblePendingPredicateProposals])

  const stagePendingPredicateApproval = useCallback((proposal: StructuredPredicateColumnProposal) => {
    if (!onCreateVocabTermProposal) return
    const vocabProposal = createStructuredPendingPredicateApprovalProposal({
      documentUri,
      classScope: classScope ?? null,
      currentPodRootUri,
      proposal,
      targetShapesUri,
      targetVocabUri,
    })
    void Promise.resolve(onCreateVocabTermProposal(vocabProposal)).then((saved) => {
      if (!saved) return
      setPendingPredicateColumnsState((current) => projectApprovedStructuredPendingPredicateColumnsState({
        current,
        proposalId: proposal.id,
        vocabProposal,
      }))
    })
  }, [classScope, currentPodRootUri, documentUri, onCreateVocabTermProposal, targetShapesUri, targetVocabUri])

  const createPendingPredicateProposal = useCallback((draft: StructuredPendingPredicateDefinitionDraft) => {
    const pendingProposal = createStructuredPendingPredicateColumnProposalFromDraft({
      currentPodRootUri,
      documentUri,
      draft,
      projectionPredicates,
      targetVocabUri,
      visiblePendingPredicateProposals,
      vocabNamespaces: vocabDefinitionIndex?.namespaces,
    })
    if (!pendingProposal) return
    setPendingPredicateColumnsState((current) => projectStagedStructuredPendingPredicateColumnsState({
      current,
      proposal: pendingProposal,
    }))
    stagePendingPredicateApproval(pendingProposal)
  }, [currentPodRootUri, documentUri, projectionPredicates, stagePendingPredicateApproval, targetVocabUri, visiblePendingPredicateProposals, vocabDefinitionIndex?.namespaces])

  const approvePendingPredicateProposal = useCallback((predicate: string) => {
    const proposal = projectPendingPredicateApprovalProposal({
      pendingPredicateProposals,
      predicate,
    })
    if (!proposal) return
    stagePendingPredicateApproval(proposal)
  }, [pendingPredicateProposals, stagePendingPredicateApproval])

  const discardPendingPredicateProposal = useCallback((predicate: string) => {
    setPendingPredicateColumnsState((current) => projectDiscardedStructuredPendingPredicateColumnsState({
      current,
      predicate,
      visiblePendingPredicateProposals,
    }))
  }, [visiblePendingPredicateProposals])

  const getPredicateDefinition = useCallback((predicate: string) => (
    projectStructuredPendingPredicateDefinition({
      predicate,
      visiblePendingPredicateProposals,
      vocabDefinitionIndex,
    })
  ), [visiblePendingPredicateProposals, vocabDefinitionIndex])

  return {
    approvePendingPredicateProposal,
    createPendingPredicateProposal,
    discardPendingPredicateProposal,
    findVisiblePendingPredicateProposal,
    getPredicateDefinition,
    pendingPredicateIds,
    pendingProposalByPredicate,
    visiblePendingPredicateProposals,
    vocabTermProposalResourceUriForPredicate,
  }
}
