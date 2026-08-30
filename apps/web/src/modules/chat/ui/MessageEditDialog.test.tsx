import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageEditDialog } from './MessageEditDialog'

describe('MessageEditDialog', () => {
  it('keeps submission disabled for an empty edit', () => {
    render(<MessageEditDialog open value="  " onValueChange={vi.fn()} onOpenChange={vi.fn()} onSubmit={vi.fn()} />)
    expect(screen.getByRole('button', { name: '保存并重新生成' })).toBeDisabled()
  })

  it('forwards controlled edits and submission', () => {
    const onValueChange = vi.fn()
    const onSubmit = vi.fn()
    render(<MessageEditDialog open value="updated" onValueChange={onValueChange} onOpenChange={vi.fn()} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByRole('textbox', { name: '消息内容' }), { target: { value: 'next' } })
    fireEvent.click(screen.getByRole('button', { name: '保存并重新生成' }))
    expect(onValueChange).toHaveBeenCalledWith('next')
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('locks actions and surfaces an error while submission is busy', () => {
    render(
      <MessageEditDialog
        open
        value="updated"
        busy
        error="生成失败"
        onValueChange={vi.fn()}
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '正在生成…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('生成失败')
  })
})
