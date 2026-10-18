import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('聊天信息 open state', () => {
  beforeEach(() => {
    vi.resetModules()
    window.localStorage.removeItem('linx:chat-info-open:v1')
  })

  it('is closed by default and remembers the last choice', async () => {
    const first = await import('./store')
    expect(first.useChatStore.getState().showRightSidebar).toBe(false)
    first.useChatStore.getState().toggleRightSidebar()
    expect(first.useChatStore.getState().showRightSidebar).toBe(true)

    vi.resetModules()
    const second = await import('./store')
    expect(second.useChatStore.getState().showRightSidebar).toBe(true)
    second.useChatStore.getState().setRightSidebarOpen(false)

    vi.resetModules()
    const third = await import('./store')
    expect(third.useChatStore.getState().showRightSidebar).toBe(false)
  })
})
