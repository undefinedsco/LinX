import type { BackendCommandRouter } from './backend-command.js'
import { installProjectedCommandRouter } from './linx-interactive-command-routing.js'
import { shouldRouteToBackendCommand } from './linx-shell-command-router.js'
import { registerLinxInteractiveSubmitHandler } from './linx-interactive-submit-router.js'

type ProjectedCommandRouterInstaller = (interactive: any) => void

export function installBackendCommandRouter(
  interactive: any,
  router: BackendCommandRouter | undefined,
  options: {
    installProjectedCommandRouter?: ProjectedCommandRouterInstaller
  } = {},
): void {
  if (!router) {
    return
  }

  interactive.__linxHandleProjectedBackendCommand = async (text: string): Promise<boolean> => {
    const command = text.trim()
    if (!shouldRouteToBackendCommand(command)) {
      return false
    }

    let routed
    try {
      routed = await router.execute(command)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      interactive.showError?.(`${router.backend} command failed: ${message}`)
      return true
    }

    if (!routed.handled) {
      return false
    }

    if (routed.message) {
      interactive.showStatus?.(routed.message)
    }
    interactive.ui?.requestRender?.()
    return true
  }
  const installProjected = options.installProjectedCommandRouter ?? installProjectedCommandRouter
  installProjected(interactive)

  registerLinxInteractiveSubmitHandler(interactive, {
    name: 'linx-backend-command',
    priority: 40,
    async handler({ interactive: target, input }) {
      const command = input
      if (!shouldRouteToBackendCommand(command)) {
        return false
      }

      let routed
      try {
        routed = await router.execute(command)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        target.showError?.(`${router.backend} command failed: ${message}`)
        return true
      }

      if (!routed.handled) {
        return false
      }

      if (routed.clearInput !== false) {
        target.editor?.setText?.('')
      }
      if (routed.message) {
        target.showStatus?.(routed.message)
      }
      target.ui?.requestRender?.()
      return true
    },
  })
}
