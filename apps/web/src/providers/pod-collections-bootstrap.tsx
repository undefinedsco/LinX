import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SolidDatabase } from '@undefineds.co/models'
import { queryClient } from './query-provider'
import { useSolidDatabase } from './solid-database-provider'
import { chatOps, initializeChatCollections, type LinxWelcomeResult } from '@/modules/chat/collections'
import { useChatStore } from '@/modules/chat/store'
import { initializeContactCollections } from '@/modules/contacts/collections'
import { initializeFavoriteCollections } from '@/modules/favorites/collections'
import { initializeInboxCollections } from '@/modules/inbox/collections'
import { formatLoginErrorForUser } from '@/modules/login/error-messages'
import { initializeModelCollections } from '@/modules/model-services/collections'

type BootstrapStatus = 'idle' | 'initializing' | 'ready' | 'error'
const SECRETARY_BOOTSTRAP_TIMEOUT_MS = 45_000

type BootstrapState = {
  db: SolidDatabase | null
  status: BootstrapStatus
  error: Error | null
}

const idleBootstrapState: BootstrapState = {
  db: null,
  status: 'idle',
  error: null,
}

interface PodCollectionsBootstrapProps {
  children?: ReactNode
}

export function PodCollectionsBootstrap({ children }: PodCollectionsBootstrapProps) {
  const { db } = useSolidDatabase()
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>(idleBootstrapState)
  const [retryKey, setRetryKey] = useState(0)
  const lastStartedRef = useRef<{ db: SolidDatabase; retryKey: number } | null>(null)

  useEffect(() => {
    initializeChatCollections(db)
    initializeContactCollections(db)
    initializeFavoriteCollections(db)
    initializeInboxCollections(db)
    initializeModelCollections(db)

    if (!db) {
      lastStartedRef.current = null
      setBootstrapState(idleBootstrapState)
      return
    }

    let cancelled = false
    const started = lastStartedRef.current
    const force = retryKey > 0 && (started?.db !== db || started.retryKey !== retryKey)

    lastStartedRef.current = { db, retryKey }
    setBootstrapState({ db, status: 'initializing', error: null })

    const welcomePromise = chatOps.ensureLinxWelcome({ force })
    const applyWelcomeResult = async (result: LinxWelcomeResult | null) => {
      if (!result) return
      selectInitialSecretary(result.chatId, result.threadId)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['chats'] }),
        queryClient.invalidateQueries({ queryKey: ['chats', result.chatId, 'threads'] }),
      ])
    }

    void withTimeout(
      welcomePromise,
      SECRETARY_BOOTSTRAP_TIMEOUT_MS,
      '默认助手准备超时。请检查网络，或返回空间选择页重试。',
    )
      .then(async (result) => {
        if (cancelled) return

        await applyWelcomeResult(result)

        if (!cancelled) {
          setBootstrapState({ db, status: 'ready', error: null })
        }
      })
      .catch((cause) => {
        if (cancelled) return

        const nextError = cause instanceof Error ? cause : new Error(String(cause))
        console.warn('[PodCollectionsBootstrap] Failed to prepare LinX welcome:', nextError)
        setBootstrapState({ db, status: 'error', error: nextError })
      })

    return () => {
      cancelled = true
    }
  }, [db, retryKey])

  const isCurrentBootstrapState = !!db && bootstrapState.db === db

  if (db && (!isCurrentBootstrapState || bootstrapState.status === 'idle' || bootstrapState.status === 'initializing')) {
    return (
      <BootstrapScreen
        title="正在准备默认助手"
        description="首次登录后正在创建默认助手、默认话题和欢迎消息。"
      />
    )
  }

  if (db && isCurrentBootstrapState && bootstrapState.status === 'error') {
    return (
      <BootstrapScreen
        title="默认助手准备失败"
        description={formatLoginErrorForUser(
          bootstrapState.error,
          '默认助手暂时无法创建。请确认当前空间可以保存数据，或换一个空间。',
        )}
        actionLabel="重试"
        onAction={() => {
          setBootstrapState({ db, status: 'initializing', error: null })
          setRetryKey((current) => current + 1)
        }}
        busy={false}
      />
    )
  }

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

function BootstrapScreen({
  title,
  description,
  actionLabel,
  onAction,
  busy = true,
}: {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  busy?: boolean
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="max-w-sm px-6 text-center">
        {busy ? (
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        ) : null}
        <h1 className="text-base font-medium">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            className="mt-4 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(message)
      error.name = 'BootstrapTimeoutError'
      reject(error)
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  })
}
