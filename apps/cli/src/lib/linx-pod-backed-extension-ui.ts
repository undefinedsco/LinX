import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent'
import { createPodBackedExtensionUiContext } from './pod-backed-extension-ui-context.js'
import { getSessionControlManager } from './session-control.js'
import { registerLinxExtensionUiContextHandler } from './linx-extension-ui-context-router.js'
import { resolveLinxSessionCwd, resolveLinxSessionId } from './linx-session-metadata.js'
import { showLinxInteractiveWarning } from './linx-interactive-warning-display.js'

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
        cwd: resolveLinxSessionCwd({ interactive: contextInteractive, runtime }, process.cwd()),
        sessionId: () => resolveLinxSessionId({ interactive: contextInteractive, runtime, session: contextInteractive?.session }),
        sessionControl,
        onWarning(error) {
          const message = error instanceof Error ? error.message : String(error)
          showLinxInteractiveWarning(contextInteractive, `Pod approval sync unavailable: ${message}`)
        },
      })
    },
  })
}
