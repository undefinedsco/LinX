import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConversationShareDialog } from './ConversationShareDialog'

const mocked = vi.hoisted(() => ({
  createConversationShare: vi.fn(),
  listConversationShares: vi.fn(),
  revokeConversationShare: vi.fn(),
}))

vi.mock('../services/conversation-share', () => ({
  createConversationShare: mocked.createConversationShare,
  listConversationShares: mocked.listConversationShares,
  revokeConversationShare: mocked.revokeConversationShare,
}))

const existingShare = {
  id: 'share-existing',
  url: 'https://pod.example/public/chat-shares/existing.html',
  resourceUri: 'https://pod.example/public/chat-shares/existing.html',
  permissionUri: 'https://pod.example/public/chat-shares/existing.html.acl',
  threadUri: 'https://pod.example/.data/chat/thread.ttl#thread',
  createdAt: '2026-08-11T00:00:00.000Z',
}

const messages = [
  { id: 'user-1', role: 'user', content: '用户的私密问题', createdAt: '2026-08-11T00:00:00.000Z' },
  { id: 'assistant-1', role: 'assistant', content: '可以分享的回答', createdAt: '2026-08-11T00:01:00.000Z' },
  { id: 'tool-1', role: 'tool', content: '工具完成', richContent: JSON.stringify({ authorization: 'Bearer secret', result: 'ok' }) },
]

describe('ConversationShareDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.listConversationShares.mockResolvedValue([existingShare])
    mocked.createConversationShare.mockResolvedValue({ ...existingShare, id: 'share-new', url: 'https://pod.example/public/chat-shares/new.html' })
    mocked.revokeConversationShare.mockResolvedValue(undefined)
  })

  it('creates a filtered share with explicit tool-detail opt-in and revokes an existing share', async () => {
    render(<ConversationShareDialog
      open
      onOpenChange={vi.fn()}
      title="Release review"
      threadUri={existingShare.threadUri}
      db={{} as any}
      ownerWebId="https://pod.example/profile/card#me"
      podBaseUrl="https://pod.example/"
      authFetch={vi.fn() as any}
      messages={messages}
    />)

    expect(await screen.findByText(existingShare.url)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /用户/u }))
    fireEvent.click(screen.getByRole('checkbox', { name: '包含工具详情' }))
    fireEvent.click(screen.getByRole('button', { name: '创建只读分享' }))

    await waitFor(() => expect(mocked.createConversationShare).toHaveBeenCalledWith(expect.objectContaining({
      messages,
      options: expect.objectContaining({
        title: 'Release review',
        includeToolDetails: true,
        excludedMessageIds: expect.any(Set),
      }),
    })))
    const options = mocked.createConversationShare.mock.calls[0]?.[0]?.options
    expect(options.excludedMessageIds.has('user-1')).toBe(true)

    fireEvent.click(screen.getAllByRole('button', { name: '撤销' })[1])
    await waitFor(() => expect(mocked.revokeConversationShare).toHaveBeenCalledWith(expect.objectContaining({
      share: existingShare,
    })))
  })

  it('does not create a share when every visible conversation message is excluded', async () => {
    render(<ConversationShareDialog
      open
      onOpenChange={vi.fn()}
      title="Release review"
      threadUri={existingShare.threadUri}
      db={{} as any}
      ownerWebId="https://pod.example/profile/card#me"
      podBaseUrl="https://pod.example/"
      authFetch={vi.fn() as any}
      messages={messages}
    />)

    await screen.findByText(existingShare.url)
    fireEvent.click(screen.getByRole('checkbox', { name: /用户/u }))
    fireEvent.click(screen.getByRole('checkbox', { name: /LinX/u }))

    expect(screen.getByRole('button', { name: '创建只读分享' })).toBeDisabled()
    expect(mocked.createConversationShare).not.toHaveBeenCalled()
  })

  it('clears stale message exclusions when the selected thread changes', async () => {
    const { rerender } = render(<ConversationShareDialog
      open
      onOpenChange={vi.fn()}
      title="First thread"
      threadUri={existingShare.threadUri}
      db={{} as any}
      ownerWebId="https://pod.example/profile/card#me"
      podBaseUrl="https://pod.example/"
      authFetch={vi.fn() as any}
      messages={messages}
    />)

    await screen.findByText(existingShare.url)
    fireEvent.click(screen.getByRole('checkbox', { name: /用户/u }))
    fireEvent.click(screen.getByRole('checkbox', { name: /LinX/u }))
    expect(screen.getByRole('button', { name: '创建只读分享' })).toBeDisabled()

    rerender(<ConversationShareDialog
      open
      onOpenChange={vi.fn()}
      title="Second thread"
      threadUri="https://pod.example/.data/chat/other.ttl#thread"
      db={{} as any}
      ownerWebId="https://pod.example/profile/card#me"
      podBaseUrl="https://pod.example/"
      authFetch={vi.fn() as any}
      messages={messages}
    />)

    await waitFor(() => expect(screen.getByRole('button', { name: '创建只读分享' })).toBeEnabled())
    expect(screen.getByRole('checkbox', { name: /用户/u })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /LinX/u })).toBeChecked()
  })

  it('writes a printable document into a detached popup', async () => {
    const write = vi.fn()
    const print = vi.fn()
    const addEventListener = vi.fn((_type: string, listener: EventListener) => listener(new Event('load')))
    const printWindow = {
      opener: window,
      document: { open: vi.fn(), write, close: vi.fn() },
      addEventListener,
      print,
    }
    const open = vi.spyOn(window, 'open').mockReturnValue(printWindow as any)
    render(<ConversationShareDialog
      open
      onOpenChange={vi.fn()}
      title="Printable thread"
      threadUri={existingShare.threadUri}
      db={{} as any}
      ownerWebId="https://pod.example/profile/card#me"
      podBaseUrl="https://pod.example/"
      authFetch={vi.fn() as any}
      messages={messages}
    />)

    await screen.findByText(existingShare.url)
    fireEvent.click(screen.getByRole('button', { name: '打印 / PDF' }))

    expect(open).toHaveBeenCalledWith('', '_blank')
    expect(printWindow.opener).toBeNull()
    expect(write).toHaveBeenCalledWith(expect.stringContaining('Printable thread'))
    expect(print).toHaveBeenCalledOnce()
  })
})
