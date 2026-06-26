import {
  getSessionCommandRouterOriginalPrompt,
  getSessionCommandRouterOriginalSendUserMessage,
} from './linx-session-command-routing-host.js'
import { restoreLinxSessionHistoryBranch, type LinxSessionRetryTurn } from './linx-session-history.js'
import { showLinxInteractiveError } from './linx-interactive-error-display.js'

export async function stopLinxActiveSessionWork(session: any, options: { waitTimeoutMs?: number } = {}): Promise<void> {
  if (!session) {
    return
  }

  const shouldWait = session.isStreaming === true || session.isBashRunning === true
  try {
    if (session.isBashRunning === true && typeof session.abortBash === 'function') {
      absorbLinxSessionAbortResult(session.abortBash())
    }
    if (session.isStreaming === true && typeof session.abort === 'function') {
      absorbLinxSessionAbortResult(session.abort())
    }
  } catch {
    // Callers may still need to repair local shell/session state even if abort reporting fails.
  }

  if (!shouldWait || typeof session.agent?.waitForIdle !== 'function') {
    return
  }

  await Promise.race([
    Promise.resolve(session.agent.waitForIdle()).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, options.waitTimeoutMs ?? 1_500)),
  ])
}

export async function stopLinxInteractiveSessionWork(
  interactive: any,
  runtime: any,
  options: { waitTimeoutMs?: number } = {},
): Promise<void> {
  await stopLinxActiveSessionWork(interactive?.session ?? runtime?.session, options)
}

function absorbLinxSessionAbortResult(result: unknown): void {
  if (!isPromiseLike(result)) {
    return
  }
  void Promise.resolve(result).catch(() => undefined)
}

export async function submitLinxSessionUserInput(session: any, text: string, options: {
  sendUserMessage?: (text: unknown, ...args: unknown[]) => Promise<unknown> | unknown
  prompt?: (text: unknown, ...args: unknown[]) => Promise<unknown> | unknown
  unavailableMessage?: string
} = {}): Promise<void> {
  const sendUserMessage = options.sendUserMessage ?? session?.sendUserMessage
  if (typeof sendUserMessage === 'function') {
    const deliveryOptions = isLinxSessionStreaming(session) ? { deliverAs: 'followUp' } : undefined
    await sendUserMessage.call(session, text, deliveryOptions)
    return
  }

  const prompt = options.prompt ?? session?.prompt
  if (typeof prompt === 'function') {
    const deliveryOptions = isLinxSessionStreaming(session) ? { streamingBehavior: 'followUp' } : undefined
    await prompt.call(session, text, deliveryOptions)
    return
  }

  throw new Error(options.unavailableMessage ?? 'Active LinX session cannot accept user input')
}

export async function submitLinxInteractiveSessionUserInput(interactive: any, text: string, options: {
  sendUserMessage?: (text: unknown, ...args: unknown[]) => Promise<unknown> | unknown
  prompt?: (text: unknown, ...args: unknown[]) => Promise<unknown> | unknown
  unavailableMessage?: string
} = {}): Promise<void> {
  await submitLinxSessionUserInput(interactive?.session, text, options)
}

export async function submitLinxInteractiveSessionUserInputBypassingCommandRouter(
  interactive: any,
  text: string,
  options: { unavailableMessage?: string } = {},
): Promise<void> {
  const session = interactive?.session
  await submitLinxSessionUserInput(session, text, {
    sendUserMessage: getSessionCommandRouterOriginalSendUserMessage(session),
    prompt: getSessionCommandRouterOriginalPrompt(session),
    unavailableMessage: options.unavailableMessage,
  })
}

export async function retryLinxInteractiveSessionTurn(
  interactive: any,
  pending: LinxSessionRetryTurn,
  options: { onRetryFailed?: (error: unknown) => void } = {},
): Promise<boolean> {
  const session = interactive?.session
  if (!session) {
    return false
  }

  await session.agent?.waitForIdle?.()

  try {
    restoreLinxSessionHistoryBranch({ session }, pending.continueFromId)
    if (typeof session.agent?.continue === 'function') {
      startLinxSessionContinuation(session, pending, options)
      return true
    }
  } catch (error) {
    if (!pending.promptText) {
      throw error
    }
  }

  if (!pending.promptText || typeof session.prompt !== 'function') {
    return false
  }

  restoreLinxSessionHistoryBranch({ session }, pending.promptParentId)
  const promptResult = session.prompt(pending.promptText)
  if (isPromiseLike(promptResult)) {
    Promise.resolve(promptResult).catch((error: unknown) => options.onRetryFailed?.(error))
  }
  return true
}

