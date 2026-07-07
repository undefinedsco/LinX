import {
  createVocabTermProposal,
  type StructuredVocabDefinitionIndex,
  type StructuredVocabPredicateDefinition,
  type VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  enumOptionsFromDraft,
  enumOptionsFromShape,
  predicateLabelFromDraft,
  predicateReferenceUriFromDraft,
  predicateShapeFromDraft,
  predicateUriFromDraft,
  type PredicateDefinitionDraft,
} from '../../domain/structured/structured-predicate-draft'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'
import type { StructuredPredicateColumnProposal } from './structured-predicate-column-header-model'

export type StructuredPendingPredicateDefinitionDraft = PredicateDefinitionDraft

export type StructuredPendingPredicateColumnsState = {
  dismissedHydratedPredicateProposalIds: Set<string>
  pendingPredicateProposals: StructuredPredicateColumnProposal[]
}

export function createStructuredPendingPredicateColumnsState(): StructuredPendingPredicateColumnsState {
  return {
    dismissedHydratedPredicateProposalIds: new Set(),
    pendingPredicateProposals: [],
  }
}

export function projectStructuredPendingPredicateColumnsStateReset(
  _current: StructuredPendingPredicateColumnsState,
): StructuredPendingPredicateColumnsState {
  return createStructuredPendingPredicateColumnsState()
}

export function projectStagedStructuredPendingPredicateColumnsState({
  current,
  proposal,
}: {
  current: StructuredPendingPredicateColumnsState
  proposal: StructuredPredicateColumnProposal
}): StructuredPendingPredicateColumnsState {
  return {
    ...current,
    pendingPredicateProposals: projectStagedPendingPredicateProposals({
      pendingPredicateProposals: current.pendingPredicateProposals,
      proposal,
    }),
  }
}

export function projectApprovedStructuredPendingPredicateColumnsState({
  current,
  proposalId,
  vocabProposal,
}: {
  current: StructuredPendingPredicateColumnsState
  proposalId: string
  vocabProposal: VocabTermProposal
}): StructuredPendingPredicateColumnsState {
  return {
    ...current,
    pendingPredicateProposals: projectApprovedStructuredPendingPredicateProposals({
      pendingPredicateProposals: current.pendingPredicateProposals,
      proposalId,
      vocabProposal,
    }),
  }
}

export function projectDiscardedStructuredPendingPredicateColumnsState({
  current,
  predicate,
  visiblePendingPredicateProposals,
}: {
  current: StructuredPendingPredicateColumnsState
  predicate: string
  visiblePendingPredicateProposals: readonly StructuredPredicateColumnProposal[]
}): StructuredPendingPredicateColumnsState {
  const hydratedProposal = projectPendingPredicateDiscardHydratedVocabProposal({
    predicate,
    visiblePendingPredicateProposals,
  })

  return {
    dismissedHydratedPredicateProposalIds: hydratedProposal
      ? projectDismissedHydratedPredicateProposalIds({
          currentIds: current.dismissedHydratedPredicateProposalIds,
          proposalId: hydratedProposal.id,
        })
      : current.dismissedHydratedPredicateProposalIds,
    pendingPredicateProposals: projectDiscardedPendingPredicateProposals({
      pendingPredicateProposals: current.pendingPredicateProposals,
      predicate,
    }),
  }
}

export function projectStructuredVisiblePendingPredicateProposals({
  classScope,
  dismissedHydratedPredicateProposalIds,
  documentUri,
  pendingPredicateProposals,
  projectionPredicates,
  reviewableVocabProposals,
}: {
  classScope?: string | null
  dismissedHydratedPredicateProposalIds: ReadonlySet<string>
  documentUri: string
  pendingPredicateProposals: readonly StructuredPredicateColumnProposal[]
  projectionPredicates: readonly string[]
  reviewableVocabProposals: readonly VocabTermProposal[]
}) {
  const proposalsById = new Map<string, StructuredPredicateColumnProposal>()
  for (const proposal of reviewableVocabProposals) {
    if (proposal.documentUri !== documentUri || dismissedHydratedPredicateProposalIds.has(proposal.id)) continue
    const pendingProposal = pendingPredicateProposalFromVocabTermProposal(proposal, classScope)
    if (pendingProposal) {
      const columnId = predicateColumnIdForProposal(proposal, projectionPredicates)
      proposalsById.set(columnId, { ...pendingProposal, id: columnId })
    }
  }
  for (const proposal of pendingPredicateProposals) {
    proposalsById.set(proposal.id, proposal)
  }
  return Array.from(proposalsById.values())
}

export function projectStructuredPendingPredicateProposalByPredicate(
  visiblePendingPredicateProposals: readonly StructuredPredicateColumnProposal[],
) {
  return new Map(visiblePendingPredicateProposals.map((proposal) => [proposal.id, proposal]))
}

