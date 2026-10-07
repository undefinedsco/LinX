import type { SourceUpdateProposal } from '../../domain/source/source-approval-model'
import type { StructuredTableProjection } from '../../domain/structured/structured-table'

export interface StructuredSourceUpdateWorkflowModel {
  sourceUpdateProposalsForTableBySubject: Record<string, SourceUpdateProposal>
  resourceUpdateSubjects: Set<string>
  resourceUpdateFilteredProjection: StructuredTableProjection
}

export type StructuredSourceUpdateWorkflowState = {
  sourceUpdatesOnly: boolean
  sourceUpdateProposalsBySubject: Record<string, SourceUpdateProposal>
}

export function createStructuredSourceUpdateWorkflowState(): StructuredSourceUpdateWorkflowState {
  return {
    sourceUpdatesOnly: false,
    sourceUpdateProposalsBySubject: {},
  }
}

export function projectStructuredSourceUpdateWorkflowReset(
  _current?: StructuredSourceUpdateWorkflowState,
): StructuredSourceUpdateWorkflowState {
  return createStructuredSourceUpdateWorkflowState()
}

export function projectStructuredSourceUpdateWorkflowSourceUpdatesOnly({
  current,
  sourceUpdatesOnly,
}: {
  current: StructuredSourceUpdateWorkflowState
  sourceUpdatesOnly: boolean
}): StructuredSourceUpdateWorkflowState {
  return {
    ...current,
    sourceUpdatesOnly,
  }
}

export function projectStructuredSourceUpdateWorkflowProposals({
  current,
  proposalsBySubject,
}: {
  current: StructuredSourceUpdateWorkflowState
  proposalsBySubject: Record<string, SourceUpdateProposal>
}): StructuredSourceUpdateWorkflowState {
  return {
    ...current,
    sourceUpdateProposalsBySubject: proposalsBySubject,
  }
}

export function mergeStructuredSourceUpdateProposalsBySubject({
  localProposalsBySubject,
  pendingProposals,
}: {
  localProposalsBySubject: Record<string, SourceUpdateProposal>
  pendingProposals: readonly SourceUpdateProposal[]
}) {
  const proposalsBySubject: Record<string, SourceUpdateProposal> = { ...localProposalsBySubject }
  for (const proposal of pendingProposals) {
    if (!proposal.subject) continue
    const current = proposalsBySubject[proposal.subject]
    if (!current || Date.parse(proposal.createdAt) >= Date.parse(current.createdAt)) {
      proposalsBySubject[proposal.subject] = proposal
    }
  }
  return proposalsBySubject
}

export function projectStructuredSourceUpdateWorkflowModel({
  localProposalsBySubject,
  pendingProposals,
  projection,
  sourceUpdatesOnly,
}: {
  localProposalsBySubject: Record<string, SourceUpdateProposal>
  pendingProposals: readonly SourceUpdateProposal[]
  projection: StructuredTableProjection
  sourceUpdatesOnly: boolean
}): StructuredSourceUpdateWorkflowModel {
  const sourceUpdateProposalsForTableBySubject = mergeStructuredSourceUpdateProposalsBySubject({
    localProposalsBySubject,
    pendingProposals,
  })
  const resourceUpdateSubjects = new Set(Object.keys(sourceUpdateProposalsForTableBySubject))
  const resourceUpdateFilteredProjection = sourceUpdatesOnly
    ? {
        ...projection,
        rows: projection.rows.filter((row) => resourceUpdateSubjects.has(row.subject)),
      }
    : projection

  return {
    resourceUpdateFilteredProjection,
    resourceUpdateSubjects,
    sourceUpdateProposalsForTableBySubject,
  }
}
