export function throwIfLinxStreamAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return
  }
  throw createLinxStreamAbortError()
}

export function createLinxStreamAbortError(): Error {
  const error = new Error('Request was aborted.')
  error.name = 'AbortError'
  return error
}
