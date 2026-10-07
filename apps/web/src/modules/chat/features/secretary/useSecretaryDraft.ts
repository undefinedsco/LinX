import { useCallback, useEffect, useRef, useState } from 'react'
import { clearChatDraft, loadChatDraft, saveChatDraft, type ChatDraftScope } from '../../draft-store'
import type { PendingComposerDraft } from '../../domain/conversation-workbench'

interface UseSecretaryDraftOptions {
  scopeKey: string
  draftScope: ChatDraftScope
  selectedChatId: string | null
  webId?: string
  onSubmit: () => void
}

interface ScopedError { message: string; scopeKey: string; chatId: string }

export function useSecretaryDraft({ scopeKey, draftScope, selectedChatId, webId, onSubmit }: UseSecretaryDraftOptions) {
  const activeScopeRef = useRef(scopeKey)
  activeScopeRef.current = scopeKey
  const [draft, setDraft] = useState('')
  const [pendingDraft, setPendingDraft] = useState<PendingComposerDraft | null>(null)
  const [handoffFailure, setHandoffFailure] = useState<ScopedError | null>(null)

  useEffect(() => {
    setPendingDraft(null)
    setHandoffFailure(null)
    setDraft(loadChatDraft(draftScope))
  }, [draftScope])

  const updateDraft = useCallback((text: string) => {
    setDraft(text)
    saveChatDraft(draftScope, text)
  }, [draftScope])

  const submitDraft = useCallback(() => {
    const text = draft.trim()
    if (!text || !selectedChatId || !webId) return
    setPendingDraft({ text, attempt: 0, chatId: selectedChatId, scopeKey })
    setHandoffFailure(null)
    onSubmit()
  }, [draft, onSubmit, scopeKey, selectedChatId, webId])

  const retryDraftHandoff = useCallback(() => {
    setHandoffFailure(null)
    setPendingDraft((current) => current?.scopeKey === scopeKey
      ? { ...current, attempt: current.attempt + 1 }
      : current)
  }, [scopeKey])

  const completeDraftHandoff = useCallback((completed: PendingComposerDraft) => {
    setPendingDraft((current) => current === completed ? null : current)
    if (completed.scopeKey === scopeKey) setDraft('')
    setHandoffFailure((current) => current?.scopeKey === completed.scopeKey ? null : current)
    clearChatDraft({ accountScope: completed.scopeKey, chatId: completed.chatId })
  }, [scopeKey])

  const failDraftHandoff = useCallback((failed: PendingComposerDraft) => {
    if (activeScopeRef.current !== failed.scopeKey) return
    setHandoffFailure({ message: '无法将草稿填入当前话题。草稿仍保留，可重试。', scopeKey: failed.scopeKey, chatId: failed.chatId })
  }, [])

  return {
    draft,
    activePendingDraft: pendingDraft?.scopeKey === scopeKey ? pendingDraft : null,
    handoffError: handoffFailure?.scopeKey === scopeKey && handoffFailure.chatId === selectedChatId
      ? handoffFailure.message
      : null,
    updateDraft,
    submitDraft,
    retryDraftHandoff,
    completeDraftHandoff,
    failDraftHandoff,
  }
}
