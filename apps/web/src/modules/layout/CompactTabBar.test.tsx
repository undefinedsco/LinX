import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CompactTabBar, compactTabFor } from './CompactTabBar'

describe('CompactTabBar', () => {
  it('is 聊天 / 联系人 / 文件 / 我, with no 收藏, 设置 or 我的 AI', () => {
    render(<CompactTabBar activeId="chat" onNavigate={vi.fn()} />)

    const names = screen.getAllByRole('button').map((button) => button.textContent)
    expect(names).toEqual(['聊天', '联系人', '文件', '我'])
  })

  it('keeps 我 selected on pages reached from it', () => {
    for (const id of ['me', 'profile', 'favorites', 'settings', 'model-services'] as const) {
      expect(compactTabFor(id)).toBe('me')
    }
    expect(compactTabFor('inbox')).toBeNull()
    expect(compactTabFor('files')).toBe('files')
  })

  it('navigates when a tab is pressed', () => {
    const onNavigate = vi.fn()
    render(<CompactTabBar activeId="settings" onNavigate={onNavigate} />)

    expect(screen.getByRole('button', { name: '我' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('button', { name: '文件' }))
    expect(onNavigate).toHaveBeenCalledWith('files')
  })
})
