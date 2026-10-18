import { useEffect } from 'react'
import type { AssistantRuntime } from '@assistant-ui/react'

interface VersionPersister {
  persistVisibleVersions: (visibleMessageIds: readonly string[]) => Promise<void>
}

/**
 * Switching versions with the branch picker (an edited message, a regenerated
 * answer) only moves the screen. Once the shown path settles, the choice is
 * saved with the service (`message.select_branch`) so a reload shows the same
 * versions. Never while a run is in flight: the service picks those itself.
 */
export function usePersistVersionChoice(runtime: AssistantRuntime, agent: VersionPersister, onError?: (error: unknown) => void): void {
  useEffect(() => {
    let lastPath = ''
    const sync = () => {
      const state = runtime.thread.getState()
      if (state.isRunning) return
      const path = state.messages.map((message) => message.id)
      const key = path.join('|')
      if (key === lastPath) return
      lastPath = key
      agent.persistVisibleVersions(path).catch((error: unknown) => onError?.(error))
    }
    const unsubscribe = runtime.thread.subscribe(sync)
    sync()
    return unsubscribe
  }, [runtime, agent, onError])
}
