import { useEffect, useRef, type ReactNode } from 'react'
import type { SolidDatabase } from '@undefineds.co/models'
import { queryClient } from './query-provider'
import { useSolidDatabase } from './solid-database-provider'
import { chatOps, initializeChatCollections, LINX_DEFAULT_SECRETARY, type LinxWelcomeResult } from '@/modules/chat/collections'
import { useChatStore } from '@/modules/chat/store'
import { useToast } from '@/components/ui/use-toast'
import { initializeContactCollections } from '@/modules/contacts/collections'
import { initializeFavoriteCollections } from '@/modules/favorites/collections'
import { initializeInboxCollections } from '@/modules/inbox/collections'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { initializeModelCollections } from '@/modules/model-services/collections'
import { initializeSymphonyControlCollections, symphonyControlOps } from '@/modules/symphony/collections'

interface PodCollectionsBootstrapProps {
  children?: ReactNode
}

export function PodCollectionsBootstrap({ children }: PodCollectionsBootstrapProps) {
  const { db } = useSolidDatabase()
  const { toast } = useToast()
  const lastStartedRef = useRef<SolidDatabase | null>(null)

  useEffect(() => {
    initializeChatCollections(db)
    initializeContactCollections(db)
    initializeFavoriteCollections(db)
    initializeInboxCollections(db)
    initializeModelCollections(db)
    initializeSymphonyControlCollections(db)

    if (!db) {
      lastStartedRef.current = null
      return
    }

    let cancelled = false
    let unsubscribe: (() => void) | null = null
    let unsubscribeSymphony: (() => void) | null = null
    const started = lastStartedRef.current
    const force = !!started && started !== db

    lastStartedRef.current = db

    void chatOps.subscribeToPod()
      .then((nextUnsubscribe) => {
        if (cancelled) {
          nextUnsubscribe()
          return
        }
        unsubscribe = nextUnsubscribe
      })
      .catch((error) => {
        console.warn('[PodCollectionsBootstrap] Failed to subscribe chat collections:', error)
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

    const welcomePromise = chatOps.ensureLinxWelcome({ force })
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
        if (cancelled) return

        applyWelcomeResult(result)
      })
      .catch((cause) => {
        if (cancelled) return

        const nextError = cause instanceof Error ? cause : new Error(String(cause))
        console.warn('[PodCollectionsBootstrap] Failed to prepare LinX welcome:', nextError)
        void queryClient.invalidateQueries({ queryKey: ['chats'] }).catch((error) => {
          console.warn('[PodCollectionsBootstrap] Failed to refresh chats after LinX welcome failure:', error)
        })
        toast({
          description: formatLoginErrorForUser(nextError, '默认助手暂时无法保存到当前空间。请稍后重试。'),
          variant: 'destructive',
        })
      })

    return () => {
      cancelled = true
      unsubscribe?.()
      unsubscribeSymphony?.()
    }
  }, [db, toast])

  return <>{children}</>
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
