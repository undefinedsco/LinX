import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  LINX_DEFAULT_SECRETARY,
  useChatList,
  useChatMutations,
  useLinxDefaultSecretaryBootstrapSettling,
  useThreadList,
} from '../../collections'
import { useChatStore } from '../../store'
import { clearChatDraft, loadChatDraft, saveChatDraft, type ChatDraftScope } from '../../draft-store'
import { chatThreadRefsMatch, readActiveBranchSelections } from '../../domain/thread-selection'
import type { PendingComposerDraft } from '../../domain/conversation-workbench'

interface ScopedDraft { text: string; scopeKey: string }
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
  const [draftState, setDraftState] = useState<ScopedDraft>({ text: '', scopeKey: '' })
  const [pendingDraft, setPendingDraft] = useState<PendingComposerDraft | null>(null)
  const [handoffFailure, setHandoffFailure] = useState<ScopedError | null>(null)

  const draft = draftState.scopeKey === scopeKey ? draftState.text : ''
  const activePendingDraft = pendingDraft?.scopeKey === scopeKey ? pendingDraft : null
  const creationError = creationFailure?.scopeKey === scopeKey && creationFailure.chatId === selectedChatId ? creationFailure.message : null
  const handoffError = handoffFailure?.scopeKey === scopeKey && handoffFailure.chatId === selectedChatId ? handoffFailure.message : null

  useEffect(() => {
    setCreationFailure(null)
    setPendingDraft(null)
    setHandoffFailure(null)
    setDraftState({ text: loadChatDraft(draftScope), scopeKey })
  }, [draftScope, scopeKey])
  useEffect(() => {
    lastAutoCreateChatRef.current = null
    isCreatingThreadRef.current = false
    creationAttemptRef.current += 1
  }, [selectedChatId])

  const retryThreadCreation = useCallback(() => {
    lastAutoCreateChatRef.current = null
    setCreationFailure(null)
    setCreationRetryKey((current) => current + 1)
  }, [])
  const updateDraft = useCallback((text: string) => {
    setDraftState({ text, scopeKey })
    saveChatDraft(draftScope, text)
  }, [draftScope, scopeKey])
  const submitDraft = useCallback(() => {
    const text = draft.trim()
    if (!text || !selectedChatId || !webId) return
    setPendingDraft({ text, attempt: 0, chatId: selectedChatId, scopeKey })
    setHandoffFailure(null)
    retryThreadCreation()
  }, [draft, retryThreadCreation, scopeKey, selectedChatId, webId])
  const retryDraftHandoff = useCallback(() => {
    setHandoffFailure(null)
    setPendingDraft((current) => current?.scopeKey === scopeKey ? { ...current, attempt: current.attempt + 1 } : current)
  }, [scopeKey])
  const completeDraftHandoff = useCallback((completed: PendingComposerDraft) => {
    setPendingDraft((current) => current === completed ? null : current)
    setDraftState((current) => current.scopeKey === completed.scopeKey ? { text: '', scopeKey: completed.scopeKey } : current)
    setHandoffFailure((current) => current?.scopeKey === completed.scopeKey ? null : current)
    clearChatDraft({ accountScope: completed.scopeKey, chatId: LINX_DEFAULT_SECRETARY.chatId })
  }, [])
  const failDraftHandoff = useCallback((failed: PendingComposerDraft) => {
    if (activeScopeRef.current !== failed.scopeKey) return
    setHandoffFailure({ message: '无法将草稿填入当前话题。草稿仍保留，可重试。', scopeKey: failed.scopeKey, chatId: failed.chatId })
  }, [])

  const chats = chatsQuery.data
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data])
  const activeChat = useMemo(() => selectedChatId && chats ? chats.find((chat) => chat.id === selectedChatId) ?? null : null, [chats, selectedChatId])
  const activeThread = useMemo(() => selectedThreadId ? threads.find((thread) => chatThreadRefsMatch(thread.id, selectedThreadId)) ?? null : null, [selectedThreadId, threads])
  const persistedActiveBranchByParent = useMemo(() => readActiveBranchSelections(activeThread?.metadata), [activeThread?.metadata])

  useEffect(() => {
    if (!selectedChatId || !isReady || (!activeChat && !isSecretary)
      || (!isSecretary && (chatsQuery.isLoading || threadsQuery.isLoading || chatsQuery.error || threadsQuery.error))) return
    const normalizedThreads = threads.map((thread) => ({ ...thread, _id: thread.id })).filter((thread) => Boolean(thread._id))
    if (selectedThreadId) return
    if (normalizedThreads.length > 0) {
      setCreationFailure(null)
      selectThread(normalizedThreads[0]._id)
      return
    }
    if (isSecretary && isDefaultSecretarySettling) return
    if (isCreatingThreadRef.current || mutations.createThread.isPending || lastAutoCreateChatRef.current === selectedChatId) return

    isCreatingThreadRef.current = true
    lastAutoCreateChatRef.current = selectedChatId
    const creationScope = scopeKey
    const creationChatId = selectedChatId
    const creationAttempt = ++creationAttemptRef.current
    mutations.createThread.mutate({ chatId: selectedChatId, title: '默认话题' }, {
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
  }, [activeChat, chatsQuery.error, chatsQuery.isLoading, creationRetryKey, isDefaultSecretarySettling, isReady, isSecretary, mutations.createThread, mutations.ensureThreadWorkspace, scopeKey, selectThread, selectedChatId, selectedThreadId, threads, threadsQuery.error, threadsQuery.isLoading])

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
    draft,
    activePendingDraft,
    creationError,
    handoffError,
    updateDraft,
    submitDraft,
    retryThreadCreation,
    retryDraftHandoff,
    completeDraftHandoff,
    failDraftHandoff,
  }
}
