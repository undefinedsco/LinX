const globalCommandHandlerInstalled = new WeakSet<object>()
const inputCommandRouterInstalled = new WeakSet<object>()
const finalSubmitWrappedHandlers = new WeakSet<object>()
const sessionCommandRouterAfterRebindInstalled = new WeakSet<object>()

export function isGlobalCommandHandlerInstalled(interactive: unknown): boolean {
  return Boolean(interactive && typeof interactive === 'object' && globalCommandHandlerInstalled.has(interactive))
}

export function markGlobalCommandHandlerInstalled(interactive: object): void {
  globalCommandHandlerInstalled.add(interactive)
}

export function isInputCommandRouterInstalled(interactive: unknown): boolean {
  return Boolean(interactive && typeof interactive === 'object' && inputCommandRouterInstalled.has(interactive))
}

export function markInputCommandRouterInstalled(interactive: object): void {
  inputCommandRouterInstalled.add(interactive)
}

export function isFinalSubmitWrappedHandler(handler: unknown): boolean {
  return Boolean(handler && typeof handler === 'function' && finalSubmitWrappedHandlers.has(handler))
}

export function markFinalSubmitWrappedHandler(handler: Function): void {
  finalSubmitWrappedHandlers.add(handler)
}


export function isSessionCommandRouterAfterRebindInstalled(interactive: unknown): boolean {
  return Boolean(
    interactive
      && typeof interactive === 'object'
      && sessionCommandRouterAfterRebindInstalled.has(interactive),
  )
}

export function markSessionCommandRouterAfterRebindInstalled(interactive: object): void {
  sessionCommandRouterAfterRebindInstalled.add(interactive)
}
