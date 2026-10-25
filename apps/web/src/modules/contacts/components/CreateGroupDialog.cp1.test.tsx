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
  mockMatrixAccess,
} = vi.hoisted(() => ({
  mockMatrixAccess: {
    get: vi.fn(),
    authorize: vi.fn(),
    importAuthorization: vi.fn(),
    accountOrigin: () => 'https://id.example',
    release: vi.fn(),
  },
  mockContacts: [
    { id: 'p-1', name: 'Alice', alias: null, rdfType: 'https://undefineds.co/ns#PersonContact', contactType: 'solid', deletedAt: null, avatarUrl: null, about: 'https://alice.example/profile/card#me' },
    { id: 'p-2', name: 'Bob', alias: null, rdfType: 'https://undefineds.co/ns#PersonContact', contactType: 'solid', deletedAt: null, avatarUrl: null, about: 'https://bob.example/profile/card#me' },
    { id: 'a-1', name: 'GPT Helper', alias: null, rdfType: 'https://undefineds.co/ns#AgentContact', contactType: 'agent', deletedAt: null, avatarUrl: null, about: 'https://pod.example/agents/gpt-helper/profile/card#me' },
  ],
  mockCreateGroupWithChat: vi.fn().mockResolvedValue({ id: 'g-1', chatId: 'ch-1' }),
  mockCreateGroup: vi.fn().mockResolvedValue({ id: 'g-1', chatId: 'ch-1' }),
}))

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({
    session: {
      info: {
        webId: 'https://me.example/profile/card#me',
      },
    },
  }),
}))

vi.mock('@/lib/matrix/usePodInterfaceAccess', () => ({
  usePodInterfaceAccess: () => mockMatrixAccess,
}))

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: () => ({ data: mockContacts, isLoading: false, isError: false }),
}))

vi.mock('../data/collections', () => ({
  contactCollection: { name: 'contacts' },
  contactOps: {
    getAll: vi.fn(() => mockContacts),
    createGroupWithChat: mockCreateGroupWithChat,
    createGroup: mockCreateGroup,
  },
}))

import { MatrixInterfaceAuthorizeUnavailableError } from '@/lib/matrix/pod-interface-access'
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
    mockMatrixAccess.get.mockReturnValue({
      apiKey: 'sk-session',
      webId: 'https://me.example/profile/card#me',
      accountOrigin: 'https://id.example',
      origin: 'https://me.example',
      podUrl: 'https://me.example/alice/',
    })
    mockMatrixAccess.authorize.mockResolvedValue({
      apiKey: 'sk-session',
      webId: 'https://me.example/profile/card#me',
      accountOrigin: 'https://id.example',
      origin: 'https://me.example',
      podUrl: 'https://me.example/alice/',
    })
  })

  it('does not mint a Pod credential until the user confirms the group-chat authorization', async () => {
    mockMatrixAccess.get.mockReturnValue(null)
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )

    fireEvent.change(screen.getByPlaceholderText('输入群组名称'), { target: { value: 'Shared' } })
    fireEvent.click(await screen.findByText('Alice'))
    fireEvent.click(screen.getByRole('button', { name: '创建群组' }))

    expect(mockMatrixAccess.authorize).not.toHaveBeenCalled()
    expect(mockCreateGroupWithChat).not.toHaveBeenCalled()
    expect(screen.getByText('群聊需要一次空间授权')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '授权并创建' }))
    await waitFor(() => expect(mockMatrixAccess.authorize).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockCreateGroupWithChat).toHaveBeenCalledTimes(1))
  })

  it('guides native Account grant when programmatic issuance is unavailable, then uses the imported key', async () => {
    mockMatrixAccess.get.mockReturnValue(null)
    mockMatrixAccess.authorize.mockRejectedValueOnce(
      new MatrixInterfaceAuthorizeUnavailableError('https://id.example'),
    )
    mockMatrixAccess.importAuthorization.mockResolvedValue({
      apiKey: 'sk-imported',
      webId: 'https://me.example/profile/card#me',
      accountOrigin: 'https://id.example',
      origin: 'https://me.example',
      podUrl: 'https://me.example/alice/',
    })
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )

    fireEvent.change(screen.getByPlaceholderText('输入群组名称'), { target: { value: 'Shared' } })
    fireEvent.click(await screen.findByText('Alice'))
    fireEvent.click(screen.getByRole('button', { name: '创建群组' }))
    fireEvent.click(screen.getByRole('button', { name: '授权并创建' }))
    await waitFor(() => expect(screen.getByText('群聊需要一次空间授权')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: '打开账号页' })).toBeInTheDocument()
    expect(mockCreateGroupWithChat).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('访问凭据'), { target: { value: 'sk-imported' } })
    fireEvent.click(screen.getByRole('button', { name: '使用这个凭据' }))

    await waitFor(() => {
      expect(mockMatrixAccess.importAuthorization).toHaveBeenCalledWith({ apiKey: 'sk-imported' })
    })
    await waitFor(() => expect(mockCreateGroupWithChat).toHaveBeenCalledTimes(1))
  })

  it('does not create a credential or group when the native grant is cancelled', async () => {
    mockMatrixAccess.get.mockReturnValue(null)
    mockMatrixAccess.authorize.mockRejectedValueOnce(
      new MatrixInterfaceAuthorizeUnavailableError('https://id.example'),
    )
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )

    fireEvent.change(screen.getByPlaceholderText('输入群组名称'), { target: { value: 'Shared' } })
    fireEvent.click(await screen.findByText('Alice'))
    fireEvent.click(screen.getByRole('button', { name: '创建群组' }))
    fireEvent.click(screen.getByRole('button', { name: '授权并创建' }))
    fireEvent.click(await screen.findByRole('button', { name: '稍后' }))

    expect(mockMatrixAccess.importAuthorization).not.toHaveBeenCalled()
    expect(mockCreateGroupWithChat).not.toHaveBeenCalled()
  })

  it('reuses an authorization that already exists in this session', async () => {
    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )

    fireEvent.change(screen.getByPlaceholderText('输入群组名称'), { target: { value: 'Shared' } })
    fireEvent.click(await screen.findByText('Alice'))
    fireEvent.click(screen.getByRole('button', { name: '创建群组' }))

    await waitFor(() => expect(mockCreateGroupWithChat).toHaveBeenCalledTimes(1))
    expect(mockMatrixAccess.authorize).not.toHaveBeenCalled()
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
        matrix: { access: mockMatrixAccess },
      })
    })

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith('g-1', 'ch-1')
    })
  })

  it('does not expose storage internals when group creation fails', async () => {
    mockCreateGroupWithChat.mockRejectedValueOnce(new Error('Failed to create Pod container https://node.example/alice/.data/groups/: HTTP 403'))

    render(
      <CreateGroupDialog open onOpenChange={() => {}} />,
      { wrapper: createWrapper() },
    )

    fireEvent.change(screen.getByPlaceholderText('输入群组名称'), {
      target: { value: 'Test Group' },
    })

    const alice = await screen.findByText('Alice')
    fireEvent.click(alice)
    fireEvent.click(screen.getByRole('button', { name: '创建群组' }))

    expect(await screen.findByText('这个账号还不能写入当前空间。请换一个空间；如果这是你的本机空间，请先完成空间创建。')).toBeInTheDocument()
    expect(screen.queryByText(/HTTP 403|Pod container|node\.example|\.data/i)).not.toBeInTheDocument()
  })
})
