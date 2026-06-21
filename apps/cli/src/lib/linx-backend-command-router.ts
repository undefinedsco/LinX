import type { BackendCommandRouter } from './backend-command.js'
import { installProjectedCommandRouter } from './linx-interactive-command-routing.js'
import { shouldRouteToBackendCommand } from './linx-shell-command-router.js'

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

  const originalSetup = interactive.setupEditorSubmitHandler?.bind(interactive)
  if (typeof originalSetup !== 'function') {
    return
  }

  interactive.setupEditorSubmitHandler = function patchedBackendCommandSetupEditorSubmitHandler(...args: unknown[]): unknown {
    const result = originalSetup(...args)
    const originalSubmit = this.defaultEditor?.onSubmit?.bind(this.defaultEditor)
    if (typeof originalSubmit !== 'function') {
      return result
    }

    this.defaultEditor.onSubmit = async (text: string): Promise<void> => {
      const command = text.trim()
      if (!shouldRouteToBackendCommand(command)) {
        await originalSubmit(text)
        return
      }

      let routed
      try {
        routed = await router.execute(command)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.showError?.(`${router.backend} command failed: ${message}`)
        return
      }

      if (!routed.handled) {
        await originalSubmit(text)
        return
      }

      if (routed.clearInput !== false) {
        this.editor?.setText?.('')
      }
      if (routed.message) {
        this.showStatus?.(routed.message)
      }
      this.ui?.requestRender?.()
    }

    return result
  }
}
