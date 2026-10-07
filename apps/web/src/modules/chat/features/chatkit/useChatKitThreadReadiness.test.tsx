import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useChatKitThreadReadiness } from './useChatKitThreadReadiness'

describe('useChatKitThreadReadiness', () => {
  it('does not expose a sendable thread until restoration finishes', () => {
    const { result, rerender } = renderHook(
      ({ threadId }) => useChatKitThreadReadiness({
        selectedChatId: 'chat-1',
        selectedThreadId: threadId,
        isMounted: true,
        loadFailed: false,
      }),
      { initialProps: { threadId: 'thread-1' } },
    )

    act(() => result.current.markLoaded({ threadId: 'thread-1' }))
    expect(result.current.isThreadReady).toBe(false)

    act(() => result.current.markRestored())
    expect(result.current.isThreadReady).toBe(true)

    act(() => result.current.markLoading())
    expect(result.current.isThreadReady).toBe(false)
    act(() => result.current.markLoaded({ threadId: 'thread-1' }))
    expect(result.current.isThreadReady).toBe(true)

    rerender({ threadId: 'thread-2' })
    expect(result.current.isThreadReady).toBe(false)
  })
})
