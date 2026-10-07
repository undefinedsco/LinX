import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MemberList, type GroupMember } from './MemberList'

const members: GroupMember[] = [
  {
    memberRef: 'member-1',
    contact: {
      id: 'member-1',
      name: 'Member',
      alias: null,
      contactType: 'solid',
      avatarUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as GroupMember['contact'],
    role: 'member',
  },
]

describe('MemberList keyboard accessibility', () => {
  it('focuses and opens a named member action menu from the keyboard', () => {
    render(<MemberList members={members} />)

    const trigger = screen.getByRole('button', { name: 'Member 的操作' })
    expect(trigger).toHaveClass('focus-within:opacity-100')

    trigger.focus()
    expect(trigger).toHaveFocus()

    fireEvent.keyDown(trigger, { key: 'Enter', code: 'Enter' })
    expect(screen.getByRole('menuitem', { name: '查看资料' })).toBeVisible()
  })
})
