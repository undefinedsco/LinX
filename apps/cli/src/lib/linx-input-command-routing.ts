import { parseLinxShellCommand, type LinxShellCommand } from './linx-shell-command-router.js'
import {
  isFinalSubmitSetCustomEditorComponentPatched,
  isFinalSubmitWrappedHandler,
  isInputCommandRouterInstalled,
  markFinalSubmitSetCustomEditorComponentPatched,
  markFinalSubmitWrappedHandler,
  markInputCommandRouterInstalled,
} from './linx-interactive-command-routing-host.js'

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

      this.editor?.setText?.('')
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

      interactive.editor?.setText?.('')
      await handleShellCommand(interactive, runtime, command)
    }
    markFinalSubmitWrappedHandler(wrappedSubmit)
    editor.onSubmit = wrappedSubmit
  }

  wrapEditor(interactive.defaultEditor)
  if (interactive.editor !== interactive.defaultEditor) {
    wrapEditor(interactive.editor)
  }

  const originalSetCustomEditorComponent = interactive.setCustomEditorComponent?.bind(interactive)
  if (
    typeof originalSetCustomEditorComponent === 'function'
    && !isFinalSubmitSetCustomEditorComponentPatched(interactive)
  ) {
    interactive.setCustomEditorComponent = function patchedLinxFinalSubmitSetCustomEditorComponent(...args: unknown[]): unknown {
      const result = originalSetCustomEditorComponent(...args)
      wrapEditor(this.defaultEditor)
      if (this.editor !== this.defaultEditor) {
        wrapEditor(this.editor)
      }
      return result
    }
    markFinalSubmitSetCustomEditorComponentPatched(interactive)
  }
}
