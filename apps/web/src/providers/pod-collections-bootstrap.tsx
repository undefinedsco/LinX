import { useEffect, useRef, type ReactNode } from 'react'
import type { SolidDatabase } from '@undefineds.co/models'
import { queryClient } from './query-provider'
import { useSolidDatabase } from './solid-database-provider'
import { acquirePodCollectionSubscription } from '@/lib/data/use-pod-collection-subscription'
import {
  chatCollection,
  chatOps,
  configureChatContactsPort,
  initializeChatCollections,
  LINX_DEFAULT_SECRETARY,
  threadCollection,
  type LinxWelcomeResult,
} from '@/modules/chat/collections'
import { createMatrixGroupRoom, loadMatrixChatRow, loadMatrixThreadRow } from '@/modules/chat/matrix-service'
import { useChatStore } from '@/modules/chat/store'
import {
  agentCollection,
  configureContactsChatPort,
  contactCollection,
  initializeContactCollections,
} from '@/modules/contacts/data/collections'
import { initializeFavoriteCollections } from '@/modules/favorites/collections'
import { initializeFilesCollections } from '@/modules/files/collections'
import { initializeInboxCollections } from '@/modules/inbox/collections'
import { subscribeInboxToPod } from '@/modules/inbox/runtime'
import { initializeModelCollections } from '@/modules/ai-connections/data/collections'
import { initializeSymphonyControlCollections } from '@/modules/symphony/collections'

interface PodCollectionsBootstrapProps {
  children?: ReactNode
}

function useSelectChat() {
  return useChatStore((state) => state.selectChat)
}

export function PodCollectionsBootstrap({ children }: PodCollectionsBootstrapProps) {
  const { db } = useSolidDatabase()
  const lastStartedRef = useRef<SolidDatabase | null>(null)

  configureChatContactsPort({ agentCollection, contactCollection })
  configureContactsChatPort({
    chatCollection,
    threadCollection,
    useSelectChat,
    createMatrixGroupRoom,
    loadMatrixChatRow,
    loadMatrixThreadRow,
  })

  startCollectionBinding('contacts', () => initializeContactCollections(db))
  startCollectionBinding('model services', () => initializeModelCollections(db))

  useEffect(() => {
    initializeChatCollections(db)
    initializeFavoriteCollections(db)
    initializeFilesCollections(db)
    initializeInboxCollections(db)
    initializeSymphonyControlCollections(db)

    if (!db) {
      lastStartedRef.current = null
      return
    }

    let cancelled = false
    const started = lastStartedRef.current
    const force = !!started && started !== db

    lastStartedRef.current = db
    chatOps.stageLinxDefaultSecretary(db)

    // Pinned: the navigation bell renders inbox summaries globally, so its
    // subscription must stay live even while another applet is active.
    // Ref-counted with the inbox runtime activation via a shared lease.
    let releasePinnedInbox: (() => void | Promise<void>) | undefined
    let pinnedInboxActive = true
    void acquirePodCollectionSubscription(db, subscribeInboxToPod)
      .then((release) => {
        if (!pinnedInboxActive) {
          void release()
          return
        }
        releasePinnedInbox = release
      })
      .catch((error) => {
        console.warn('[PodCollectionsBootstrap] Failed to pin inbox subscription:', error)
      })

    const welcomePromise = chatOps.ensureLinxWelcome({ force })
    const isCurrentBootstrap = () => !cancelled && lastStartedRef.current === db
    const applyWelcomeResult = (result: LinxWelcomeResult | null) => {
      if (!result) return
      selectInitialSecretary(result.chatId, result.threadId)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chats'] }),
        queryClient.invalidateQueries({ queryKey: ['threads'] }),
      ]).catch((error) => {
        console.warn('[PodCollectionsBootstrap] Failed to refresh LinX welcome queries:', error)
      })
    }

    selectInitialSecretary(LINX_DEFAULT_SECRETARY.chatId)
    // Collections may have been preloaded while db was null and cached empty
    // results under the default staleTime; invalidate everything so every
    // module refetches against the ready database, not just chats.
    void queryClient.invalidateQueries().catch((error) => {
      console.warn('[PodCollectionsBootstrap] Failed to refresh collections for the ready database:', error)
    })

    void welcomePromise
      .then(async (result) => {
        if (!isCurrentBootstrap()) return

        applyWelcomeResult(result)
      })
      .catch((cause) => {
        if (!isCurrentBootstrap()) return

        const nextError = cause instanceof Error ? cause : new Error(String(cause))
        console.warn('[PodCollectionsBootstrap] Failed to prepare LinX welcome:', nextError)
        void queryClient.invalidateQueries({ queryKey: ['chats'] }).catch((error) => {
          console.warn('[PodCollectionsBootstrap] Failed to refresh chats after LinX welcome failure:', error)
        })
      })

    return () => {
      cancelled = true
      pinnedInboxActive = false
      void releasePinnedInbox?.()
    }
  }, [db])

  return <>{children}</>
}

function startCollectionBinding(label: string, initialize: () => void | Promise<void>): void {
  try {
    void Promise.resolve(initialize()).catch((error) => {
      console.warn(`[PodCollectionsBootstrap] Failed to bind ${label} collections:`, error)
    })
  } catch (error) {
    console.warn(`[PodCollectionsBootstrap] Failed to bind ${label} collections:`, error)
  }
}

function selectInitialSecretary(chatId: string, threadId?: string): void {
  const state = useChatStore.getState()
  const shouldSelectChat = !state.selectedChatId || state.selectedChatId === chatId

  if (!shouldSelectChat) {
    return
  }

  if (!state.selectedChatId) {
    state.selectChat(chatId)
  }

  if (threadId && !useChatStore.getState().selectedThreadId) {
    useChatStore.getState().selectThread(threadId)
  }
}
