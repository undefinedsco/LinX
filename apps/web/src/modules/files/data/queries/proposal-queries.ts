import { useSession } from '@inrupt/solid-ui-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type { AccessPolicyProposal } from '../../domain/proposal/access-approval-model'
import type { AiChangeProposal } from '../../domain/proposal/ai-change-approval-model'
import type { StructuredCellChangeProposal } from '../../domain/proposal/structured-cell-approval-model'
import type { SourceUpdateProposal } from '../../domain/source/source-approval-model'
import type { VocabTermProposal } from '../../domain/structured/structured-table'
import {
  accessPolicyProposalCollection,
  aiChangeProposalCollection,
  filesProposalQueryCollection,
  sourceUpdateProposalCollection,
  structuredCellProposalCollection,
  vocabTermProposalCollection,
} from '../collections'

export function useApproveVocabTermProposal() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (proposal: VocabTermProposal) => {
      if (!db) throw new Error('Database not connected')
      return vocabTermProposalCollection.approveWithCache({
        cacheClient: queryClient,
        db,
        proposal,
      })
    },
  })
}

export function useCreateVocabTermProposalInboxApproval() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (proposal: VocabTermProposal) => {
      if (!db) throw new Error('Database not connected')
      const actorWebId = session.info.webId
      if (!actorWebId) throw new Error('Cannot create vocab proposal approval without a logged-in WebID.')
      return vocabTermProposalCollection.createWithCache({
        cacheClient: queryClient,
        db,
        actorWebId,
        proposal,
      })
    },
  })
}

export function usePendingVocabTermProposals(documentUri: string | null | undefined, enabled = true) {
  const { db } = useSolidDatabase()

  return useQuery<VocabTermProposal[]>(filesProposalQueryCollection.pendingVocabTerms({
    documentUri,
    enabled,
    db,
  }))
}

export function useCreateAccessPolicyProposal() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (proposal: AccessPolicyProposal) => {
      if (!db) throw new Error('Database not connected')
      const actorWebId = session.info.webId
      if (!actorWebId) throw new Error('Cannot create access proposal approval without a logged-in WebID.')
      return accessPolicyProposalCollection.createWithCache({
        cacheClient: queryClient,
        db,
        actorWebId,
        proposal,
      })
    },
  })
}

export function usePendingAccessPolicyProposals(ownerUri: string | null | undefined, enabled = true) {
  const { db } = useSolidDatabase()

  return useQuery<AccessPolicyProposal[]>(filesProposalQueryCollection.pendingAccessPolicies({
    ownerUri,
    enabled,
    db,
  }))
}

export function useCreateSourceUpdateProposal() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (proposal: SourceUpdateProposal) => {
      if (!db) throw new Error('Database not connected')
      const actorWebId = session.info.webId
      if (!actorWebId) throw new Error('Cannot create source update approval without a logged-in WebID.')
      return sourceUpdateProposalCollection.createWithCache({
        cacheClient: queryClient,
        db,
        actorWebId,
        proposal,
      })
    },
  })
}

export function usePendingSourceUpdateProposals(documentUri: string | null | undefined, enabled = true) {
  const { db } = useSolidDatabase()

  return useQuery<SourceUpdateProposal[]>(filesProposalQueryCollection.pendingSourceUpdates({
    documentUri,
    enabled,
    db,
  }))
}

export function useCreateAiChangeProposal() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (proposal: AiChangeProposal) => {
      if (!db) throw new Error('Database not connected')
      const actorWebId = session.info.webId
      if (!actorWebId) throw new Error('Cannot create AI change approval without a logged-in WebID.')
      return aiChangeProposalCollection.createWithCache({
        cacheClient: queryClient,
        db,
        actorWebId,
        proposal,
      })
    },
  })
}

export function usePendingStructuredCellChangeProposals(documentUri: string | null | undefined, enabled = true) {
  const { db } = useSolidDatabase()

  return useQuery<StructuredCellChangeProposal[]>(filesProposalQueryCollection.pendingStructuredCellChanges({
    documentUri,
    enabled,
    db,
  }))
}

export function useCreateStructuredCellChangeProposal() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (proposal: StructuredCellChangeProposal) => {
      if (!db) throw new Error('Database not connected')
      const actorWebId = session.info.webId
      if (!actorWebId) throw new Error('Cannot create structured cell approval without a logged-in WebID.')
      return structuredCellProposalCollection.createWithCache({
        cacheClient: queryClient,
        db,
        actorWebId,
        proposal,
      })
    },
  })
}
