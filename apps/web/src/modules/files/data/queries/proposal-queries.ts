import { useSession } from '@/providers/solid-session-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSolidDatabase } from '@/providers/solid-database-provider'
import type { AccessPolicyProposal } from '../../domain/proposal/access-approval-model'
import type { AiChangeProposal } from '../../domain/proposal/ai-change-approval-model'
import type { ShareChange } from '../proposal/share-commands'
import type { ShareState } from '../../domain/resource/share-model'
import type { AiCellChange } from '../../domain/proposal/ai-cell-change-model'
import type { AiDraft } from '../../domain/proposal/ai-draft-model'
import type { StructuredCellChangeProposal } from '../../domain/proposal/structured-cell-approval-model'
import type { SourceUpdateProposal } from '../../domain/source/source-approval-model'
import type { VocabTermProposal } from '../../domain/structured/structured-table'
import {
  accessPolicyProposalCollection,
  aiChangeProposalCollection,
  aiCellChangeCollection,
  shareCollection,
  aiDraftCollection,
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

/** The person's own structured edit, written directly (no approval). */
export function useWriteOwnStructuredCellChange() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (change: {
      documentUri: string
      subject: string
      predicate: string
      previousValues: string[]
      nextValues: string[]
      expectedEtag?: string | null
    }) => {
      if (!db) throw new Error('Database not connected')
      const actorWebId = session.info.webId
      if (!actorWebId) throw new Error('Cannot write without a logged-in WebID.')
      await structuredCellProposalCollection.writeOwnChangeWithCache({
        cacheClient: queryClient,
        db,
        actorWebId,
        change,
      })
    },
  })
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

/** LinX's unconfirmed change to a file, if any (R6 K10). */
export function useAiDraft(targetResourceUri: string | null | undefined, enabled = true) {
  const { db } = useSolidDatabase()
  const target = targetResourceUri?.trim() ?? ''
  return useQuery<AiDraft | null>({
    queryKey: aiDraftCollection.queryKey(target),
    queryFn: () => aiDraftCollection.fetch(target, { db }),
    enabled: enabled && !!db && target.length > 0,
  })
}

/** Used by whoever runs LinX's edits: lays the change over the file as an unconfirmed draft (or keeps it under a grant). */
export function useStageAiDraft() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      targetResourceUri: string
      draftContent: string
      agentWebId?: string | null
      delegated?: boolean
      summary?: string
      podRootUri?: string | null
    }) => {
      const actorWebId = session.info.webId
      if (!actorWebId) throw new Error('Cannot stage an AI draft without a logged-in WebID.')
      return aiDraftCollection.stage({ cacheClient: queryClient, db, actorWebId, ...input })
    },
  })
}

export function useActOnAiDraft() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { draft: AiDraft; action: 'keep' | 'undo' | 'reapply' | { undoSpot: number } }) => (
      aiDraftCollection.act({ cacheClient: queryClient, db, ...input })
    ),
  })
}

/** Cells LinX wrote into a table, for the purple dots (R6 K10b). */
export function useAiCellChanges(documentUri: string | null | undefined, enabled = true) {
  const { db } = useSolidDatabase()
  const uri = documentUri?.trim() ?? ''
  return useQuery<AiCellChange[]>({
    queryKey: aiCellChangeCollection.queryKey(uri),
    queryFn: () => aiCellChangeCollection.fetch(uri, { db }),
    enabled: enabled && !!db && uri.length > 0,
  })
}

/** Used by whoever runs LinX's table edits: writes the cell directly and records it for the dot and undo. */
export function useWriteAiCellChange() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      documentUri: string
      subject: string
      predicate: string
      previousValues: string[]
      nextValues: string[]
      rowAdded?: boolean
      agentWebId?: string | null
      expectedEtag?: string | null
      podRootUri?: string | null
    }) => {
      const actorWebId = session.info.webId
      if (!actorWebId) throw new Error('Cannot write without a logged-in WebID.')
      return aiCellChangeCollection.write({ cacheClient: queryClient, db, actorWebId, ...input })
    },
  })
}

export function useUndoAiCellChange() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (change: AiCellChange) => {
      const actorWebId = session.info.webId
      if (!actorWebId) throw new Error('Cannot undo without a logged-in WebID.')
      return aiCellChangeCollection.undo({ cacheClient: queryClient, db, actorWebId, change })
    },
  })
}

export function useMarkAiCellChangeSeen() {
  const { db } = useSolidDatabase()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (change: AiCellChange) => aiCellChangeCollection.markSeen({ cacheClient: queryClient, db, change }),
  })
}

/** Who can open an item (R6 K9). */
export function useShareState(uri: string | null | undefined, isFolder: boolean, enabled = true) {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const target = uri?.trim() ?? ''
  return useQuery<ShareState | null>({
    queryKey: shareCollection.queryKey(target),
    queryFn: () => shareCollection.fetch(target, isFolder, db, session.info.webId),
    enabled: enabled && !!db && target.length > 0,
    retry: false,
  })
}

export function useApplyShareChange() {
  const { db } = useSolidDatabase()
  const { session } = useSession()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { uri: string; isFolder: boolean; change: ShareChange }) => (
      shareCollection.apply({ cacheClient: queryClient, db, selfWebId: session.info.webId, ...input })
    ),
  })
}