export type LinxRuntimeProjectionMessage = {
  customType: string
  content: string
  display?: boolean
  details?: unknown
}

export async function queueLinxSessionRuntimeProjection(session: any, message: LinxRuntimeProjectionMessage, options: {
  deliverAs?: 'steer' | 'followUp' | 'nextTurn'
  sendCustomMessage?: (message: LinxRuntimeProjectionMessage, options?: unknown) => Promise<unknown> | unknown
} = {}): Promise<boolean> {
  const sendCustomMessage = options.sendCustomMessage ?? session?.sendCustomMessage
  if (typeof sendCustomMessage !== 'function') {
    return false
  }

  await sendCustomMessage.call(session, {
    ...message,
    display: message.display ?? false,
  }, { deliverAs: options.deliverAs ?? 'nextTurn' })
  return true
}

export async function queueLinxInteractiveSessionRuntimeProjection(interactive: any, message: LinxRuntimeProjectionMessage, options: {
  deliverAs?: 'steer' | 'followUp' | 'nextTurn'
  sendCustomMessage?: (message: LinxRuntimeProjectionMessage, options?: unknown) => Promise<unknown> | unknown
} = {}): Promise<boolean> {
  return queueLinxSessionRuntimeProjection(interactive?.session, message, options)
}

export function subscribeLinxInteractiveSessionEvents(
  interactive: any,
  listener: (event: unknown) => void,
): (() => void) | null {
  const session = interactive?.session
  const subscribe = session?.subscribe
  if (typeof subscribe !== 'function') {
    return null
  }

  const unsubscribe = subscribe.call(session, listener)
  return typeof unsubscribe === 'function' ? unsubscribe : null
}

export function canSubmitLinxSessionUserInputNow(session: any): boolean {
  return Boolean(session) && !isLinxSessionStreaming(session)
}

export function canSubmitLinxInteractiveSessionUserInputNow(interactive: any): boolean {
  return canSubmitLinxSessionUserInputNow(interactive?.session)
}

export function stopLinxInteractiveSessionWorkNow(interactive: any): boolean {
  const session = interactive?.session
  if (session?.isBashRunning === true && typeof session.abortBash === 'function') {
    runLinxSessionInterrupt(interactive, () => session.abortBash())
    return true
  }

  if (isLinxInteractiveSessionWorkActive(interactive) && typeof session?.abort === 'function') {
    runLinxSessionInterrupt(interactive, () => session.abort())
    return true
  }

  return false
}

function runLinxSessionInterrupt(interactive: any, interrupt: () => unknown): void {
  try {
    const result = interrupt()
    if (isPromiseLike(result)) {
      Promise.resolve(result).catch((error: unknown) => {
        reportLinxSessionInterruptError(interactive, error)
      })
    }
  } catch (error) {
    reportLinxSessionInterruptError(interactive, error)
  }
}

function reportLinxSessionInterruptError(interactive: any, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  showLinxInteractiveError(interactive, `LinX session interrupt failed: ${message}`)
}

function isLinxSessionStreaming(session: any): boolean {
  return session?.isStreaming === true
}

function isLinxInteractiveSessionWorkActive(interactive: any): boolean {
  return isLinxSessionStreaming(interactive?.session)
    || Boolean(interactive?.loadingAnimation)
    || Boolean(interactive?.autoCompactionEscapeHandler)
    || Boolean(interactive?.retryEscapeHandler)
}

function startLinxSessionContinuation(
  session: any,
  pending: LinxSessionRetryTurn,
  options: { onRetryFailed?: (error: unknown) => void },
): void {
  try {
    const result = session.agent.continue()
    if (isPromiseLike(result)) {
      Promise.resolve(result).catch((error: unknown) => {
        void retryLinxSessionPromptFallback(session, pending, error, options)
      })
    }
  } catch (error) {
    void retryLinxSessionPromptFallback(session, pending, error, options)
  }
}

async function retryLinxSessionPromptFallback(
  session: any,
  pending: LinxSessionRetryTurn,
  cause: unknown,
  options: { onRetryFailed?: (error: unknown) => void },
): Promise<void> {
  if (!pending.promptText || typeof session?.prompt !== 'function') {
    options.onRetryFailed?.(cause)
    return
  }

  try {
    restoreLinxSessionHistoryBranch({ session }, pending.promptParentId)
    await session.prompt(pending.promptText)
  } catch (error) {
    options.onRetryFailed?.(error)
  }
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && typeof (value as { then?: unknown }).then === 'function')
}
