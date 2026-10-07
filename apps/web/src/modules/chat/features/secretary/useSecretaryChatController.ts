import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LINX_DEFAULT_SECRETARY,
  useChatList,
  useChatMutations,
  useLinxDefaultSecretaryBootstrapSettling,
  useThreadList,
} from '../../collections'
import { useChatStore } from '../../store'
import type { ChatDraftScope } from '../../draft-store'
import { chatThreadRefsMatch, readActiveBranchSelections } from '../../domain/thread-selection'
import { useSecretaryDraft } from './useSecretaryDraft'

interface ScopedError { message: string; scopeKey: string; chatId: string }

interface UseSecretaryChatControllerOptions {
  databaseScopeKey: string
  webId?: string
  isReady: boolean
}

export function useSecretaryChatController({ databaseScopeKey, webId, isReady }: UseSecretaryChatControllerOptions) {
  const selectedChatId = useChatStore((state) => state.selectedChatId)
  const selectedThreadId = useChatStore((state) => state.selectedThreadId)
  const selectThread = useChatStore((state) => state.selectThread)
  const chatsQuery = useChatList()
  const threadsQuery = useThreadList(selectedChatId || '', { enabled: Boolean(selectedChatId) })
  const mutations = useChatMutations()
  const isDefaultSecretarySettling = useLinxDefaultSecretaryBootstrapSettling()
  const isSecretary = selectedChatId === LINX_DEFAULT_SECRETARY.chatId
  const scopeKey = `${databaseScopeKey}:${webId ?? 'logged-out'}`
  const draftScope: ChatDraftScope = useMemo(() => ({ accountScope: scopeKey, chatId: LINX_DEFAULT_SECRETARY.chatId }), [scopeKey])
  const activeScopeRef = useRef(scopeKey)
  const activeChatRef = useRef(selectedChatId)
  activeScopeRef.current = scopeKey
  activeChatRef.current = selectedChatId

  const isCreatingThreadRef = useRef(false)
  const lastAutoCreateChatRef = useRef<string | null>(null)
  const creationAttemptRef = useRef(0)
  const [creationFailure, setCreationFailure] = useState<ScopedError | null>(null)
  const [creationRetryKey, setCreationRetryKey] = useState(0)
  const creationError = creationFailure?.scopeKey === scopeKey && creationFailure.chatId === selectedChatId ? creationFailure.message : null
  const retryThreadCreation = useCallback(() => {
    lastAutoCreateChatRef.current = null
    setCreationFailure(null)
    setCreationRetryKey((current) => current + 1)
  }, [])
  const draftController = useSecretaryDraft({
    scopeKey,
    draftScope,
    selectedChatId,
    webId,
    onSubmit: retryThreadCreation,
  })
  useEffect(() => {
    lastAutoCreateChatRef.current = null
    isCreatingThreadRef.current = false
    creationAttemptRef.current += 1
  }, [selectedChatId])

  const chats = chatsQuery.data
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data])
  const activeChat = useMemo(() => selectedChatId && chats ? chats.find((chat) => chat.id === selectedChatId) ?? null : null, [chats, selectedChatId])
  const activeThread = useMemo(() => selectedThreadId ? threads.find((thread) => chatThreadRefsMatch(thread.id, selectedThreadId)) ?? null : null, [selectedThreadId, threads])
  const persistedActiveBranchByParent = useMemo(() => readActiveBranchSelections(activeThread?.metadata), [activeThread?.metadata])

  useEffect(() => {
    const hasExplicitSecretaryDraft = isSecretary && Boolean(draftController.activePendingDraft)
    if (!selectedChatId || (!isReady && !hasExplicitSecretaryDraft) || (!activeChat && !isSecretary)
      || (!isSecretary && (chatsQuery.isLoading || threadsQuery.isLoading || chatsQuery.error || threadsQuery.error))) return
    const normalizedThreads = threads.map((thread) => ({ ...thread, _id: thread.id })).filter((thread) => Boolean(thread._id))
    // A persisted thread id can outlive its chat (or be recorded under the
    // wrong chat by an older client). Only keep it when the scoped thread
    // query confirms ownership; otherwise recover to a valid thread below.
    if (selectedThreadId && activeThread) return
    if (normalizedThreads.length > 0) {
      setCreationFailure(null)
      selectThread(normalizedThreads[0]._id)
      return
    }
    // The welcome bootstrap may still be settling, but an explicit user
    // submission must be allowed to create the default thread immediately.
    // Otherwise the composer appears enabled while the pending draft waits
    // forever for a background bootstrap promise to settle.
    if (isSecretary && isDefaultSecretarySettling && !draftController.activePendingDraft) return
    if (isCreatingThreadRef.current || mutations.createThread.isPending || lastAutoCreateChatRef.current === selectedChatId) return

    isCreatingThreadRef.current = true
    lastAutoCreateChatRef.current = selectedChatId
    const creationScope = scopeKey
    const creationChatId = selectedChatId
    const creationAttempt = ++creationAttemptRef.current
    // The live collection can be ready with an empty pre-authentication cache
    // while the Pod rebind is still fetching. Confirm remote emptiness before
    // creating anything, otherwise every refresh can create a blank thread.
    // An explicit welcome-page submission is different: the user has already
    // asked to start a conversation, so a slow historical refetch must not
    // leave the pending draft and disabled button hanging forever.
    const restoreBeforeCreate = hasExplicitSecretaryDraft
      ? Promise.resolve([])
      : Promise.resolve().then(() => threadsQuery.refetch?.())
    void restoreBeforeCreate.then((restored) => {
      if (activeScopeRef.current !== creationScope || activeChatRef.current !== creationChatId || creationAttemptRef.current !== creationAttempt) return
      const restoredThreads = Array.isArray(restored) ? restored : []
      const existing = restoredThreads.find((thread) => chatThreadRefsMatch(thread.id, selectedThreadId)) ?? restoredThreads[0]
      if (existing?.id) {
        selectThread(existing.id)
        isCreatingThreadRef.current = false
        return
      }
      mutations.createThread.mutate({
        chatId: selectedChatId,
        title: '默认话题',
        ...(isSecretary ? { threadId: LINX_DEFAULT_SECRETARY.threadKey } : {}),
      }, {
        onSuccess: (thread) => {
          if (activeScopeRef.current !== creationScope || activeChatRef.current !== creationChatId || creationAttemptRef.current !== creationAttempt) return
          setCreationFailure(null)
          if (thread.id) {
            selectThread(thread.id)
            void mutations.ensureThreadWorkspace.mutateAsync({ threadId: thread.id, title: '默认话题' })
              .catch((error) => console.error('Bind default Pod workspace failed:', error))
          }
          isCreatingThreadRef.current = false
        },
        onError: (error) => {
          if (activeScopeRef.current !== creationScope || activeChatRef.current !== creationChatId || creationAttemptRef.current !== creationAttempt) return
          setCreationFailure({ message: error instanceof Error ? error.message : '创建话题失败', scopeKey: creationScope, chatId: creationChatId })
          isCreatingThreadRef.current = false
        },
      })
    }).catch((error) => {
      if (activeScopeRef.current !== creationScope || activeChatRef.current !== creationChatId || creationAttemptRef.current !== creationAttempt) return
      setCreationFailure({ message: error instanceof Error ? error.message : '恢复话题失败', scopeKey: creationScope, chatId: creationChatId })
      isCreatingThreadRef.current = false
    })
  }, [activeChat, activeThread, chatsQuery.error, chatsQuery.isLoading, creationRetryKey, draftController.activePendingDraft, isDefaultSecretarySettling, isReady, isSecretary, mutations.createThread, mutations.ensureThreadWorkspace, scopeKey, selectThread, selectedChatId, selectedThreadId, threads, threadsQuery.error, threadsQuery.isLoading])

  return {
    selectedChatId,
    selectedThreadId,
    chats,
    threads,
    activeChat,
    activeThread,
    persistedActiveBranchByParent,
    isSecretary,
    isDefaultSecretarySettling,
    isChatsLoading: chatsQuery.isLoading,
    isThreadsLoading: threadsQuery.isLoading,
    chatError: chatsQuery.error,
    threadError: threadsQuery.error,
    refetchChats: chatsQuery.refetch,
    refetchThreads: threadsQuery.refetch,
    isCreatingThread: mutations.createThread.isPending,
    ...draftController,
    creationError,
    retryThreadCreation,
  }
}
