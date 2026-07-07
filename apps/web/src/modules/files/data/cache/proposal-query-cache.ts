import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { restoreQuerySnapshot } from './resource-query-cache'

export type FilesProposalCacheSnapshot<TProposal> = {
  queryKey: QueryKey
  previous: TProposal[] | undefined
}

export const filesProposalCacheCollection = {
  async stageCreate<TProposal extends { id: string }>(
    cacheClient: QueryClient,
    queryKey: QueryKey,
    proposal: TProposal,
  ): Promise<FilesProposalCacheSnapshot<TProposal>> {
    await cacheClient.cancelQueries({ queryKey })
    return filesProposalCacheCollection.stage(cacheClient, queryKey, proposal)
  },

  stage<TProposal extends { id: string }>(
    cacheClient: QueryClient,
    queryKey: QueryKey,
    proposal: TProposal,
  ): FilesProposalCacheSnapshot<TProposal> {
    const previous = cacheClient.getQueryData<TProposal[]>(queryKey)
    cacheClient.setQueryData<TProposal[]>(queryKey, (current) => {
      const proposals = current ?? []
      return proposals.some((item) => item.id === proposal.id)
        ? proposals
        : [...proposals, proposal]
    })
    return { queryKey, previous }
  },

  restore<TProposal>(
    cacheClient: QueryClient,
    snapshot?: FilesProposalCacheSnapshot<TProposal>,
  ) {
    if (!snapshot) return
    restoreQuerySnapshot(cacheClient, [[snapshot.queryKey, snapshot.previous]])
  },
}

export function createScopedFilesProposalCacheCollection<TProposal extends { id: string }>(
  queryKeyForProposal: (proposal: TProposal) => QueryKey,
) {
  return {
    async stageCreate(
      cacheClient: QueryClient,
      proposal: TProposal,
    ): Promise<FilesProposalCacheSnapshot<TProposal>> {
      return filesProposalCacheCollection.stageCreate(
        cacheClient,
        queryKeyForProposal(proposal),
        proposal,
      )
    },

    stage(
      cacheClient: QueryClient,
      proposal: TProposal,
    ): FilesProposalCacheSnapshot<TProposal> {
      return filesProposalCacheCollection.stage(
        cacheClient,
        queryKeyForProposal(proposal),
        proposal,
      )
    },

    restore(
      cacheClient: QueryClient,
      snapshot?: FilesProposalCacheSnapshot<TProposal>,
    ) {
      filesProposalCacheCollection.restore(cacheClient, snapshot)
    },
  }
}

export async function createFilesProposalWithCache<
  TProposal extends { id: string },
  TResult,
>(input: {
  cacheClient: QueryClient
  queryKey: QueryKey
  proposal: TProposal
  create: () => Promise<TResult>
  invalidate: () => Promise<void>
}): Promise<TResult> {
  const snapshot = await filesProposalCacheCollection.stageCreate(
    input.cacheClient,
    input.queryKey,
    input.proposal,
  )

  try {
    return await input.create()
  } catch (error) {
    filesProposalCacheCollection.restore(input.cacheClient, snapshot)
    throw error
  } finally {
    await input.invalidate()
  }
}
