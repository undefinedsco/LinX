import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { VocabTermProposal } from '../../domain/structured/structured-table'
import { useStructuredPendingPredicateColumns } from './useStructuredPendingPredicateColumns'

const documentUri = 'https://pod.example/.data/tasks.ttl'

function vocabPredicateProposal(overrides: Partial<VocabTermProposal> = {}): VocabTermProposal {
  return {
    id: 'proposal-review-status',
    kind: 'vocab-term-proposal',
    status: 'pending',
    operation: 'create',
    documentUri,
    proposalResourceUri: 'https://pod.example/.data/proposals/review-status.ttl#proposal',
    targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
    targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
    classScope: 'udfs:Task',
    termUri: 'https://pod.example/.vocab/terms.ttl#ReviewStatus',
    termKind: 'predicate',
    label: 'Review status',
    valueType: 'enum',
    description: 'Approval state',
    shape: 'Ready, Blocked',
    predicate: 'reviewStatus',
    createdAt: '2026-06-30T00:00:00.000Z',
    writesCanonicalVocab: false,
    ...overrides,
  }
}

describe('useStructuredPendingPredicateColumns', () => {
  it('owns visible pending predicate ids for table model assembly', () => {
    const { result } = renderHook(() => useStructuredPendingPredicateColumns({
      classScope: 'udfs:Task',
      documentUri,
      projectionPredicates: ['title'],
      reviewableVocabProposals: [vocabPredicateProposal()],
    }))

    expect(result.current.visiblePendingPredicateProposals.map((proposal) => proposal.id)).toEqual(['reviewStatus'])
    expect(result.current.pendingPredicateIds).toEqual(['reviewStatus'])
  })
})
