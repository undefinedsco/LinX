/**
 * SessionInputbar - Unit tests
 *
 * Tests send, Ctrl+C interrupt, and disabled states.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionInputbar } from './SessionInputbar'

const baseProps = {
  value: '',
  onChange: vi.fn(),
  onSend: vi.fn(),
}

describe('SessionInputbar', () => {
  it('renders placeholder text when session is active', () => {
    render(<SessionInputbar {...baseProps} />)
    expect(screen.getByPlaceholderText('输入指令发送给 CLI session...')).toBeInTheDocument()
  })

  it('renders ended placeholder when session is inactive', () => {
    render(<SessionInputbar {...baseProps} isSessionActive={false} />)
    expect(screen.getByPlaceholderText('Session 已结束')).toBeInTheDocument()
  })

  it('renders hint text with keyboard shortcuts', () => {
    render(<SessionInputbar {...baseProps} />)
    expect(screen.getByText(/Enter 发送/)).toBeInTheDocument()
    expect(screen.getByText(/Ctrl\+C 中断/)).toBeInTheDocument()
  })

  it('calls onSend on Enter key when value is non-empty', () => {
    const onSend = vi.fn()
    render(<SessionInputbar {...baseProps} value="test command" onSend={onSend} />)
    const textarea = screen.getByPlaceholderText('输入指令发送给 CLI session...')
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).toHaveBeenCalledOnce()
  })

  it('does not call onSend on Enter when value is empty', () => {
    const onSend = vi.fn()
    render(<SessionInputbar {...baseProps} value="" onSend={onSend} />)
    const textarea = screen.getByPlaceholderText('输入指令发送给 CLI session...')
    fireEvent.keyDown(textarea, { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('does not call onSend on Shift+Enter', () => {
    const onSend = vi.fn()
    render(<SessionInputbar {...baseProps} value="test" onSend={onSend} />)
    const textarea = screen.getByPlaceholderText('输入指令发送给 CLI session...')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('calls onInterrupt on Ctrl+C when input is empty', () => {
    const onInterrupt = vi.fn()
    render(<SessionInputbar {...baseProps} value="" onInterrupt={onInterrupt} />)
    const textarea = screen.getByPlaceholderText('输入指令发送给 CLI session...')
    fireEvent.keyDown(textarea, { key: 'c', ctrlKey: true })
    expect(onInterrupt).toHaveBeenCalledOnce()
  })

  it('does not call onInterrupt on Ctrl+C when input has value', () => {
    const onInterrupt = vi.fn()
    render(<SessionInputbar {...baseProps} value="some text" onInterrupt={onInterrupt} />)
    const textarea = screen.getByPlaceholderText('输入指令发送给 CLI session...')
    fireEvent.keyDown(textarea, { key: 'c', ctrlKey: true })
    expect(onInterrupt).not.toHaveBeenCalled()
  })

  it('disables send button when value is empty', () => {
    render(<SessionInputbar {...baseProps} value="" />)
    expect(screen.getByRole('button', { name: '发送' })).toBeDisabled()
  })

  it('enables send button when value is non-empty', () => {
    render(<SessionInputbar {...baseProps} value="test" />)
    expect(screen.getByRole('button', { name: '发送' })).not.toBeDisabled()
  })

  it('disables textarea when session is inactive', () => {
    render(<SessionInputbar {...baseProps} isSessionActive={false} />)
    expect(screen.getByPlaceholderText('Session 已结束')).toBeDisabled()
  })

  it('shows interrupt button when onInterrupt is provided', () => {
    const onInterrupt = vi.fn()
    render(<SessionInputbar {...baseProps} onInterrupt={onInterrupt} />)
    expect(screen.getByRole('button', { name: /中断/ })).toBeInTheDocument()
  })

  it('does not show interrupt button when onInterrupt is not provided', () => {
    render(<SessionInputbar {...baseProps} />)
    expect(screen.queryByRole('button', { name: /中断/ })).not.toBeInTheDocument()
  })

  it('calls onChange when typing', () => {
    const onChange = vi.fn()
    render(<SessionInputbar {...baseProps} onChange={onChange} />)
    const textarea = screen.getByPlaceholderText('输入指令发送给 CLI session...')
    fireEvent.change(textarea, { target: { value: 'hello' } })
    expect(onChange).toHaveBeenCalledWith('hello')
  })
})
