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
    { id: 'p-1', name: 'Alice', alias: null, rdfType: 'https://undefineds.co/ns#PersonContact', contactType: 'solid', deletedAt: null, avatarUrl: null, entityUri: 'https://alice.example/profile/card#me' },
    { id: 'p-2', name: 'Bob', alias: null, rdfType: 'https://undefineds.co/ns#PersonContact', contactType: 'solid', deletedAt: null, avatarUrl: null, entityUri: 'https://bob.example/profile/card#me' },
    { id: 'a-1', name: 'GPT Helper', alias: null, rdfType: 'https://undefineds.co/ns#AgentContact', contactType: 'agent', deletedAt: null, avatarUrl: null, entityUri: 'https://pod.example/.data/agents/gpt-helper.ttl#this' },
  ],
  mockCreateGroupWithChat: vi.fn().mockResolvedValue({ id: 'g-1', chatId: 'ch-1' }),
  mockCreateGroup: vi.fn().mockResolvedValue({ id: 'g-1', chatId: 'ch-1' }),
}))

vi.mock('@inrupt/solid-ui-react', () => ({
  useSession: () => ({
    session: {
      info: {
        webId: 'https://me.example/profile/card#me',
      },
    },
  }),
}))

vi.mock('../collections', () => ({
  contactOps: {
    getAll: vi.fn(() => mockContacts),
    createGroupWithChat: mockCreateGroupWithChat,
    createGroup: mockCreateGroup,
  },
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
    expect(screen.queryByText('添加 AI 助手')).not.toBeInTheDocument()
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

  it('disables create button when only self is in the group', () => {
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )

    const nameInput = screen.getByPlaceholderText('输入群组名称')
    fireEvent.change(nameInput, { target: { value: 'My Group' } })

    const btn = screen.getByRole('button', { name: '创建群组' })
    expect(btn).toBeDisabled()
  })

  it('enables create button when name + 1 member selected', async () => {
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )

    const nameInput = screen.getByPlaceholderText('输入群组名称')
    fireEvent.change(nameInput, { target: { value: 'My Group' } })

    const alice = await screen.findByText('Alice')
    fireEvent.click(alice)

    const btn = screen.getByRole('button', { name: '创建群组' })
    expect(btn).not.toBeDisabled()
  })

  it('shows owner-inclusive summary and minimum hint', () => {
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText(/共 1 人，包含你/)).toBeInTheDocument()
    expect(screen.getByText(/至少选择 1 人/)).toBeInTheDocument()
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

  it('calls createGroupWithChat on submit', async () => {
    const onCreated = vi.fn()
    render(
      <CreateGroupDialog open onOpenChange={() => {}} onCreated={onCreated} />,
      { wrapper: createWrapper() },
    )

    // Fill name
    fireEvent.change(screen.getByPlaceholderText('输入群组名称'), {
      target: { value: 'Test Group' },
    })

    // Select 1 member + self
    const alice = await screen.findByText('Alice')
    fireEvent.click(alice)

    // Submit
    fireEvent.click(screen.getByRole('button', { name: '创建群组' }))

    await waitFor(() => {
      expect(mockCreateGroupWithChat).toHaveBeenCalledWith({
        name: 'Test Group',
        participants: expect.arrayContaining([
          'https://alice.example/profile/card#me',
        ]),
        ownerRef: 'https://me.example/profile/card#me',
      })
    })

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('g-1', 'ch-1')
    })
  })
})
