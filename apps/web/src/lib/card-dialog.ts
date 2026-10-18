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

export interface CardDialogRequest {
  /** Pod resource URI of the card: a file, or a subject inside a data document. */
  uri: string
  /** Optional spot to jump to and highlight, e.g. an AI citation. */
  locator?: CardDialogLocator
  /** Sibling cards for ‹ › navigation, in display order. */
  siblings?: string[]
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
