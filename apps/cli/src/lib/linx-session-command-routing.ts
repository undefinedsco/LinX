import { parseLinxShellCommand, type LinxShellCommand } from './linx-shell-command-router.js'
import {
  isSessionCommandRouterAfterRebindInstalled,
  markSessionCommandRouterAfterRebindInstalled,
} from './linx-interactive-command-routing-host.js'
import {
  isSessionCommandRouterInstalled,
  markSessionCommandRouterInstalled,
  setSessionCommandRouterOriginals,
} from './linx-session-command-routing-host.js'

export type LinxSessionCommandHandler = (
  interactive: any,
  runtime: any,
  command: LinxShellCommand,
) => Promise<void> | void

export function installLinxSessionCommandRouter(
  interactive: any,
  runtime: any,
  handleCommand: LinxSessionCommandHandler,
): void {
  const session = interactive?.session ?? runtime?.session
  if (!session || typeof session !== 'object' || isSessionCommandRouterInstalled(session)) {
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

  setSessionCommandRouterOriginals(session, {
    prompt: originalPrompt,
    sendUserMessage: originalSendUserMessage,
  })

  if (originalPrompt) {
    session.prompt = async (text: unknown, ...args: unknown[]): Promise<unknown> => {
      if (await maybeHandleLinxSessionCommand(interactive, runtime, text, handleCommand)) {
        return undefined
      }
      return originalPrompt(text, ...args)
    }
  }

  if (originalSendUserMessage) {
    session.sendUserMessage = async (text: unknown, ...args: unknown[]): Promise<unknown> => {
      if (await maybeHandleLinxSessionCommand(interactive, runtime, text, handleCommand)) {
        return undefined
      }
      return originalSendUserMessage(text, ...args)
    }
  }

  markSessionCommandRouterInstalled(session)
}

export function installLinxSessionCommandRouterAfterRebind(
  interactive: any,
  runtime: any,
  handleCommand: LinxSessionCommandHandler,
): void {
  if (!interactive || isSessionCommandRouterAfterRebindInstalled(interactive)) {
    return
  }

  const originalRebind = interactive.rebindCurrentSession?.bind(interactive)
  if (typeof originalRebind !== 'function') {
    return
  }

  interactive.rebindCurrentSession = async function patchedLinxRebindCurrentSession(...args: unknown[]): Promise<unknown> {
    const result = await originalRebind(...args)
    installLinxSessionCommandRouter(this, runtime, handleCommand)
    return result
  }
  markSessionCommandRouterAfterRebindInstalled(interactive)
}

async function maybeHandleLinxSessionCommand(
  interactive: any,
  runtime: any,
  text: unknown,
  handleCommand: LinxSessionCommandHandler,
): Promise<boolean> {
  if (typeof text !== 'string') {
    return false
  }

  const command = parseLinxShellCommand(text.trim())
  if (!command) {
    return false
  }

  interactive.editor?.setText?.('')
  await handleCommand(interactive, runtime, command)
  return true
}
