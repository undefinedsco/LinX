import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forwardRef } from 'react'

const mockNavigate = vi.fn()
const mockUseInboxItems = vi.fn()
const mockSelectInboxItem = vi.fn()
const mockSetInboxFilter = vi.fn()
const { mockSetThreadId, mockSetComposerValue, mockFetchUpdates, mockUseChatKit } = vi.hoisted(() => {
  const setThreadId = vi.fn()
  const setComposerValue = vi.fn(async () => undefined)
  const fetchUpdates = vi.fn(async () => undefined)
  return {
    mockSetThreadId: setThreadId,
    mockSetComposerValue: setComposerValue,
    mockFetchUpdates: fetchUpdates,
    mockUseChatKit: vi.fn(() => ({
      control: {},
      setThreadId,
      setComposerValue,
      fetchUpdates,
    })),
  }
})
const mockIsRuntimeSessionMode = vi.fn()
const mockUseRuntimeSession = vi.fn()
const mockResolveLocalWorkspaceUri = vi.fn(async () => 'linx://device-123/repo/linx')
const mockUseWorkspaceList = vi.fn()
const mockUseChatList = vi.fn()
const mockUseThreadList = vi.fn()
const mockUseDefaultSecretaryBootstrapSettling = vi.fn()
const mockChatRefetch = vi.fn()
const mockThreadRefetch = vi.fn()
const mockDatabaseRetry = vi.fn()
const mockUseSolidDatabase = vi.fn()
const mockClearMessageAnchor = vi.fn()
const mockRuntimeEventHandler = { current: null as ((event: unknown) => void) | null }
const mockSession = {
  info: { webId: 'https://alice.example/profile/card#me' as string | undefined },
  fetch: vi.fn() as ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) | undefined,
}

const storeState = {
  selectedChatId: 'chat-1',
  selectedThreadId: 'thread-1',
  messageAnchorId: null as string | null,
  selectThread: vi.fn(),
  clearMessageAnchor: mockClearMessageAnchor,
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({
    session: mockSession,
  }),
}))

vi.mock('@openai/chatkit-react', () => ({
  useChatKit: mockUseChatKit,
  ChatKit: forwardRef<HTMLDivElement>((_props, ref) => (
    <div ref={ref} data-testid="chatkit-root">
      <div data-message-id="msg-3">anchored message</div>
    </div>
  )),
}))

vi.mock('@undefineds.co/models', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@undefineds.co/models')>()
  return {
    ...actual,
    resolveRowId: (row: { id?: string }) => row?.id ?? null,
  }
})

vi.mock('@/modules/inbox/collections', () => ({
  useInboxItems: (..._args: unknown[]) => mockUseInboxItems(),
}))

vi.mock('@/modules/inbox/store', () => ({
  useInboxStore: (selector: (state: unknown) => unknown) =>
    selector({
      selectedItemId: null,
      filter: 'all',
      selectItem: mockSelectInboxItem,
      setFilter: mockSetInboxFilter,
    }),
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => mockUseSolidDatabase(),
}))

vi.mock('../services/chatkit-local/fetch-handler', () => ({
  createLocalChatKitFetch: () => vi.fn(),
}))

vi.mock('../store', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => selector(storeState),
}))

const mockMutations = {
  createThread: {
    isPending: false,
    mutate: vi.fn(),
  },
  ensureThreadWorkspace: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
}

vi.mock('../collections', () => ({
  useChatInit: () => ({ isReady: true }),
  useChatList: () => mockUseChatList(),
  useThreadList: () => mockUseThreadList(),
  useWorkspaceList: () => mockUseWorkspaceList(),
  useChatMutations: () => mockMutations,
  useLinxDefaultSecretaryBootstrapSettling: () => mockUseDefaultSecretaryBootstrapSettling(),
  LINX_DEFAULT_SECRETARY: {
    chatId: '__secretary__/index.ttl#this',
    threadTitle: '默认话题',
  },
}))

