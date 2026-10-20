import { useCallback, useEffect } from 'react'
import type { LocalChatKitFetch } from '../../../services/chatkit-local/fetch-handler'
import { setPendingWelcomeTexts, takePendingWelcomeTexts } from './pending-welcome'

/**
 * Saves the welcome into the thread as real assistant messages (see
 * `InlineWelcome`) and merges them into the running timeline right away. Also
 * saves a welcome that was shown before this topic existed.
 */
export function useWelcomePersistence({ localFetch, threadId, chatId, refresh }: {
  localFetch: Pick<LocalChatKitFetch, 'conversation'>
  threadId: string
  chatId: string
  refresh: () => Promise<void>
}) {
  const persistWelcome = useCallback(async (texts: string[]) => {
    const append = localFetch.conversation.appendAssistantMessages
    if (!append) throw new Error('welcome persistence is unavailable')
    await append(threadId, texts)
    await refresh()
  }, [localFetch, threadId, refresh])

  useEffect(() => {
    const texts = takePendingWelcomeTexts(chatId)
    if (!texts) return
    void persistWelcome(texts).catch(() => setPendingWelcomeTexts(chatId, texts))
  }, [persistWelcome, chatId])

  return persistWelcome
}
