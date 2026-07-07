import {
  createVocabTermProposal,
  type VocabTermProposal,
} from '../../domain/structured/structured-table'
import { classUriFromDraft } from '../../domain/structured/structured-predicate-draft'
import {
  localPredicateLabel,
  resolveLocalVocabTermUri,
} from '../../domain/structured/structured-table-vocab'

export type PendingClassProposal = {
  id: string
  label: string
  uri: string
  status: 'pending' | 'approval-staged'
  vocabProposal?: VocabTermProposal
}

export type StructuredVocabProposalWorkflowState = {
  dismissedReviewableVocabProposalIds: Set<string>
  localReviewableVocabProposals: VocabTermProposal[]
  pendingClassProposals: PendingClassProposal[]
}

export function createStructuredVocabProposalWorkflowState(): StructuredVocabProposalWorkflowState {
  return {
    dismissedReviewableVocabProposalIds: new Set(),
    localReviewableVocabProposals: [],
    pendingClassProposals: [],
  }
}

export function projectStructuredVocabProposalWorkflowStateReset(
  _current: StructuredVocabProposalWorkflowState,
): StructuredVocabProposalWorkflowState {
  return createStructuredVocabProposalWorkflowState()
}

export function projectStagedPendingClassProposalWorkflowState({
  current,
  proposal,
}: {
  current: StructuredVocabProposalWorkflowState
  proposal: PendingClassProposal
}): StructuredVocabProposalWorkflowState {
  return {
    ...current,
    pendingClassProposals: projectStagedPendingClassProposals({
      pendingClassProposals: current.pendingClassProposals,
      proposal,
    }),
  }
}

export function projectStoredLocalReviewableVocabProposalWorkflowState({
  current,
  proposal,
}: {
  current: StructuredVocabProposalWorkflowState
  proposal: VocabTermProposal
}): StructuredVocabProposalWorkflowState {
  return {
    ...current,
    localReviewableVocabProposals: projectStoredLocalReviewableVocabProposals({
      localProposals: current.localReviewableVocabProposals,
      proposal,
    }),
  }
}

export function projectApprovedPendingClassProposalWorkflowState({
  classUri,
  current,
  vocabProposal,
}: {
  classUri: string
  current: StructuredVocabProposalWorkflowState
  vocabProposal: VocabTermProposal
}): StructuredVocabProposalWorkflowState {
  return {
    ...current,
    pendingClassProposals: projectApprovedPendingClassProposal({
      classUri,
      pendingClassProposals: current.pendingClassProposals,
      vocabProposal,
    }),
  }
}

export function projectDiscardedPendingClassProposalWorkflowState({
  classUri,
  current,
  visiblePendingClassProposals,
}: {
  classUri: string
  current: StructuredVocabProposalWorkflowState
  visiblePendingClassProposals: readonly PendingClassProposal[]
}): StructuredVocabProposalWorkflowState {
  const hydratedProposal = projectPendingClassDiscardHydratedVocabProposal({
    classUri,
    visiblePendingClassProposals,
  })

  return {
    ...current,
    dismissedReviewableVocabProposalIds: hydratedProposal
      ? projectDismissedReviewableVocabProposalIds({
          currentIds: current.dismissedReviewableVocabProposalIds,
          proposalId: hydratedProposal.id,
        })
      : current.dismissedReviewableVocabProposalIds,
    pendingClassProposals: projectDiscardedPendingClassProposals({
      classUri,
      pendingClassProposals: current.pendingClassProposals,
    }),
  }
}

export function projectDiscardedReviewableVocabProposalWorkflowState({
  current,
  proposalId,
}: {
  current: StructuredVocabProposalWorkflowState
  proposalId: string
}): StructuredVocabProposalWorkflowState {
  return {
    ...current,
    dismissedReviewableVocabProposalIds: projectDismissedReviewableVocabProposalIds({
      currentIds: current.dismissedReviewableVocabProposalIds,
      proposalId,
    }),
    localReviewableVocabProposals: projectDiscardedReviewableVocabProposals({
      localProposals: current.localReviewableVocabProposals,
      proposalId,
    }),
  }
}

export function projectStructuredReviewableVocabProposals({
  dismissedProposalIds,
  localProposals,
  pendingProposals,
}: {
  dismissedProposalIds: ReadonlySet<string>
  localProposals: readonly VocabTermProposal[]
  pendingProposals: readonly VocabTermProposal[]
}) {
  const proposalsById = new Map<string, VocabTermProposal>()
  for (const proposal of pendingProposals) {
    proposalsById.set(proposal.id, proposal)
  }
  for (const proposal of localProposals) {
    proposalsById.set(proposal.id, proposal)
  }
  return Array.from(proposalsById.values()).filter((proposal) => !dismissedProposalIds.has(proposal.id))
}

export function projectStructuredVisiblePendingClassProposals({
  pendingClassProposals,
  reviewableVocabProposals,
}: {
  pendingClassProposals: readonly PendingClassProposal[]
  reviewableVocabProposals: readonly VocabTermProposal[]
}) {
  const proposalsById = new Map<string, PendingClassProposal>()
  for (const proposal of reviewableVocabProposals) {
    const pendingProposal = pendingClassProposalFromVocabTermProposal(proposal)
    if (pendingProposal) proposalsById.set(pendingProposal.id, pendingProposal)
  }
  for (const proposal of pendingClassProposals) {
    proposalsById.set(proposal.id, proposal)
  }
  return Array.from(proposalsById.values())
}

