import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveChatDraft } from '@/modules/chat/draft-store'
import { SignOutDialog } from './SignOutDialog'

describe('SignOutDialog', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keeps this account drafts by default and says running work continues', () => {
    saveChatDraft({ accountScope: 'alice', chatId: 'chat-1' }, '共享日历先试两周')
    saveChatDraft({ accountScope: 'alice', chatId: 'chat-2', threadId: 't-1' }, '周六签到改到 9:30')
    saveChatDraft({ accountScope: 'bob', chatId: 'chat-9' }, 'bob 的草稿')
    const onConfirm = vi.fn()

    render(<SignOutDialog open onOpenChange={vi.fn()} accountScope="alice" onConfirm={onConfirm} />)

    expect(screen.getByText('2 条没发出的草稿会留在这台电脑，只有你登录后能看到')).toBeTruthy()
    expect(screen.getByText('正在运行的任务会继续，退出不会停止它们')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(window.localStorage.length).toBe(3)
  })

  it('discards only this account drafts when asked', () => {
    saveChatDraft({ accountScope: 'alice', chatId: 'chat-1' }, '草稿')
    saveChatDraft({ accountScope: 'bob', chatId: 'chat-9' }, 'bob 的草稿')
    const onConfirm = vi.fn()

    render(<SignOutDialog open onOpenChange={vi.fn()} accountScope="alice" onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: '放弃草稿并退出' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(window.localStorage.length).toBe(1)
  })

  it('does not mention drafts when there are none', () => {
    render(<SignOutDialog open onOpenChange={vi.fn()} accountScope="alice" onConfirm={vi.fn()} />)

    expect(screen.queryByText(/草稿/)).toBeNull()
    expect(screen.queryByRole('button', { name: '放弃草稿并退出' })).toBeNull()
  })
})
