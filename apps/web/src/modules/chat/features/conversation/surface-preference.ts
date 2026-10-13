import { useSyncExternalStore } from 'react'

/**
 * Which conversation surface the chat pane shows. ChatKit stays the default
 * until the AG-UI surface is accepted (spec §3.1), then ChatKit is removed.
 * Switch in the console: `localStorage.setItem('linx.conversation.surface', 'assistant-ui')`.
 */
export type ConversationSurfaceKind = 'assistant-ui' | 'chatkit'

export const CONVERSATION_SURFACE_STORAGE_KEY = 'linx.conversation.surface'
const CHANGE_EVENT = 'linx:conversation-surface'

export function readConversationSurface(): ConversationSurfaceKind {
  try {
    return globalThis.localStorage?.getItem(CONVERSATION_SURFACE_STORAGE_KEY) === 'assistant-ui'
      ? 'assistant-ui'
      : 'chatkit'
  } catch {
    return 'chatkit'
  }
}

export function writeConversationSurface(kind: ConversationSurfaceKind): void {
  try {
    globalThis.localStorage?.setItem(CONVERSATION_SURFACE_STORAGE_KEY, kind)
  } catch {
    // Private mode: the switch simply does not stick.
  }
  globalThis.dispatchEvent?.(new Event(CHANGE_EVENT))
}

function subscribe(listener: () => void): () => void {
  globalThis.addEventListener?.('storage', listener)
  globalThis.addEventListener?.(CHANGE_EVENT, listener)
  return () => {
    globalThis.removeEventListener?.('storage', listener)
    globalThis.removeEventListener?.(CHANGE_EVENT, listener)
  }
}

export function useConversationSurface(): ConversationSurfaceKind {
  return useSyncExternalStore(subscribe, readConversationSurface, () => 'chatkit')
}
