import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent'
import { createPodBackedExtensionUiContext } from './pod-backed-extension-ui-context.js'
import { getSessionControlManager } from './session-control.js'
import { registerLinxExtensionUiContextHandler } from './linx-extension-ui-context-router.js'

export function installPodBackedExtensionUi(
  interactive: any,
  runtime: any,
  sessionControl = getSessionControlManager(interactive, runtime),
): void {
  if (!interactive) {
    return
  }

  registerLinxExtensionUiContextHandler(interactive, {
    name: 'linx-pod-backed-extension-ui:approval-context',
    priority: 0,
    handler({ interactive: contextInteractive, ui }) {
      if (!ui || typeof ui !== 'object') {
        return ui
      }

      return createPodBackedExtensionUiContext(ui as ExtensionUIContext, {
        cwd: contextInteractive?.session?.cwd ?? runtime?.cwd ?? process.cwd(),
        sessionId: () => contextInteractive?.sessionManager?.getSessionId?.()
          ?? contextInteractive?.session?.sessionManager?.getSessionId?.()
          ?? contextInteractive?.session?.sessionId,
        sessionControl,
        onWarning(error) {
          const message = error instanceof Error ? error.message : String(error)
          contextInteractive.showWarning?.(`Pod approval sync unavailable: ${message}`)
        },
      })
    },
  })
}
