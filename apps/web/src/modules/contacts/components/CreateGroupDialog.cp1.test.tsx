/**
 * CP1 Component Tests: CreateGroupDialog
 *
 * Tests rendering, validation, and interaction for the group creation dialog.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'

// Use vi.hoisted so mocks are available in vi.mock factory (hoisted above imports)
const {
  mockContacts,
  mockCreateGroupWithChat,
  mockCreateGroup,
} = vi.hoisted(() => ({
  mockContacts: [
    { id: 'p-1', name: 'Alice', alias: null, contactType: 'solid', deletedAt: null, avatarUrl: null },
    { id: 'p-2', name: 'Bob', alias: null, contactType: 'solid', deletedAt: null, avatarUrl: null },
    { id: 'a-1', name: 'GPT Helper', alias: null, contactType: 'agent', deletedAt: null, avatarUrl: null },
  ],
  mockCreateGroupWithChat: vi.fn().mockResolvedValue({ id: 'g-1', chatId: 'ch-1' }),
  mockCreateGroup: vi.fn().mockResolvedValue({ id: 'g-1', chatId: 'ch-1' }),
}))

vi.mock('../collections', () => ({
  contactOps: {
    getAll: vi.fn(() => mockContacts),
    createGroupWithChat: mockCreateGroupWithChat,
    createGroup: mockCreateGroup,
  },
}))

vi.mock('../feature-flags', () => ({
  CONTACTS_CP1_ENABLED: true,
}))

import { CreateGroupDialog } from './CreateGroupDialog'

const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
}

describe('CreateGroupDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders dialog title and description', () => {
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )
    expect(screen.getByRole('heading', { name: '创建群组' })).toBeInTheDocument()
    expect(screen.getByText('选择成员并创建群聊')).toBeInTheDocument()
  })

  it('renders group name input', () => {
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )
    expect(screen.getByPlaceholderText('输入群组名称')).toBeInTheDocument()
  })

  it('disables create button when no name entered', () => {
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )
    const btn = screen.getByRole('button', { name: '创建群组' })
    expect(btn).toBeDisabled()
  })

  it('disables create button when fewer than 2 members selected', async () => {
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )

    // Type a group name
    const nameInput = screen.getByPlaceholderText('输入群组名称')
    fireEvent.change(nameInput, { target: { value: 'My Group' } })

    // Select only 1 member
    const alice = await screen.findByText('Alice')
    fireEvent.click(alice)

    // Button should still be disabled (need >= 2)
    const btn = screen.getByRole('button', { name: '创建群组' })
    expect(btn).toBeDisabled()
  })

  it('enables create button when name + 2 members selected', async () => {
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )

    const nameInput = screen.getByPlaceholderText('输入群组名称')
    fireEvent.change(nameInput, { target: { value: 'My Group' } })

    // Select 2 members
    const alice = await screen.findByText('Alice')
    const bob = await screen.findByText('Bob')
    fireEvent.click(alice)
    fireEvent.click(bob)

    const btn = screen.getByRole('button', { name: '创建群组' })
    expect(btn).not.toBeDisabled()
  })

  it('shows minimum-2 hint when only 1 selected', async () => {
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )

    const alice = await screen.findByText('Alice')
    fireEvent.click(alice)

    expect(screen.getByText(/至少选择 2 人/)).toBeInTheDocument()
  })

  it('calls onOpenChange(false) on cancel', () => {
    const onOpenChange = vi.fn()
    render(
      <CreateGroupDialog open onOpenChange={onOpenChange} />,
      { wrapper: createWrapper() },
    )

    fireEvent.click(screen.getByText('取消'))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls createGroupWithChat on submit when CP1 enabled', async () => {
    const onCreated = vi.fn()
    render(
      <CreateGroupDialog open onOpenChange={() => {}} onCreated={onCreated} />,
      { wrapper: createWrapper() },
    )

    // Fill name
    fireEvent.change(screen.getByPlaceholderText('输入群组名称'), {
      target: { value: 'Test Group' },
    })

    // Select 2 members
    const alice = await screen.findByText('Alice')
    const bob = await screen.findByText('Bob')
    fireEvent.click(alice)
    fireEvent.click(bob)

    // Submit
    fireEvent.click(screen.getByRole('button', { name: '创建群组' }))

    await waitFor(() => {
      expect(mockCreateGroupWithChat).toHaveBeenCalledWith({
        name: 'Test Group',
        memberIds: expect.arrayContaining(['p-1', 'p-2']),
        aiAssistantIds: [],
      })
    })

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('g-1', 'ch-1')
    })
  })
})
