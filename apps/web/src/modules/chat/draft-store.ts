const DRAFT_STORAGE_PREFIX = 'linx.chat.draft.v1'

export interface ChatDraftScope {
  accountScope: string
  chatId: string
  threadId?: string | null
}

function storageKey(scope: ChatDraftScope): string {
  return [
    DRAFT_STORAGE_PREFIX,
    encodeURIComponent(scope.accountScope),
    encodeURIComponent(scope.chatId),
    encodeURIComponent(scope.threadId || '__new__'),
  ].join(':')
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadChatDraft(scope: ChatDraftScope): string {
  const storage = getStorage()
  if (!storage) return ''
  try {
    return storage.getItem(storageKey(scope)) ?? ''
  } catch {
    return ''
  }
}

export function saveChatDraft(scope: ChatDraftScope, text: string): void {
  const storage = getStorage()
  if (!storage) return
  try {
    if (text) {
      storage.setItem(storageKey(scope), text)
    } else {
      storage.removeItem(storageKey(scope))
    }
  } catch {
    // Draft persistence is best-effort; storage can be unavailable in private mode.
  }
}

export function clearChatDraft(scope: ChatDraftScope): void {
  saveChatDraft(scope, '')
}