export function projectStructuredPendingPredicateIds(
  visiblePendingPredicateProposals: readonly StructuredPredicateColumnProposal[],
) {
  return visiblePendingPredicateProposals.map((proposal) => proposal.id)
}

export function findStructuredVisiblePendingPredicateProposal({
  predicate,
  visiblePendingPredicateProposals,
}: {
  predicate: string
  visiblePendingPredicateProposals: readonly StructuredPredicateColumnProposal[]
}) {
  return visiblePendingPredicateProposals.find((proposal) => (
    predicatesShareLocalIdentity(proposal.id, predicate)
    || predicatesShareLocalIdentity(proposal.uri, predicate)
    || (!!proposal.predicateUri && predicatesShareLocalIdentity(proposal.predicateUri, predicate))
  ))
}

export function resolveVocabTermProposalResourceUriForPredicate({
  pendingProposalByPredicate,
  predicate,
  visiblePendingPredicateProposals,
}: {
  pendingProposalByPredicate: ReadonlyMap<string, StructuredPredicateColumnProposal>
  predicate: string
  visiblePendingPredicateProposals: readonly StructuredPredicateColumnProposal[]
}) {
  const direct = pendingProposalByPredicate.get(predicate)?.vocabProposal?.proposalResourceUri
  if (direct) return direct
  return findStructuredVisiblePendingPredicateProposal({
    predicate,
    visiblePendingPredicateProposals,
  })?.vocabProposal?.proposalResourceUri
}

export function createStructuredPendingPredicateColumnProposalFromDraft({
  currentPodRootUri,
  documentUri,
  draft,
  projectionPredicates,
  targetVocabUri,
  visiblePendingPredicateProposals,
  vocabNamespaces,
}: {
  currentPodRootUri?: string | null
  documentUri: string
  draft: PredicateDefinitionDraft
  projectionPredicates: readonly string[]
  targetVocabUri?: string | null
  visiblePendingPredicateProposals: readonly StructuredPredicateColumnProposal[]
  vocabNamespaces?: ReadonlyMap<string, string>
}): StructuredPredicateColumnProposal | null {
  const termUri = predicateUriFromDraft(draft, documentUri, vocabNamespaces, currentPodRootUri, targetVocabUri)
  if (!termUri) return null
  const predicateUri = predicateReferenceUriFromDraft(draft, vocabNamespaces)
  const columnId = predicateUri || termUri
  if (
    visiblePendingPredicateProposals.some((proposal) => (
      predicatesShareLocalIdentity(proposal.id, columnId)
      || predicatesShareLocalIdentity(proposal.uri, termUri)
      || (!!predicateUri && !!proposal.predicateUri && predicatesShareLocalIdentity(proposal.predicateUri, predicateUri))
    ))
    || projectionPredicates.some((predicate) => predicatesShareLocalIdentity(predicate, columnId))
  ) return null

  const label = predicateLabelFromDraft(draft, termUri)
  return {
    id: columnId,
    label,
    uri: termUri,
    ...(predicateUri ? { predicateUri } : {}),
    type: draft.type,
    description: draft.description.trim() || 'Local field proposal; vocabulary is unchanged until approval.',
    shape: predicateShapeFromDraft(draft),
    enumOptions: enumOptionsFromDraft(draft),
    status: 'pending',
  }
}

export function createStructuredPendingPredicateApprovalProposal({
  classScope,
  currentPodRootUri,
  documentUri,
  proposal,
  targetShapesUri,
  targetVocabUri,
}: {
  classScope?: string | null
  currentPodRootUri?: string | null
  documentUri: string
  proposal: StructuredPredicateColumnProposal
  targetShapesUri?: string | null
  targetVocabUri?: string | null
}) {
  return createVocabTermProposal({
    documentUri,
    classScope: classScope ?? null,
    termUri: proposal.uri,
    termKind: 'predicate',
    label: proposal.label,
    valueType: proposal.type,
    description: proposal.description,
    shape: proposal.shape,
    predicate: proposal.predicateUri,
    podRootUri: currentPodRootUri,
    targetVocabUri: targetVocabUri ?? undefined,
    targetShapesUri: targetShapesUri ?? undefined,
  })
}

export function projectStagedPendingPredicateProposals({
  pendingPredicateProposals,
  proposal,
}: {
  pendingPredicateProposals: readonly StructuredPredicateColumnProposal[]
  proposal: StructuredPredicateColumnProposal
}) {
  return [...pendingPredicateProposals, proposal]
}

