import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  StructuredColumnDialogHost,
  type StructuredColumnDialogModel,
} from './StructuredColumnDialogHost'

const model = (overrides: Partial<StructuredColumnDialogModel> = {}): StructuredColumnDialogModel => ({
  kind: 'rename',
  predicate: 'https://undefineds.co/vocab/status',
  label: '进度',
  originalLabel: '状态',
  typeLabel: 'enum',
  valueKind: 'choice',
  ...overrides,
})

function renderHost(dialog: StructuredColumnDialogModel | null) {
  const handlers = {
    onChangeType: vi.fn(async () => true),
    onClose: vi.fn(),
    onFilterChange: vi.fn(),
    onRemove: vi.fn(),
    onRename: vi.fn(),
  }
  const view = render(<StructuredColumnDialogHost dialog={dialog} {...handlers} />)
  return { ...view, handlers }
}

describe('StructuredColumnDialogHost (R6 K6d dialogs behind the column menu)', () => {
  it('shows nothing while no dialog is asked for', () => {
    renderHost(null)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renames the column for this table only, and an empty name puts the original back', () => {
    const { handlers } = renderHost(model())

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('只改这张表里的名字，别的表格和卡片上的名字不变。')).toBeInTheDocument()
    const input = within(dialog).getByLabelText('显示的名字')
    expect(input).toHaveValue('进度')
    fireEvent.change(input, { target: { value: '当前进展' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(handlers.onRename).toHaveBeenLastCalledWith('https://undefineds.co/vocab/status', '当前进展')
    expect(handlers.onClose).toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '状态' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存' }))
    expect(handlers.onRename).toHaveBeenLastCalledWith('https://undefineds.co/vocab/status', '')
  })

  it('saves a rename with Enter', () => {
    const { handlers } = renderHost(model())
    const input = screen.getByLabelText('显示的名字')
    fireEvent.change(input, { target: { value: '新名字' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(handlers.onRename).toHaveBeenCalledWith('https://undefineds.co/vocab/status', '新名字')
  })

  it('asks before taking the column off the table and says the values stay', () => {
    const { handlers } = renderHost(model({ kind: 'remove' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('从这张表去掉“进度”？')).toBeInTheDocument()
    expect(within(dialog).getByText(/卡片上的值都保留/)).toBeInTheDocument()
    expect(handlers.onRemove).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: '去掉' }))
    expect(handlers.onRemove).toHaveBeenCalledWith('https://undefineds.co/vocab/status', '进度')
    expect(handlers.onClose).toHaveBeenCalled()
  })

  it('does not take the column off when the person cancels', () => {
    const { handlers } = renderHost(model({ kind: 'remove' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }))
    expect(handlers.onRemove).not.toHaveBeenCalled()
    expect(handlers.onClose).toHaveBeenCalled()
  })

  it('changes the value type, only when the type is actually different', async () => {
    const { handlers } = renderHost(model({ kind: 'type' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/已经填好的内容不会变/)).toBeInTheDocument()
    const apply = within(dialog).getByRole('button', { name: '改成这个' })
    expect(apply).toBeDisabled()
    expect(within(dialog).getByRole('radio', { name: /选项/ })).toHaveAttribute('aria-checked', 'true')

    fireEvent.click(within(dialog).getByRole('radio', { name: /文字/ }))
    expect(apply).toBeEnabled()
    fireEvent.click(apply)
    await waitFor(() => expect(handlers.onChangeType).toHaveBeenCalledWith('https://undefineds.co/vocab/status', 'text'))
    await waitFor(() => expect(handlers.onClose).toHaveBeenCalled())
  })

  it('keeps the type dialog open when the change fails', async () => {
    const { handlers } = renderHost(model({ kind: 'type' }))
    handlers.onChangeType.mockResolvedValueOnce(false)

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: /数字/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '改成这个' }))

    await waitFor(() => expect(handlers.onChangeType).toHaveBeenCalledWith('https://undefineds.co/vocab/status', 'number'))
    expect(handlers.onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('filters a text column by what it contains', () => {
    const { handlers } = renderHost(model({ kind: 'filter', label: '备注', valueKind: 'text', typeLabel: 'text' }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('按“备注”筛选')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByLabelText('包含的文字'), { target: { value: '周末' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '筛选' }))

    expect(handlers.onFilterChange).toHaveBeenCalledWith('https://undefineds.co/vocab/status', {
      predicate: 'https://undefineds.co/vocab/status',
      kind: 'contains',
      text: '周末',
    })
  })

  it('filters a number column by a range, a date column with date inputs, and either by empty', () => {
    const { handlers, rerender } = renderHost(model({ kind: 'filter', label: '预算', valueKind: 'number', typeLabel: 'number' }))
    let dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('最小值')).toHaveAttribute('type', 'number')
    fireEvent.change(within(dialog).getByLabelText('最小值'), { target: { value: '100' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '筛选' }))
    expect(handlers.onFilterChange).toHaveBeenLastCalledWith('https://undefineds.co/vocab/status', {
      predicate: 'https://undefineds.co/vocab/status',
      kind: 'range',
      min: '100',
      max: null,
    })

    rerender(<StructuredColumnDialogHost dialog={model({ kind: 'filter', label: '截止', valueKind: 'date', typeLabel: 'date' })} {...handlers} />)
    dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('最大值')).toHaveAttribute('type', 'date')
    fireEvent.click(within(dialog).getByRole('radio', { name: '没填' }))
    fireEvent.click(within(dialog).getByRole('button', { name: '筛选' }))
    expect(handlers.onFilterChange).toHaveBeenLastCalledWith('https://undefineds.co/vocab/status', {
      predicate: 'https://undefineds.co/vocab/status',
      kind: 'empty',
      empty: true,
    })
  })

  it('clears a filter the column already has', () => {
    const { handlers } = renderHost(model({
      kind: 'filter',
      valueKind: 'text',
      filter: { predicate: 'https://undefineds.co/vocab/status', kind: 'contains', text: '周' },
    }))

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText('包含的文字')).toHaveValue('周')
    fireEvent.click(within(dialog).getByRole('button', { name: '清除筛选' }))
    expect(handlers.onFilterChange).toHaveBeenCalledWith('https://undefineds.co/vocab/status', null)
  })
})
