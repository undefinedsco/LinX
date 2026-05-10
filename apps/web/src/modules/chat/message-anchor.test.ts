import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { findChatMessageAnchorElement, restoreChatMessageAnchor } from './message-anchor'

describe('chat message anchor', () => {
  const scrollIntoView = vi.fn()

  beforeEach(() => {
    scrollIntoView.mockReset()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('finds message anchor in host tree', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div data-message-id="msg-3">hello</div>'

    expect(findChatMessageAnchorElement(host, 'msg-3')).toBe(host.querySelector('[data-message-id="msg-3"]'))
  })

  it('scrolls and highlights the located message anchor', () => {
    const host = document.createElement('div')
    host.innerHTML = '<div data-message-id="msg-3">hello</div>'

    expect(restoreChatMessageAnchor(host, 'msg-3')).toBe(true)
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    })

    const target = host.querySelector<HTMLElement>('[data-message-id="msg-3"]')
    expect(target?.style.boxShadow).toContain('rgba(124, 77, 255')

    vi.advanceTimersByTime(1800)
    expect(target?.style.boxShadow).toBe('')
  })
})