vi.mock('../runtime-client', () => ({
  fetchRuntimeSessionLog: vi.fn(),
  isRuntimeSessionMode: () => mockIsRuntimeSessionMode(),
  resolveLocalContainer: (...args: unknown[]) => mockResolveLocalWorkspaceUri(...args),
  useRuntimeSession: () => mockUseRuntimeSession(),
  useRuntimeSessionEvents: vi.fn((_id: string | undefined, handler: (event: unknown) => void) => {
    mockRuntimeEventHandler.current = handler
  }),
}))

vi.mock('./ChatListPane', () => ({
  ChatListPane: () => <div data-testid="compact-chat-list">Compact chat list</div>,
}))

import { ChatContentPane } from './ChatContentPane'

describe('ChatContentPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    mockSetComposerValue.mockResolvedValue(undefined)
    mockFetchUpdates.mockResolvedValue(undefined)
    mockUseSolidDatabase.mockReturnValue({
      db: {},
      status: 'ready',
      error: null,
      retry: mockDatabaseRetry,
      scopeKey: 'account:alice',
    })
    mockIsRuntimeSessionMode.mockReturnValue(false)
    mockUseWorkspaceList.mockReturnValue({
      data: [],
      isLoading: false,
    })
    mockUseChatList.mockReturnValue({
      data: [{ id: 'chat-1', title: 'Runtime Chat' }],
      isLoading: false,
      error: null,
      refetch: mockChatRefetch,
    })
    mockUseThreadList.mockReturnValue({
      data: [{ id: 'thread-1', title: '默认话题' }],
      isLoading: false,
      error: null,
      refetch: mockThreadRefetch,
    })
    mockUseDefaultSecretaryBootstrapSettling.mockReturnValue(false)
    mockUseRuntimeSession.mockReturnValue({
      runtimeSession: null,
      refetch: vi.fn(),
      createSession: { isPending: false, mutateAsync: vi.fn() },
      startSession: { isPending: false, mutateAsync: vi.fn() },
      pauseSession: { isPending: false, mutateAsync: vi.fn() },
      resumeSession: { isPending: false, mutateAsync: vi.fn() },
      stopSession: { isPending: false, mutateAsync: vi.fn() },
    })
    mockUseInboxItems.mockReturnValue({
      data: [],
      isLoading: false,
    })
    mockMutations.ensureThreadWorkspace.mutateAsync.mockResolvedValue('https://alice.example/.data/workspaces/thread-1/')
    mockResolveLocalWorkspaceUri.mockResolvedValue('linx://device-123/repo/linx')
    storeState.messageAnchorId = null
    storeState.selectedChatId = 'chat-1'
    storeState.selectedThreadId = 'thread-1'
    mockSession.info.webId = 'https://alice.example/profile/card#me'
    mockSession.fetch = vi.fn()
    mockRuntimeEventHandler.current = null
  })

  it('shows the existing chat list in compact content when no chat is selected', () => {
    storeState.selectedChatId = null
    storeState.selectedThreadId = null

    render(<ChatContentPane theme="light" compact />)

    expect(screen.getByTestId('compact-chat-list')).toBeInTheDocument()
    expect(screen.queryByText('选择或创建一个聊天')).not.toBeInTheDocument()
  })

  it('shows the empty prompt instead of the inline list on desktop when no chat is selected', () => {
    storeState.selectedChatId = null
    storeState.selectedThreadId = null

    render(<ChatContentPane theme="light" />)

    expect(screen.getByText('选择或创建一个聊天')).toBeInTheDocument()
    expect(screen.queryByTestId('compact-chat-list')).not.toBeInTheDocument()
  })

  it('passes selected thread as the initial ChatKit thread without unsafe pre-upgrade method calls', () => {
    render(<ChatContentPane theme="light" />)

    expect(mockUseChatKit).toHaveBeenCalledWith(
      expect.objectContaining({
        initialThread: 'thread-1',
      }),
    )
    expect(mockSetThreadId).not.toHaveBeenCalled()
  })

  it('uses the chat workspace as a full-bleed operational surface', () => {
    render(<ChatContentPane theme="light" />)

    const workspace = screen.getByTestId('chat-workspace-surface')
    expect(workspace.className).not.toMatch(/rounded-|backdrop-blur|\bm-4\b/)
  })

  it('keeps model selection in the chat header instead of duplicating it in ChatKit', () => {
    render(<ChatContentPane theme="light" />)

    expect(mockUseChatKit).toHaveBeenCalledWith(
      expect.objectContaining({
        composer: expect.not.objectContaining({ models: expect.anything() }),
      }),
    )
  })

  it('offers real web search as a non-persistent ChatKit composer tool', () => {
    render(<ChatContentPane theme="light" />)

    expect(mockUseChatKit).toHaveBeenCalledWith(
      expect.objectContaining({
        composer: expect.objectContaining({
          tools: [expect.objectContaining({
            id: 'web_search',
            label: '联网搜索',
            icon: 'search',
            pinned: true,
            persistent: false,
          })],
        }),
      }),
    )
  })

  it('blocks sending while offline and refreshes the active thread after reconnecting', async () => {
    render(<ChatContentPane theme="light" />)

    act(() => window.dispatchEvent(new Event('offline')))
    expect(screen.getByRole('alert')).toHaveTextContent('网络已断开')
    expect(screen.getByText('网络恢复后可继续发送')).toBeInTheDocument()

    act(() => window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(mockFetchUpdates).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByText('连接已恢复，正在同步最新消息…')).not.toBeInTheDocument())
  })

  it('offers an explicit retry when reconnect synchronization fails', async () => {
    mockFetchUpdates.mockRejectedValueOnce(new Error('network reset')).mockResolvedValueOnce(undefined)
    render(<ChatContentPane theme="light" />)

    act(() => window.dispatchEvent(new Event('offline')))
    act(() => window.dispatchEvent(new Event('online')))

    expect(await screen.findByText('连接已恢复，但消息同步失败。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试同步' }))
    await waitFor(() => expect(mockFetchUpdates).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('连接已恢复，但消息同步失败。')).not.toBeInTheDocument())
  })

  it('renders an interactive Secretary welcome while bootstrap is still pending', async () => {
    storeState.selectedChatId = '__secretary__/index.ttl#this'
    storeState.selectedThreadId = null
    mockUseChatList.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockChatRefetch,
    })
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockThreadRefetch,
    })
    mockUseDefaultSecretaryBootstrapSettling.mockReturnValue(true)

    render(<ChatContentPane theme="light" />)

    expect(screen.getByRole('heading', { name: '你好，我是 LinX 主理人' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '给主理人发消息' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /整理今天的工作/ }))
    expect(screen.getByRole('textbox', { name: '给主理人发消息' })).toHaveValue('帮我整理今天需要推进的工作')
    expect(screen.queryByText('正在准备话题...')).not.toBeInTheDocument()
    expect(mockMutations.createThread.mutate).not.toHaveBeenCalled()
  })

  it('creates the Secretary default thread after bootstrap settles even before the chat query returns', async () => {
    storeState.selectedChatId = '__secretary__/index.ttl#this'
    storeState.selectedThreadId = null
    mockUseChatList.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockChatRefetch,
    })
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockThreadRefetch,
    })
    mockUseDefaultSecretaryBootstrapSettling.mockReturnValue(false)

    render(<ChatContentPane theme="light" />)

    await waitFor(() => expect(mockMutations.createThread.mutate).toHaveBeenCalledTimes(1))
    expect(mockMutations.createThread.mutate).toHaveBeenCalledWith(
      {
        chatId: '__secretary__/index.ttl#this',
        title: '默认话题',
      },
      expect.any(Object),
    )
  })

  it('shows forbidden query state and retries chat and thread reads', async () => {
    mockUseChatList.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: Object.assign(new Error('HTTP 403'), { status: 403 }),
      refetch: mockChatRefetch,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByText('无法读取当前空间中的聊天')).toBeInTheDocument()
    expect(screen.getByText(/没有读取这个空间的权限/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => {
      expect(mockChatRefetch).toHaveBeenCalledTimes(1)
      expect(mockThreadRefetch).toHaveBeenCalledTimes(1)
    })
    expect(mockMutations.createThread.mutate).not.toHaveBeenCalled()
  })

  it('shows timeout separately from forbidden and offers retry', () => {
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
      error: Object.assign(new Error('request timed out'), { name: 'TimeoutError' }),
      refetch: mockThreadRefetch,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByText('读取聊天超时')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.queryByText(/权限/)).not.toBeInTheDocument()
  })

  it('does not project loading after the chat query completes without a match', () => {
    mockUseChatList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockChatRefetch,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByText('找不到这个聊天')).toBeInTheDocument()
    expect(screen.queryByText('正在加载聊天')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(mockMutations.createThread.mutate).not.toHaveBeenCalled()
  })

  it('projects not-found when no thread is selected and the completed chat query has no match', () => {
    storeState.selectedThreadId = null
    mockUseChatList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockChatRefetch,
    })
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockThreadRefetch,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByText('找不到这个聊天')).toBeInTheDocument()
    expect(screen.queryByText('正在加载聊天')).not.toBeInTheDocument()
    expect(mockMutations.createThread.mutate).not.toHaveBeenCalled()
  })

  it('keeps cached ready ChatKit visible when a background query reports an error', () => {
    mockUseChatList.mockReturnValue({
      data: [{ id: 'chat-1', title: 'Cached Chat' }],
      isLoading: false,
      error: Object.assign(new Error('HTTP 403'), { status: 403 }),
      refetch: mockChatRefetch,
    })
    mockUseThreadList.mockReturnValue({
      data: [{ id: 'thread-1', title: 'Cached Thread' }],
      isLoading: false,
      error: Object.assign(new Error('request timed out'), { name: 'TimeoutError' }),
      refetch: mockThreadRefetch,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByTestId('chatkit-root')).toBeInTheDocument()
    expect(screen.getByText('聊天同步失败，当前显示缓存内容')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试同步' }))
    expect(mockChatRefetch).toHaveBeenCalledTimes(1)
    expect(mockThreadRefetch).toHaveBeenCalledTimes(1)
  })

  it('does not turn a staged Secretary welcome into a chat-sync failure banner', () => {
    storeState.selectedChatId = '__secretary__/index.ttl#this'
    storeState.selectedThreadId = null
    mockUseChatList.mockReturnValue({
      data: [{ id: '__secretary__/index.ttl#this', title: 'AI Secretary' }],
      isLoading: false,
      error: Object.assign(new Error('HTTP 403'), { status: 403 }),
      refetch: mockChatRefetch,
    })
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
      error: Object.assign(new Error('request timed out'), { name: 'TimeoutError' }),
      refetch: mockThreadRefetch,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByTestId('secretary-welcome')).toBeInTheDocument()
    expect(screen.queryByText('聊天同步失败，当前显示缓存内容')).not.toBeInTheDocument()
  })

  it('keeps cached content visible but disables sending while the database is invalid', () => {
    mockUseSolidDatabase.mockReturnValue({
      db: null,
      status: 'error',
      error: new Error('database unavailable'),
      retry: mockDatabaseRetry,
      scopeKey: 'account:alice',
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByTestId('chatkit-root')).toBeInTheDocument()
    expect(screen.getByText('当前空间连接已失效')).toBeInTheDocument()
    expect(screen.getByTestId('chatkit-send-boundary')).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('button', { name: '重试连接' }))
    expect(mockDatabaseRetry).toHaveBeenCalledTimes(1)
  })

  it('keeps cached content read-only while the database is still reinitializing', () => {
    mockUseSolidDatabase.mockReturnValue({
      db: null,
      status: 'initializing',
      error: null,
      retry: mockDatabaseRetry,
      scopeKey: 'account:alice',
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByTestId('chatkit-root')).toBeInTheDocument()
    expect(screen.getByText('正在恢复当前空间连接')).toBeInTheDocument()
    expect(screen.getByTestId('chatkit-send-boundary')).toHaveAttribute('aria-disabled', 'true')
  })

  it('ignores a thread creation callback after the user switches chats', async () => {
    storeState.selectedChatId = '__secretary__/index.ttl#this'
    storeState.selectedThreadId = null
    mockUseChatList.mockReturnValue({
      data: [{ id: '__secretary__/index.ttl#this', title: 'AI Secretary' }],
      isLoading: false,
      error: null,
      refetch: mockChatRefetch,
    })
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockThreadRefetch,
    })

    const view = render(<ChatContentPane theme="light" />)
    await waitFor(() => expect(mockMutations.createThread.mutate).toHaveBeenCalledTimes(1))
    const [, options] = mockMutations.createThread.mutate.mock.calls[0]

    storeState.selectedChatId = 'chat-2'
    mockUseChatList.mockReturnValue({
      data: [{ id: 'chat-2', title: 'Other Chat' }],
      isLoading: false,
      error: null,
      refetch: mockChatRefetch,
    })
    view.rerender(<ChatContentPane theme="light" />)
    act(() => options.onSuccess({ id: 'stale-thread' }))

    expect(storeState.selectThread).not.toHaveBeenCalledWith('stale-thread')
  })

  it('offers a dedicated Secretary thread retry even when the draft is empty', async () => {
    storeState.selectedChatId = '__secretary__/index.ttl#this'
    storeState.selectedThreadId = null
    mockUseChatList.mockReturnValue({
      data: [{ id: '__secretary__/index.ttl#this', title: 'AI Secretary' }],
      isLoading: false,
      error: null,
      refetch: mockChatRefetch,
    })
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockThreadRefetch,
    })

    render(<ChatContentPane theme="light" />)

    await waitFor(() => expect(mockMutations.createThread.mutate).toHaveBeenCalledTimes(1))
    const [, options] = mockMutations.createThread.mutate.mock.calls[0]
    act(() => options.onError(new Error('thread write failed')))

    expect(screen.getByRole('button', { name: '开始对话' })).toBeDisabled()
    fireEvent.click(await screen.findByRole('button', { name: '重试创建话题' }))

    await waitFor(() => expect(mockMutations.createThread.mutate).toHaveBeenCalledTimes(2))
  })

  it('retains a submitted Secretary draft and retries ChatKit composer handoff after failure', async () => {
    storeState.selectedChatId = '__secretary__/index.ttl#this'
    storeState.selectedThreadId = null
    mockUseChatList.mockReturnValue({
      data: [{ id: '__secretary__/index.ttl#this', title: 'AI Secretary' }],
      isLoading: false,
      error: null,
      refetch: mockChatRefetch,
    })
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockThreadRefetch,
    })
    mockSetComposerValue
      .mockRejectedValueOnce(new Error('composer unavailable'))
      .mockResolvedValueOnce(undefined)

    const view = render(<ChatContentPane theme="light" />)

    fireEvent.click(screen.getByRole('button', { name: /整理今天的工作/ }))
    fireEvent.click(screen.getByRole('button', { name: '开始对话' }))
    await waitFor(() => expect(mockMutations.createThread.mutate).toHaveBeenCalled())
    const [, options] = mockMutations.createThread.mutate.mock.calls[0]
    act(() => options.onSuccess({ id: 'secretary-thread' }))

    storeState.selectedThreadId = 'secretary-thread'
    mockUseThreadList.mockReturnValue({
      data: [{ id: 'secretary-thread', title: '默认话题' }],
      isLoading: false,
      error: null,
      refetch: mockThreadRefetch,
    })
    view.rerender(<ChatContentPane theme="light" />)

    await waitFor(() => {
      expect(mockSetComposerValue).toHaveBeenCalledWith({
        text: '帮我整理今天需要推进的工作',
      })
    })
    expect(await screen.findByText('无法填入 Secretary 草稿')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试填入草稿' }))
    await waitFor(() => expect(mockSetComposerValue).toHaveBeenCalledTimes(2))
  })

  it('restores the Secretary draft after a page remount for the same account and chat', async () => {
    storeState.selectedChatId = '__secretary__/index.ttl#this'
    storeState.selectedThreadId = null
    mockUseChatList.mockReturnValue({
      data: [{ id: '__secretary__/index.ttl#this', title: 'AI Secretary' }],
      isLoading: false,
      error: null,
      refetch: mockChatRefetch,
    })
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockThreadRefetch,
    })

    const first = render(<ChatContentPane theme="light" />)
    fireEvent.change(screen.getByRole('textbox', { name: '给主理人发消息' }), {
      target: { value: '刷新后仍需保留的草稿' },
    })
    first.unmount()

    render(<ChatContentPane theme="light" />)

    await waitFor(() => expect(screen.getByRole('textbox', { name: '给主理人发消息' }))
      .toHaveValue('刷新后仍需保留的草稿'))
  })

  it('clears Secretary draft, pending handoff, and thread error when the account scope changes', async () => {
    storeState.selectedChatId = '__secretary__/index.ttl#this'
    storeState.selectedThreadId = null
    mockUseChatList.mockReturnValue({
      data: [{ id: '__secretary__/index.ttl#this', title: 'AI Secretary' }],
      isLoading: false,
      error: null,
      refetch: mockChatRefetch,
    })
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockThreadRefetch,
    })

    const view = render(<ChatContentPane theme="light" />)
    fireEvent.click(screen.getByRole('button', { name: /整理今天的工作/ }))
    fireEvent.click(screen.getByRole('button', { name: '开始对话' }))
    await waitFor(() => expect(mockMutations.createThread.mutate).toHaveBeenCalled())
    const [, options] = mockMutations.createThread.mutate.mock.calls[0]
    act(() => options.onError(new Error('old account thread failure')))
    expect(screen.getByRole('button', { name: '重试创建话题' })).toBeInTheDocument()

    mockSession.info.webId = 'https://bob.example/profile/card#me'
    mockUseSolidDatabase.mockReturnValue({
      db: null,
      status: 'initializing',
      error: null,
      retry: mockDatabaseRetry,
      scopeKey: 'account:bob',
    })
    mockUseDefaultSecretaryBootstrapSettling.mockReturnValue(true)
    mockUseChatList.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockChatRefetch,
    })
    view.rerender(<ChatContentPane theme="light" />)

    expect(screen.getByRole('textbox', { name: '给主理人发消息' })).toHaveValue('')
    expect(screen.getByRole('button', { name: '开始对话' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '重试创建话题' })).not.toBeInTheDocument()
    expect(screen.queryByText(/old account thread failure/)).not.toBeInTheDocument()
  })

  it('projects Solid database initialization errors and exposes database retry', () => {
    storeState.selectedThreadId = null
    mockUseSolidDatabase.mockReturnValue({
      db: null,
      status: 'error',
      error: new Error('database initialization failed'),
      retry: mockDatabaseRetry,
      scopeKey: 'account:alice',
    })
    mockUseChatList.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      refetch: mockChatRefetch,
    })
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: mockThreadRefetch,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByText('无法读取聊天')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(mockDatabaseRetry).toHaveBeenCalledTimes(1)
  })

  it('shows login-required without treating it as a recoverable query failure', () => {
    mockSession.info.webId = undefined
    mockSession.fetch = undefined

    render(<ChatContentPane theme="light" />)

    expect(screen.getByText('登录未完成')).toBeInTheDocument()
    expect(screen.getByText('请先完成登录，再开始聊天。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重试' })).not.toBeInTheDocument()
  })

  it('treats an authenticated 401 query failure as transient loading and auto-retries', async () => {
    mockUseChatList.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: Object.assign(new Error('Request failed'), { status: 401 }),
      refetch: mockChatRefetch,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.queryByText('登录未完成')).not.toBeInTheDocument()
    expect(screen.getByText('正在加载聊天')).toBeInTheDocument()
    await waitFor(() => expect(mockChatRefetch).toHaveBeenCalled(), { timeout: 1000 })
  })

  it('shows login-required only after the grace period when an authenticated 401 persists', async () => {
    mockUseChatList.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: Object.assign(new Error('Request failed'), { status: 401 }),
      refetch: mockChatRefetch,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.queryByText('登录未完成')).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('登录未完成')).toBeInTheDocument(), { timeout: 4000 })
  }, 6000)

  it('creates a random-id initial thread and binds the default Pod workspace after bootstrap when no thread exists', async () => {
    storeState.selectedChatId = 'chat-1'
    storeState.selectedThreadId = null
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
    })
    mockUseDefaultSecretaryBootstrapSettling.mockReturnValue(false)

    render(<ChatContentPane theme="light" />)

    await waitFor(() => {
      expect(mockMutations.createThread.mutate).toHaveBeenCalled()
    })
    const [input] = mockMutations.createThread.mutate.mock.calls[0]
    expect(input).toEqual({
      chatId: 'chat-1',
      title: '默认话题',
    })
    expect(input).not.toHaveProperty('threadId')

    const [, options] = mockMutations.createThread.mutate.mock.calls[0]
    await act(async () => {
      options.onSuccess({ id: 'thread-1' })
    })

    expect(storeState.selectThread).toHaveBeenCalledWith('thread-1')
    expect(mockMutations.ensureThreadWorkspace.mutateAsync).toHaveBeenCalledWith({
      threadId: 'thread-1',
      title: '默认话题',
    })
  })

  it('shows a recoverable error after initial thread creation fails', async () => {
    storeState.selectedChatId = 'chat-1'
    storeState.selectedThreadId = null
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
    })
    mockUseDefaultSecretaryBootstrapSettling.mockReturnValue(false)

    render(<ChatContentPane theme="light" />)

    await waitFor(() => {
      expect(mockMutations.createThread.mutate).toHaveBeenCalledTimes(1)
    })
    const [, options] = mockMutations.createThread.mutate.mock.calls[0]

    act(() => {
      options.onError(new Error('network down'))
    })

    expect(await screen.findByText('无法创建默认话题')).toBeInTheDocument()
    expect(screen.getByText(/network down/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))

    await waitFor(() => expect(mockMutations.createThread.mutate).toHaveBeenCalledTimes(2))
  })

  it('shows approval banner and routes to inbox for pending approvals', () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'approval:1',
          kind: 'approval',
          category: 'approval',
          status: 'pending',
          chatId: 'chat-1',
          threadId: 'thread-1',
        },
      ],
      isLoading: false,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByText('当前话题有 1 条待处理授权')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '打开收件箱' }))

    expect(mockSetInboxFilter).toHaveBeenCalledWith('pending')
    expect(mockSelectInboxItem).toHaveBeenCalledWith('approval:1')
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'inbox' },
    })
  })

  it('prefers auth-required banner when authentication is needed', () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'audit:1',
          kind: 'audit',
          category: 'auth_required',
          status: 'pending',
          chatId: 'chat-1',
          threadId: 'thread-1',
        },
        {
          id: 'approval:1',
          kind: 'approval',
          category: 'approval',
          status: 'pending',
          chatId: 'chat-1',
          threadId: 'thread-1',
        },
      ],
      isLoading: false,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByText('当前话题等待认证')).toBeInTheDocument()
    expect(screen.getByText('请先在收件箱完成认证，再继续当前 runtime 会话。')).toBeInTheDocument()
  })

  it('shows bound workspace context when runtime mode is enabled', () => {
    mockIsRuntimeSessionMode.mockReturnValue(true)
    mockUseWorkspaceList.mockReturnValue({
      data: [{
        id: 'ws-1',
        title: 'Pod Workspace',
        workspaceType: 'pod',
        kind: 'folder',
        rootUri: 'https://alice.example/.data/workspaces/ws-1/',
        repoRootUri: null,
        baseRef: 'origin/main',
        branch: 'main',
      }],
      isLoading: false,
    })
    mockUseThreadList.mockReturnValue({
      data: [{
        id: 'thread-1',
        title: '默认话题',
        workspace: 'https://alice.example/.data/workspaces/ws-1/',
      }],
      isLoading: false,
    })

    render(<ChatContentPane theme="light" />)

    expect(screen.getByText('当前话题已绑定空间文件夹')).toBeInTheDocument()
    expect(screen.getByText('Pod Workspace · https://alice.example/.data/workspaces/ws-1/ · main · 基于 origin/main')).toBeInTheDocument()
  })

  it('creates a Pod-container runtime session from the bound workspace without requiring a local repo path', async () => {
    const createSession = vi.fn(async () => ({ id: 'runtime-pod-1' }))
    const startSession = vi.fn(async () => ({ id: 'runtime-pod-1', status: 'active' }))
    const refetch = vi.fn()
    mockIsRuntimeSessionMode.mockReturnValue(true)
    mockUseRuntimeSession.mockReturnValue({
      runtimeSession: null,
      refetch,
      createSession: { isPending: false, mutateAsync: createSession },
      startSession: { isPending: false, mutateAsync: startSession },
      pauseSession: { isPending: false, mutateAsync: vi.fn() },
      resumeSession: { isPending: false, mutateAsync: vi.fn() },
      stopSession: { isPending: false, mutateAsync: vi.fn() },
    })
    mockUseWorkspaceList.mockReturnValue({
      data: [{
        id: 'ws-1',
        title: 'Pod Workspace',
        workspaceType: 'pod',
        kind: 'folder',
        rootUri: 'https://alice.example/.data/workspaces/ws-1/',
      }],
      isLoading: false,
    })
    mockUseThreadList.mockReturnValue({
      data: [{
        id: 'thread-1',
        title: '默认话题',
        workspace: 'https://alice.example/.data/workspaces/ws-1/',
      }],
      isLoading: false,
    })

    render(<ChatContentPane theme="light" />)

    fireEvent.click(screen.getByRole('button', { name: /创建运行时会话/ }))
    fireEvent.click(screen.getByRole('button', { name: '创建并启动' }))

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith({
        threadId: 'thread-1',
        container: 'https://alice.example/.data/workspaces/ws-1/',
        workspaceKind: 'pod-container',
        title: '默认话题',
        tool: 'codex',
        baseRef: 'HEAD',
        branch: undefined,
      })
    })
    expect(startSession).toHaveBeenCalledWith('runtime-pod-1')
    expect(refetch).toHaveBeenCalled()
    expect(mockResolveLocalWorkspaceUri).not.toHaveBeenCalled()
    expect(mockMutations.ensureThreadWorkspace.mutateAsync).not.toHaveBeenCalled()
  })

  it('does not expose internal runtime event errors', () => {
    mockIsRuntimeSessionMode.mockReturnValue(true)
    mockUseRuntimeSession.mockReturnValue({
      runtimeSession: { id: 'runtime-1', status: 'active' },
      refetch: vi.fn(),
      createSession: { isPending: false, mutateAsync: vi.fn() },
      startSession: { isPending: false, mutateAsync: vi.fn() },
      pauseSession: { isPending: false, mutateAsync: vi.fn() },
      resumeSession: { isPending: false, mutateAsync: vi.fn() },
      stopSession: { isPending: false, mutateAsync: vi.fn() },
    })

    render(<ChatContentPane theme="light" />)

    act(() => {
      mockRuntimeEventHandler.current?.({
        type: 'error',
        message: 'Failed to create Pod container https://node.example/alice/agents/__secretary__/: HTTP 403',
      })
    })

    expect(screen.getByText('这个账号还不能写入当前空间。请换一个空间；如果这是你的本机空间，请先完成空间创建。')).toBeInTheDocument()
    expect(screen.queryByText(/HTTP 403|node\.example|__secretary__|Pod container/i)).not.toBeInTheDocument()
  })

  it('shows runtime tools as a restrained activity summary with optional technical detail', () => {
    mockIsRuntimeSessionMode.mockReturnValue(true)
    mockUseRuntimeSession.mockReturnValue({
      runtimeSession: { id: 'runtime-1', status: 'active', title: '默认话题', tool: 'codex' },
      refetch: vi.fn(),
      createSession: { isPending: false, mutateAsync: vi.fn() },
      startSession: { isPending: false, mutateAsync: vi.fn() },
      pauseSession: { isPending: false, mutateAsync: vi.fn() },
      resumeSession: { isPending: false, mutateAsync: vi.fn() },
      stopSession: { isPending: false, mutateAsync: vi.fn() },
    })

    render(<ChatContentPane theme="light" />)

    act(() => {
      mockRuntimeEventHandler.current?.({
        type: 'tool_call',
        name: 'write_file',
        arguments: '{"path":"secret.txt"}',
      })
    })

    expect(screen.getByText('等待确认工作区变更')).toBeInTheDocument()
    expect(screen.getByText('write_file')).toBeInTheDocument()
    expect(screen.queryByText(/secret\.txt/)).not.toBeInTheDocument()
  })

  it('restores anchored message after chat scene re-entry', () => {
    vi.useFakeTimers()
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })

    storeState.messageAnchorId = 'msg-3'

    render(<ChatContentPane theme="light" />)

    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'center',
    })

    vi.advanceTimersByTime(2000)
    expect(mockClearMessageAnchor).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
