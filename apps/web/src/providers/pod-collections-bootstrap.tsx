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
import { initializeFavoriteCollections } from '@/modules/favorites/collections'
import { initializeFilesCollections } from '@/modules/files/collections'
import { initializeInboxCollections } from '@/modules/inbox/collections'
import { initializeModelCollections } from '@/modules/model-services/data/collections'
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

    const welcomePromise = chatOps.ensureLinxWelcome({ force })
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

    selectInitialSecretary(LINX_DEFAULT_SECRETARY.chatId)
    void queryClient.invalidateQueries({ queryKey: ['chats'] }).catch((error) => {
      console.warn('[PodCollectionsBootstrap] Failed to refresh staged LinX welcome chat:', error)
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
