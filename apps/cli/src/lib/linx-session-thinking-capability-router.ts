export type LinxThinkingSession = {
  model?: { provider?: string; reasoning?: boolean }
  supportsXhighThinking?: () => boolean
  getAvailableThinkingLevels?: () => string[]
}

export type LinxSessionThinkingCapabilityContext = {
  session: LinxThinkingSession
  getAvailableThinkingLevels: () => string[] | undefined
  originalSupportsXhighThinking: () => boolean
}

export type LinxSessionThinkingLevelsContext = {
  session: LinxThinkingSession
  levels: string[]
}

type LinxSessionThinkingCapabilityHandlerEntry = {
  name: string
  priority?: number
  supportsXhighThinking?: (context: LinxSessionThinkingCapabilityContext) => boolean | undefined
  getAvailableThinkingLevels?: (context: LinxSessionThinkingLevelsContext) => string[]
}

type LinxSessionThinkingCapabilityRouterState = {
  installed: boolean
  handlers: LinxSessionThinkingCapabilityHandlerEntry[]
}

const LINX_SESSION_THINKING_CAPABILITY_ROUTER = Symbol.for('linx.runtime.sessionThinkingCapabilityRouter')

export function registerLinxSessionThinkingCapabilityHandler(
  session: LinxThinkingSession,
  entry: LinxSessionThinkingCapabilityHandlerEntry,
): void {
  const state = getLinxSessionThinkingCapabilityRouterState(session)
  if (state.handlers.some((existing) => existing.name === entry.name)) {
    return
  }

  state.handlers.push(entry)
  state.handlers.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))
  installLinxSessionThinkingCapabilityRouter(session, state)
}

function getLinxSessionThinkingCapabilityRouterState(
  session: LinxThinkingSession,
): LinxSessionThinkingCapabilityRouterState {
  if (!session || typeof session !== 'object') {
    return { installed: true, handlers: [] }
  }

  const existing = (session as Record<symbol, unknown>)[LINX_SESSION_THINKING_CAPABILITY_ROUTER]
  if (existing && typeof existing === 'object' && Array.isArray((existing as { handlers?: unknown }).handlers)) {
    return existing as LinxSessionThinkingCapabilityRouterState
  }

  const state: LinxSessionThinkingCapabilityRouterState = {
    installed: false,
    handlers: [],
  }
  ;(session as Record<symbol, unknown>)[LINX_SESSION_THINKING_CAPABILITY_ROUTER] = state
  return state
}

function installLinxSessionThinkingCapabilityRouter(
  session: LinxThinkingSession,
  state: LinxSessionThinkingCapabilityRouterState,
): void {
  if (state.installed) {
    return
  }

  const originalSupportsXhighThinking = session.supportsXhighThinking?.bind(session)
  const originalGetAvailableThinkingLevels = session.getAvailableThinkingLevels?.bind(session)

  session.supportsXhighThinking = () => {
    const context: LinxSessionThinkingCapabilityContext = {
      session,
      getAvailableThinkingLevels: () => session.getAvailableThinkingLevels?.(),
      originalSupportsXhighThinking: () => originalSupportsXhighThinking?.() ?? false,
    }
    for (const entry of state.handlers) {
      const value = entry.supportsXhighThinking?.(context)
      if (value !== undefined) {
        return value
      }
    }
    return context.originalSupportsXhighThinking()
  }

  session.getAvailableThinkingLevels = () => {
    let levels = originalGetAvailableThinkingLevels?.() ?? []
    for (const entry of state.handlers) {
      levels = entry.getAvailableThinkingLevels?.({ session, levels }) ?? levels
    }
    return levels
  }

  state.installed = true
}
