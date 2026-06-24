import { showLinxInteractiveWarning } from './linx-interactive-warning-display.js'
import { getSessionControlManager } from './session-control.js'

export function recordInteractiveSubmittedUserMessage(interactive: any, runtime: any, text: string): void {
  const input = text.trim()
  if (!input || input.startsWith('/')) {
    return
  }
  try {
    getSessionControlManager(interactive, runtime).recordUserMessage({ text: input })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    showLinxInteractiveWarning(interactive, `Thread reconciliation unavailable: ${message}`)
  }
}
