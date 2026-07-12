import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHAT_QUERY_RETRY, runChatQueryWithBoundary } from './chat-query-boundary'

describe('chat query boundary', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects a never-settling read after the configured timeout', async () => {
    vi.useFakeTimers()
    let operationSignal: AbortSignal | null = null
    const result = expect(runChatQueryWithBoundary(
      (signal) => {
        operationSignal = signal
        return new Promise<never>(() => undefined)
      },
      { signal: new AbortController().signal, timeoutMs: 100 },
    )).rejects.toMatchObject({ name: 'TimeoutError', kind: 'timeout', recoverable: true })

    await vi.advanceTimersByTimeAsync(100)
    await result
    expect(operationSignal?.aborted).toBe(true)
  })

  it('rejects a pending read when TanStack Query aborts its signal', async () => {
    const controller = new AbortController()
    let operationSignal: AbortSignal | null = null
    const result = expect(runChatQueryWithBoundary(
      (signal) => {
        operationSignal = signal
        return new Promise<never>(() => undefined)
      },
      { signal: controller.signal, timeoutMs: 10_000 },
    )).rejects.toMatchObject({ name: 'AbortError' })

    controller.abort()
    await result
    expect(operationSignal?.aborted).toBe(true)
  })

  it('rejects a late result when its account generation is stale before cache commit', async () => {
    let resolveRead: ((value: string) => void) | undefined
    let isCurrent = true
    const commit = vi.fn()
    const bounded = runChatQueryWithBoundary(
      () => new Promise<string>((resolve) => {
        resolveRead = resolve
      }),
      {
        signal: new AbortController().signal,
        timeoutMs: 10_000,
        isCurrent: () => isCurrent,
      },
    )
    const cacheWrite = bounded.then(commit, () => undefined)

    await Promise.resolve()
    isCurrent = false
    resolveRead?.('old account row')

    await expect(bounded).rejects.toMatchObject({ name: 'AbortError' })
    await cacheWrite
    expect(commit).not.toHaveBeenCalled()
  })

  it('disables automatic same-key retries to bound ignored transport work', () => {
    expect(CHAT_QUERY_RETRY).toBe(false)
  })
})
