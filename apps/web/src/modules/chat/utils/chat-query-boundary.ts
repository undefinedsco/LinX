export const CHAT_QUERY_TIMEOUT_MS = 10_000
export const CHAT_QUERY_RETRY = false

export class ChatQueryTimeoutError extends Error {
  readonly kind = 'timeout'
  readonly recoverable = true

  constructor(timeoutMs: number) {
    super(`Chat query timed out after ${timeoutMs}ms.`)
    this.name = 'TimeoutError'
  }
}

export interface ChatQueryBoundaryOptions {
  signal: AbortSignal
  timeoutMs?: number
  isCurrent?: () => boolean
}

export function runChatQueryWithBoundary<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  {
    signal,
    timeoutMs = CHAT_QUERY_TIMEOUT_MS,
    isCurrent = () => true,
  }: ChatQueryBoundaryOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const operationController = new AbortController()

    const cleanup = () => {
      clearTimeout(timeoutId)
      signal.removeEventListener('abort', handleAbort)
    }
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const handleAbort = () => {
      operationController.abort(signal.reason)
      settle(() => reject(createAbortError('Chat query aborted.')))
    }
    const timeoutId = setTimeout(() => {
      operationController.abort(new ChatQueryTimeoutError(timeoutMs))
      settle(() => reject(new ChatQueryTimeoutError(timeoutMs)))
    }, timeoutMs)

    if (signal.aborted) {
      handleAbort()
      return
    }

    signal.addEventListener('abort', handleAbort, { once: true })
    Promise.resolve()
      .then(() => operation(operationController.signal))
      .then(
        (value) => {
          if (!isCurrent()) {
            operationController.abort(createAbortError('Chat query scope changed.'))
            settle(() => reject(createAbortError('Chat query scope changed.')))
            return
          }
          settle(() => resolve(value))
        },
        (error) => settle(() => reject(error)),
      )
  })
}

function createAbortError(message: string): Error {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}
