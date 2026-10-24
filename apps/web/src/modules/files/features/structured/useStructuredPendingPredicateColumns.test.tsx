import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { VocabTermProposal } from '../../domain/structured/structured-table'
import { createPredicateDefinitionDraft } from '../../domain/structured/structured-predicate-draft'
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

  describe('columns the person adds themselves (R6 K6b)', () => {
    const draft = () => ({
      ...createPredicateDefinitionDraft('udfs:Task'),
      namespace: 'udfs',
      localName: 'skill',
      label: '擅长',
      type: 'enum',
      enumOptions: '摄影, 布置',
    })

    it('puts the new column into the vocabulary at once, with no approval record', async () => {
      const onConfirmVocabTerm = vi.fn(async () => true)
      const onCreateVocabTermProposal = vi.fn(async () => true)
      const { result } = renderHook(() => useStructuredPendingPredicateColumns({
        classScope: 'udfs:Task',
        documentUri,
        onConfirmVocabTerm,
        onCreateVocabTermProposal,
        projectionPredicates: ['title'],
        reviewableVocabProposals: [],
      }))

      act(() => result.current.createPendingPredicateProposal(draft()))

      await waitFor(() => expect(onConfirmVocabTerm).toHaveBeenCalledTimes(1))
      expect(onConfirmVocabTerm).toHaveBeenCalledWith(
        expect.objectContaining({ termKind: 'predicate', label: '擅长', valueType: 'enum', classScope: 'udfs:Task' }),
        { resolveRecord: false },
      )
      expect(onCreateVocabTermProposal).not.toHaveBeenCalled()
      // The column is usable straight away: listed, named, and not waiting for anybody.
      const columnId = result.current.pendingPredicateIds[0]!
      expect(result.current.pendingPredicateIds).toHaveLength(1)
      expect(result.current.pendingProposalByPredicate.has(columnId)).toBe(false)
      expect(result.current.confirmedLabelByPredicate.get(columnId)).toEqual({ label: '擅长' })
      expect(result.current.getPredicateDefinition(columnId)).toMatchObject({ label: '擅长', valueType: 'enum' })
      // Cells written into it need no approval of the column.
      expect(result.current.vocabTermProposalResourceUriForPredicate(columnId)).toBeUndefined()
      // Its choices are known before the vocabulary has been re-read.
      expect(result.current.findVisiblePendingPredicateProposal(columnId)?.enumOptions).toEqual(['摄影', '布置'])
    })

    it('takes the column away again when the vocabulary could not take it', async () => {
      const onConfirmVocabTerm = vi.fn(async () => false)
      const { result } = renderHook(() => useStructuredPendingPredicateColumns({
        classScope: 'udfs:Task',
        documentUri,
        onConfirmVocabTerm,
        projectionPredicates: ['title'],
        reviewableVocabProposals: [],
      }))

      act(() => result.current.createPendingPredicateProposal(draft()))

      await waitFor(() => expect(onConfirmVocabTerm).toHaveBeenCalled())
      await waitFor(() => expect(result.current.pendingPredicateIds).toEqual([]))
    })

    it('keeps a column added earlier: writes it to the vocabulary, closes its old record and lists it as an ordinary column', async () => {
      const onConfirmVocabTerm = vi.fn(async () => true)
      const hydrated = vocabPredicateProposal()
      const { result } = renderHook(() => useStructuredPendingPredicateColumns({
        classScope: 'udfs:Task',
        documentUri,
        onConfirmVocabTerm,
        projectionPredicates: ['title'],
        reviewableVocabProposals: [hydrated],
      }))
      expect(result.current.pendingProposalByPredicate.get('reviewStatus')).toMatchObject({ status: 'approval-staged' })

      act(() => result.current.approvePendingPredicateProposal('reviewStatus'))

      await waitFor(() => expect(onConfirmVocabTerm).toHaveBeenCalledWith(hydrated, { resolveRecord: true }))
      expect(result.current.pendingProposalByPredicate.has('reviewStatus')).toBe(false)
      expect(result.current.pendingPredicateIds).toEqual(['reviewStatus'])
      expect(result.current.confirmedLabelByPredicate.get('reviewStatus')).toEqual({ label: 'Review status' })
      expect(result.current.vocabTermProposalResourceUriForPredicate('reviewStatus')).toBeUndefined()
    })

    it('still sends the column to approval when nothing can write the vocabulary directly (LinX\'s path)', async () => {
      const onCreateVocabTermProposal = vi.fn(async () => true)
      const { result } = renderHook(() => useStructuredPendingPredicateColumns({
        classScope: 'udfs:Task',
        documentUri,
        onCreateVocabTermProposal,
        projectionPredicates: ['title'],
        reviewableVocabProposals: [],
      }))

      act(() => result.current.createPendingPredicateProposal(draft()))

      await waitFor(() => expect(onCreateVocabTermProposal).toHaveBeenCalledTimes(1))
      const columnId = result.current.pendingPredicateIds[0]!
      await waitFor(() => expect(result.current.pendingProposalByPredicate.get(columnId)?.status).toBe('approval-staged'))
    })
  })
})

