import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ContactType } from '@undefineds.co/models'

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  findOrCreateChat: vi.fn(),
}))

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({ data: mocks.rows, isLoading: false, isError: false }),
}))

vi.mock('../../data/collections', () => ({
  contactCollection: {},
  contactOps: { findOrCreateChat: (...args: unknown[]) => mocks.findOrCreateChat(...args) },
}))

import { ContactPickerDialog } from './ContactPickerDialog'

// cmdk measures its list and scrolls the active item into view; jsdom has neither.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView ??= function scrollIntoView() {}

describe('ContactPickerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rows = [
      { id: 'contact-zhou', name: '周禾', contactType: ContactType.SOLID },
      { id: 'contact-agent', name: 'LinX 主理人', contactType: ContactType.AGENT },
      { id: 'contact-group', name: '书店活动组', contactType: ContactType.GROUP },
    ]
  })

  it('lists people and assistants separately and leaves groups out', () => {
    render(<ContactPickerDialog open onOpenChange={vi.fn()} onChatReady={vi.fn()} onAddFriend={vi.fn()} />)

    expect(screen.getByText('朋友')).toBeInTheDocument()
    expect(screen.getByText('周禾')).toBeInTheDocument()
    expect(screen.getByText('LinX 助手')).toBeInTheDocument()
    expect(screen.getByText('助手', { selector: 'span' })).toBeInTheDocument()
    expect(screen.queryByText('书店活动组')).not.toBeInTheDocument()
  })

  it('opens the conversation with the picked contact', async () => {
    const onOpenChange = vi.fn()
    const onChatReady = vi.fn()
    mocks.findOrCreateChat.mockResolvedValue('chat-zhou')

    render(<ContactPickerDialog open onOpenChange={onOpenChange} onChatReady={onChatReady} onAddFriend={vi.fn()} />)

    fireEvent.click(screen.getByText('周禾'))

    await waitFor(() => expect(onChatReady).toHaveBeenCalledWith('chat-zhou'))
    expect(mocks.findOrCreateChat).toHaveBeenCalledWith('contact-zhou')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps the picker open and explains when the chat cannot be opened', async () => {
    const onChatReady = vi.fn()
    mocks.findOrCreateChat.mockRejectedValue(new Error('boom'))

    render(<ContactPickerDialog open onOpenChange={vi.fn()} onChatReady={onChatReady} onAddFriend={vi.fn()} />)

    fireEvent.click(screen.getByText('周禾'))

    expect(await screen.findByText(/没能打开这个聊天|请稍后再试|boom/)).toBeInTheDocument()
    expect(onChatReady).not.toHaveBeenCalled()
  })
})
