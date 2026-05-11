import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
const mockSelectChat = vi.fn()
const mockSelectThread = vi.fn()
const mockSelectTreeNode = vi.fn()
const mockSelectFile = vi.fn()
const mockSetFilter = vi.fn()
const mockSelectInboxItem = vi.fn()
const mockMutateAsync = vi.fn().mockResolvedValue(undefined)

const mockUseInboxStore = vi.fn()
const mockUseInboxItems = vi.fn()
const mockUseResolveInboxApproval = vi.fn()
const mockUseChatStore = vi.fn()
const mockUseThreadIndex = vi.fn()
const mockUseFilesStore = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/modules/chat/collections', () => ({
  useThreadIndex: (..._args: unknown[]) => mockUseThreadIndex(),
}))

vi.mock('@/modules/chat/store', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => mockUseChatStore(selector),
}))

vi.mock('@/modules/files/store', () => ({
  useFilesStore: (selector: (state: unknown) => unknown) => mockUseFilesStore(selector),
}))

vi.mock('../../store', () => ({
  useInboxStore: (selector: (state: unknown) => unknown) => mockUseInboxStore(selector),
}))

vi.mock('../../collections', () => ({
  useInboxItems: () => mockUseInboxItems(),
  useResolveInboxApproval: () => mockUseResolveInboxApproval(),
}))

import { InboxContentPane } from '../InboxContentPane'

const authRequiredItem = {
  id: 'audit:audit-1',
  kind: 'audit' as const,
  category: 'auth_required' as const,
  title: '认证请求 · oauth2',
  description: '需要登录 · oauth2 · https://example.com/auth',
  timestamp: '2026-03-10T12:00:00.000Z',
  chatId: 'chat-1',
  threadId: 'thread-1',
  authUrl: 'https://example.com/auth',
  authMethod: 'oauth2',
  authMessage: '请完成登录后继续',
  audit: {
    id: 'audit-1',
    action: 'runtime.auth_required',
    actorRole: 'system',
    session: 'urn:linx:runtime-session:runtime-1',
    entry: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
    toolName: 'oauth2',
    policy: 'https://example.com/auth',
    createdAt: '2026-03-10T12:00:00.000Z',
  },
}

