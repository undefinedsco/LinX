import type { StructuredCellChangeProposal } from '../../domain/proposal/structured-cell-approval-model'
import type { StructuredCellWriteProposal } from '../../domain/structured/structured-table'
import {
  documentCellKey,
  structuredCellChangeProposalToWriteProposal,
} from '../../domain/structured/structured-table-cell-model'

export type StructuredCellProposalWorkflowState = {
  localCellWriteProposals: StructuredCellWriteProposal[]
  localPendingWriteSubjects: Set<string>
  localViewCellWriteProposals: StructuredCellWriteProposal[]
}

export function createStructuredCellProposalWorkflowState(): StructuredCellProposalWorkflowState {
  return {
    localCellWriteProposals: [],
    localPendingWriteSubjects: new Set(),
    localViewCellWriteProposals: [],
  }
}

export function projectStructuredCellProposalWorkflowStateReset(
  _current: StructuredCellProposalWorkflowState,
): StructuredCellProposalWorkflowState {
  return createStructuredCellProposalWorkflowState()
}

export function projectStructuredCellProposalWorkflowStateTableSubjects({
  current,
  subjects,
}: {
  current: StructuredCellProposalWorkflowState
  subjects: readonly string[]
}): StructuredCellProposalWorkflowState {
  return {
    ...current,
    localPendingWriteSubjects: projectStructuredLocalPendingWriteSubjectsFromTable({
      current: current.localPendingWriteSubjects,
      subjects,
    }),
  }
}

export function projectStructuredCellProposalWorkflowStateTableProposals({
  current,
  proposals,
}: {
  current: StructuredCellProposalWorkflowState
  proposals: readonly StructuredCellWriteProposal[]
}): StructuredCellProposalWorkflowState {
  return {
    ...current,
    localCellWriteProposals: projectStructuredLocalCellWriteProposalsFromTable({
      current: current.localCellWriteProposals,
      proposals,
    }),
  }
}

export function projectStructuredCellProposalWorkflowStateViewProposal({
  current,
  proposal,
}: {
  current: StructuredCellProposalWorkflowState
  proposal: StructuredCellWriteProposal
}): StructuredCellProposalWorkflowState {
  return {
    ...current,
    localViewCellWriteProposals: upsertStructuredLocalViewCellWriteProposal({
      current: current.localViewCellWriteProposals,
      proposal,
    }),
  }
}

export function projectPersistedStructuredCellWriteProposals(
  pendingStructuredCellProposals: readonly StructuredCellChangeProposal[] | null | undefined,
) {
  return (pendingStructuredCellProposals ?? []).map(structuredCellChangeProposalToWriteProposal)
}

export function projectEffectiveStructuredCellWriteProposals({
  localCellWriteProposals,
  localViewCellWriteProposals,
  persistedCellWriteProposals,
}: {
  persistedCellWriteProposals: readonly StructuredCellWriteProposal[]
  localCellWriteProposals: readonly StructuredCellWriteProposal[]
  localViewCellWriteProposals: readonly StructuredCellWriteProposal[]
}) {
  return [
    ...persistedCellWriteProposals,
    ...localCellWriteProposals,
    ...localViewCellWriteProposals,
  ]
}

export function projectPersistedStructuredPendingWriteSubjects(
  persistedCellWriteProposals: readonly StructuredCellWriteProposal[],
) {
  return new Set(persistedCellWriteProposals.map((proposal) => proposal.subject))
}

export function projectAllStructuredPendingWriteSubjects({
  localPendingWriteSubjects,
  persistedPendingWriteSubjects,
}: {
  persistedPendingWriteSubjects: ReadonlySet<string>
  localPendingWriteSubjects: ReadonlySet<string>
}) {
  return new Set([
    ...persistedPendingWriteSubjects,
    ...localPendingWriteSubjects,
  ])
}

export function projectStructuredLocalPendingWriteSubjectsFromTable({
  current,
  subjects,
}: {
  current: Set<string>
  subjects: readonly string[]
}): Set<string> {
  if (current.size === subjects.length && subjects.every((subject) => current.has(subject))) return current
  return new Set(subjects)
}

export function projectStructuredLocalCellWriteProposalsFromTable({
  current,
  proposals,
}: {
  current: readonly StructuredCellWriteProposal[]
  proposals: readonly StructuredCellWriteProposal[]
}): StructuredCellWriteProposal[] {
  if (current.length === proposals.length && current.every((proposal, index) => proposal === proposals[index])) {
    return current as StructuredCellWriteProposal[]
  }
  return [...proposals]
}

export function upsertStructuredLocalViewCellWriteProposal({
  current,
  proposal,
}: {
  current: readonly StructuredCellWriteProposal[]
  proposal: StructuredCellWriteProposal
}) {
  const proposalKey = documentCellKey(proposal.documentUri, proposal.subject, proposal.predicate)
  return [
    ...current.filter((item) => documentCellKey(item.documentUri, item.subject, item.predicate) !== proposalKey),
    proposal,
  ]
}
