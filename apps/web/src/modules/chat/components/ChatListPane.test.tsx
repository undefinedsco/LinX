import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChatListPane } from './ChatListPane'
import { projectChatListEntry, type ChatListEntrySource } from '../domain/chat-list-model'

const mockUseChatStore = vi.fn()
vi.mock('../store', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => mockUseChatStore(selector),
}))

const mutations = {
  updateChat: { mutateAsync: vi.fn(), isPending: false },
  deleteChat: { mutateAsync: vi.fn(), isPending: false },
}
vi.mock('../collections', () => ({
  useChatMutations: () => mutations,
  useChatInit: () => ({ db: null, isReady: true }),
  chatOps: { getThreads: () => [{}, {}] },
}))

const listState = {
  entries: [] as ReturnType<typeof projectChatListEntry>[],
  isLoading: false,
  isError: false,
  isForbidden: false,
  refetch: vi.fn(),
}
vi.mock('../features/list/useChatListEntries', () => ({ useChatListEntries: () => listState }))

vi.mock('../features/search/GlobalSearchResults', () => ({
  GlobalSearchResults: ({ query }: { query: string }) => <div data-testid="global-search-results">{query}</div>,
}))
vi.mock('./AddChatDialog', () => ({ AddChatDialog: () => null }))
vi.mock('@/modules/contacts', () => ({
  ContactPickerDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="找人聊天" /> : null),
}))
const online = { value: true }
vi.mock('@/lib/use-browser-online', () => ({ useBrowserOnline: () => online.value }))
const mockToast = vi.fn()
vi.mock('@/components/ui/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }))

function entry(overrides: Partial<ChatListEntrySource> & { id: string; title: string }) {
  return projectChatListEntry({
    kind: 'person',
    starred: false,
    muted: false,
    unreadCount: 0,
    isProtected: false,
    ...overrides,
  })
}

const selectChat = vi.fn()
const openAddDialog = vi.fn()
function storeState(overrides = {}) {
  return {
    search: '',
    setSearch: vi.fn(),
    searchRequest: 0,
    selectedChatId: null,
    selectChat,
    openAddDialog,
    ...overrides,
  }
}

describe('ChatListPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    online.value = true
    Object.assign(listState, { entries: [], isLoading: false, isError: false, isForbidden: false })
    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector(storeState()))
  })

  it('uses the 48px list head and shows one flat row per identity', () => {
    listState.entries = [
      entry({ id: 'a', title: 'LinX 助手', kind: 'assistant', isProtected: true, preview: '你好' }),
      entry({ id: 'b', title: '周禾', preview: '收到', unreadCount: 3 }),
    ]
    render(<ChatListPane theme="light" />)
    expect(screen.getByTestId('chat-list-header')).toHaveClass('h-12')
    expect(screen.getAllByTestId('chat-list-item')).toHaveLength(2)
    expect(screen.getByText('收到')).toBeInTheDocument()
    expect(screen.getByLabelText('3 条未读')).toBeInTheDocument()
  })

  it('opens a chat from the keyboard', () => {
    listState.entries = [entry({ id: 'k', title: 'Keyboard Chat' })]
    render(<ChatListPane theme="light" />)
    const option = screen.getByRole('option', { name: 'Keyboard Chat' })
    fireEvent.keyDown(option, { key: 'Enter' })
    expect(selectChat).toHaveBeenCalledWith('k')
  })

  it('shows the state that needs you in the preview, without a topic name', () => {
    listState.entries = [entry({
      id: 'a', title: 'LinX 助手', kind: 'assistant',
      headlineTopic: { title: '每周排班提醒', status: { kind: 'decision', label: '等你决定', needsYou: true } },
    })]
    render(<ChatListPane theme="light" />)
    expect(screen.getByText('等你决定')).toBeInTheDocument()
    expect(screen.queryByText(/每周排班提醒/)).not.toBeInTheDocument()
  })

  it('filters to unread conversations', async () => {
    listState.entries = [
      entry({ id: 'a', title: '有未读', unreadCount: 1 }),
      entry({ id: 'b', title: '已读' }),
    ]
    render(<ChatListPane theme="light" />)
    fireEvent.pointerDown(screen.getByLabelText('筛选会话'), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByText('未读'))
    expect(screen.queryByText('已读')).not.toBeInTheDocument()
    expect(screen.getByText('有未读')).toBeInTheDocument()
  })

  it('offers only 找人聊天 and 发起群聊 (no 新的 AI 工作) from the + menu', async () => {
    render(<ChatListPane theme="light" />)
    fireEvent.pointerDown(screen.getByTitle('新建聊天'), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByText('发起群聊'))
    expect(openAddDialog).toHaveBeenCalledWith('group')
    fireEvent.pointerDown(screen.getByTitle('新建聊天'), { button: 0, ctrlKey: false })
    expect(await screen.findByText('找人聊天')).toBeInTheDocument()
    expect(screen.queryByText('新的 AI 工作')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByText('找人聊天'))
    expect(await screen.findByRole('dialog', { name: '找人聊天' })).toBeInTheDocument()
  })

  it('says when it shows old content offline, failed, or not allowed', () => {
    online.value = false
    const { rerender } = render(<ChatListPane theme="light" />)
    expect(screen.getByText('网络不可用，显示的是上次的内容')).toBeInTheDocument()
    online.value = true
    listState.isError = true
    rerender(<ChatListPane theme="light" />)
    fireEvent.click(screen.getByText('重试'))
    expect(listState.refetch).toHaveBeenCalled()
    listState.isForbidden = true
    rerender(<ChatListPane theme="light" />)
    expect(screen.getByText(/没有权限读取你的会话/u)).toBeInTheDocument()
  })

  it('shows loading and empty states', () => {
    listState.isLoading = true
    const { rerender } = render(<ChatListPane theme="light" />)
    expect(screen.getByText('正在加载...')).toBeInTheDocument()
    listState.isLoading = false
    rerender(<ChatListPane theme="light" />)
    expect(screen.getByText('还没有会话')).toBeInTheDocument()
  })

  it('shows search results while a search is typed', () => {
    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector(storeState({ search: 'alice' })))
    render(<ChatListPane theme="light" />)
    return waitFor(() => expect(screen.getByTestId('global-search-results')).toHaveTextContent('alice'))
  })

  it('confirms deletion in a dialog and never offers it for LinX 助手', async () => {
    listState.entries = [
      entry({ id: 'a', title: 'LinX 助手', kind: 'assistant', isProtected: true }),
      entry({ id: 'b', title: '周禾' }),
    ]
    mutations.deleteChat.mutateAsync.mockResolvedValue(undefined)
    render(<ChatListPane theme="light" />)

    fireEvent.contextMenu(screen.getByRole('option', { name: 'LinX 助手' }))
    await screen.findByText('标为未读')
    expect(screen.queryByText('删除会话…')).not.toBeInTheDocument()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    fireEvent.contextMenu(screen.getByRole('option', { name: '周禾' }))
    fireEvent.click(await screen.findByText('删除会话…'))
    expect(await screen.findByText('删除和周禾的会话？')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(mutations.deleteChat.mutateAsync).toHaveBeenCalledWith('b'))
  })

  it('stars and mutes from the right-click menu', async () => {
    listState.entries = [entry({ id: 'b', title: '周禾' })]
    mutations.updateChat.mutateAsync.mockResolvedValue(undefined)
    render(<ChatListPane theme="light" />)
    fireEvent.contextMenu(screen.getByRole('option', { name: '周禾' }))
    fireEvent.click(await screen.findByText('标星'))
    await waitFor(() => expect(mutations.updateChat.mutateAsync).toHaveBeenCalledWith({ id: 'b', starred: true }))
  })
})
