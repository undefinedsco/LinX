/**
 * The welcome before any topic exists is drawn by `WelcomeConversation`; its
 * first message creates the topic and the conversation surface mounts anew. The
 * welcome text travels across that hop here, so the surface can save it into
 * the new thread (see `InlineWelcome`) instead of losing it.
 */
const pending = new Map<string, string[]>()

export function setPendingWelcomeTexts(chatId: string, texts: string[]): void {
  pending.set(chatId, texts)
}

/** Returns the waiting welcome text of a chat once; null when there is none. */
export function takePendingWelcomeTexts(chatId: string): string[] | null {
  const texts = pending.get(chatId) ?? null
  pending.delete(chatId)
  return texts
}
