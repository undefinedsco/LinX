import { createPodBackedExtensionUiContext } from './pod-backed-extension-ui-context.js'
import { getSessionControlManager } from './session-control.js'

const podBackedExtensionUiInstalled = new WeakSet<object>()

export function installPodBackedExtensionUi(
  interactive: any,
  runtime: any,
  sessionControl = getSessionControlManager(interactive, runtime),
): void {
  if (!interactive || podBackedExtensionUiInstalled.has(interactive)) {
    return
  }

  const originalCreate = interactive.createExtensionUIContext?.bind(interactive)
  if (typeof originalCreate !== 'function') {
    return
  }

  interactive.createExtensionUIContext = function patchedCreateExtensionUIContext(...args: unknown[]): unknown {
    const baseUi = originalCreate(...args)
    if (!baseUi || typeof baseUi !== 'object') {
      return baseUi
    }

    return createPodBackedExtensionUiContext(baseUi, {
      cwd: interactive?.session?.cwd ?? runtime?.cwd ?? process.cwd(),
      sessionId: () => interactive?.sessionManager?.getSessionId?.()
        ?? interactive?.session?.sessionManager?.getSessionId?.()
        ?? interactive?.session?.sessionId,
      sessionControl,
      onWarning(error) {
        const message = error instanceof Error ? error.message : String(error)
        interactive.showWarning?.(`Pod approval sync unavailable: ${message}`)
      },
    })
  }

  podBackedExtensionUiInstalled.add(interactive)
}
