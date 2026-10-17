/**
 * 问 LinX, chat side (`@/lib/ask-linx`): a passage asked about from elsewhere
 * lands in the composer of the LinX 助手 chat as a quoted prompt. It is focused
 * and never sent on its own; an existing draft is kept above it. The source
 * shows as a chip that opens the card.
 */
import { useCallback, useEffect, useState } from 'react'
import { useAui, useAuiState } from '@assistant-ui/react'
import { ASK_LINX_MAX_AGE_MS, useAskLinx, type PendingAskLinx } from '@/lib/ask-linx'
import { useCardDialog } from '@/lib/card-dialog'
import { LINX_DEFAULT_SECRETARY } from '../../collections'

export interface ComposerCitation {
  label: string
  open: () => void
  remove: () => void
}

/** How the prompt is put into a composer that may already hold a draft. */
export function mergeAskIntoDraft(draft: string, prompt: string): string {
  return draft.trim() ? `${draft.replace(/\s+$/, '')}\n\n${prompt}` : prompt
}

export function citationLabel(request: Pick<PendingAskLinx, 'title' | 'sourceUri'>): string {
  if (request.title?.trim()) return request.title.trim()
  const name = request.sourceUri?.split('#')[0].split('/').filter(Boolean).pop()
  try { return name ? decodeURIComponent(name) : '引用的内容' } catch { return name ?? '引用的内容' }
}

export function useAskLinxIntoComposer(chatId: string): ComposerCitation | null {
  const aui = useAui()
  const pending = useAskLinx((state) => state.pending)
  const settle = useAskLinx((state) => state.settle)
  const openCard = useCardDialog((state) => state.open)
  const [source, setSource] = useState<Pick<PendingAskLinx, 'sourceUri' | 'locator' | 'title'> | null>(null)
  const isLinx = chatId === LINX_DEFAULT_SECRETARY.chatId

  useEffect(() => {
    if (!pending || !isLinx) return
    settle(pending.id)
    if (Date.now() - pending.at > ASK_LINX_MAX_AGE_MS) return
    const composer = aui.composer()
    composer.setText(mergeAskIntoDraft(composer.getState().text, pending.text))
    setSource(pending.sourceUri ? { sourceUri: pending.sourceUri, locator: pending.locator, title: pending.title } : null)
    // Focus once the text is in, with the caret after the quote.
    window.requestAnimationFrame(() => {
      const input = document.querySelector<HTMLTextAreaElement>('[data-testid="conversation-surface"] textarea[aria-label="消息"]')
      if (!input) return
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    })
  }, [aui, isLinx, pending, settle])

  // The chip belongs to the message being written: sending it (or switching chats) ends it.
  const sentCount = useAuiState((state) => state.thread.messages.length)
  useEffect(() => setSource(null), [chatId, sentCount])

  const sourceUri = source?.sourceUri
  const locator = source?.locator
  const remove = useCallback(() => setSource(null), [])
  if (!source || !sourceUri) return null
  return {
    label: citationLabel(source),
    open: () => openCard({ uri: sourceUri, locator, from: 'chat' }),
    remove,
  }
}
