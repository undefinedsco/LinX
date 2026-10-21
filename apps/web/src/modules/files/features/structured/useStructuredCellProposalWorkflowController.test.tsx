import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { StructuredCellWriteProposal } from '../../domain/structured/structured-table'
import { useStructuredCellProposalWorkflowController } from './useStructuredCellProposalWorkflowController'

const mutateAsync = vi.fn()

vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }))
vi.mock('../../data/queries', () => ({
  useCreateStructuredCellChangeProposal: () => ({ mutateAsync: vi.fn() }),
  useWriteOwnStructuredCellChange: () => ({ mutateAsync }),
  usePendingStructuredCellChangeProposals: () => ({ data: [] }),
}))

const documentUri = 'https://pod.example/.data/tasks.ttl'
const move = (subject: string): StructuredCellWriteProposal => ({
  id: `${documentUri}|${subject}|stage`,
  documentUri,
  subject,
  predicate: 'stage',
  previousValues: ['"待办"'],
  nextValues: ['"进行中"'],
  status: 'pending',
} as StructuredCellWriteProposal)

describe('useStructuredCellProposalWorkflowController own writes', () => {
  beforeEach(() => mutateAsync.mockReset().mockResolvedValue(undefined))

  it('checks the loaded version once, then lets a following write of ours go through', async () => {
    const { result } = renderHook(() => useStructuredCellProposalWorkflowController({
      documentEtag: '"v1"',
      documentUri,
      structuredWritesSupported: true,
    }))

    await act(async () => {
      await result.current.commitCellWriteProposal(move('#Alpha'))
      await result.current.commitCellWriteProposal(move('#Beta'))
    })

    expect(mutateAsync.mock.calls.map(([input]) => input.expectedEtag)).toEqual(['"v1"', null])
  })

  it('checks again once a newer version has loaded', async () => {
    const { result, rerender } = renderHook(({ etag }) => useStructuredCellProposalWorkflowController({
      documentEtag: etag,
      documentUri,
      structuredWritesSupported: true,
    }), { initialProps: { etag: '"v1"' } })

    await act(async () => { await result.current.commitCellWriteProposal(move('#Alpha')) })
    rerender({ etag: '"v2"' })
    await act(async () => { await result.current.commitCellWriteProposal(move('#Beta')) })

    expect(mutateAsync.mock.calls.map(([input]) => input.expectedEtag)).toEqual(['"v1"', '"v2"'])
  })
})
