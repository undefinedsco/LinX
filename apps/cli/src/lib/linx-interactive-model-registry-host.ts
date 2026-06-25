export type LinxInteractiveAuthStorage = {
  login?: (providerId: string, callbacks: unknown) => Promise<unknown>
  logout?: (providerId: string) => unknown
  set?: (providerId: string, value: unknown) => unknown
  setRuntimeApiKey?: (providerId: string, value: string) => unknown
}

export type LinxInteractiveLoginAuthStorage = LinxInteractiveAuthStorage & {
  login: (providerId: string, callbacks: unknown) => Promise<unknown>
}

export type LinxInteractiveModelRegistry = {
  authStorage?: LinxInteractiveAuthStorage
  refresh?: () => unknown
}

export function getLinxInteractiveModelRegistry(interactive: any): LinxInteractiveModelRegistry | undefined {
  return interactive?.session?.modelRegistry
}

export function getLinxInteractiveAuthStorage(interactive: any): LinxInteractiveAuthStorage | undefined {
  return getLinxInteractiveModelRegistry(interactive)?.authStorage
}

export function getLinxInteractiveLoginAuthStorage(interactive: any): LinxInteractiveLoginAuthStorage | undefined {
  const authStorage = getLinxInteractiveAuthStorage(interactive)
  return typeof authStorage?.login === 'function' ? authStorage as LinxInteractiveLoginAuthStorage : undefined
}

export function refreshLinxInteractiveModelRegistry(interactive: any): void {
  getLinxInteractiveModelRegistry(interactive)?.refresh?.()
}
