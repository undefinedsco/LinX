import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import {
  createFilesProposalWithCache,
  createScopedFilesProposalCacheCollection,
} from './proposal-query-cache'

describe('Files proposal query cache workflow', () => {
  it('stages a proposal before create and invalidates after success', async () => {
    const cacheClient = new QueryClient()
    const queryKey = ['files', 'proposal-test', 'doc'] as const
    const proposal = { id: 'proposal-1', documentUri: 'https://pod.example/doc.ttl' }
    const events: string[] = []
    const create = vi.fn(async () => {
      events.push('create')
      expect(cacheClient.getQueryData(queryKey)).toEqual([proposal])
      return 'created-resource'
    })
    const invalidate = vi.fn(async () => {
      events.push('invalidate')
    })

    const result = await createFilesProposalWithCache({
      cacheClient,
      queryKey,
      proposal,
      create,
      invalidate,
    })

    expect(result).toBe('created-resource')
    expect(create).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledOnce()
    expect(events).toEqual(['create', 'invalidate'])
    expect(cacheClient.getQueryData(queryKey)).toEqual([proposal])
  })

  it('restores the previous proposal list and still invalidates when create fails', async () => {
    const cacheClient = new QueryClient()
    const queryKey = ['files', 'proposal-test', 'doc'] as const
    const existingProposal = { id: 'proposal-existing' }
    const proposal = { id: 'proposal-1' }
    cacheClient.setQueryData(queryKey, [existingProposal])
    const createError = new Error('create failed')
    const create = vi.fn(async () => {
      expect(cacheClient.getQueryData(queryKey)).toEqual([existingProposal, proposal])
      throw createError
    })
    const invalidate = vi.fn(async () => undefined)

    await expect(createFilesProposalWithCache({
      cacheClient,
      queryKey,
      proposal,
      create,
      invalidate,
    })).rejects.toThrow(createError)

    expect(create).toHaveBeenCalledOnce()
    expect(invalidate).toHaveBeenCalledOnce()
    expect(cacheClient.getQueryData(queryKey)).toEqual([existingProposal])
  })

  it('creates a scoped proposal cache collection from a proposal query-key resolver', async () => {
    const cacheClient = new QueryClient()
    const proposal = {
      id: 'proposal-1',
      documentUri: 'https://pod.example/.data/workspaces/ws-1/state.ttl',
    }
    const existingProposal = {
      id: 'proposal-existing',
      documentUri: proposal.documentUri,
    }
    const queryKey = ['files', 'structured-cell-proposals', proposal.documentUri] as const
    const cacheCollection = createScopedFilesProposalCacheCollection(
      (input: typeof proposal) => ['files', 'structured-cell-proposals', input.documentUri] as const,
    )
    cacheClient.setQueryData(queryKey, [existingProposal])

    const snapshot = await cacheCollection.stageCreate(cacheClient, proposal)

    expect(cacheClient.getQueryData(queryKey)).toEqual([existingProposal, proposal])

    cacheCollection.stage(cacheClient, proposal)
    expect(cacheClient.getQueryData(queryKey)).toEqual([existingProposal, proposal])

    cacheCollection.restore(cacheClient, snapshot)
    expect(cacheClient.getQueryData(queryKey)).toEqual([existingProposal])
  })
})
