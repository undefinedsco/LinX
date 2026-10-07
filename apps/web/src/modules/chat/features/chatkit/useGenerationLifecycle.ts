import { useEffect, useRef } from 'react'

import type { ConversationSurfacePort } from '../../domain/conversation-workbench'

export function useGenerationLifecycle(isGenerating: boolean, surface: ConversationSurfacePort) {
  const wasGeneratingRef = useRef(false)

  useEffect(() => {
    if (!isGenerating) return
    // ChatKit may reset the embedded transcript scroll position when the
    // first assistant item is inserted. Keep the composer visible while the
    // response is streaming instead of jumping the user's viewport upward.
    void surface.focusComposer().catch((error) => {
      console.warn('[ChatKit] Failed to keep composer visible during generation:', error)
    })
  }, [isGenerating, surface])

  useEffect(() => {
    if (isGenerating) {
      wasGeneratingRef.current = true
      return
    }
    if (!wasGeneratingRef.current) return
    wasGeneratingRef.current = false
    // The local service persists the completed assistant item before closing
    // the stream. Refresh once at the terminal transition so ChatKit cannot
    // leave a blank assistant bubble when it misses the final stream event.
    void surface.refresh()
      .then(() => surface.focusComposer())
      .catch((error) => {
        console.warn('[ChatKit] Failed to refresh completed response:', error)
      })
  }, [isGenerating, surface])
}
