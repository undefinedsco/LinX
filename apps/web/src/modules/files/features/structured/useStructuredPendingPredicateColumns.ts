import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AiColumnChange } from '../../domain/proposal/ai-column-change-model'
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
  projectConfirmedStructuredPendingPredicateColumnsState,
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
  aiColumns,
  classScope,
  currentPodRootUri,
  documentUri,
  onConfirmVocabTerm,
  onCreateVocabTermProposal,
  onKeepAiColumn,
  onRemoveAiColumn,
  projectionPredicates,
  reviewableVocabProposals,
  targetShapesUri,
  targetVocabUri,
  vocabDefinitionIndex,
}: {
  aiColumns?: ReadonlyMap<string, AiColumnChange>
  onKeepAiColumn?: (change: AiColumnChange) => void
  onRemoveAiColumn?: (change: AiColumnChange) => void
  classScope?: string | null
  currentPodRootUri?: string | null
  documentUri: string
  /** The person's own column goes straight into the vocabulary; only LinX's columns wait for approval. */
  onConfirmVocabTerm?: (proposal: VocabTermProposal, options?: { resolveRecord?: boolean }) => boolean | Promise<boolean>
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
      aiColumns,
      classScope,
      dismissedHydratedPredicateProposalIds,
      documentUri,
      pendingPredicateProposals,
      projectionPredicates,
      reviewableVocabProposals,
    })
  ), [aiColumns, classScope, dismissedHydratedPredicateProposalIds, documentUri, pendingPredicateProposals, projectionPredicates, reviewableVocabProposals])

  const pendingProposalByPredicate = useMemo(
    () => projectStructuredPendingPredicateProposalByPredicate(visiblePendingPredicateProposals),
    [visiblePendingPredicateProposals],
  )
  /** The names of the person's own new columns that the table has not listed yet (cells are labelled with them). */
  const confirmedLabelByPredicate = useMemo(
    () => new Map(visiblePendingPredicateProposals
      .filter((proposal) => proposal.status === 'confirmed')
      .map((proposal) => [proposal.id, { label: proposal.label }] as const)),
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

  const confirmPendingPredicate = useCallback((proposal: StructuredPredicateColumnProposal) => {
    if (!onConfirmVocabTerm) return
    // An older column still has its approval record: keep that record's identity and close it.
    const existingRecord = proposal.vocabProposal
    const vocabProposal = existingRecord ?? createStructuredPendingPredicateApprovalProposal({
      documentUri,
      classScope: classScope ?? null,
      currentPodRootUri,
      proposal,
      targetShapesUri,
      targetVocabUri,
    })
    // Optimistic: the column is usable at once; it goes away again if the vocabulary refuses it.
    setPendingPredicateColumnsState((current) => projectConfirmedStructuredPendingPredicateColumnsState({
      current,
      proposal,
      hydratedProposalId: existingRecord ? existingRecord.id : null,
    }))
    void Promise.resolve(onConfirmVocabTerm(vocabProposal, { resolveRecord: !!existingRecord })).then((saved) => {
      if (saved) return
      setPendingPredicateColumnsState((current) => projectDiscardedStructuredPendingPredicateColumnsState({
        current,
        predicate: proposal.id,
        visiblePendingPredicateProposals: [],
      }))
    })
  }, [classScope, currentPodRootUri, documentUri, onConfirmVocabTerm, targetShapesUri, targetVocabUri])

  const stagePendingPredicateApproval = useCallback((proposal: StructuredPredicateColumnProposal) => {
    if (onConfirmVocabTerm) {
      confirmPendingPredicate(proposal)
      return
    }
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
  }, [classScope, confirmPendingPredicate, currentPodRootUri, documentUri, onConfirmVocabTerm, onCreateVocabTermProposal, targetShapesUri, targetVocabUri])

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
    const aiColumn = findStructuredVisiblePendingPredicateProposal({ predicate, visiblePendingPredicateProposals })?.aiColumn
    if (aiColumn) {
      onKeepAiColumn?.(aiColumn)
      // 保留这列: an unconfirmed column becomes a real property in the vocabulary; a column added
      // under a grant only needs its mark cleared.
      if (aiColumn.state === 'unconfirmed') {
        const hydrated = findStructuredVisiblePendingPredicateProposal({ predicate, visiblePendingPredicateProposals })
        if (hydrated && !hydrated.vocabProposal) stagePendingPredicateApproval(hydrated)
      }
      return
    }
    // 保留这列 on a column made earlier (its approval record may still be waiting in the inbox).
    const proposal = projectPendingPredicateApprovalProposal({
      pendingPredicateProposals,
      predicate,
    }) ?? findStructuredVisiblePendingPredicateProposal({ predicate, visiblePendingPredicateProposals })
    if (!proposal || proposal.status === 'confirmed') return
    stagePendingPredicateApproval(proposal)
  }, [onKeepAiColumn, pendingPredicateProposals, stagePendingPredicateApproval, visiblePendingPredicateProposals])

  const discardPendingPredicateProposal = useCallback((predicate: string) => {
    const aiColumn = findStructuredVisiblePendingPredicateProposal({ predicate, visiblePendingPredicateProposals })?.aiColumn
    if (aiColumn) onRemoveAiColumn?.(aiColumn)
    setPendingPredicateColumnsState((current) => projectDiscardedStructuredPendingPredicateColumnsState({
      current,
      predicate,
      visiblePendingPredicateProposals,
    }))
  }, [onRemoveAiColumn, visiblePendingPredicateProposals])

  const getPredicateDefinition = useCallback((predicate: string) => (
    projectStructuredPendingPredicateDefinition({
      predicate,
      visiblePendingPredicateProposals,
      vocabDefinitionIndex,
    })
  ), [visiblePendingPredicateProposals, vocabDefinitionIndex])

  return {
    approvePendingPredicateProposal,
    confirmedLabelByPredicate,
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
