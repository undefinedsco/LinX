import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('chat selection persistence', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.resetModules()
  })

  it('restores the selected chat and its last thread after a page reload', async () => {
    const { useChatStore } = await import('./store')

    useChatStore.getState().selectChat('chat-1')
    useChatStore.getState().selectThread('thread-1')

    vi.resetModules()
    const { useChatStore: restoredStore } = await import('./store')
    expect(restoredStore.getState()).toMatchObject({
      selectedChatId: 'chat-1',
      selectedThreadId: 'thread-1',
      lastThreadByChat: { 'chat-1': 'thread-1' },
    })
  })

  it('restores the last selected thread when returning to a chat', async () => {
    const { useChatStore } = await import('./store')

    useChatStore.getState().selectChat('chat-1')
    useChatStore.getState().selectThread('thread-1')
    useChatStore.getState().selectChat('chat-2')
    useChatStore.getState().selectThread('thread-2')
    useChatStore.getState().selectChat('chat-1')

    expect(useChatStore.getState().selectedThreadId).toBe('thread-1')
  })
})
