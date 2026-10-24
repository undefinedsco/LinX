import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StructuredColumnFilterChips } from './StructuredColumnFilterChips'

const chips = [
  { predicate: 'status', text: '状态：进行中', removeLabel: '去掉筛选：状态：进行中' },
  { predicate: 'amount', text: '金额 ≥ 10', removeLabel: '去掉筛选：金额 ≥ 10' },
]

describe('StructuredColumnFilterChips (R6 K6 已用的筛选)', () => {
  it('shows nothing when no column is filtered', () => {
    const { container } = render(<StructuredColumnFilterChips chips={[]} onClear={vi.fn()} onRemove={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows one chip per filter and removes just that filter', () => {
    const onRemove = vi.fn()
    render(<StructuredColumnFilterChips chips={chips} onClear={vi.fn()} onRemove={onRemove} />)

    const row = screen.getByLabelText('已用的筛选')
    expect(within(row).getByText('状态：进行中')).toBeInTheDocument()
    expect(within(row).getByText('金额 ≥ 10')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '去掉筛选：金额 ≥ 10' }))
    expect(onRemove).toHaveBeenCalledWith('amount')
    expect(onRemove).toHaveBeenCalledTimes(1)
  })

  it('offers 清除全部 only when there is more than one chip', () => {
    const onClear = vi.fn()
    const { rerender } = render(<StructuredColumnFilterChips chips={chips} onClear={onClear} onRemove={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '清除全部' }))
    expect(onClear).toHaveBeenCalledTimes(1)

    rerender(<StructuredColumnFilterChips chips={chips.slice(0, 1)} onClear={onClear} onRemove={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '清除全部' })).not.toBeInTheDocument()
  })
})
