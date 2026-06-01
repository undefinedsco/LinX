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
  parseApprovalOptions(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) return []
    return JSON.parse(value)
  },
  approvalDecisionForOption(option: { kind?: string }) {
    return option.kind === 'reject_once' || option.kind === 'reject_always' || option.kind === 'cancel'
      ? 'rejected'
      : 'approved'
  },
  buildApprovalOptionReason(option: { optionId: string; label: string }, extraReason?: string) {
    return JSON.stringify({
      source: 'linx-inbox',
      selectedOptionId: option.optionId,
      selectedLabel: option.label,
      ...(extraReason?.trim() ? { note: extraReason.trim() } : {}),
    })
  },
}))

import { InboxContentPane } from '../InboxContentPane'

const pendingApproval = {
  id: 'approval:approval-1',
  kind: 'approval' as const,
  category: 'approval' as const,
  title: 'write_file',
  description: '待审批 · 高 风险',
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

describe('InboxContentPane approval resolution', () => {
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

  it('submits the approval decision and reason without granting a reusable pattern', async () => {
    render(<InboxContentPane />)

    expect(screen.queryByLabelText('自动允许同类请求')).toBeNull()

    fireEvent.change(screen.getByLabelText('处理备注'), { target: { value: '可以执行' } })
    fireEvent.click(screen.getByText('批准'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        approval: expect.objectContaining({ id: 'approval-1' }),
        decision: 'approved',
        reason: '可以执行',
      })
    })
  })

  it('renders stored approval options as the resolution buttons', async () => {
    mockUseInboxItems.mockReturnValue({
      data: [{
        ...pendingApproval,
        approval: {
          ...pendingApproval.approval,
          approvalOptions: JSON.stringify([
            { optionId: '0', label: 'Allow', kind: 'allow_once' },
            { optionId: '1', label: 'Block', kind: 'reject_once' },
          ]),
        },
      }],
      isLoading: false,
    })

    render(<InboxContentPane />)

    fireEvent.change(screen.getByLabelText('处理备注'), { target: { value: '风险太高' } })
    fireEvent.click(screen.getByText('Block'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        approval: expect.objectContaining({ id: 'approval-1' }),
        decision: 'rejected',
        reason: JSON.stringify({
          source: 'linx-inbox',
          selectedOptionId: '1',
          selectedLabel: 'Block',
          note: '风险太高',
        }),
      })
    })
  })
})
