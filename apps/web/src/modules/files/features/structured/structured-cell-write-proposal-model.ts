import type { StructuredCellWriteProposal } from '../../domain/structured/structured-table'
import { documentCellKey } from '../../domain/structured/structured-table-cell-model'

export type StructuredCellWriteProposalStatus = 'pending' | 'approval-staged'

export type StructuredCellWriteProposalDraft = {
  proposal: StructuredCellWriteProposal
  status: StructuredCellWriteProposalStatus
}

export type StructuredCellWriteProposalWorkflowState = {
  cellValueOverrides: Record<string, string[]>
  cellWriteProposals: Record<string, StructuredCellWriteProposalDraft>
}

export type StructuredCellWriteState = {
  proposal?: StructuredCellWriteProposal
  persistedProposal?: StructuredCellWriteProposal
  status?: StructuredCellWriteProposalStatus
  hasProposal: boolean
}

export function buildStructuredPersistedCellWriteProposalByKey({
  documentUri,
  persistedCellWriteProposals,
}: {
  documentUri: string
  persistedCellWriteProposals: readonly StructuredCellWriteProposal[]
}) {
  const proposalMap = new Map<string, StructuredCellWriteProposal>()
  for (const proposal of persistedCellWriteProposals) {
    if (proposal.documentUri !== documentUri) continue
    proposalMap.set(documentCellKey(proposal.documentUri, proposal.subject, proposal.predicate), proposal)
  }
  return proposalMap
}

export function createStructuredCellWriteProposalWorkflowState(): StructuredCellWriteProposalWorkflowState {
  return {
    cellValueOverrides: {},
    cellWriteProposals: {},
  }
}

export function projectStructuredCellWriteProposalWorkflowReset(
  _current: StructuredCellWriteProposalWorkflowState,
): StructuredCellWriteProposalWorkflowState {
  return createStructuredCellWriteProposalWorkflowState()
}

export function projectStructuredStagedCellValueOverrides({
  current,
  key,
  nextValues,
}: {
  current: Record<string, string[]>
  key: string
  nextValues: readonly string[]
}) {
  return {
    ...current,
    [key]: [...nextValues],
  }
}

export function projectStructuredStagedCellWriteProposals({
  current,
  key,
  proposal,
}: {
  current: Record<string, StructuredCellWriteProposalDraft>
  key: string
  proposal: StructuredCellWriteProposal
}) {
  return {
    ...current,
    [key]: { proposal, status: 'pending' as const },
  }
}

export function projectStructuredDiscardedCellValueOverrides({
  current,
  key,
}: {
  current: Record<string, string[]>
  key: string
}) {
  if (!(key in current)) return current
  const next = { ...current }
  delete next[key]
  return next
}

export function projectStructuredDiscardedCellWriteProposals({
  current,
  key,
}: {
  current: Record<string, StructuredCellWriteProposalDraft>
  key: string
}) {
  if (!(key in current)) return current
  const next = { ...current }
  delete next[key]
  return next
}

export function projectStructuredApprovalStagedCellWriteProposals({
  current,
  key,
}: {
  current: Record<string, StructuredCellWriteProposalDraft>
  key: string
}) {
  const draft = current[key]
  if (!draft) return current
  return {
    ...current,
    [key]: { ...draft, status: 'approval-staged' as const },
  }
}

export function projectStructuredCellWriteProposalWorkflowStaged({
  current,
  key,
  proposal,
}: {
  current: StructuredCellWriteProposalWorkflowState
  key: string
  proposal: StructuredCellWriteProposal
}): StructuredCellWriteProposalWorkflowState {
  return {
    cellValueOverrides: projectStructuredStagedCellValueOverrides({
      current: current.cellValueOverrides,
      key,
      nextValues: proposal.nextValues,
    }),
    cellWriteProposals: projectStructuredStagedCellWriteProposals({
      current: current.cellWriteProposals,
      key,
      proposal,
    }),
  }
}

export function projectStructuredCellWriteProposalWorkflowDiscarded({
  current,
  key,
}: {
  current: StructuredCellWriteProposalWorkflowState
  key: string
}): StructuredCellWriteProposalWorkflowState {
  return {
    cellValueOverrides: projectStructuredDiscardedCellValueOverrides({
      current: current.cellValueOverrides,
      key,
    }),
    cellWriteProposals: projectStructuredDiscardedCellWriteProposals({
      current: current.cellWriteProposals,
      key,
    }),
  }
}

export function projectStructuredCellWriteProposalWorkflowApprovalStaged({
  current,
  key,
}: {
  current: StructuredCellWriteProposalWorkflowState
  key: string
}): StructuredCellWriteProposalWorkflowState {
  return {
    ...current,
    cellWriteProposals: projectStructuredApprovalStagedCellWriteProposals({
      current: current.cellWriteProposals,
      key,
    }),
  }
}

export function resolveStructuredCellWriteValues({
  cellValueOverrides,
  cellWriteProposals,
  documentUri,
  originalValues,
  persistedCellWriteProposalByKey,
  predicate,
  subject,
}: {
  documentUri: string
  subject: string
  predicate: string
  originalValues: readonly string[]
  cellValueOverrides: Record<string, string[]>
  cellWriteProposals: Record<string, StructuredCellWriteProposalDraft>
  persistedCellWriteProposalByKey: ReadonlyMap<string, StructuredCellWriteProposal>
}) {
  const key = documentCellKey(documentUri, subject, predicate)
  const proposalDraft = cellWriteProposals[key]
  const persistedProposal = persistedCellWriteProposalByKey.get(key)
  return cellValueOverrides[key]
    ?? (proposalDraft?.status === 'pending' ? proposalDraft.proposal.nextValues : undefined)
    ?? persistedProposal?.nextValues
    ?? [...originalValues]
}

export function projectStructuredCellWriteState({
  cellWriteProposals,
  documentUri,
  persistedCellWriteProposalByKey,
  predicate,
  subject,
}: {
  documentUri: string
  subject: string
  predicate: string
  cellWriteProposals: Record<string, StructuredCellWriteProposalDraft>
  persistedCellWriteProposalByKey: ReadonlyMap<string, StructuredCellWriteProposal>
}): StructuredCellWriteState {
  const key = documentCellKey(documentUri, subject, predicate)
  const proposal = cellWriteProposals[key]?.proposal
  const persistedProposal = persistedCellWriteProposalByKey.get(key)
  const status = cellWriteProposals[key]?.status ?? (persistedProposal ? 'approval-staged' : undefined)
  return {
    proposal,
    persistedProposal,
    status,
    hasProposal: !!proposal || !!persistedProposal,
  }
}

export function projectStructuredPendingWriteSubjects({
  cellWriteProposals,
  persistedCellWriteProposalByKey,
}: {
  cellWriteProposals: Record<string, StructuredCellWriteProposalDraft>
  persistedCellWriteProposalByKey: ReadonlyMap<string, StructuredCellWriteProposal>
}) {
  return new Set([
    ...Object.values(cellWriteProposals).map((draft) => draft.proposal.subject),
    ...Array.from(persistedCellWriteProposalByKey.values()).map((proposal) => proposal.subject),
  ])
}

export function projectStructuredPendingWriteSubjectList(
  pendingWriteSubjects: ReadonlySet<string>,
) {
  return Array.from(pendingWriteSubjects).sort((left, right) => left.localeCompare(right))
}

export function projectStructuredLocalCellWriteProposals(
  cellWriteProposals: Record<string, StructuredCellWriteProposalDraft>,
) {
  return Object.values(cellWriteProposals).map((draft) => draft.proposal)
}
