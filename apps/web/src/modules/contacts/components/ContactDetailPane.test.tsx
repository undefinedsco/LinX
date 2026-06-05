import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { ContactType } from '@undefineds.co/models'

const {
  mockNavigate,
  mockToast,
  mockStoreState,
  mockContactState,
  mockEntityByUri,
  mockSelectChat,
  mockFindOrCreateChat,
  mockGetLastSyncedText,
  mockUpdateContact,
  mockUpdateAgent,
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
  mockContactState: new Map<string, any>(),
  mockEntityByUri: new Map<string, any>(),
  mockSelectChat: vi.fn(),
  mockFindOrCreateChat: vi.fn(),
  mockGetLastSyncedText: vi.fn(() => '刚刚同步'),
  mockUpdateContact: vi.fn(),
  mockUpdateAgent: vi.fn(),
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

vi.mock('@/modules/chat/store', () => ({
  useChatStore: (selector: (state: { selectChat: typeof mockSelectChat }) => unknown) =>
    selector({ selectChat: mockSelectChat }),
}))

vi.mock('@/lib/data/use-entity', () => ({
  useEntity: (_table: unknown, entity: string | null) => ({
    data: entity ? (mockEntityByUri.get(entity) ?? null) : null,
    isLoading: false,
    error: null,
    refresh: vi.fn(),
  }),
}))

vi.mock('@/components/ui/model-selector', () => ({
  ModelSelector: ({ value }: { value: string }) => <div data-testid="model-selector">{value}</div>,
}))

vi.mock('./CreateGroupDialog', () => ({
  CreateGroupDialog: ({ open }: { open: boolean }) => open ? <div data-testid="group-dialog" /> : null,
}))

vi.mock('../store', () => ({
  useContactStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}))

vi.mock('../collections', () => ({
  contactCollection: {
    state: mockContactState,
  },
  contactOps: {
    findOrCreateChat: (...args: unknown[]) => mockFindOrCreateChat(...args),
    getLastSyncedText: (...args: unknown[]) => mockGetLastSyncedText(...args),
    updateContact: (...args: unknown[]) => mockUpdateContact(...args),
    updateAgent: (...args: unknown[]) => mockUpdateAgent(...args),
    toggleStar: vi.fn(),
    deleteContact: vi.fn(),
    fetchSolidProfile: vi.fn(),
    addFriend: vi.fn(),
    createAgent: vi.fn(),
    getGroupMembers: vi.fn(() => []),
    getGroupMemberRoles: vi.fn(() => ({})),
    resolveMembers: vi.fn(() => []),
    getGroupChat: vi.fn(),
    getAll: vi.fn(() => Array.from(mockContactState.values())),
    addMemberToGroup: vi.fn(),
    removeMemberFromGroup: vi.fn(),
    updateMemberRole: vi.fn(),
    createGroupWithChat: vi.fn(),
  },
}))

import { ContactDetailPane } from './ContactDetailPane'

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
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
  ...overrides,
})

describe('ContactDetailPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockContactState.clear()
    mockEntityByUri.clear()
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
  })

  it('shows placeholder when no contact is selected', () => {
    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByText('选择联系人查看详情')).toBeInTheDocument()
  })

  it('keeps add-friend dialog available without an active selection', () => {
    mockStoreState.createDialogOpen = true
    mockStoreState.createType = 'friend'

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByText('添加朋友')).toBeInTheDocument()
    expect(screen.getByText('WebID')).toBeInTheDocument()
  })

  it('renders human contact details from real collection data', () => {
    const contact = makeContact({
      id: 'contact-solid-1',
      name: 'Alice Smith',
      alias: 'Alice',
      entity: 'https://alice.solidcommunity.net/profile/card#me',
      inbox: 'https://alice.solidcommunity.net/inbox/',
      province: '北京',
      city: '海淀',
      isPublic: true,
    })

    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Alice')
    expect(screen.getByText('北京 海淀')).toBeInTheDocument()
    expect(screen.getByText('WebID')).toBeInTheDocument()
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    expect(screen.getByText('公开关系')).toBeInTheDocument()
    expect(screen.queryByText('标签')).not.toBeInTheDocument()
  })

  it('starts chat from a persisted contact instead of using fake ids', async () => {
    const contact = makeContact({
      id: 'contact-solid-1',
      entity: 'https://alice.solidcommunity.net/profile/card#me',
    })

    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id
    mockFindOrCreateChat.mockResolvedValue('chat-1')

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('聊天'))

    await waitFor(() => {
      expect(mockFindOrCreateChat).toHaveBeenCalledWith('contact-solid-1')
    })
    expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'chat' },
    })
  })

  it('renders local agent configuration and allows opening tools editor', async () => {
    const entity = '/agents/agent-1/'
    const contact = makeContact({
      id: 'contact-agent-1',
      name: '智能翻译官',
      alias: '翻译助手',
      contactType: ContactType.AGENT,
      entity,
      province: '广东',
      city: '深圳',
      gender: 'bot',
    })

    mockContactState.set(contact.id, contact)
    mockEntityByUri.set(entity, {
      model: 'openai/gpt-4o',
      instructions: '你是一个精通 12 国语言的翻译专家。',
      ttsModel: 'openai/tts-1',
      videoModel: 'heygen/avatar-v2',
      tools: ['WebSearch'],
    })
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('翻译助手')
    expect(screen.getByText('系统提示词')).toBeInTheDocument()
    expect(screen.getByText(/翻译专家/)).toBeInTheDocument()
    expect(screen.getByText('聊天模型')).toBeInTheDocument()
    expect(screen.getByText('语音模型')).toBeInTheDocument()
    expect(screen.getByText('视频模型')).toBeInTheDocument()
    expect(screen.getByText('插件工具')).toBeInTheDocument()

    fireEvent.click(screen.getByText('插件工具'))

    await waitFor(() => {
      expect(screen.getByText('配置插件工具')).toBeInTheDocument()
    })
  })

  it('opens alias dialog for persisted contacts', async () => {
    const contact = makeContact({
      id: 'contact-solid-1',
      alias: 'Alice',
      entity: 'https://alice.solidcommunity.net/profile/card#me',
    })

    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('备注名'))

    await waitFor(() => {
      expect(screen.getByText('修改备注名')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('输入备注名...')).toBeInTheDocument()
    })
  })
})
