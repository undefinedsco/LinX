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

function isLinxInteractiveSessionWorkActive(interactive: any): boolean {
  return interactive?.session?.isStreaming === true
    || Boolean(interactive?.loadingAnimation)
    || Boolean(interactive?.autoCompactionEscapeHandler)
    || Boolean(interactive?.retryEscapeHandler)
}
