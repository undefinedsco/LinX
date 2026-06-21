import type { AutoModePeerCommandRoute } from '@linx/agent-runtime/auto-mode'
import { parseLinxShellCommand, type LinxShellCommand } from './linx-shell-command-router.js'
import { checkAndShowLinxUpdate } from './linx-update-notification.js'
import { handleInteractiveAiConnectCommand } from './linx-ai-connect-command.js'
import { handleInteractiveStatusLineCommand } from './linx-status-line-command.js'
import { handleInteractiveRewindSelector, handleInteractiveRewindTurnsCommand } from './linx-rewind-command.js'
import { changeInteractiveCwd, installLinxCwdStartupNotice } from './linx-workspace-command.js'
import { installLinxAutoEditorIndicator } from './linx-auto-editor-indicator.js'
import { getSecretaryAutoInputController } from './secretary-auto-input-controller.js'
import { getSessionControlManager } from './session-control.js'
import { registerLinxInteractiveSubmitHandler } from './linx-interactive-submit-router.js'
import {
  configureLinxInteractiveShellState,
  getLinxInteractiveAiConnectCommand,
  notifyLinxInteractiveAutoControlChange,
  setLinxInteractiveGoalModeEnabled,
} from './linx-interactive-shell-state.js'

type ShellCommandOptions = {
  onAutoControlChange?: (enabled: boolean) => void | Promise<void>
  handleAiConnectCommand?: (
    interactive: any,
    runtime: any,
    command: Extract<LinxShellCommand, { action: 'ai-connect' }>,
  ) => Promise<void>
}

export function installLinxShellCommands(
  interactive: any,
  runtime: any,
  sessionCwd: string,
  options: ShellCommandOptions = {},
): void {
  installLinxCwdStartupNotice(interactive, sessionCwd)
  installLinxAutoEditorIndicator(interactive)
  if (options.onAutoControlChange) {
    configureLinxInteractiveShellState(interactive, {
      autoControlChange: options.onAutoControlChange,
    })
  }
  if (options.handleAiConnectCommand) {
    configureLinxInteractiveShellState(interactive, {
      aiConnectCommand: options.handleAiConnectCommand,
    })
  }
  installLinxShellCommandHandler(interactive, runtime)
}

export const installLinxGlobalCommands = installLinxShellCommands

function installLinxShellCommandHandler(interactive: any, runtime: any): void {
  if (interactive.__linxGlobalCommandHandlerInstalled) {
    return
  }

  registerLinxInteractiveSubmitHandler(interactive, {
    name: 'linx-shell-command',
    priority: 50,
    async handler({ interactive: target, text, input, originalSubmit }) {
      const command = parseLinxShellCommand(input)
      if (!command) {
        recordSubmittedUserMessage(target, runtime, text)
        return false
      }

      target.editor?.setText?.('')
      await handleLinxShellCommand(target, runtime, command)
      return true
    },
  })

  interactive.__linxGlobalCommandHandlerInstalled = true
  configureLinxInteractiveShellState(interactive, {
    projectedGlobalCommand: async (text: string): Promise<boolean | 'peer-command'> => {
      const command = parseLinxShellCommand(text.trim())
      if (!command) {
        return false
      }
      await handleLinxShellCommand(interactive, runtime, command)
      if (command.action === 'peer-command') {
        return 'peer-command'
      }
      return true
    },
  })
  installProjectedCommandRouter(interactive)
}

export function installLinxInputCommandRouter(interactive: any, runtime: any): void {
  if (!interactive || interactive.__linxInputCommandRouterInstalled) {
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
      await handleLinxShellCommand(this, runtime, command)
    }
  }
  interactive.__linxInputCommandRouterInstalled = true
}

