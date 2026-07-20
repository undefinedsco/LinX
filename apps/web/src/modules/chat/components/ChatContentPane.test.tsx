import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { forwardRef } from 'react'

const mockNavigate = vi.fn()
const mockUseInboxItems = vi.fn()
const mockSelectInboxItem = vi.fn()
const mockSetInboxFilter = vi.fn()
const { mockSetThreadId, mockUseChatKit } = vi.hoisted(() => {
  const setThreadId = vi.fn()
  return {
    mockSetThreadId: setThreadId,
    mockUseChatKit: vi.fn(() => ({
      control: {},
      setThreadId,
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
const mockUseModelServices = vi.fn()
const mockClearMessageAnchor = vi.fn()
const mockRuntimeEventHandler = { current: null as ((event: unknown) => void) | null }

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

vi.mock('@inrupt/solid-ui-react', () => ({
  useSession: () => ({
    session: {
      info: { webId: 'https://alice.example/profile/card#me' },
      fetch: vi.fn(),
    },
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

vi.mock('@/modules/model-services/hooks/useModelServices', () => ({
  useModelServices: () => mockUseModelServices(),
}))

vi.mock('@/providers/solid-database-provider', () => ({
  useSolidDatabase: () => ({
    db: {},
  }),
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
    threadKey: '__default__',
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

import { ChatContentPane } from './ChatContentPane'

describe('ChatContentPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsRuntimeSessionMode.mockReturnValue(false)
    mockUseWorkspaceList.mockReturnValue({
      data: [],
      isLoading: false,
    })
    mockUseChatList.mockReturnValue({
      data: [{ id: 'chat-1', title: 'Runtime Chat' }],
    })
    mockUseThreadList.mockReturnValue({
      data: [{ id: 'thread-1', title: '默认话题' }],
      isLoading: false,
    })
    mockUseDefaultSecretaryBootstrapSettling.mockReturnValue(false)
    mockUseModelServices.mockReturnValue({ providers: {} })
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
    mockRuntimeEventHandler.current = null
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

  it('exposes LinX platform models to ChatKit with linx-lite as the default', () => {
    render(<ChatContentPane theme="light" />)

    expect(mockUseChatKit).toHaveBeenCalledWith(
      expect.objectContaining({
        composer: expect.objectContaining({
          models: [
            expect.objectContaining({ id: 'linx-lite', label: 'LinX Lite', default: true }),
            expect.objectContaining({ id: 'linx', label: 'LinX', default: false }),
          ],
        }),
      }),
    )
  })

  it('exposes configured provider models with an unambiguous transport id', () => {
    mockUseModelServices.mockReturnValue({
      providers: {
        timecc: {
          id: 'timecc',
          name: 'TimeCC',
          enabled: true,
          models: [{ id: 'gpt-5.5', name: 'GPT-5.5', enabled: true }],
        },
      },
    })

    render(<ChatContentPane theme="light" />)

    expect(mockUseChatKit).toHaveBeenCalledWith(expect.objectContaining({
      composer: expect.objectContaining({
        models: expect.arrayContaining([
          expect.objectContaining({ id: 'timecc::gpt-5.5', label: 'TimeCC / GPT-5.5' }),
        ]),
      }),
    }))
  })

  it('restores the Thread provider model as the ChatKit composer default', () => {
    mockUseModelServices.mockReturnValue({
      providers: {
        timecc: {
          id: 'timecc',
          name: 'TimeCC',
          enabled: true,
          models: [{ id: 'gpt-5.5', name: 'GPT-5.5', enabled: true }],
        },
      },
    })
    mockUseThreadList.mockReturnValue({
      data: [{ id: 'thread-1', metadata: { linxComposerModel: 'timecc::gpt-5.5' } }],
      isLoading: false,
    })

    render(<ChatContentPane theme="light" />)

    expect(mockUseChatKit).toHaveBeenCalledWith(expect.objectContaining({
      composer: expect.objectContaining({
        models: expect.arrayContaining([
          expect.objectContaining({ id: 'timecc::gpt-5.5', default: true }),
          expect.objectContaining({ id: 'linx-lite', default: false }),
        ]),
      }),
    }))
  })

  it('creates an initial Secretary thread immediately when bootstrap is pending but the thread list is ready', async () => {
    storeState.selectedChatId = '__secretary__/index.ttl#this'
    storeState.selectedThreadId = null
    mockUseChatList.mockReturnValue({
      data: [{ id: '__secretary__/index.ttl#this', title: 'AI Secretary' }],
    })
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
    })
    mockUseDefaultSecretaryBootstrapSettling.mockReturnValue(true)

    render(<ChatContentPane theme="light" />)

    await waitFor(() => {
      expect(mockMutations.createThread.mutate).toHaveBeenCalledTimes(1)
    })
    expect(mockMutations.createThread.mutate.mock.calls[0][0]).toEqual({
      chatId: '__secretary__/index.ttl#this',
      optimistic: true,
      threadId: '__default__',
      title: '默认话题',
    })
  })

  it('reselects the canonical Secretary thread instead of an older duplicate', async () => {
    storeState.selectedChatId = '__secretary__/index.ttl#this'
    storeState.selectedThreadId = 'legacy-thread'
    mockUseChatList.mockReturnValue({
      data: [{ id: '__secretary__/index.ttl#this', title: 'AI Secretary' }],
    })
    mockUseThreadList.mockReturnValue({
      data: [
        { id: 'legacy-thread', title: '默认话题' },
        { id: '__default__', title: '默认话题' },
      ],
      isLoading: false,
    })

    render(<ChatContentPane theme="light" />)

    await waitFor(() => {
      expect(storeState.selectThread).toHaveBeenCalledWith('__default__')
    })
  })

  it('creates the default Secretary thread after the bootstrap grace period even if threads are still loading', async () => {
    vi.useFakeTimers()
    try {
      storeState.selectedChatId = '__secretary__/index.ttl#this'
      storeState.selectedThreadId = null
      mockUseChatList.mockReturnValue({
        data: [{ id: '__secretary__/index.ttl#this', title: 'AI Secretary' }],
      })
      mockUseThreadList.mockReturnValue({
        data: [],
        isLoading: true,
      })
      mockUseDefaultSecretaryBootstrapSettling.mockReturnValue(true)

      render(<ChatContentPane theme="light" />)

      expect(mockMutations.createThread.mutate).not.toHaveBeenCalled()

      await act(async () => {
        vi.advanceTimersByTime(3000)
      })

      expect(mockMutations.createThread.mutate).toHaveBeenCalledTimes(1)
      expect(mockMutations.createThread.mutate.mock.calls[0][0]).toEqual({
        chatId: '__secretary__/index.ttl#this',
        optimistic: true,
        threadId: '__default__',
        title: '默认话题',
      })
    } finally {
      vi.useRealTimers()
    }
  })

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

  it('does not retry automatic initial thread creation for the same chat after a failure', async () => {
    storeState.selectedChatId = 'chat-1'
    storeState.selectedThreadId = null
    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
    })
    mockUseDefaultSecretaryBootstrapSettling.mockReturnValue(false)

    const { rerender } = render(<ChatContentPane theme="light" />)

    await waitFor(() => {
      expect(mockMutations.createThread.mutate).toHaveBeenCalledTimes(1)
    })
    const [, options] = mockMutations.createThread.mutate.mock.calls[0]

    act(() => {
      options.onError(new Error('network down'))
    })

    mockUseThreadList.mockReturnValue({
      data: [],
      isLoading: false,
    })
    rerender(<ChatContentPane theme="light" />)

    expect(mockMutations.createThread.mutate).toHaveBeenCalledTimes(1)
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

    expect(screen.getByText('这个账号还不能写入当前空间。请换一个空间；如果这是你的本地空间，请先完成空间创建。')).toBeInTheDocument()
    expect(screen.queryByText(/HTTP 403|node\.example|__secretary__|Pod container/i)).not.toBeInTheDocument()
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
