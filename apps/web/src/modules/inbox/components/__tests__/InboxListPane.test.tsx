import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseInboxStore = vi.fn()
const mockUseInboxItems = vi.fn()
const mockUseInboxSummary = vi.fn()

vi.mock('../../app/store', () => ({
  useInboxStore: (selector: (state: unknown) => unknown) => mockUseInboxStore(selector),
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
  useInboxItems: () => mockUseInboxItems(),
  useInboxSummary: () => mockUseInboxSummary(),
  useResolveInboxApproval: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { InboxListPane } from '../InboxListPane'

describe('InboxListPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        filter: 'all',
        setFilter: vi.fn(),
        selectedItemId: null,
        selectItem: vi.fn(),
      }))

    mockUseInboxSummary.mockReturnValue({
      total: 2,
      pending: 1,
      audit: 2,
    })
  })

  it('shows resolved auth items as completed instead of pending', () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'audit:resolved-auth',
          kind: 'audit',
          category: 'auth_required',
          title: '认证请求 · oauth2',
          description: '认证已完成 · https://example.com/auth',
          timestamp: '2026-03-12T12:00:00.000Z',
          status: 'resolved',
        },
      ],
      isLoading: false,
    })

    render(<InboxListPane />)

    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.queryByText('待登录')).not.toBeInTheDocument()
  })

  it('keeps pending auth items actionable in the list', () => {
    const selectItem = vi.fn()
    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({
        filter: 'all',
        setFilter: vi.fn(),
        selectedItemId: null,
        selectItem,
      }))

    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'audit:pending-auth',
          kind: 'audit',
          category: 'auth_required',
          title: '认证请求 · oauth2',
          description: '请完成登录',
          timestamp: '2026-03-12T12:00:00.000Z',
          status: 'pending',
        },
      ],
      isLoading: false,
    })

    render(<InboxListPane />)

    expect(screen.getByText('待登录')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('option', { name: /认证请求 · oauth2/i }))

    expect(selectItem).toHaveBeenCalledWith('audit:pending-auth')
  })

  it('shows generic mapped status labels for audit timeline items', () => {
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'audit:runtime-completed',
          kind: 'audit',
          category: 'audit',
          title: '运行时已完成',
          description: '代码修复 · 工具 codex',
          timestamp: '2026-03-12T12:00:00.000Z',
          status: 'completed',
        },
      ],
      isLoading: false,
    })

    render(<InboxListPane />)

    expect(screen.getByText('已完成')).toBeInTheDocument()
    expect(screen.getByText('运行时已完成')).toBeInTheDocument()
  })

  it('shows approval targets so same-tool requests can be distinguished', () => {
    const target = 'https://pod.example/.data/proposals/source/source-refresh.ttl#proposal'
    mockUseInboxItems.mockReturnValue({
      data: [
        {
          id: 'approval:source-refresh',
          kind: 'approval',
          category: 'approval',
          title: 'files.source.proposal',
          description: '等待授权 · medium 风险',
          timestamp: '2026-03-12T12:00:00.000Z',
          status: 'pending',
          approval: {
            id: 'source-refresh',
            status: 'pending',
            toolName: 'files.source.proposal',
            risk: 'medium',
            target,
            createdAt: '2026-03-12T12:00:00.000Z',
          },
        },
      ],
      isLoading: false,
    })

    render(<InboxListPane />)

    const detail = screen.getByText('source-refresh.ttl', { exact: false })
    expect(detail).toHaveAttribute('title', target)
    expect(screen.getByText('待批准')).toBeInTheDocument()
  })

  it('switches between waiting and handled work, with the activity log at the bottom', () => {
    const setFilter = vi.fn()
    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ filter: 'pending', setFilter, selectedItemId: null, selectItem: vi.fn() }))
    mockUseInboxItems.mockReturnValue({ data: [], isLoading: false })

    render(<InboxListPane />)

    expect(screen.getByRole('button', { name: '待处理 1' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('没有要决定的事')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '已处理' }))
    expect(setFilter).toHaveBeenCalledWith('done')

    fireEvent.click(screen.getByRole('button', { name: '活动记录' }))
    expect(setFilter).toHaveBeenCalledWith('audit')
  })

  it('opens the activity log as its own view with a way back', () => {
    const setFilter = vi.fn()
    mockUseInboxStore.mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ filter: 'audit', setFilter, selectedItemId: null, selectItem: vi.fn() }))
    mockUseInboxItems.mockReturnValue({ data: [], isLoading: false })

    render(<InboxListPane />)

    expect(screen.getByRole('heading', { name: '活动记录' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '已处理' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回收件箱' }))
    expect(setFilter).toHaveBeenCalledWith('pending')
  })
})
