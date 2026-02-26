/**
 * SessionControlBar - Unit tests
 *
 * Tests button state logic based on session status and callback wiring.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionControlBar, type SessionStatus } from './SessionControlBar'

const baseProps = {
  title: 'Test Session',
  status: 'active' as SessionStatus,
  tool: 'Claude Code',
  tokenUsage: 1500,
  duration: '2m 30s',
}

describe('SessionControlBar', () => {
  it('renders title, tool, token usage, and duration', () => {
    render(<SessionControlBar {...baseProps} />)
    expect(screen.getByText('Test Session')).toBeInTheDocument()
    expect(screen.getByText('Claude Code')).toBeInTheDocument()
    expect(screen.getByText('1.5k tokens')).toBeInTheDocument()
    expect(screen.getByText('2m 30s')).toBeInTheDocument()
  })

  it('shows status badge label', () => {
    render(<SessionControlBar {...baseProps} status="active" />)
    expect(screen.getByText('运行中')).toBeInTheDocument()
  })

  describe('active status', () => {
    it('shows Pause and Stop buttons, no Resume', () => {
      render(<SessionControlBar {...baseProps} status="active" />)
      expect(screen.getByRole('button', { name: '暂停' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '恢复' })).not.toBeInTheDocument()
    })

    it('calls onPause when Pause button clicked', () => {
      const onPause = vi.fn()
      render(<SessionControlBar {...baseProps} status="active" onPause={onPause} />)
      fireEvent.click(screen.getByRole('button', { name: '暂停' }))
      expect(onPause).toHaveBeenCalledOnce()
    })

    it('calls onStop when Stop button clicked', () => {
      const onStop = vi.fn()
      render(<SessionControlBar {...baseProps} status="active" onStop={onStop} />)
      fireEvent.click(screen.getByRole('button', { name: '停止' }))
      expect(onStop).toHaveBeenCalledOnce()
    })
  })

  describe('paused status', () => {
    it('shows Resume and Stop buttons, no Pause', () => {
      render(<SessionControlBar {...baseProps} status="paused" />)
      expect(screen.getByRole('button', { name: '恢复' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '停止' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '暂停' })).not.toBeInTheDocument()
    })

    it('shows paused status badge', () => {
      render(<SessionControlBar {...baseProps} status="paused" />)
      expect(screen.getByText('已暂停')).toBeInTheDocument()
    })

    it('calls onResume when Resume button clicked', () => {
      const onResume = vi.fn()
      render(<SessionControlBar {...baseProps} status="paused" onResume={onResume} />)
      fireEvent.click(screen.getByRole('button', { name: '恢复' }))
      expect(onResume).toHaveBeenCalledOnce()
    })
  })

  describe('completed status', () => {
    it('shows only Copy Log button', () => {
      render(<SessionControlBar {...baseProps} status="completed" />)
      expect(screen.getByRole('button', { name: '复制日志' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '暂停' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '恢复' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '停止' })).not.toBeInTheDocument()
    })
  })

  describe('error status', () => {
    it('shows only Copy Log button', () => {
      render(<SessionControlBar {...baseProps} status="error" />)
      expect(screen.getByRole('button', { name: '复制日志' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '停止' })).not.toBeInTheDocument()
    })

    it('shows error status badge', () => {
      render(<SessionControlBar {...baseProps} status="error" />)
      expect(screen.getByText('出错')).toBeInTheDocument()
    })
  })

  it('calls onCopyLog when Copy Log button clicked', () => {
    const onCopyLog = vi.fn()
    render(<SessionControlBar {...baseProps} onCopyLog={onCopyLog} />)
    fireEvent.click(screen.getByRole('button', { name: '复制日志' }))
    expect(onCopyLog).toHaveBeenCalledOnce()
  })

  it('disables Pause button when onPause is not provided', () => {
    render(<SessionControlBar {...baseProps} status="active" />)
    expect(screen.getByRole('button', { name: '暂停' })).toBeDisabled()
  })

  it('renders auto-approved patterns', () => {
    render(
      <SessionControlBar
        {...baseProps}
        autoApprovedPatterns={['npm test', 'git status']}
      />,
    )
    expect(screen.getByText(/npm test/)).toBeInTheDocument()
    expect(screen.getByText(/git status/)).toBeInTheDocument()
  })

  it('formats token count with k suffix for large numbers', () => {
    render(<SessionControlBar {...baseProps} tokenUsage={25000} />)
    expect(screen.getByText('25.0k tokens')).toBeInTheDocument()
  })

  it('formats token count without suffix for small numbers', () => {
    render(<SessionControlBar {...baseProps} tokenUsage={500} />)
    expect(screen.getByText('500 tokens')).toBeInTheDocument()
  })
})
