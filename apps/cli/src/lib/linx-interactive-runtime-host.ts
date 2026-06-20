export function ensureInteractiveRuntimeHost(runtime: any): void {
  if (!runtime || typeof runtime !== 'object') {
    return
  }

  if (typeof runtime.setBeforeSessionInvalidate !== 'function') {
    runtime.setBeforeSessionInvalidate = (callback?: () => void): void => {
      runtime.__linxBeforeSessionInvalidate = callback
    }
  }

  if (typeof runtime.setRebindSession !== 'function') {
    runtime.setRebindSession = (callback?: (session: unknown) => Promise<void>): void => {
      runtime.__linxRebindSession = callback
    }
  }
}
