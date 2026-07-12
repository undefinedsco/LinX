import { afterEach, describe, expect, it, vi } from 'vitest'
import { runChatQueryWithBoundary } from './chat-query-boundary'

describe('chat query boundary', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects a never-settling read after the configured timeout', async () => {
    vi.useFakeTimers()
    const result = expect(runChatQueryWithBoundary(
      new Promise<never>(() => undefined),
      { signal: new AbortController().signal, timeoutMs: 100 },
    )).rejects.toMatchObject({ name: 'TimeoutError', kind: 'timeout', recoverable: true })

    await vi.advanceTimersByTimeAsync(100)
    await result
  })

  it('rejects a pending read when TanStack Query aborts its signal', async () => {
    const controller = new AbortController()
    const result = expect(runChatQueryWithBoundary(
      new Promise<never>(() => undefined),
      { signal: controller.signal, timeoutMs: 10_000 },
    )).rejects.toMatchObject({ name: 'AbortError' })

    controller.abort()
    await result
  })
})
