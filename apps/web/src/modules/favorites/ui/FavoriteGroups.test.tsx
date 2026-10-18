import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FavoriteGroups } from './FavoriteGroups'

describe('FavoriteGroups', () => {
  it('lists the five types with counts and switches group', () => {
    const onGroupChange = vi.fn()
    render(
      <FavoriteGroups
        searchText=""
        onSearchChange={vi.fn()}
        group="all"
        counts={{ all: 14, messages: 6, chats: 2, files: 3, cards: 2, contacts: 1 }}
        onGroupChange={onGroupChange}
      />,
    )
    expect(screen.getByRole('tab', { name: '全部收藏 14' })).toHaveAttribute('aria-selected', 'true')
    for (const label of ['消息 6', '会话 2', '文件 3', '卡片 2', '联系人 1']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('tab', { name: '文件 3' }))
    expect(onGroupChange).toHaveBeenCalledWith('files')
  })
})
