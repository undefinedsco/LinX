import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StructuredRowBulkBar } from './StructuredRowBulkBar'

describe('StructuredRowBulkBar', () => {
  it('opens and clears without asking', () => {
    const onOpen = vi.fn()
    const onClear = vi.fn()
    render(<StructuredRowBulkBar count={2} moveTargets={[]} onOpen={onOpen} onClear={onClear} />)
    expect(screen.getByText('已选 2 张卡片')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    fireEvent.click(screen.getByRole('button', { name: '取消选择' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('asks before deleting', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(<StructuredRowBulkBar count={3} moveTargets={[]} onOpen={vi.fn()} onDelete={onDelete} onClear={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '删除…' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('删除 3 张卡片？')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1))
  })

  it('hides 移到… when there is no other table', () => {
    render(<StructuredRowBulkBar count={1} moveTargets={[]} onMove={vi.fn()} onOpen={vi.fn()} onClear={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '移到…' })).toBeNull()
  })
})
