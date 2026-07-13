export type PodRequestErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'missing'
  | 'timeout'
  | 'offline'
  | 'aborted'
  | 'unknown'

export class PodRequestError extends Error {
  readonly cause?: unknown
  readonly recoverable: boolean
  readonly status?: number

  constructor(
    readonly kind: PodRequestErrorKind,
    message: string,
    options: { cause?: unknown; status?: number; recoverable?: boolean } = {},
  ) {
    super(message)
    this.name = 'PodRequestError'
    this.cause = options.cause
    this.status = options.status
    this.recoverable = options.recoverable ?? kind !== 'unauthorized'
  }
}

export interface PodRequestBoundaryOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export function withPodRequestBoundary<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  { signal, timeoutMs = 10_000 }: PodRequestBoundaryOptions = {},
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const controller = new AbortController()
    let settled = false
    const cleanup = () => {
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onAbort)
    }
    const settle = (callback: () => void) => {
      if (settled) return
      settled = true
      cleanup()
      callback()
    }
    const onAbort = () => {
      controller.abort(signal?.reason)
      settle(() => reject(new PodRequestError('aborted', 'Pod request aborted.', {
        cause: signal?.reason,
        recoverable: true,
      })))
    }
    const timeoutId = setTimeout(() => {
      const error = new PodRequestError('timeout', `Pod request timed out after ${timeoutMs}ms.`, {
        recoverable: true,
      })
      controller.abort(error)
      settle(() => reject(error))
    }, timeoutMs)

    if (signal?.aborted) {
      onAbort()
      return
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    Promise.resolve()
      .then(() => operation(controller.signal))
      .then(
        (value) => settle(() => resolve(value)),
        (error) => settle(() => reject(normalizePodRequestError(error))),
      )
  })
}

export function shouldRetryPodRequest(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false
  const kind = readErrorKind(error)
  return kind !== 'unauthorized' && kind !== 'forbidden' && kind !== 'missing' && kind !== 'aborted'
}

function normalizePodRequestError(error: unknown): Error {
  if (error instanceof PodRequestError) return error
  const status = readStatus(error)
  if (status === 401) return new PodRequestError('unauthorized', 'Pod request requires authentication.', { cause: error, status, recoverable: false })
  if (status === 403) return new PodRequestError('forbidden', 'Pod request is forbidden.', { cause: error, status })
  if (status === 404 || status === 410) return new PodRequestError('missing', 'Pod resource was not found.', { cause: error, status })

  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error)
  if (/abort/iu.test(text)) return new PodRequestError('aborted', 'Pod request aborted.', { cause: error })
  if (/timeout|timed out/iu.test(text)) return new PodRequestError('timeout', 'Pod request timed out.', { cause: error })
  if (/network|offline|failed to fetch|connection/iu.test(text)) {
    return new PodRequestError('offline', 'Pod network is unavailable.', { cause: error })
  }
  return error instanceof Error ? error : new PodRequestError('unknown', String(error), { cause: error })
}

function readErrorKind(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  return typeof (error as { kind?: unknown }).kind === 'string'
    ? (error as { kind: string }).kind
    : null
}

function readStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const record = error as { status?: unknown; statusCode?: unknown; response?: unknown; cause?: unknown }
  if (typeof record.status === 'number') return record.status
  if (typeof record.statusCode === 'number') return record.statusCode
  return readStatus(record.response) ?? readStatus(record.cause)
}