describe('InboxContentPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedItemId: 'audit:audit-1',
      setFilter: mockSetFilter,
      selectItem: mockSelectInboxItem,
    }))

    mockUseInboxItems.mockReturnValue({
      data: [authRequiredItem],
      isLoading: false,
    })

    mockUseResolveInboxApproval.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      error: null,
    })

    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectChat: mockSelectChat,
      selectThread: mockSelectThread,
    }))

    mockUseThreadIndex.mockReturnValue({
      data: [],
      isLoading: false,
    })

    mockUseFilesStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectTreeNode: mockSelectTreeNode,
      selectFile: mockSelectFile,
    }))
  })

  it('renders auth-required actions', () => {
    render(<InboxContentPane />)

    expect(screen.getByText('运行时等待额外认证')).toBeInTheDocument()
    expect(screen.getByText('打开会话')).toBeInTheDocument()
    expect(screen.getByText('打开认证页')).toBeInTheDocument()
    expect(screen.getByText('oauth2')).toBeInTheDocument()
    expect(screen.getByText('请完成登录后继续')).toBeInTheDocument()
  })

  it('opens the linked conversation when user clicks open conversation', () => {
    render(<InboxContentPane />)

    fireEvent.click(screen.getByText('打开会话'))

    expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
    expect(mockSelectThread).toHaveBeenCalledWith('thread-1')
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'chat' },
    })
  })

  it('does not show pending auth guidance once auth request is resolved', () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          ...authRequiredItem,
          status: 'resolved',
        },
      ],
      isLoading: false,
    })

    render(<InboxContentPane />)

    expect(screen.queryByText('运行时等待额外认证')).not.toBeInTheDocument()
    expect(screen.getByText('运行时认证已完成')).toBeInTheDocument()
    expect(screen.getByText('打开会话')).toBeInTheDocument()
  })

  it('opens derived workspace and object targets from audit pointers', () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'audit:audit-file',
          kind: 'audit' as const,
          category: 'audit' as const,
          title: '运行时已完成',
          description: '生成报告文件',
          timestamp: '2026-03-10T12:00:00.000Z',
          chatId: 'chat-1',
          threadId: 'thread-1',
          thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
          about: 'https://alice.example/.data/workspaces/ws-1/output/report.md',
          audit: {
            id: 'audit-file',
            action: 'runtime.session.completed',
            actorRole: 'system',
            session: 'urn:linx:runtime-session:runtime-1',
            entry: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
            toolName: 'codex',
            createdAt: '2026-03-10T12:00:00.000Z',
          },
        },
      ],
      isLoading: false,
    })

    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedItemId: 'audit:audit-file',
      setFilter: mockSetFilter,
      selectItem: mockSelectInboxItem,
    }))

    mockUseThreadIndex.mockReturnValue({
      data: [
        {
          id: 'thread-1',
          chat: 'chat-1',
          workspace: 'https://alice.example/.data/workspaces/ws-1/',
        },
      ],
      isLoading: false,
    })

    render(<InboxContentPane />)

    fireEvent.click(screen.getByText('打开工作区'))

    expect(mockSelectChat).toHaveBeenCalledWith('chat-1')
    expect(mockSelectThread).toHaveBeenCalledWith('thread-1')
    expect(mockSelectTreeNode).toHaveBeenCalledWith('workspace:https://alice.example/.data/workspaces/ws-1/')
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'files' },
    })

    fireEvent.click(screen.getByText('打开对象'))

    expect(mockSelectTreeNode).toHaveBeenCalledWith('container:https://alice.example/.data/workspaces/ws-1/output/')
    expect(mockSelectFile).toHaveBeenCalledWith('https://alice.example/.data/workspaces/ws-1/output/report.md')
  })

  it('opens related approval card from audit record', () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'audit:audit-approval',
          kind: 'audit' as const,
          category: 'audit' as const,
          title: '授权已批准',
          description: '收件箱已批准工具执行。',
          timestamp: '2026-03-10T12:00:00.000Z',
          approvalId: 'approval-1',
          audit: {
            id: 'audit-approval',
            action: 'inbox.approval.approved',
            actorRole: 'human',
            session: 'urn:linx:runtime-session:runtime-1',
            approval: 'https://alice.example/.data/approvals/approval-1.ttl#this',
            createdAt: '2026-03-10T12:00:00.000Z',
          },
        },
      ],
      isLoading: false,
    })

    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedItemId: 'audit:audit-approval',
      setFilter: mockSetFilter,
      selectItem: mockSelectInboxItem,
    }))

    render(<InboxContentPane />)

    fireEvent.click(screen.getByText('打开原审批'))

    expect(mockSetFilter).toHaveBeenCalledWith('all')
    expect(mockSelectInboxItem).toHaveBeenCalledWith('approval:approval-1')
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'inbox' },
    })
  })

  it('submits grant pattern when approving a pending approval', async () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'approval:approval-1',
          kind: 'approval' as const,
          category: 'approval' as const,
          title: 'write_file',
          description: '等待授权 · 高 风险',
          timestamp: '2026-03-10T12:00:00.000Z',
          status: 'pending',
          approval: {
            id: 'approval-1',
            toolName: 'write_file',
            risk: '高',
            status: 'pending',
            target: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
            session: 'urn:linx:runtime-session:runtime-1',
            toolCallId: 'tool-call-1',
            createdAt: '2026-03-10T12:00:00.000Z',
            policyVersion: 'phase4-inbox-v1',
          },
        },
      ],
      isLoading: false,
    })

    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedItemId: 'approval:approval-1',
      setFilter: mockSetFilter,
      selectItem: mockSelectInboxItem,
    }))

    render(<InboxContentPane />)

    fireEvent.change(screen.getByLabelText('自动允许同类请求'), { target: { value: 'shell:git status' } })
    fireEvent.change(screen.getByLabelText('处理备注'), { target: { value: '可以执行' } })
    fireEvent.click(screen.getByText('批准'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        approval: expect.objectContaining({ id: 'approval-1' }),
        decision: 'approved',
        reason: '可以执行',
        grantPattern: 'shell:git status',
      })
    })
  })
})
