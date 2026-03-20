import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { ContactClass, ContactType } from '@linx/models'

const {
  mockNavigate,
  mockToast,
  mockStoreState,
  mockContactState,
  mockSelectChat,
  mockGetAll,
  mockGetGroupChat,
  mockGetGroupMembers,
  mockGetGroupMemberRoles,
  mockResolveMembers,
  mockFindOrCreateChat,
  mockAddMemberToGroup,
  mockCreateGroupWithChat,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockToast: vi.fn(),
  mockStoreState: {
    selectedId: null as string | null,
    viewMode: 'view',
    createDialogOpen: false,
    createType: null as 'agent' | 'friend' | 'group' | null,
    clearNewFriends: vi.fn(),
    closeCreateDialog: vi.fn(),
    select: vi.fn(),
    inviteMemberDialogOpen: false,
    inviteTargetGroupId: null as string | null,
    openInviteMemberDialog: vi.fn(),
    closeInviteMemberDialog: vi.fn(),
  },
  mockContactState: new Map<string, any>(),
  mockSelectChat: vi.fn(),
  mockGetAll: vi.fn(),
  mockGetGroupChat: vi.fn(),
  mockGetGroupMembers: vi.fn(),
  mockGetGroupMemberRoles: vi.fn(),
  mockResolveMembers: vi.fn(),
  mockFindOrCreateChat: vi.fn(),
  mockAddMemberToGroup: vi.fn(),
  mockCreateGroupWithChat: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
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

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}))

