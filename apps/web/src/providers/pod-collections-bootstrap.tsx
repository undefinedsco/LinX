import { useEffect, useRef, type ReactNode } from 'react'
import type { SolidDatabase } from '@undefineds.co/models'
import { queryClient } from './query-provider'
import { useSolidDatabase } from './solid-database-provider'
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
import { favoriteOps, initializeFavoriteCollections } from '@/modules/favorites/collections'
import { filesOps, initializeFilesCollections } from '@/modules/files/collections'
import { inboxOps, initializeInboxCollections } from '@/modules/inbox/collections'
import { initializeModelCollections } from '@/modules/model-services/data/collections'
import { initializeSymphonyControlCollections, symphonyControlOps } from '@/modules/symphony/collections'

interface PodCollectionsBootstrapProps {
  children?: ReactNode
}

function useSelectChat() {
  return useChatStore((state) => state.selectChat)
}

export function PodCollectionsBootstrap({ children }: PodCollectionsBootstrapProps) {
  const { db } = useSolidDatabase()
  const lastStartedRef = useRef<SolidDatabase | null>(null)
  // Xpod's streaming notification endpoint currently uses one long-lived
  // connection per collection. Opening every product collection while the
  // user is on Chat can exhaust the browser's per-origin connection pool and
  // leave ordinary Pod writes queued indefinitely. Keep Chat's three live
  // channels on the Chat route; the other modules still initialize normally
  // and establish their channels when entered directly.
  const isChatRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/chat')

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
    initializeFavoriteCollections(db)
    initializeFilesCollections(db)
    initializeInboxCollections(db)
    initializeSymphonyControlCollections(db)

    if (!db) {
      lastStartedRef.current = null
      void initializeChatCollections(null).catch((error) => {
        console.warn('[PodCollectionsBootstrap] Failed to unbind chat collections:', error)
      })
      return
    }

    let cancelled = false
    let unsubscribe: (() => void) | null = null
    let unsubscribeFavorites: (() => void) | null = null
    let unsubscribeFiles: (() => void) | null = null
    let unsubscribeInbox: (() => void) | null = null
    let unsubscribeSymphony: (() => void) | null = null
    const started = lastStartedRef.current
    const force = !!started && started !== db

    lastStartedRef.current = db

    if (!isChatRoute) {
      void filesOps.subscribeToPod()
        .then((nextUnsubscribe) => {
          if (cancelled) {
            nextUnsubscribe()
            return
          }
          unsubscribeFiles = nextUnsubscribe
        })
        .catch((error) => {
          console.warn('[PodCollectionsBootstrap] Failed to subscribe files collections:', error)
        })

      void favoriteOps.subscribeToPod()
        .then((nextUnsubscribe) => {
          if (cancelled) {
            nextUnsubscribe()
            return
          }
          unsubscribeFavorites = nextUnsubscribe
        })
        .catch((error) => {
          console.warn('[PodCollectionsBootstrap] Failed to subscribe favorite collection:', error)
        })

      void inboxOps.subscribeToPod()
        .then((nextUnsubscribe) => {
          if (cancelled) {
            nextUnsubscribe()
            return
          }
          unsubscribeInbox = nextUnsubscribe
        })
        .catch((error) => {
          console.warn('[PodCollectionsBootstrap] Failed to subscribe inbox collections:', error)
        })

      void symphonyControlOps.subscribeToPod()
        .then((nextUnsubscribe) => {
          if (cancelled) {
            nextUnsubscribe()
            return
          }
          unsubscribeSymphony = nextUnsubscribe
        })
        .catch((error) => {
          console.warn('[PodCollectionsBootstrap] Failed to subscribe Symphony control collections:', error)
        })
    }

    const isCurrentBootstrap = () => !cancelled && lastStartedRef.current === db
    const applyWelcomeResult = (result: LinxWelcomeResult | null) => {
      if (!result) return
      selectInitialSecretary(result.chatId, result.threadId)
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chats'] }),
        queryClient.invalidateQueries({ queryKey: ['chats', result.chatId, 'threads'] }),
      ]).catch((error) => {
        console.warn('[PodCollectionsBootstrap] Failed to refresh LinX welcome queries:', error)
      })
    }

    void initializeChatCollections(db)
      .then(async () => {
        if (!isCurrentBootstrap()) return

        chatOps.stageLinxDefaultSecretary(db)
        const stagedThread = chatOps.stageLinxDefaultSecretaryThread(db)
        selectInitialSecretary(LINX_DEFAULT_SECRETARY.chatId, stagedThread?.id)
        void queryClient.invalidateQueries({ queryKey: ['chats'] }).catch((error) => {
          console.warn('[PodCollectionsBootstrap] Failed to refresh staged LinX welcome chat:', error)
        })

        const nextUnsubscribe = await chatOps.subscribeToPod()
        if (!isCurrentBootstrap()) {
          nextUnsubscribe()
          return
        }
        unsubscribe = nextUnsubscribe

        const result = await chatOps.ensureLinxWelcome({ force })
        if (isCurrentBootstrap()) {
          applyWelcomeResult(result)
        }
      })
      .catch((cause) => {
        if (!isCurrentBootstrap()) return

        const nextError = cause instanceof Error ? cause : new Error(String(cause))
        if (!isRecoverableSecretaryBootstrapTimeout(cause)) {
          console.warn('[PodCollectionsBootstrap] Failed to prepare LinX welcome:', nextError)
        }
        void queryClient.invalidateQueries({ queryKey: ['chats'] }).catch((error) => {
          console.warn('[PodCollectionsBootstrap] Failed to refresh chats after LinX welcome failure:', error)
        })
      })

    return () => {
      cancelled = true
      unsubscribe?.()
      unsubscribeFavorites?.()
      unsubscribeFiles?.()
      unsubscribeInbox?.()
      unsubscribeSymphony?.()
    }
  }, [db, isChatRoute])

  return <>{children}</>
}

function isRecoverableSecretaryBootstrapTimeout(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false
  const error = cause as { kind?: unknown; name?: unknown; recoverable?: unknown }
  return error.kind === 'timeout'
    && error.name === 'SecretaryBootstrapTimeoutError'
    && error.recoverable === true
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
