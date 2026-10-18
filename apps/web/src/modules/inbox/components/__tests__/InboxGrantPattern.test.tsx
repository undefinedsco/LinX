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
  chatOps: { createUserMessage: vi.fn() },
}))

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({ session: { info: { webId: 'https://alice.example/profile/card#me' } } }),
}))

vi.mock('@/modules/files/store', () => ({
  useFilesStore: (selector: (state: unknown) => unknown) => mockUseFilesStore(selector),
}))

vi.mock('../../app/store', () => ({
  useInboxStore: (selector: (state: unknown) => unknown) => mockUseInboxStore(selector),
}))

vi.mock('../../app/auto-judge-sweep', () => ({
  useInboxAutoJudgeSweep: () => undefined,
  useAutoJudgeSettingsSync: () => undefined,
}))

vi.mock('../../data/auto-judge', () => ({
  useInboxAutoJudgeSweep: () => undefined,
  useGrantRows: () => ({ data: [], all: [], isLoading: false }),
  useAutoJudgeActions: () => ({
    takeOver: { mutate: vi.fn(), isPending: false },
    markReviewed: { mutate: vi.fn(), isPending: false },
    revokeGrant: { mutate: vi.fn(), isPending: false },
  }),
}))

vi.mock('../../data/collections', () => ({
  refreshInboxRequests: () => undefined,
  useInboxItems: () => mockUseInboxItems(),
  useResolveInboxApproval: () => mockUseResolveInboxApproval(),
  useResolveInboxInputRequest: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }),
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
    fireEvent.click(screen.getByText('批准这一次'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        approval: expect.objectContaining({ id: 'approval-1' }),
        decision: 'approved',
        reason: '可以执行',
      })
    })
  })

  it('grants this kind of request when the box is ticked', async () => {
    render(<InboxContentPane />)

    fireEvent.click(screen.getByLabelText('以后这类交给 LinX 判断（授权）'))
    fireEvent.click(screen.getByText('批准这一次'))

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        decision: 'approved',
        grant: { highImpactConfirmed: false },
      }))
    })
  })

  it('asks once more before granting sending, spending or deleting', async () => {
    mockUseInboxItems.mockReturnValue({
      data: [{
        ...pendingApproval,
        approval: { ...pendingApproval.approval, toolName: 'send_email', action: 'https://undefineds.co/ns#sendEmail' },
      }],
      isLoading: false,
    })
    render(<InboxContentPane />)

    fireEvent.click(screen.getByLabelText('以后这类交给 LinX 判断（授权）'))
    fireEvent.click(screen.getByText('批准这一次'))
    expect(mockMutateAsync).not.toHaveBeenCalled()

    fireEvent.click(await screen.findByText('批准并授权'))
    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        grant: { highImpactConfirmed: true },
      }))
    })
  })
})
