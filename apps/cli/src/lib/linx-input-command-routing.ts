import { parseLinxShellCommand, type LinxShellCommand } from './linx-shell-command-router.js'
import { setLinxInteractiveEditorText } from './linx-interactive-editor-text-host.js'
import {
  isFinalSubmitWrappedHandler,
  isInputCommandRouterInstalled,
  markFinalSubmitWrappedHandler,
  markInputCommandRouterInstalled,
} from './linx-interactive-command-routing-host.js'
import { registerLinxEditorComponentRebindHandler } from './linx-editor-component-router.js'

export type LinxInputShellCommandHandler = (
  interactive: any,
  runtime: any,
  command: LinxShellCommand,
) => Promise<void>

export function installLinxInputCommandRouter(
  interactive: any,
  runtime: any,
  handleShellCommand: LinxInputShellCommandHandler,
): void {
  if (!interactive || isInputCommandRouterInstalled(interactive)) {
    return
  }
  const originalGetUserInput = interactive.getUserInput?.bind(interactive)
  if (typeof originalGetUserInput !== 'function') {
    return
  }

  interactive.getUserInput = async function patchedLinxGetUserInput(...args: unknown[]): Promise<unknown> {
    while (true) {
      const input = await originalGetUserInput(...args)
      if (typeof input !== 'string') {
        return input
      }

      const command = parseLinxShellCommand(input.trim())
      if (!command) {
        return input
      }

      setLinxInteractiveEditorText(this, '')
      await handleShellCommand(this, runtime, command)
    }
  }
  markInputCommandRouterInstalled(interactive)
}

export function installLinxFinalSubmitCommandRouter(
  interactive: any,
  runtime: any,
  handleShellCommand: LinxInputShellCommandHandler,
): void {
  if (!interactive) {
    return
  }

  const wrapEditor = (editor: any): void => {
    if (!editor || typeof editor.onSubmit !== 'function') {
      return
    }
    if (isFinalSubmitWrappedHandler(editor.onSubmit)) {
      return
    }

    const originalSubmit = editor.onSubmit.bind(editor)
    const wrappedSubmit = async (text: string): Promise<void> => {
      const command = parseLinxShellCommand(String(text ?? '').trim())
      if (!command) {
        await originalSubmit(text)
        return
      }

      setLinxInteractiveEditorText(interactive, '')
      await handleShellCommand(interactive, runtime, command)
    }
    markFinalSubmitWrappedHandler(wrappedSubmit)
    editor.onSubmit = wrappedSubmit
  }

  wrapEditor(interactive.defaultEditor)
  if (interactive.editor !== interactive.defaultEditor) {
    wrapEditor(interactive.editor)
  }

  registerLinxEditorComponentRebindHandler(interactive, {
    name: 'linx-final-submit-command-router:wrap-editor-submit',
    priority: 0,
    handler({ interactive: reboundInteractive }) {
      wrapEditor(reboundInteractive.defaultEditor)
      if (reboundInteractive.editor !== reboundInteractive.defaultEditor) {
        wrapEditor(reboundInteractive.editor)
      }
    },
  })
}
