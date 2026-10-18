import { create } from 'zustand'
import type { CardDialogLocator } from './card-dialog'

/**
 * 问 LinX: any module (a card popup, a file preview, a selection toolbar) asks
 * LinX about a passage. The chat module listens: it opens the LinX 助手 chat and
 * puts the quoted prompt into the composer, focused and never sent on its own.
 *
 * `ask()` returns false when nobody listens (the chat module is not loaded);
 * callers then fall back to something else, e.g. copying the text.
 */
export interface AskLinxRequest {
  /** The quoted prompt to put into the composer. */
  text: string
  /** Pod resource URI the passage comes from; shown as a citation chip. */
  sourceUri?: string
  /** Where inside the source (page, time, line, quote). */
  locator?: CardDialogLocator
  /** Name of the source for the chip (falls back to a generic label). */
  title?: string
}

export interface PendingAskLinx extends AskLinxRequest {
  /** Increases with each request, so identical requests are still distinct. */
  id: number
  /** When it was asked; a request nobody took for a while is dropped, not replayed later. */
  at: number
}

interface AskLinxState {
  pending: PendingAskLinx | null
  listeners: number
  ask: (request: AskLinxRequest) => boolean
  /** The chat marks itself as listening for as long as it can take a request. */
  listen: () => () => void
  /** The composer took the request. */
  settle: (id: number) => void
}

let nextId = 1

/** A request older than this is stale (the chat never showed up for it). */
export const ASK_LINX_MAX_AGE_MS = 60_000

export const useAskLinx = create<AskLinxState>((set, get) => ({
  pending: null,
  listeners: 0,
  ask: (request) => {
    if (get().listeners === 0 || !request.text.trim()) return false
    set({ pending: { ...request, id: nextId++, at: Date.now() } })
    return true
  },
  listen: () => {
    set((state) => ({ listeners: state.listeners + 1 }))
    let active = true
    return () => {
      if (!active) return
      active = false
      set((state) => ({ listeners: Math.max(0, state.listeners - 1) }))
    }
  },
  settle: (id) => set((state) => (state.pending?.id === id ? { pending: null } : state)),
}))

/** `ask({ text, sourceUri, locator })`; see `AskLinxRequest`. */
export function ask(request: AskLinxRequest): boolean {
  return useAskLinx.getState().ask(request)
}
