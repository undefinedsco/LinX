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
  const persistWelcome = useCallback(async (texts: string[], before?: number) => {
    const append = localFetch.conversation.appendAssistantMessages
    if (!append) throw new Error('welcome persistence is unavailable')
    await append(threadId, texts, before)
    await refresh()
  }, [localFetch, threadId, refresh])

  useEffect(() => {
    const welcome = takePendingWelcomeTexts(chatId)
    if (!welcome) return
    void persistWelcome(welcome.texts, welcome.before).catch(() => setPendingWelcomeTexts(chatId, welcome))
  }, [persistWelcome, chatId])

  return persistWelcome
}
