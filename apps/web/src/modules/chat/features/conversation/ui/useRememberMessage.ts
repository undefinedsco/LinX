import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from '@/providers/solid-session-context'
import { useOptionalConversationIdentity } from '../ConversationContext'
import { forgetNote, rememberNote, RememberFailedError, type RememberResult } from '../memory/remembered'

export type RememberStatus =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'remembered'; noteUri: string; text: string }
  | { kind: 'replaced'; noteUri: string; replacedUri: string; text: string; before: string }
  | { kind: 'already'; noteUri: string }
  | { kind: 'failed'; reason: 'forbidden' | 'offline' | 'unavailable' }

const LINGER_MS = 6_000

/** What goes in the note: the message, tidied and kept to one short paragraph. */
export function noteTextOf(messageText: string): string {
  const text = messageText.replace(/\s+/gu, ' ').trim()
  return text.length > 140 ? `${text.slice(0, 139)}…` : text
}

/**
 * The "记住" button of one message (W3 / W3b). Nothing is written until the
 * button is pressed; the result shows for a few seconds and then folds away.
 */
export function useRememberMessage(messageUri: string, messageText: string, replaces?: string) {
  const { session } = useSession()
  const identity = useOptionalConversationIdentity()
  const [status, setStatus] = useState<RememberStatus>({ kind: 'idle' })
  const timer = useRef<number | null>(null)
  const fileUrl = identity?.rememberedUrl ?? null
  const webId = session.info.webId ?? null
  const authFetch = session.fetch

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])
  const linger = useCallback((next: RememberStatus) => {
    setStatus(next)
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (next.kind === 'remembered' || next.kind === 'already' || next.kind === 'replaced') {
      timer.current = window.setTimeout(() => setStatus({ kind: 'idle' }), LINGER_MS)
    }
  }, [])

  const remember = useCallback(async () => {
    if (!fileUrl || !webId || !authFetch) {
      linger({ kind: 'failed', reason: 'unavailable' })
      return
    }
    setStatus({ kind: 'saving' })
    const text = noteTextOf(messageText)
    try {
      const result: RememberResult = await rememberNote({
        fileUrl, authFetch, content: text, sourceUri: messageUri, creatorWebId: webId, replaces,
      })
      if (result.status === 'already') linger({ kind: 'already', noteUri: result.noteUri })
      else if (result.status === 'replaced') {
        linger({ kind: 'replaced', noteUri: result.noteUri, replacedUri: result.replacedUri, text, before: result.replacedContent })
      } else linger({ kind: 'remembered', noteUri: result.noteUri, text })
    } catch (error) {
      linger({ kind: 'failed', reason: error instanceof RememberFailedError ? error.reason : 'unavailable' })
    }
  }, [authFetch, fileUrl, linger, messageText, messageUri, replaces, webId])

  const undo = useCallback(async () => {
    if (!fileUrl || !authFetch) return
    if (status.kind !== 'remembered' && status.kind !== 'replaced') return
    try {
      await forgetNote({
        fileUrl, authFetch, noteUri: status.noteUri,
        replacedUri: status.kind === 'replaced' ? status.replacedUri : undefined,
      })
      setStatus({ kind: 'idle' })
    } catch {
      setStatus({ kind: 'failed', reason: 'unavailable' })
    }
  }, [authFetch, fileUrl, status])

  const dismiss = useCallback(() => setStatus({ kind: 'idle' }), [])
  return { status, remember, undo, dismiss, canRemember: Boolean(fileUrl && webId && authFetch) }
}