export function projectStructuredPendingClassScopeProposal({
  selectedClassName,
  visiblePendingClassProposals,
}: {
  selectedClassName?: string | null
  visiblePendingClassProposals: readonly PendingClassProposal[]
}) {
  return selectedClassName
    ? visiblePendingClassProposals.find((proposal) => (
        proposal.uri === selectedClassName || proposal.id === selectedClassName
      ))
    : undefined
}

export function canStagePendingClassProposal({
  classOptions,
  uri,
  visiblePendingClassProposals,
}: {
  classOptions: readonly string[]
  uri: string
  visiblePendingClassProposals: readonly PendingClassProposal[]
}) {
  return !(
    classOptions.some((className) => predicatesShareLocalIdentity(className, uri))
    || visiblePendingClassProposals.some((proposal) => (
      predicatesShareLocalIdentity(proposal.id, uri) || predicatesShareLocalIdentity(proposal.uri, uri)
    ))
  )
}

export function createPendingClassProposalFromDraft({
  classOptions,
  currentPodRootUri,
  documentUri,
  draftUri,
  targetVocabUri,
  visiblePendingClassProposals,
}: {
  classOptions: readonly string[]
  currentPodRootUri?: string | null
  documentUri: string
  draftUri: string
  targetVocabUri?: string | null
  visiblePendingClassProposals: readonly PendingClassProposal[]
}) {
  const uri = classUriFromDraft(draftUri, documentUri, currentPodRootUri, targetVocabUri)
  if (!uri) return null
  if (!canStagePendingClassProposal({ classOptions, uri, visiblePendingClassProposals })) return null
  return createPendingClassProposal(uri)
}

export function createPendingClassProposal(uri: string): PendingClassProposal {
  return {
    id: uri,
    label: localPredicateLabel(uri),
    uri,
    status: 'pending',
  }
}

export function projectStagedPendingClassProposals({
  pendingClassProposals,
  proposal,
}: {
  pendingClassProposals: readonly PendingClassProposal[]
  proposal: PendingClassProposal
}) {
  return [...pendingClassProposals, proposal]
}

export function projectStoredLocalReviewableVocabProposals({
  localProposals,
  proposal,
}: {
  localProposals: readonly VocabTermProposal[]
  proposal: VocabTermProposal
}) {
  return localProposals.some((item) => item.id === proposal.id) ? [...localProposals] : [proposal, ...localProposals]
}

export function projectPendingClassApprovalProposal({
  classUri,
  pendingClassProposals,
}: {
  classUri: string
  pendingClassProposals: readonly PendingClassProposal[]
}) {
  return pendingClassProposals.find((proposal) => proposal.id === classUri)
}

export function createPendingClassApprovalVocabProposal({
  currentPodRootUri,
  documentUri,
  pendingClass,
  targetShapesUri,
  targetVocabUri,
}: {
  currentPodRootUri?: string | null
  documentUri: string
  pendingClass: PendingClassProposal
  targetShapesUri: string
  targetVocabUri: string
}) {
  return createVocabTermProposal({
    documentUri,
    classScope: null,
    termUri: resolveLocalVocabTermUri(
      documentUri,
      labelForPendingClassProposal(pendingClass),
      currentPodRootUri,
      targetVocabUri,
    ),
    termKind: 'class',
    label: pendingClass.label,
    valueType: 'class',
    description: '当前表格只展示这个 class 的 subject。',
    shape: 'rdf:type scope',
    podRootUri: currentPodRootUri,
    targetVocabUri,
    targetShapesUri,
  })
}

export function projectApprovedPendingClassProposal({
  classUri,
  pendingClassProposals,
  vocabProposal,
}: {
  classUri: string
  pendingClassProposals: readonly PendingClassProposal[]
  vocabProposal: VocabTermProposal
}) {
  return pendingClassProposals.map((proposal) => (
    proposal.id === classUri
      ? {
          ...proposal,
          id: vocabProposal.termUri,
          uri: vocabProposal.termUri,
          status: 'approval-staged' as const,
          vocabProposal,
        }
      : proposal
  ))
}

export function projectDiscardedPendingClassProposals({
  classUri,
  pendingClassProposals,
}: {
  classUri: string
  pendingClassProposals: readonly PendingClassProposal[]
}) {
  return pendingClassProposals.filter((proposal) => proposal.id !== classUri)
}

export function projectPendingClassDiscardHydratedVocabProposal({
  classUri,
  visiblePendingClassProposals,
}: {
  classUri: string
  visiblePendingClassProposals: readonly PendingClassProposal[]
}) {
  return visiblePendingClassProposals.find((proposal) => proposal.id === classUri)?.vocabProposal ?? null
}

export function projectDiscardedReviewableVocabProposals({
  localProposals,
  proposalId,
}: {
  localProposals: readonly VocabTermProposal[]
  proposalId: string
}) {
  return localProposals.filter((proposal) => proposal.id !== proposalId)
}

export function projectDismissedReviewableVocabProposalIds({
  currentIds,
  proposalId,
}: {
  currentIds: ReadonlySet<string>
  proposalId: string
}) {
  return new Set(currentIds).add(proposalId)
}

export function labelForPendingClassProposal(proposal: PendingClassProposal) {
  return proposal.label || localPredicateLabel(proposal.uri)
}

function pendingClassProposalFromVocabTermProposal(proposal: VocabTermProposal): PendingClassProposal | null {
  if (proposal.termKind !== 'class') return null
  return {
    id: proposal.termUri,
    label: proposal.label || localPredicateLabel(proposal.termUri),
    uri: proposal.termUri,
    status: 'approval-staged',
    vocabProposal: proposal,
  }
}

function predicatesShareLocalIdentity(left: string, right: string) {
  return left === right || localPredicateLabel(left).toLowerCase() === localPredicateLabel(right).toLowerCase()
}
