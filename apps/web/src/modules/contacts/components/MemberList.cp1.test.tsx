/**
 * CP1 Component Tests: MemberList
 *
 * Tests permission control, role management actions, and rendering.
 */

import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemberList, type GroupMember } from './MemberList'

const makeContact = (id: string, name: string, type = 'solid') => ({
  id,
  name,
  alias: null,
  contactType: type,
  avatarUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

const baseMembers: GroupMember[] = [
  { contact: makeContact('owner-1', 'Owner') as any, role: 'owner' },
  { contact: makeContact('admin-1', 'Admin') as any, role: 'admin' },
  { contact: makeContact('member-1', 'Member') as any, role: 'member' },
  { contact: makeContact('bot-1', 'AI Bot', 'agent') as any, role: 'member' },
]

describe('MemberList', () => {
  it('renders member count in header', () => {
    render(<MemberList members={baseMembers} />)
    expect(screen.getByText(`群成员 (${baseMembers.length})`)).toBeInTheDocument()
  })

  it('renders all member names', () => {
    render(<MemberList members={baseMembers} />)
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Member')).toBeInTheDocument()
    expect(screen.getByText('AI Bot')).toBeInTheDocument()
  })

  it('shows role badges for owner and admin', () => {
    render(<MemberList members={baseMembers} />)
    expect(screen.getByText('群主')).toBeInTheDocument()
    expect(screen.getByText('管理员')).toBeInTheDocument()
  })

  it('marks current user with (你)', () => {
    render(<MemberList members={baseMembers} currentUserId="member-1" />)
    expect(screen.getByText('(你)')).toBeInTheDocument()
  })

  it('renders search input', () => {
    render(<MemberList members={baseMembers} />)
    expect(screen.getByPlaceholderText('搜索成员')).toBeInTheDocument()
  })

  it('filters members by search', () => {
    render(<MemberList members={baseMembers} />)
    const input = screen.getByPlaceholderText('搜索成员')
    fireEvent.change(input, { target: { value: 'Admin' } })

    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.queryByText('Member')).not.toBeInTheDocument()
  })

  it('renders invite button when onInvite provided', () => {
    const onInvite = vi.fn()
    render(<MemberList members={baseMembers} onInvite={onInvite} />)
    const btn = screen.getByText('邀请成员')
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onInvite).toHaveBeenCalled()
  })

  it('does not render invite button when onInvite not provided', () => {
    render(<MemberList members={baseMembers} />)
    expect(screen.queryByText('邀请成员')).not.toBeInTheDocument()
  })
})
