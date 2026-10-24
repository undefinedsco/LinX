import { create } from 'zustand'

/**
 * R6 open rule: every card (file, table row, whiteboard card, file message,
 * citation) opens in one large popup; "展开" switches to the full page.
 * Any module asks for a card through this store; the files module renders it
 * (`CardDialogHost`, mounted once in the shell).
 */
export interface CardDialogLocator {
  page?: number
  timeSeconds?: number
  line?: number
  quote?: string
}

export type CardDialogDraftResult =
  | { kind: 'created'; uri: string; siblings?: string[] }
  | { kind: 'rejected'; reason: 'empty' | 'duplicate' | 'unavailable' }

export interface CardDialogDraft {
  create: (title: string) => Promise<CardDialogDraftResult>
}

export interface CardDialogRequest {
  /** Pod resource URI of the card: a file, or a subject inside a data document. */
  uri: string
  /** Optional spot to jump to and highlight, e.g. an AI citation. */
  locator?: CardDialogLocator
  /** Sibling cards for ‹ › navigation, in display order. */
  siblings?: string[]
  /**
   * A card that does not exist yet (R6 K2 "+ 卡片"): the popup opens empty with the title focused and
   * calls `create` with the typed title. On success the popup continues on the new card's `uri`.
   */
  draft?: CardDialogDraft
  from?: 'chat' | 'table' | 'folder' | 'whiteboard' | 'inbox' | 'search' | 'favorites'
}

interface CardDialogState {
  request: CardDialogRequest | null
  open: (request: CardDialogRequest) => void
  close: () => void
}

export const useCardDialog = create<CardDialogState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}))
