import { fireEvent, render, screen } from '@testing-library/react'
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
const mockUseWorkspaceList = vi.fn()
const mockUseThreadList = vi.fn()
const mockClearMessageAnchor = vi.fn()

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
  useChatList: () => ({
    data: [{ id: 'chat-1', title: 'Runtime Chat' }],
  }),
  useThreadList: () => mockUseThreadList(),
  useWorkspaceList: () => mockUseWorkspaceList(),
  useChatMutations: () => mockMutations,
}))

vi.mock('../runtime-client', () => ({
  fetchRuntimeSessionLog: vi.fn(),
  isRuntimeSessionMode: () => mockIsRuntimeSessionMode(),
  resolveLocalWorkspaceUri: vi.fn(async () => 'linx://node-123/repo/linx'),
  useRuntimeSession: () => mockUseRuntimeSession(),
  useRuntimeSessionEvents: vi.fn(),
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
    mockUseThreadList.mockReturnValue({
      data: [{ id: 'thread-1', title: '默认话题' }],
      isLoading: false,
    })
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
    storeState.messageAnchorId = null
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
        root: 'https://alice.example/.data/workspaces/ws-1/',
        repoRoot: null,
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

    expect(screen.getByText('当前话题已绑定Pod 容器')).toBeInTheDocument()
    expect(screen.getByText('Pod Workspace · https://alice.example/.data/workspaces/ws-1/ · main · 基于 origin/main')).toBeInTheDocument()
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