vi.mock('@/lib/data/use-entity', () => ({
  useEntity: () => ({
    data: null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}))

vi.mock('@/modules/chat/store', () => ({
  useChatStore: (selector: (state: { selectChat: typeof mockSelectChat }) => unknown) =>
    selector({ selectChat: mockSelectChat }),
}))

vi.mock('../store', () => ({
  useContactStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}))

vi.mock('../collections', () => ({
  contactCollection: {
    state: mockContactState,
  },
  contactOps: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
    getGroupChat: (...args: unknown[]) => mockGetGroupChat(...args),
    getGroupMembers: (...args: unknown[]) => mockGetGroupMembers(...args),
    getGroupMemberRoles: (...args: unknown[]) => mockGetGroupMemberRoles(...args),
    resolveMembers: (...args: unknown[]) => mockResolveMembers(...args),
    findOrCreateChat: (...args: unknown[]) => mockFindOrCreateChat(...args),
    addMemberToGroup: (...args: unknown[]) => mockAddMemberToGroup(...args),
    createGroupWithChat: (...args: unknown[]) => mockCreateGroupWithChat(...args),
    getLastSyncedText: vi.fn(() => '刚刚同步'),
    toggleStar: vi.fn(),
    updateContact: vi.fn(),
    updateAgent: vi.fn(),
    deleteContact: vi.fn(),
    fetchSolidProfile: vi.fn(),
    addFriend: vi.fn(),
    createAgent: vi.fn(),
    removeMemberFromGroup: vi.fn(),
    updateMemberRole: vi.fn(),
  },
}))

import { ContactDetailPane } from './ContactDetailPane'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const makeContact = (overrides: Record<string, unknown>) => ({
  id: 'contact-1',
  name: 'Alice',
  alias: null,
  avatarUrl: null,
  deletedAt: null,
  createdAt: new Date('2026-03-13T00:00:00.000Z'),
  updatedAt: new Date('2026-03-13T00:00:00.000Z'),
  contactType: ContactType.SOLID,
  rdfType: 'https://undefineds.co/ns#PersonContact',
  ...overrides,
})

describe('ContactDetailPane group flows', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockContactState.clear()
    Object.assign(mockStoreState, {
      selectedId: null,
      viewMode: 'view',
      createDialogOpen: false,
      createType: null,
      clearNewFriends: vi.fn(),
      closeCreateDialog: vi.fn(),
      select: vi.fn(),
      inviteMemberDialogOpen: false,
      inviteTargetGroupId: null,
      openInviteMemberDialog: vi.fn(),
      closeInviteMemberDialog: vi.fn(),
    })

    mockGetAll.mockImplementation(() => Array.from(mockContactState.values()))
    mockGetGroupChat.mockReset()
    mockGetGroupMembers.mockReset()
    mockGetGroupMemberRoles.mockReset()
    mockResolveMembers.mockReset()
    mockFindOrCreateChat.mockReset()
    mockAddMemberToGroup.mockResolvedValue(undefined)
    mockCreateGroupWithChat.mockResolvedValue({ id: 'group-new', chatId: 'chat-new' })
  })

  it('renders group summary and member sidebar', async () => {
    const group = makeContact({
      id: 'group-1',
      name: '产品群',
      entityUri: '/.data/chats/chat-1/index.ttl#this',
      rdfType: ContactClass.GROUP,
    })
    const owner = makeContact({
      id: 'owner-contact',
      name: 'Me',
      entityUri: 'https://me.example/profile/card#me',
    })
    const member = makeContact({
      id: 'member-1',
      name: 'Bob',
      entityUri: 'https://bob.example/profile/card#me',
    })

    mockContactState.set(group.id, group)
    mockContactState.set(owner.id, owner)
    mockContactState.set(member.id, member)
    mockStoreState.selectedId = 'group-1'
    mockGetGroupMembers.mockReturnValue([
      'https://me.example/profile/card#me',
      'https://bob.example/profile/card#me',
    ])
    mockGetGroupMemberRoles.mockReturnValue({
      'https://me.example/profile/card#me': 'owner',
      'https://bob.example/profile/card#me': 'admin',
    })
    mockResolveMembers.mockReturnValue([owner, member])

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByText('群成员')).toBeInTheDocument()
    expect(screen.getByText('群成员 (2)')).toBeInTheDocument()
    expect(screen.getByText('我的角色')).toBeInTheDocument()
    expect(screen.getAllByText('群主').length).toBeGreaterThan(0)
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByText('公开关系')).not.toBeInTheDocument()
  })

  it('starts the linked group chat instead of creating a direct chat', async () => {
    const group = makeContact({
      id: 'group-1',
      name: '产品群',
      entityUri: '/.data/chats/chat-1/index.ttl#this',
      rdfType: ContactClass.GROUP,
    })

    mockContactState.set(group.id, group)
    mockStoreState.selectedId = 'group-1'
    mockGetGroupMembers.mockReturnValue([])
    mockGetGroupMemberRoles.mockReturnValue({})
    mockResolveMembers.mockReturnValue([])
    mockGetGroupChat.mockReturnValue({ id: 'chat-1' })

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('聊天'))

    expect(mockGetGroupChat).toHaveBeenCalledWith('/.data/chats/chat-1/index.ttl#this')
    expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
    expect(mockFindOrCreateChat).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'chat' },
    })
  })

  it('invites a selectable contact into the current group', async () => {
    const group = makeContact({
      id: 'group-1',
      name: '产品群',
      entityUri: '/.data/chats/chat-1/index.ttl#this',
      rdfType: ContactClass.GROUP,
    })
    const owner = makeContact({
      id: 'owner-contact',
      name: 'Me',
      entityUri: 'https://me.example/profile/card#me',
    })
    const member = makeContact({
      id: 'member-1',
      name: 'Bob',
      entityUri: 'https://bob.example/profile/card#me',
    })
    const candidate = makeContact({
      id: 'member-2',
      name: 'Charlie',
      entityUri: 'https://charlie.example/profile/card#me',
    })

    mockContactState.set(group.id, group)
    mockContactState.set(owner.id, owner)
    mockContactState.set(member.id, member)
    mockContactState.set(candidate.id, candidate)
    Object.assign(mockStoreState, {
      selectedId: 'group-1',
      inviteMemberDialogOpen: true,
      inviteTargetGroupId: '/.data/chats/chat-1/index.ttl#this',
    })
    mockGetGroupMembers.mockReturnValue([
      'https://me.example/profile/card#me',
      'https://bob.example/profile/card#me',
    ])
    mockGetGroupMemberRoles.mockReturnValue({
      'https://me.example/profile/card#me': 'owner',
    })
    mockResolveMembers.mockReturnValue([owner, member])

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    await waitFor(() => {
      expect(screen.getByText('Charlie')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Charlie'))
    fireEvent.click(screen.getByRole('button', { name: '邀请' }))

    await waitFor(() => {
      expect(mockAddMemberToGroup).toHaveBeenCalledWith(
        '/.data/chats/chat-1/index.ttl#this',
        'https://charlie.example/profile/card#me',
      )
    })
    expect(mockStoreState.closeInviteMemberDialog).toHaveBeenCalled()
  })

  it('creates a group through the embedded dialog and jumps into chat', async () => {
    const candidate = makeContact({
      id: 'member-2',
      name: 'Charlie',
      entityUri: 'https://charlie.example/profile/card#me',
    })

    mockContactState.set(candidate.id, candidate)
    Object.assign(mockStoreState, {
      selectedId: 'mock-solid-1',
      createDialogOpen: true,
      createType: 'group',
    })

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.change(screen.getByPlaceholderText('输入群组名称'), {
      target: { value: '新群组' },
    })

    fireEvent.click(await screen.findByText('Charlie'))
    fireEvent.click(screen.getByRole('button', { name: '创建群组' }))

    await waitFor(() => {
      expect(mockCreateGroupWithChat).toHaveBeenCalledWith({
        name: '新群组',
        participants: ['https://charlie.example/profile/card#me'],
        ownerRef: 'https://me.example/profile/card#me',
      })
    })

    await waitFor(() => {
      expect(mockStoreState.closeCreateDialog).toHaveBeenCalled()
      expect(mockStoreState.select).toHaveBeenCalledWith('group-new')
      expect(mockSelectChat).toHaveBeenCalledWith('chat-new')
      expect(mockNavigate).toHaveBeenCalledWith({
        to: '/$microAppId',
        params: { microAppId: 'chat' },
      })
    })
  })
})
