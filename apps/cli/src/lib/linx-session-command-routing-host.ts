type SessionCommandMethod = (text: unknown, ...args: unknown[]) => Promise<unknown> | unknown

type SessionCommandRouterOriginals = {
  prompt?: SessionCommandMethod
  sendUserMessage?: SessionCommandMethod
}

const sessionCommandRouterOriginals = new WeakMap<object, SessionCommandRouterOriginals>()
const sessionCommandRouterInstallState = new WeakSet<object>()

export function isSessionCommandRouterInstalled(session: unknown): boolean {
  return Boolean(session && typeof session === 'object' && sessionCommandRouterInstallState.has(session))
}

export function markSessionCommandRouterInstalled(session: object): void {
  sessionCommandRouterInstallState.add(session)
}

export function setSessionCommandRouterOriginals(
  session: object,
  originals: SessionCommandRouterOriginals,
): void {
  sessionCommandRouterOriginals.set(session, originals)
}

export function getSessionCommandRouterOriginalPrompt(session: unknown): SessionCommandMethod | undefined {
  return getSessionCommandRouterOriginals(session).prompt
}

export function getSessionCommandRouterOriginalSendUserMessage(session: unknown): SessionCommandMethod | undefined {
  return getSessionCommandRouterOriginals(session).sendUserMessage
}

function getSessionCommandRouterOriginals(session: unknown): SessionCommandRouterOriginals {
  if (!session || typeof session !== 'object') {
    return {}
  }
  return sessionCommandRouterOriginals.get(session) ?? {}
}
