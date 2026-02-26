/**
 * CP1 Unit Tests — ToolApprovalBlock rendering
 *
 * Tests pending/approved/rejected states, countdown timer, and button interactions.
 */

import { render, screen, fireEvent, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ToolApprovalBlock } from '../ToolApprovalBlock'
import { MessageBlockType, MessageBlockStatus } from '@linx/models'

function createApprovalBlock(overrides = {}) {
  return {
    id: 'block-1',
    messageId: 'msg-1',
    type: MessageBlockType.TOOL_APPROVAL as const,
    status: MessageBlockStatus.PENDING,
    createdAt: new Date().toISOString(),
    toolCallId: 'tc-1',
    toolName: 'write_file',
    toolDescription: 'Write content to a file',
    arguments: { path: '/tmp/test.txt', content: 'hello' },
    risk: 'medium' as const,
    approvalStatus: 'pending' as const,
    ...overrides,
  }
}

describe('ToolApprovalBlock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders pending state with tool name and risk label', () => {
    const block = createApprovalBlock()
    render(<ToolApprovalBlock block={block} />)

    expect(screen.getByText('write_file')).toBeInTheDocument()
    expect(screen.getByText('中风险')).toBeInTheDocument()
    expect(screen.getByText('等待审批')).toBeInTheDocument()
  })

  it('renders description and arguments', () => {
    const block = createApprovalBlock()
    render(<ToolApprovalBlock block={block} />)

    expect(screen.getByText('Write content to a file')).toBeInTheDocument()
    expect(screen.getByText(/path:/)).toBeInTheDocument()
  })

  it('shows approve and reject buttons when pending', () => {
    const block = createApprovalBlock()
    const onApprove = vi.fn()
    const onReject = vi.fn()

    render(
      <ToolApprovalBlock
        block={block}
        onApprove={onApprove}
        onReject={onReject}
      />
    )

    expect(screen.getByText('批准')).toBeInTheDocument()
    expect(screen.getByText('拒绝')).toBeInTheDocument()
  })

  it('calls onApprove when approve button clicked', () => {
    const block = createApprovalBlock()
    const onApprove = vi.fn()

    render(<ToolApprovalBlock block={block} onApprove={onApprove} />)

    fireEvent.click(screen.getByText('批准'))
    expect(onApprove).toHaveBeenCalledWith('tc-1')
  })

  it('calls onReject when reject button clicked', () => {
    const block = createApprovalBlock()
    const onReject = vi.fn()

    render(<ToolApprovalBlock block={block} onReject={onReject} />)

    fireEvent.click(screen.getByText('拒绝'))
    expect(onReject).toHaveBeenCalledWith('tc-1')
  })

  it('renders approved state without buttons', () => {
    const block = createApprovalBlock({ approvalStatus: 'approved' })
    render(<ToolApprovalBlock block={block} onApprove={vi.fn()} />)

    expect(screen.getByText('已批准')).toBeInTheDocument()
    expect(screen.queryByText('批准')).not.toBeInTheDocument()
    expect(screen.queryByText('拒绝')).not.toBeInTheDocument()
  })

  it('renders rejected state without buttons', () => {
    const block = createApprovalBlock({ approvalStatus: 'rejected' })
    render(<ToolApprovalBlock block={block} onReject={vi.fn()} />)

    expect(screen.getByText('已拒绝')).toBeInTheDocument()
    expect(screen.queryByText('批准')).not.toBeInTheDocument()
    expect(screen.queryByText('拒绝')).not.toBeInTheDocument()
  })

  it('renders auto_approved state', () => {
    const block = createApprovalBlock({ approvalStatus: 'auto_approved' })
    render(<ToolApprovalBlock block={block} />)

    expect(screen.getByText('自动批准')).toBeInTheDocument()
  })

  it('shows high risk indicator', () => {
    const block = createApprovalBlock({ risk: 'high' })
    render(<ToolApprovalBlock block={block} />)

    expect(screen.getByText('高风险')).toBeInTheDocument()
  })

  it('shows low risk indicator', () => {
    const block = createApprovalBlock({ risk: 'low' })
    render(<ToolApprovalBlock block={block} />)

    expect(screen.getByText('低风险')).toBeInTheDocument()
  })

  it('displays countdown for medium risk', () => {
    const block = createApprovalBlock({ risk: 'medium' })
    const onApprove = vi.fn()

    render(<ToolApprovalBlock block={block} onApprove={onApprove} />)

    // Should show countdown text
    expect(screen.getByText(/自动批准/)).toBeInTheDocument()
    expect(screen.getByText(/60s/)).toBeInTheDocument()
  })

  it('displays countdown for high risk', () => {
    const block = createApprovalBlock({ risk: 'high' })
    const onReject = vi.fn()

    render(<ToolApprovalBlock block={block} onReject={onReject} />)

    expect(screen.getByText(/自动拒绝/)).toBeInTheDocument()
    expect(screen.getByText(/30s/)).toBeInTheDocument()
  })

  it('auto-rejects high risk on timeout', () => {
    const block = createApprovalBlock({ risk: 'high' })
    const onReject = vi.fn()

    render(
      <ToolApprovalBlock block={block} onApprove={vi.fn()} onReject={onReject} />
    )

    // Advance 30 seconds
    act(() => {
      vi.advanceTimersByTime(30_000)
    })

    expect(onReject).toHaveBeenCalledWith('tc-1')
  })

  it('auto-approves medium risk on timeout', () => {
    const block = createApprovalBlock({ risk: 'medium' })
    const onApprove = vi.fn()

    render(
      <ToolApprovalBlock block={block} onApprove={onApprove} onReject={vi.fn()} />
    )

    // Advance 60 seconds
    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(onApprove).toHaveBeenCalledWith('tc-1')
  })

  it('does not auto-action for low risk', () => {
    const block = createApprovalBlock({ risk: 'low' })
    const onApprove = vi.fn()
    const onReject = vi.fn()

    render(
      <ToolApprovalBlock block={block} onApprove={onApprove} onReject={onReject} />
    )

    // Advance well past any timeout
    act(() => {
      vi.advanceTimersByTime(120_000)
    })

    expect(onApprove).not.toHaveBeenCalled()
    expect(onReject).not.toHaveBeenCalled()
  })

  it('shows reason when provided', () => {
    const block = createApprovalBlock({
      approvalStatus: 'rejected',
      reason: 'Too dangerous',
    })
    render(<ToolApprovalBlock block={block} />)

    expect(screen.getByText('Too dangerous')).toBeInTheDocument()
  })
})
