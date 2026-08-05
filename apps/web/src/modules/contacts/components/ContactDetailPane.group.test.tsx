import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { ContactClass, ContactType } from '@undefineds.co/models'

const {
  mockNavigate,
  mockToast,
  mockStoreState,
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
    closeCreateDialog: vi.fn(),
    select: vi.fn(),
    inviteMemberDialogOpen: false,
    inviteTargetGroupId: null as string | null,
    openInviteMemberDialog: vi.fn(),
    closeInviteMemberDialog: vi.fn(),
  },
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

const { mockContactCollection, mockChatCollection } = vi.hoisted(() => {
  const createReactiveCollection = () => {
    let version = 0
    const listeners = new Set<() => void>()
    const state = new Map<string, any>()
    return {
      state,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      getVersion: () => version,
      replace: (id: string, row: any) => {
        state.set(id, row)
        version += 1
        listeners.forEach((listener) => listener())
      },
    }
  }
  return {
    mockContactCollection: createReactiveCollection(),
    mockChatCollection: createReactiveCollection(),
  }
})
const mockContactState = mockContactCollection.state

vi.mock('@tanstack/react-db', async () => {
  const { useSyncExternalStore } = await import('react')
  return {
    useLiveQuery: (collection: typeof mockContactCollection) => {
      useSyncExternalStore(collection.subscribe, collection.getVersion, collection.getVersion)
      return {
        data: Array.from(collection.state.values()),
        isError: false,
        isLoading: false,
      }
    },
  }
})

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
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

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}))

vi.mock('@/modules/model-services/data/use-model-services', () => ({
  useModelServices: () => ({ providers: {} }),
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

vi.mock('../app/store', () => ({
  useContactStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}))

vi.mock('../data/collections', () => ({
  contactCollection: mockContactCollection,
  getContactsChatCollection: () => mockChatCollection,
  useContactsChatSelection: () => mockSelectChat,
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
    mockChatCollection.state.clear()
    Object.assign(mockStoreState, {
      selectedId: null,
      viewMode: 'view',
      createDialogOpen: false,
      createType: null,
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
      about: '/.data/chats/chat-1/index.ttl#this',
      rdfType: ContactClass.GROUP,
    })
    const owner = makeContact({
      id: 'owner-contact',
      name: 'Me',
      about: 'https://me.example/profile/card#me',
    })
    const member = makeContact({
      id: 'member-1',
      name: 'Bob',
      about: 'https://bob.example/profile/card#me',
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

  it('reacts when the linked Chat membership changes in the live collection', async () => {
    const group = makeContact({
      id: 'group-1',
      name: '产品群',
      about: '/.data/chats/chat-1/index.ttl#this',
      rdfType: ContactClass.GROUP,
    })
    const owner = makeContact({
      id: 'owner-contact',
      name: 'Me',
      about: 'https://me.example/profile/card#me',
    })
    const bob = makeContact({
      id: 'member-1',
      name: 'Bob',
      about: 'https://bob.example/profile/card#me',
    })
    const charlie = makeContact({
      id: 'member-2',
      name: 'Charlie',
      about: 'https://charlie.example/profile/card#me',
    })
    const initialChat = {
      id: 'chat-1',
      participants: [owner.about, bob.about],
      metadata: { memberRoles: { [owner.about]: 'owner', [bob.about]: 'member' } },
    }

    for (const contact of [group, owner, bob, charlie]) {
      mockContactState.set(contact.id, contact)
    }
    mockChatCollection.state.set(initialChat.id, initialChat)
    mockStoreState.selectedId = group.id
    mockGetGroupChat.mockImplementation(() => mockChatCollection.state.get('chat-1'))
    mockGetGroupMembers.mockImplementation(() => (
      mockChatCollection.state.get('chat-1')?.participants ?? []
    ))
    mockGetGroupMemberRoles.mockImplementation(() => (
      mockChatCollection.state.get('chat-1')?.metadata?.memberRoles ?? {}
    ))
    mockResolveMembers.mockImplementation((refs: string[]) => (
      Array.from(mockContactState.values()).filter((contact) => refs.includes(contact.about))
    ))

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
    expect(screen.getByText('Bob')).toBeInTheDocument()

    act(() => {
      mockChatCollection.replace('chat-1', {
        ...initialChat,
        participants: [owner.about, charlie.about],
        metadata: { memberRoles: { [owner.about]: 'owner', [charlie.about]: 'admin' } },
      })
    })

    await waitFor(() => {
      expect(screen.queryByText('Bob')).not.toBeInTheDocument()
      expect(screen.getByText('Charlie')).toBeInTheDocument()
      expect(screen.getByText('管理员')).toBeInTheDocument()
    })
  })

  it('starts the linked group chat instead of creating a direct chat', async () => {
    const group = makeContact({
      id: 'group-1',
      name: '产品群',
      about: '/.data/chats/chat-1/index.ttl#this',
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

    expect(mockGetGroupChat).toHaveBeenCalledWith('group-1')
    expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
    expect(mockFindOrCreateChat).not.toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$appletId',
      params: { appletId: 'chat' },
    })
  })

  it('invites a selectable contact into the current group', async () => {
    const group = makeContact({
      id: 'group-1',
      name: '产品群',
      about: '/.data/chats/chat-1/index.ttl#this',
      rdfType: ContactClass.GROUP,
    })
    const owner = makeContact({
      id: 'owner-contact',
      name: 'Me',
      about: 'https://me.example/profile/card#me',
    })
    const member = makeContact({
      id: 'member-1',
      name: 'Bob',
      about: 'https://bob.example/profile/card#me',
    })
    const candidate = makeContact({
      id: 'member-2',
      name: 'Charlie',
      about: 'https://charlie.example/profile/card#me',
    })

    mockContactState.set(group.id, group)
    mockContactState.set(owner.id, owner)
    mockContactState.set(member.id, member)
    mockContactState.set(candidate.id, candidate)
    Object.assign(mockStoreState, {
      selectedId: 'group-1',
      inviteMemberDialogOpen: true,
      inviteTargetGroupId: 'group-1',
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
        'group-1',
        'https://charlie.example/profile/card#me',
      )
    })
    expect(mockStoreState.closeInviteMemberDialog).toHaveBeenCalled()
  })

  it('creates a group through the embedded dialog and jumps into chat', async () => {
    const candidate = makeContact({
      id: 'member-2',
      name: 'Charlie',
      about: 'https://charlie.example/profile/card#me',
    })

    mockContactState.set(candidate.id, candidate)
    Object.assign(mockStoreState, {
      selectedId: null,
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
        to: '/$appletId',
        params: { appletId: 'chat' },
      })
    })
  })
})