export function installLinxFinalSubmitCommandRouter(interactive: any, runtime: any): void {
  if (!interactive) {
    return
  }

  const wrapEditor = (editor: any): void => {
    if (!editor || typeof editor.onSubmit !== 'function') {
      return
    }
    if (editor.onSubmit.__linxFinalSubmitCommandRouterWrapped === true) {
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
      await handleLinxShellCommand(interactive, runtime, command)
    }
    ;(wrappedSubmit as any).__linxFinalSubmitCommandRouterWrapped = true
    editor.onSubmit = wrappedSubmit
  }

  wrapEditor(interactive.defaultEditor)
  if (interactive.editor !== interactive.defaultEditor) {
    wrapEditor(interactive.editor)
  }

  const originalSetCustomEditorComponent = interactive.setCustomEditorComponent?.bind(interactive)
  if (
    typeof originalSetCustomEditorComponent === 'function'
    && interactive.__linxFinalSubmitSetCustomEditorComponentPatched !== true
  ) {
    interactive.setCustomEditorComponent = function patchedLinxFinalSubmitSetCustomEditorComponent(...args: unknown[]): unknown {
      const result = originalSetCustomEditorComponent(...args)
      wrapEditor(this.defaultEditor)
      if (this.editor !== this.defaultEditor) {
        wrapEditor(this.editor)
      }
      return result
    }
    interactive.__linxFinalSubmitSetCustomEditorComponentPatched = true
  }

  interactive.__linxFinalSubmitCommandRouterInstalled = true
}

export function installLinxSessionCommandRouter(interactive: any, runtime: any): void {
  const session = interactive?.session ?? runtime?.session
  if (!session || typeof session !== 'object' || session.__linxSessionCommandRouterInstalled === true) {
    return
  }

  const originalPrompt = typeof session.prompt === 'function'
    ? session.prompt.bind(session)
    : undefined
  const originalSendUserMessage = typeof session.sendUserMessage === 'function'
    ? session.sendUserMessage.bind(session)
    : undefined

  if (!originalPrompt && !originalSendUserMessage) {
    return
  }

  if (originalPrompt) {
    session.__linxPromptWithoutCommandRouting = originalPrompt
    session.prompt = async (text: unknown, ...args: unknown[]): Promise<unknown> => {
      if (await maybeHandleLinxSessionCommand(interactive, runtime, text)) {
        return undefined
      }
      return originalPrompt(text, ...args)
    }
  }

  if (originalSendUserMessage) {
    session.__linxSendUserMessageWithoutCommandRouting = originalSendUserMessage
    session.sendUserMessage = async (text: unknown, ...args: unknown[]): Promise<unknown> => {
      if (await maybeHandleLinxSessionCommand(interactive, runtime, text)) {
        return undefined
      }
      return originalSendUserMessage(text, ...args)
    }
  }

  session.__linxSessionCommandRouterInstalled = true
}

export function installLinxSessionCommandRouterAfterRebind(interactive: any, runtime: any): void {
  if (!interactive || interactive.__linxSessionCommandRouterAfterRebindInstalled === true) {
    return
  }

  const originalRebind = interactive.rebindCurrentSession?.bind(interactive)
  if (typeof originalRebind !== 'function') {
    return
  }

  interactive.rebindCurrentSession = async function patchedLinxRebindCurrentSession(...args: unknown[]): Promise<unknown> {
    const result = await originalRebind(...args)
    installLinxSessionCommandRouter(this, runtime)
    return result
  }
  interactive.__linxSessionCommandRouterAfterRebindInstalled = true
}

async function maybeHandleLinxSessionCommand(interactive: any, runtime: any, text: unknown): Promise<boolean> {
  if (typeof text !== 'string') {
    return false
  }

  const command = parseLinxShellCommand(text.trim())
  if (!command) {
    return false
  }

  interactive.editor?.setText?.('')
  await handleLinxShellCommand(interactive, runtime, command)
  return true
}

function recordSubmittedUserMessage(interactive: any, runtime: any, text: string): void {
  const input = text.trim()
  if (!input || input.startsWith('/')) {
    return
  }
  try {
    getSessionControlManager(interactive, runtime).recordUserMessage({ text: input })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    interactive.showWarning?.(`Thread reconciliation unavailable: ${message}`)
  }
}

async function handleLinxShellCommand(
  interactive: any,
  runtime: any,
  command: LinxShellCommand,
): Promise<void> {
  if (command.action === 'auto') {
    const auto = command.route.auto
    const enabled = auto?.action === 'set' ? auto.enabled : undefined
    const initialInput = auto?.action === 'set' ? auto.initialInput : undefined
    await handleInteractiveAutoCommand(interactive, runtime, enabled, {
      scheduleImmediately: initialInput === undefined,
    })
    if (initialInput) {
      const controller = getSecretaryAutoInputController(
        interactive,
        runtime,
        getSessionControlManager(interactive, runtime),
      )
      await controller.submit(initialInput, { reason: 'auto-on' })
    }
    return
  }

  if (command.action === 'peer-command') {
    await handleInteractivePeerCommand(interactive, runtime, command.route)
    return
  }

  if (command.action === 'ai-connect') {
    const handler = getLinxInteractiveAiConnectCommand(interactive) ?? handleInteractiveAiConnectCommand
    await handler(interactive, runtime, command)
    return
  }

  if (command.action === 'statusline') {
    await handleInteractiveStatusLineCommand(interactive, command.args)
    return
  }

  if (command.action === 'update') {
    await checkAndShowLinxUpdate(interactive, { manual: true })
    return
  }

  if (command.action === 'rewind-select') {
    await handleInteractiveRewindSelector(interactive, runtime)
    return
  }

  if (command.action === 'rewind-turns') {
    await handleInteractiveRewindTurnsCommand(interactive, runtime, command.turns)
    return
  }

  await changeInteractiveCwd(interactive, runtime, command.target)
}

