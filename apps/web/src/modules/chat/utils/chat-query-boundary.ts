export const CHAT_QUERY_TIMEOUT_MS = 10_000

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
}

export function runChatQueryWithBoundary<T>(
  read: Promise<T>,
  { signal, timeoutMs = CHAT_QUERY_TIMEOUT_MS }: ChatQueryBoundaryOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false

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
      const error = new Error('Chat query aborted.')
      error.name = 'AbortError'
      settle(() => reject(error))
    }
    const timeoutId = setTimeout(() => {
      settle(() => reject(new ChatQueryTimeoutError(timeoutMs)))
    }, timeoutMs)

    if (signal.aborted) {
      handleAbort()
      return
    }

    signal.addEventListener('abort', handleAbort, { once: true })
    read.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    )
  })
}
