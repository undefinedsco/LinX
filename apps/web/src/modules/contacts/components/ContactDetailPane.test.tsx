import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { ContactType, contactResource } from '@undefineds.co/models'

const {
  mockNavigate,
  mockToast,
  mockStoreState,
  mockAboutByRef,
  mockAboutError,
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
  mockAboutByRef: new Map<string, any>(),
  mockAboutError: { current: null as Error | null },
  mockSelectChat: vi.fn(),
  mockFindOrCreateChat: vi.fn(),
  mockGetLastSyncedText: vi.fn(() => '刚刚同步'),
  mockUpdateContact: vi.fn(),
  mockUpdateAgent: vi.fn(),
}))

const { mockContactCollection, mockChatCollection, mockLiveQueryErrors } = vi.hoisted(() => {
  const createCollection = () => {
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
      fetch: vi.fn(async () => Array.from(state.values())),
    }
  }
  return {
    mockContactCollection: createCollection(),
    mockChatCollection: createCollection(),
    mockLiveQueryErrors: { contact: false, chat: false },
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
        isError: collection === mockContactCollection
          ? mockLiveQueryErrors.contact
          : mockLiveQueryErrors.chat,
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

vi.mock('@/modules/chat/store', () => ({
  useChatStore: (selector: (state: { selectChat: typeof mockSelectChat }) => unknown) =>
    selector({ selectChat: mockSelectChat }),
}))

vi.mock('@/lib/data/use-entity', () => ({
  useEntity: (_resource: unknown, about: string | null) => ({
    data: about ? (mockAboutByRef.get(about) ?? null) : null,
    isLoading: false,
    error: mockAboutError.current,
    refresh: vi.fn(),
  }),
}))

vi.mock('@/components/ui/model-selector', () => ({
  ModelSelector: ({ value }: { value: string }) => <div data-testid="model-selector">{value}</div>,
}))

vi.mock('@/modules/model-services/data/use-model-services', () => ({
  useModelServices: () => ({ providers: {} }),
}))

vi.mock('./CreateGroupDialog', () => ({
  CreateGroupDialog: ({ open }: { open: boolean }) => open ? <div data-testid="group-dialog" /> : null,
}))

vi.mock('../app/store', () => ({
  useContactStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}))

vi.mock('../data/collections', () => ({
  contactCollection: mockContactCollection,
  getContactsChatCollection: () => mockChatCollection,
  useContactsChatSelection: () => mockSelectChat,
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
    mockChatCollection.state.clear()
    mockLiveQueryErrors.contact = false
    mockLiveQueryErrors.chat = false
    mockAboutByRef.clear()
    mockAboutError.current = null
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
    expect(screen.getByText('用户地址')).toBeInTheDocument()
  })

  it('renders human contact details from real collection data', () => {
    const contact = makeContact({
      id: 'contact-solid-1',
      name: 'Alice Smith',
      alias: 'Alice',
      about: 'https://alice.solidcommunity.net/profile/card#me',
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
    expect(screen.getByText('用户地址')).toBeInTheDocument()
    expect(screen.getByText('Inbox')).toBeInTheDocument()
    expect(screen.getByText('公开关系')).toBeInTheDocument()
    expect(screen.queryByText('标签')).not.toBeInTheDocument()
  })

  it('hides the delete action for the default secretary contact (no delete pressure)', async () => {
    const secretaryId = contactResource.buildId({ id: '__secretary__' })
    const contact = makeContact({ id: secretaryId, name: 'LinX 主理人', contactType: ContactType.AGENT })
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    // 头部 button 顺序：[分享, 更多菜单触发器, ...]；Radix 下拉由 pointerdown 打开
    fireEvent.pointerDown(screen.getAllByRole('button')[1], { button: 0 })
    await waitFor(() => {
      // 证明菜单确实打开，而非整体未渲染
      expect(screen.getByRole('menuitem', { name: /设为星标|取消星标/ })).toBeInTheDocument()
    })
    expect(screen.queryByRole('menuitem', { name: /删除联系人/ })).not.toBeInTheDocument()
  })

  it('keeps the delete action for ordinary contacts', async () => {
    const contact = makeContact({ id: 'contact-ordinary-1', name: 'Bob' })
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.pointerDown(screen.getAllByRole('button')[1], { button: 0 })
    await waitFor(() => {
      expect(screen.getByRole('menuitem', { name: /删除联系人/ })).toBeInTheDocument()
    })
  })

  it('reacts when the selected Contact row changes in the live collection', async () => {
    const contact = makeContact({
      id: 'contact-solid-1',
      name: 'Alice Smith',
      alias: 'Alice',
      about: 'https://alice.solidcommunity.net/profile/card#me',
    })

    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Alice')

    act(() => {
      mockContactCollection.replace(contact.id, { ...contact, alias: 'Alicia' })
    })

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Alicia')
    })
  })

  it('shows a retryable error instead of a loading state when detail queries fail', async () => {
    const contact = makeContact({ id: 'contact-solid-1', name: 'Alice Smith' })
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id
    mockLiveQueryErrors.contact = true

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByRole('alert')).toHaveTextContent('联系人详情加载失败，请重试。')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => {
      expect(mockContactCollection.fetch).toHaveBeenCalledOnce()
      expect(mockChatCollection.fetch).toHaveBeenCalledOnce()
    })
  })

  it('does not expose internal sync errors in the contact details', () => {
    const contact = makeContact({
      id: 'contact-solid-1',
      name: 'Alice Smith',
      about: 'https://alice.solidcommunity.net/profile/card#me',
    })

    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id
    mockAboutError.current = new Error('读取资源头信息失败: https://alice.example/profile/card#me (HTTP 403)')

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByText('这个账号还不能写入当前空间。请换一个空间；如果这是你的本机空间，请先完成空间创建。')).toBeInTheDocument()
    expect(screen.queryByText(/HTTP 403|读取资源头信息失败|alice\.example/i)).not.toBeInTheDocument()
  })

  it('starts chat from a persisted contact instead of using fake ids', async () => {
    const contact = makeContact({
      id: 'contact-solid-1',
      about: 'https://alice.solidcommunity.net/profile/card#me',
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

  it('shows chat, voice, and video as the primary contact actions', () => {
    const contact = makeContact({ id: 'contact-solid-1', name: 'Alice' })
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByRole('button', { name: '聊天' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '语音' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '视频' })).toBeInTheDocument()
  })

  it('renders local agent configuration and allows opening tools editor', async () => {
    const about = '/agents/agent-1/profile/card#me'
    const contact = makeContact({
      id: 'contact-agent-1',
      name: '智能翻译官',
      alias: '翻译助手',
      contactType: ContactType.AGENT,
      about,
      province: '广东',
      city: '深圳',
      gender: 'bot',
    })

    mockContactState.set(contact.id, contact)
    mockAboutByRef.set(about, {
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
      about: 'https://alice.solidcommunity.net/profile/card#me',
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
