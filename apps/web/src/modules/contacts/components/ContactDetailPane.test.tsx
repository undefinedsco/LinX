import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { ContactClass, ContactType, contactResource } from '@undefineds.co/models'

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
  mockOpenAgentMethod,
  mockProbe,
  mockReadKnows,
  mockSetKnows,
  mockRevoke,
  mockLookup,
  mockAddFriend,
  mockDeleteContact,
  mockCommonGroups,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockToast: vi.fn(),
  mockStoreState: {
    selectedId: null as string | null,
    entry: null as 'new-friends' | 'groups' | null,
    openEntry: vi.fn(),
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
  mockOpenAgentMethod: vi.fn(),
  mockProbe: vi.fn(),
  mockReadKnows: vi.fn(),
  mockSetKnows: vi.fn(),
  mockRevoke: vi.fn(),
  mockLookup: vi.fn(),
  mockAddFriend: vi.fn(),
  mockDeleteContact: vi.fn(),
  mockCommonGroups: vi.fn(),
}))

const { mockContactCollection, mockChatCollection, mockAgentCollection, mockLiveQueryErrors } = vi.hoisted(() => {
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
    mockAgentCollection: createCollection(),
    mockLiveQueryErrors: { contact: false, chat: false },
  }
})
const mockContactState = mockContactCollection.state
const mockCreateAgent = vi.fn()

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

vi.mock('@/modules/my-ai', () => ({
  useOpenAgentMethod: () => mockOpenAgentMethod,
}))

vi.mock('@/modules/inbox', () => ({
  GrantsView: ({ agentId }: { agentId?: string }) => <div data-testid="grants-view">{agentId}</div>,
}))

vi.mock('../data/contact-access', () => ({
  probeContactAccess: (...args: unknown[]) => mockProbe(...args),
  readPublicKnows: (...args: unknown[]) => mockReadKnows(...args),
  setPublicKnows: (...args: unknown[]) => mockSetKnows(...args),
  revokeContactAccess: (...args: unknown[]) => mockRevoke(...args),
}))

vi.mock('../app/store', () => ({
  useContactStore: (selector: (state: typeof mockStoreState) => unknown) => selector(mockStoreState),
}))

