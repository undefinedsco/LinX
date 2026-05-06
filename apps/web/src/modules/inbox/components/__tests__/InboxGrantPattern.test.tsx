import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockNavigate = vi.fn()
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

vi.mock('@/modules/chat/store', () => ({
  useChatStore: (selector: (state: unknown) => unknown) => mockUseChatStore(selector),
}))

vi.mock('@/modules/chat/collections', () => ({
  useThreadIndex: (..._args: unknown[]) => mockUseThreadIndex(),
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

const pendingApproval = {
  id: 'approval:approval-1',
  kind: 'approval' as const,
  category: 'approval' as const,
  title: 'write_file',
  description: '等待授权 · 高 风险',
  timestamp: '2026-03-10T12:00:00.000Z',
  status: 'pending' as const,
  approval: {
    id: 'approval-1',
    toolName: 'write_file',
    risk: '高',
    status: 'pending' as const,
    target: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
    session: 'urn:linx:runtime-session:runtime-1',
    toolCallId: 'tool-call-1',
    createdAt: '2026-03-10T12:00:00.000Z',
    policyVersion: 'phase4-inbox-v1',
  },
}

describe('InboxContentPane grant pattern', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectedItemId: 'approval:approval-1',
      setFilter: vi.fn(),
      selectItem: vi.fn(),
    }))

    mockUseInboxItems.mockReturnValue({
      data: [pendingApproval],
      isLoading: false,
    })

    mockUseResolveInboxApproval.mockReturnValue({
      mutateAsync: mockMutateAsync,
      isPending: false,
      error: null,
    })

    mockUseChatStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectChat: vi.fn(),
      selectThread: vi.fn(),
    }))

    mockUseThreadIndex.mockReturnValue({
      data: [],
      isLoading: false,
    })

    mockUseFilesStore.mockImplementation((selector: (state: unknown) => unknown) => selector({
      selectTreeNode: vi.fn(),
      selectFile: vi.fn(),
    }))
  })

  it('submits grant pattern when approving a pending approval', async () => {
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
