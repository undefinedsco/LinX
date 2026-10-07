import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PodRequestError,
  shouldRetryPodRequest,
  withPodRequestBoundary,
} from './pod-request-boundary'

describe('Pod request boundary', () => {
  afterEach(() => vi.useRealTimers())

  it('turns a never-settling operation into a typed timeout', async () => {
    vi.useFakeTimers()
    const signal = new AbortController().signal
    const result = withPodRequestBoundary(
      () => new Promise<never>(() => undefined),
      { signal, timeoutMs: 2_500 },
    )
    const assertion = expect(result).rejects.toMatchObject({
      name: 'PodRequestError',
      kind: 'timeout',
      recoverable: true,
    })

    await vi.advanceTimersByTimeAsync(2_500)
    await assertion
  })

  it('preserves forbidden errors and never retries them', async () => {
    const signal = new AbortController().signal
    const result = withPodRequestBoundary(
      async () => { throw Object.assign(new Error('HTTP 403'), { status: 403 }) },
      { signal },
    )

    await expect(result).rejects.toMatchObject({ kind: 'forbidden', status: 403 })
    expect(shouldRetryPodRequest(0, new PodRequestError('forbidden', 'no', { status: 403 }))).toBe(false)
  })
})