export function projectApprovedStructuredPendingPredicateProposals({
  pendingPredicateProposals,
  proposalId,
  vocabProposal,
}: {
  pendingPredicateProposals: readonly StructuredPredicateColumnProposal[]
  proposalId: string
  vocabProposal: VocabTermProposal
}) {
  return pendingPredicateProposals.map((candidate) => (
    candidate.id === proposalId
      ? {
          ...candidate,
          id: vocabProposal.predicate ?? vocabProposal.termUri,
          uri: vocabProposal.termUri,
          ...(vocabProposal.predicate ? { predicateUri: vocabProposal.predicate } : {}),
          status: 'approval-staged' as const,
          vocabProposal,
        }
      : candidate
  ))
}

export function projectPendingPredicateApprovalProposal({
  pendingPredicateProposals,
  predicate,
}: {
  pendingPredicateProposals: readonly StructuredPredicateColumnProposal[]
  predicate: string
}) {
  return pendingPredicateProposals.find((proposal) => (
    predicatesShareLocalIdentity(proposal.id, predicate)
    || predicatesShareLocalIdentity(proposal.uri, predicate)
    || (!!proposal.predicateUri && predicatesShareLocalIdentity(proposal.predicateUri, predicate))
  ))
}

export function projectDiscardedPendingPredicateProposals({
  pendingPredicateProposals,
  predicate,
}: {
  pendingPredicateProposals: readonly StructuredPredicateColumnProposal[]
  predicate: string
}) {
  return pendingPredicateProposals.filter((proposal) => !(
    predicatesShareLocalIdentity(proposal.id, predicate)
    || predicatesShareLocalIdentity(proposal.uri, predicate)
    || (!!proposal.predicateUri && predicatesShareLocalIdentity(proposal.predicateUri, predicate))
  ))
}

export function projectPendingPredicateDiscardHydratedVocabProposal({
  predicate,
  visiblePendingPredicateProposals,
}: {
  predicate: string
  visiblePendingPredicateProposals: readonly StructuredPredicateColumnProposal[]
}) {
  return findStructuredVisiblePendingPredicateProposal({
    predicate,
    visiblePendingPredicateProposals,
  })?.vocabProposal
}

export function projectDismissedHydratedPredicateProposalIds({
  currentIds,
  proposalId,
}: {
  currentIds: ReadonlySet<string>
  proposalId: string
}) {
  return new Set(currentIds).add(proposalId)
}

export function projectStructuredPendingPredicateDefinition({
  predicate,
  visiblePendingPredicateProposals,
  vocabDefinitionIndex,
}: {
  predicate: string
  visiblePendingPredicateProposals: readonly StructuredPredicateColumnProposal[]
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex
}): StructuredVocabPredicateDefinition | undefined {
  return (
    vocabDefinitionIndex?.predicates.get(predicate)
    ?? vocabDefinitionIndex?.predicates.get(localPredicateLabel(predicate))
    ?? (() => {
      const proposal = findStructuredVisiblePendingPredicateProposal({
        predicate,
        visiblePendingPredicateProposals,
      })
      return proposal ? {
        uri: proposal.predicateUri ?? proposal.uri,
        label: proposal.label,
        description: proposal.description,
        status: proposal.status,
        valueType: proposal.type,
        shape: proposal.shape,
        ...(proposal.predicateUri ? { predicateUri: proposal.predicateUri } : {}),
        shapeRules: [],
      } satisfies StructuredVocabPredicateDefinition : undefined
    })()
  )
}

function pendingPredicateProposalFromVocabTermProposal(
  proposal: VocabTermProposal,
  classScope?: string | null,
): StructuredPredicateColumnProposal | null {
  if (proposal.termKind !== 'predicate') return null
  if (proposal.classScope && classScope && proposal.classScope !== classScope && localPredicateLabel(proposal.classScope) !== localPredicateLabel(classScope)) {
    return null
  }
  return {
    id: proposal.predicate ?? proposal.termUri,
    label: proposal.label || localPredicateLabel(proposal.termUri),
    uri: proposal.termUri,
    ...(proposal.predicate ? { predicateUri: proposal.predicate } : {}),
    type: proposal.valueType || 'text',
    description: proposal.description,
    shape: proposal.shape,
    enumOptions: enumOptionsFromShape(proposal.shape),
    status: 'approval-staged',
    vocabProposal: proposal,
  }
}

function predicateColumnIdForProposal(
  proposal: VocabTermProposal,
  projectionPredicates: readonly string[],
) {
  const predicateReference = proposal.predicate ?? proposal.termUri
  return projectionPredicates.find((predicate) => predicatesShareLocalIdentity(predicate, predicateReference)) ?? predicateReference
}

function predicatesShareLocalIdentity(left: string, right: string) {
  return left === right || localPredicateLabel(left) === localPredicateLabel(right)
}