vi.mock('../data/collections', () => ({
  agentCollection: mockAgentCollection,
  contactCollection: mockContactCollection,
  getContactsChatCollection: () => mockChatCollection,
  useContactsChatSelection: () => mockSelectChat,
  contactOps: {
    findOrCreateChat: (...args: unknown[]) => mockFindOrCreateChat(...args),
    getLastSyncedText: (...args: unknown[]) => mockGetLastSyncedText(...args),
    updateContact: (...args: unknown[]) => mockUpdateContact(...args),
    updateAgent: (...args: unknown[]) => mockUpdateAgent(...args),
    deleteContact: (...args: unknown[]) => mockDeleteContact(...args),
    lookupSolidProfile: (...args: unknown[]) => mockLookup(...args),
    findPersonByAccount: vi.fn(() => null),
    addFriend: (...args: unknown[]) => mockAddFriend(...args),
    getAuthFetch: () => vi.fn(),
    getSpaceRootUrl: () => 'https://me.example/',
    getCommonGroups: (...args: unknown[]) => mockCommonGroups(...args),
    updateAgentModel: vi.fn(),
    createAgent: (...args: unknown[]) => mockCreateAgent(...args),
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
    mockAgentCollection.state.clear()
    mockLiveQueryErrors.contact = false
    mockLiveQueryErrors.chat = false
    mockAboutByRef.clear()
    mockAboutError.current = null
    mockProbe.mockResolvedValue({ items: [
      { place: 'space', url: 'https://me.example/', agent: { read: true, write: true }, public: {} },
      { place: 'profile', url: 'https://me.example/profile/card', agent: {}, public: { read: true } },
    ] })
    mockReadKnows.mockResolvedValue([])
    mockSetKnows.mockResolvedValue(undefined)
    mockRevoke.mockResolvedValue({ revoked: 1, failed: 0 })
    mockCommonGroups.mockReturnValue([])
    mockDeleteContact.mockResolvedValue(undefined)
    Object.assign(mockStoreState, {
      entry: null,
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
    expect(screen.getByLabelText('对方的账号')).toBeInTheDocument()
  })

  it('adds a friend by pasting an account and says when it is not found', async () => {
    mockStoreState.createDialogOpen = true
    mockStoreState.createType = 'friend'
    mockLookup.mockResolvedValueOnce({ status: 'not-found' })
    mockLookup.mockResolvedValueOnce({
      status: 'found',
      profile: { name: '宋青', webId: 'https://songqing.solidcommunity.net/profile/card#me' },
    })
    mockAddFriend.mockResolvedValue({ id: 'contact-new', chatId: 'chat-new' })

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.change(screen.getByLabelText('对方的账号'), { target: { value: 'nobody@solidcommunity.net' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText('没有找到这个账号')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('对方的账号'), { target: { value: 'songqing@solidcommunity.net' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(await screen.findByText('宋青')).toBeInTheDocument()
    expect(screen.getByText('songqing@solidcommunity.net')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '添加' }))

    await waitFor(() => expect(mockAddFriend).toHaveBeenCalledWith({
      name: '宋青',
      webId: 'https://songqing.solidcommunity.net/profile/card#me',
      avatarUrl: undefined,
    }))
    await waitFor(() => expect(mockStoreState.select).toHaveBeenCalledWith('contact-new'))
  })

  it('opens 新的朋友 and 群聊 in the detail pane', () => {
    const group = makeContact({ id: 'group-1', name: '书店活动组', rdfType: ContactClass.GROUP, contactType: ContactType.SOLID })
    mockContactState.set(group.id, group)
    mockStoreState.entry = 'groups'

    const { unmount } = render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
    expect(screen.getByRole('heading', { name: '群聊' })).toBeInTheDocument()
    expect(screen.getByText('书店活动组')).toBeInTheDocument()
    unmount()

    mockStoreState.entry = 'new-friends'
    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
    expect(screen.getByRole('heading', { name: '新的朋友' })).toBeInTheDocument()
    expect(screen.getByText(/现在没有新的朋友/)).toBeInTheDocument()
  })

  it('starts a new assistant from an existing method or from blank', async () => {
    mockStoreState.createDialogOpen = true
    mockStoreState.createType = 'agent'
    mockAgentCollection.state.set('__secretary__', { id: '__secretary__', name: 'LinX 主理人', instructions: '## 目标\n省时间' })
    mockCreateAgent.mockResolvedValue({ contactId: 'contact-new', chatId: 'chat-new' })

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    const picker = screen.getByRole('radiogroup', { name: '从哪个方法开始' })
    expect(within(picker).getByRole('radio', { name: '空白' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(within(picker).getByRole('radio', { name: 'LinX 主理人的方法' }))
    expect(within(picker).getByRole('radio', { name: 'LinX 主理人的方法' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/创建助手不会训练模型/)).toBeInTheDocument()
    // The model is a later execution condition, not part of creating the assistant.
    expect(screen.queryByText('聊天模型')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('给助手起个名字'), { target: { value: '活动小助手' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))

    await waitFor(() => {
      expect(mockCreateAgent).toHaveBeenCalledWith(expect.objectContaining({ name: '活动小助手', instructions: '## 目标\n省时间' }))
    })
  })

  const solidContact = (overrides: Record<string, unknown> = {}) => makeContact({
    id: 'contact-solid-1',
    name: '周禾',
    alias: '书店合伙人',
    about: 'https://zhouhe.undefineds.co/profile/card#me',
    ...overrides,
  })

  it('shows a person with name@provider, never the raw address', async () => {
    const contact = solidContact()
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('书店合伙人')
    expect(screen.getAllByText('zhouhe@undefineds.co').length).toBeGreaterThan(0)
    expect(screen.queryByText(/profile\/card/)).not.toBeInTheDocument()
    for (const label of ['发消息', '语音通话', '视频通话']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByText('公开关系')).not.toBeInTheDocument()
    expect(screen.queryByText('标签')).not.toBeInTheDocument()
    await screen.findByText('看公开资料、改你的空间')
  })

  it('says calls cannot be made yet', () => {
    const contact = solidContact()
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole('button', { name: '语音通话' }))
    fireEvent.click(screen.getByRole('button', { name: '视频通话' }))
    expect(mockToast).toHaveBeenCalledTimes(2)
    expect(mockToast).toHaveBeenCalledWith({ description: '暂时不能打' })
  })

  it('copies the full address only from the copy action', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const contact = solidContact()
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getAllByRole('button', { name: '复制地址' })[0])
    expect(writeText).toHaveBeenCalledWith('https://zhouhe.undefineds.co/profile/card#me')
  })

  it('reads what they can do in my space and what I shared from the Pod', async () => {
    const contact = solidContact()
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(await screen.findByText('1 项')).toBeInTheDocument()
    expect(mockProbe).toHaveBeenCalledWith(expect.objectContaining({
      contactWebId: 'https://zhouhe.undefineds.co/profile/card#me',
      spaceRootUrl: 'https://me.example/',
    }))
    fireEvent.click(screen.getByText('TA 在我空间里能做什么'))
    expect((await screen.findAllByText('你的整个空间')).length).toBeGreaterThan(0)
  })

  it('is honest when the Pod cannot say what they can do', async () => {
    mockProbe.mockResolvedValue({ items: [
      { place: 'space', url: 'https://me.example/', agent: null, public: null },
      { place: 'profile', url: 'https://me.example/profile/card', agent: null, public: null },
    ] })
    const contact = solidContact()
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(await screen.findByText('查不到')).toBeInTheDocument()
    expect(screen.getByText('暂时看不到')).toBeInTheDocument()
  })

  it('shows the person in my public profile from the Pod and writes the change back', async () => {
    mockReadKnows.mockResolvedValue(['https://zhouhe.undefineds.co/profile/card#me'])
    const contact = solidContact()
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    const toggle = await screen.findByRole('switch', { name: '在我的公开资料里显示 TA' })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'))
    fireEvent.click(toggle)

    await waitFor(() => expect(mockSetKnows).toHaveBeenCalledWith(expect.objectContaining({
      contactWebId: 'https://zhouhe.undefineds.co/profile/card#me',
      show: false,
    })))
  })

  it('refreshes the public profile and does not expose sync errors', () => {
    const contact = solidContact()
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id
    mockAboutError.current = new Error('读取资源头信息失败: https://alice.example/profile/card#me (HTTP 403)')

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByText('资料暂时读不到，显示的是上次的信息')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.queryByText(/HTTP 403|读取资源头信息失败|alice\.example/i)).not.toBeInTheDocument()
  })

  it('lists the groups you share with them', () => {
    mockCommonGroups.mockReturnValue([{ id: 'g1', name: '书店活动组' }, { id: 'g2', name: '志愿者' }])
    const contact = solidContact()
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByText('书店活动组 等 2 个')).toBeInTheDocument()
  })

  it('deletes a contact and, when asked, takes back what I shared', async () => {
    const contact = solidContact()
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
    await screen.findByText('1 项')

    fireEvent.click(screen.getByRole('button', { name: '删除联系人…' }))
    expect(await screen.findByText('删除 书店合伙人？')).toBeInTheDocument()
    expect(screen.getByText('聊天记录还在。删除后 TA 仍能看到你的公开资料。')).toBeInTheDocument()
    expect(screen.getByLabelText('同时收回我共享给 TA 的 1 项')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))

    await waitFor(() => expect(mockDeleteContact).toHaveBeenCalledWith('contact-solid-1'))
    expect(mockRevoke).toHaveBeenCalledOnce()
    expect(mockRevoke.mock.invocationCallOrder[0]).toBeLessThan(mockDeleteContact.mock.invocationCallOrder[0])
  })

  it('keeps shares when the box is unticked, and keeps the contact when taking back fails', async () => {
    const contact = solidContact()
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })
    await screen.findByText('1 项')

    fireEvent.click(screen.getByRole('button', { name: '删除联系人…' }))
    fireEvent.click(await screen.findByLabelText('同时收回我共享给 TA 的 1 项'))
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(mockDeleteContact).toHaveBeenCalledOnce())
    expect(mockRevoke).not.toHaveBeenCalled()

    mockDeleteContact.mockClear()
    mockRevoke.mockResolvedValue({ revoked: 0, failed: 1 })
    fireEvent.click(screen.getByRole('button', { name: '删除联系人…' }))
    expect(await screen.findByLabelText('同时收回我共享给 TA 的 1 项')).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(mockRevoke).toHaveBeenCalledOnce())
    expect(mockDeleteContact).not.toHaveBeenCalled()
  })

  it('hides the delete action for the default secretary contact (no delete pressure)', async () => {
    const secretaryId = contactResource.buildId({ id: '__secretary__' })
    const contact = makeContact({ id: secretaryId, name: 'LinX 主理人', contactType: ContactType.AGENT })
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByRole('button', { name: '发消息' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /删除联系人/ })).not.toBeInTheDocument()
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

    expect(screen.getByText('资料暂时读不到，显示的是上次的信息')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.queryByText(/HTTP 403|读取资源头信息失败|alice\.example/i)).not.toBeInTheDocument()
  })

  it('treats an assistant stored in my own Pod as mine and opens its method', () => {
    const about = 'https://pod.example/agents/__secretary__/profile/card#me'
    const contact = makeContact({
      id: 'contact-secretary',
      name: 'LinX 主理人',
      contactType: ContactType.AGENT,
      about,
    })

    mockContactState.set(contact.id, contact)
    mockAboutByRef.set(about, { id: '__secretary__', instructions: '' })
    mockAgentCollection.state.set('__secretary__', { id: '__secretary__', name: 'LinX 主理人' })
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('做事的方法'))

    expect(mockOpenAgentMethod).toHaveBeenCalledWith('__secretary__')
    expect(screen.queryByText('正在同步...')).not.toBeInTheDocument()
  })

  it('keeps someone else\'s assistant read-only', () => {
    const about = 'https://friend.example/agents/helper/profile/card#me'
    const contact = makeContact({
      id: 'contact-friend-agent',
      name: '朋友的助手',
      contactType: ContactType.AGENT,
      about,
    })

    mockContactState.set(contact.id, contact)
    mockAboutByRef.set(about, { id: 'helper', instructions: '' })
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByText('由对方管理，你看不到')).toBeInTheDocument()
    expect(screen.queryByText('执行条件')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('做事的方法'))
    expect(mockOpenAgentMethod).not.toHaveBeenCalled()
  })

  it('sends method editing to the single editor in My AI', () => {
    const about = '/agents/agent-1/profile/card#me'
    const contact = makeContact({
      id: 'contact-agent-1',
      name: '智能翻译官',
      contactType: ContactType.AGENT,
      about,
    })

    mockContactState.set(contact.id, contact)
    mockAboutByRef.set(about, {
      id: 'agent-1',
      instructions: '你是一个精通 12 国语言的翻译专家。',
    })
    mockAgentCollection.state.set('agent-1', { id: 'agent-1', name: '智能翻译官' })
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('做事的方法'))

    expect(mockOpenAgentMethod).toHaveBeenCalledWith('agent-1')
    expect(screen.queryByText('编辑系统提示词')).not.toBeInTheDocument()
  })

  it('shows my assistant like a person with method and execution condition added', () => {
    const about = 'https://pod.example/agents/agent-1/profile/card#me'
    const contact = makeContact({
      id: 'contact-agent-1',
      name: '智能翻译官',
      alias: '翻译助手',
      contactType: ContactType.AGENT,
      about,
    })

    mockContactState.set(contact.id, contact)
    mockAboutByRef.set(about, {
      id: 'agent-1',
      model: 'openai/gpt-4o',
      instructions: '你是一个精通 12 国语言的翻译专家。',
      ttsModel: 'openai/tts-1',
      tools: ['WebSearch'],
    })
    mockAgentCollection.state.set('agent-1', { id: 'agent-1', name: '智能翻译官' })
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('翻译助手')
    expect(screen.getByText('助手 · 你创建的')).toBeInTheDocument()
    expect(screen.getByText(/翻译专家/)).toBeInTheDocument()
    expect(screen.getByText('openai/gpt-4o')).toBeInTheDocument()
    expect(screen.getByText('agent-1@pod.example')).toBeInTheDocument()
    expect(screen.getByText('改名、换模型都不会改变它的身份和聊天记录')).toBeInTheDocument()
    for (const label of ['发消息', '语音通话', '视频通话']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    // Engineering settings are not part of the contact card.
    expect(screen.queryByText('能用的工具')).not.toBeInTheDocument()
    expect(screen.queryByText('语音')).not.toBeInTheDocument()
    // An assistant has no person-only space section.
    expect(screen.queryByText('TA 的空间与权限')).not.toBeInTheDocument()
  })

  it('opens an assistant\'s grants in my space from its card', () => {
    const about = 'https://pod.example/agents/agent-1/profile/card#me'
    const contact = makeContact({ id: 'contact-agent-1', name: '助手', contactType: ContactType.AGENT, about })
    mockContactState.set(contact.id, contact)
    mockAboutByRef.set(about, { id: 'agent-1', instructions: '' })
    mockAgentCollection.state.set('agent-1', { id: 'agent-1', name: '助手' })
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('在你空间里的权限'))
    expect(screen.getByTestId('grants-view')).toHaveTextContent('agent-1')
  })

  it('starts chat from a persisted contact instead of using fake ids', async () => {
    const contact = solidContact()
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id
    mockFindOrCreateChat.mockResolvedValue('chat-1')

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByRole('button', { name: '发消息' }))

    await waitFor(() => {
      expect(mockFindOrCreateChat).toHaveBeenCalledWith('contact-solid-1')
    })
    expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'chat' },
    })
  })

  it('opens the remark dialog for persisted contacts', async () => {
    const contact = solidContact()
    mockContactState.set(contact.id, contact)
    mockStoreState.selectedId = contact.id

    render(<ContactDetailPane theme="light" />, { wrapper: createWrapper() })

    fireEvent.click(screen.getByText('备注'))

    expect(await screen.findByPlaceholderText('给 TA 起个备注')).toBeInTheDocument()
    expect(screen.getAllByText('备注只存在你的空间，TA 看不到。').length).toBeGreaterThan(0)
  })
})