export function installProjectedCommandRouter(interactive: any): void {
  configureLinxInteractiveShellState(interactive, {})
}

async function handleInteractivePeerCommand(
  interactive: any,
  runtime: any,
  route: AutoModePeerCommandRoute,
): Promise<void> {
  const goalMode = route.secretaryBehavior?.goalMode
  if (goalMode !== undefined) {
    applyInteractiveGoalMode(interactive, runtime, goalMode)
    interactive.showStatus?.(`Peer command routed; Secretary goal supervision mirror is ${goalMode ? 'active' : 'paused'}.`)
  } else {
    interactive.showStatus?.('Peer command routed to current chat peer.')
  }
  await submitProjectedBackendInput(interactive, route.text)
  interactive.ui?.requestRender?.()
}

function applyInteractiveGoalMode(interactive: any, runtime: any, enabled: boolean): void {
  setLinxInteractiveGoalModeEnabled(interactive, runtime, enabled)
}

async function submitProjectedBackendInput(interactive: any, text: string): Promise<void> {
  const session = interactive?.session
  const sendUserMessage = typeof session?.__linxSendUserMessageWithoutCommandRouting === 'function'
    ? session.__linxSendUserMessageWithoutCommandRouting
    : session?.sendUserMessage
  if (typeof sendUserMessage === 'function') {
    await sendUserMessage(text, session.isStreaming ? { deliverAs: 'followUp' } : undefined)
    return
  }

  const prompt = typeof session?.__linxPromptWithoutCommandRouting === 'function'
    ? session.__linxPromptWithoutCommandRouting
    : session?.prompt
  if (typeof prompt === 'function') {
    await prompt(text, session.isStreaming ? { streamingBehavior: 'followUp' } : undefined)
    return
  }

  throw new Error('Active LinX session cannot accept peer goal input')
}

export async function handleInteractiveAutoCommand(
  interactive: any,
  runtime: any,
  enabled: boolean | undefined,
  options: { scheduleImmediately?: boolean } = {},
): Promise<void> {
  if (enabled === undefined) {
    const active = interactive.__autoEnabled === true
    interactive.showStatus?.(formatAutoModeChangeStatus(active))
    interactive.ui?.requestRender?.()
    return
  }

  const control = getSessionControlManager(interactive, runtime)
  control.setAutoEnabled(enabled)
  interactive.__autoEnabled = enabled
  if (runtime && typeof runtime === 'object') {
    runtime.autoEnabled = enabled
  }
  const controller = getSecretaryAutoInputController(interactive, runtime, control)
  if (enabled) {
    controller.start({ scheduleImmediately: options.scheduleImmediately !== false })
  } else {
    controller.stop()
  }
  interactive.showStatus?.(formatAutoModeChangeStatus(enabled))
  interactive.ui?.requestRender?.()
  await notifyLinxInteractiveAutoControlChange(interactive, enabled)
}

function formatAutoModeChangeStatus(enabled: boolean): string {
  return enabled
    ? [
      'Auto is on.',
      'Auto on: Secretary drives the current session input loop.',
      'What changed: backend prompts and blocked approval/input requests go to Secretary first; Secretary answers in-policy and asks you only when blocked.',
      'User-visible state: the input bar shows auto; Ctrl+C or /auto off hands control back to you.',
      'Backend approval policy is unchanged.',
    ].join('\n')
    : [
      'Auto is off.',
      'Auto off: you drive the current session directly.',
      'What changed: backend prompts, approvals, and free-form input return to the local TUI unless another explicit control path handles them.',
      'Auto only controls input ownership; it does not change whether the current chat peer is Secretary or worker/backend.',
      'Use /auto on to hand control back to Secretary.',
    ].join('\n')
}
