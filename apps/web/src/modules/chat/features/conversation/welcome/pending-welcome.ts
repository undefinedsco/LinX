/**
 * The welcome before any topic exists is drawn by `WelcomeConversation`; its
 * first message creates the topic and the conversation surface mounts anew. The
 * welcome text travels across that hop here, so the surface can save it into
 * the new thread (see `InlineWelcome`) instead of losing it. `before` is when the
 * welcome ended (seconds): the saved welcome goes ahead of the first message.
 */
export interface PendingWelcome {
  texts: string[]
  before: number
}

/** Thread item time: whole seconds, like `created_at`. */
export function welcomeClockSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

const pending = new Map<string, PendingWelcome>()

export function setPendingWelcomeTexts(chatId: string, welcome: PendingWelcome): void {
  pending.set(chatId, welcome)
}

/** Returns the waiting welcome of a chat once; null when there is none. */
export function takePendingWelcomeTexts(chatId: string): PendingWelcome | null {
  const welcome = pending.get(chatId) ?? null
  pending.delete(chatId)
  return welcome
}
