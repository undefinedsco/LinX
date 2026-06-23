export async function stopLinxActiveSessionWork(session: any, options: { waitTimeoutMs?: number } = {}): Promise<void> {
  if (!session) {
    return
  }

  const shouldWait = session.isStreaming === true || session.isBashRunning === true
  try {
    if (session.isBashRunning === true && typeof session.abortBash === 'function') {
      session.abortBash()
    }
    if (session.isStreaming === true && typeof session.abort === 'function') {
      session.abort()
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

export function canSubmitLinxSessionUserInputNow(session: any): boolean {
  return Boolean(session) && !isLinxSessionStreaming(session)
}

export function stopLinxInteractiveSessionWorkNow(interactive: any): boolean {
  const session = interactive?.session
  if (session?.isBashRunning === true && typeof session.abortBash === 'function') {
    void session.abortBash()
    return true
  }

  if (isLinxInteractiveSessionWorkActive(interactive) && typeof session?.abort === 'function') {
    void session.abort()
    return true
  }

  return false
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
