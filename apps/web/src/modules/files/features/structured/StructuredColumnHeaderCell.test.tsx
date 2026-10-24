import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StructuredColumnHeaderCell, type StructuredColumnHeaderActions } from './StructuredColumnHeaderCell'

function makeActions(overrides: Partial<StructuredColumnHeaderActions> = {}): StructuredColumnHeaderActions {
  return {
    filterValues: ['进行中', '已完成'],
    onFilterChange: vi.fn(),
    onOpenFilterDialog: vi.fn(),
    onSort: vi.fn(),
    onRename: vi.fn(),
    onChangeType: vi.fn(),
    onHide: vi.fn(),
    onRemove: vi.fn(),
    onOpenDefinition: vi.fn(),
    ...overrides,
  }
}

function cell(actions: StructuredColumnHeaderActions, props: Partial<Parameters<typeof StructuredColumnHeaderCell>[0]> = {}) {
  return (
    <StructuredColumnHeaderCell
      actions={actions}
      description="任务现在的进展"
      editable
      label="状态"
      predicate="https://undefineds.co/vocab/status"
      sort={null}
      termIsEditable
      typeLabel="enum"
      {...props}
    />
  )
}

function openMenu(label = '状态') {
  fireEvent.pointerDown(screen.getByRole('button', { name: `${label} 列菜单` }))
}

function openSubmenu(name: string) {
  const trigger = screen.getByRole('menuitem', { name })
  trigger.focus()
  fireEvent.keyDown(trigger, { key: 'ArrowRight' })
}

describe('StructuredColumnHeaderCell (R6 K6d 点表头：这一列的菜单)', () => {
  it('opens a menu from the column title with the artboard items', () => {
    render(cell(makeActions()))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    openMenu()

    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('状态')).toBeInTheDocument()
    expect(within(menu).getByText('选项')).toBeInTheDocument()
    expect(within(menu).getByText('任务现在的进展')).toBeInTheDocument()
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      '改显示的名字',
      '改值的类型…',
      '按它排序',
      '按它筛选',
      '隐藏这一列',
      '在词表里查看',
      '从这张表去掉…',
    ])
  })

  it('sorts ascending or descending from the 按它排序 submenu and can cancel the sort', async () => {
    const actions = makeActions()
    const { rerender } = render(cell(actions))

    openMenu()
    openSubmenu('按它排序')
    fireEvent.click(await screen.findByRole('menuitem', { name: '降序' }))
    expect(actions.onSort).toHaveBeenLastCalledWith('desc')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())

    rerender(cell(actions, { sort: 'desc' }))
    openMenu()
    openSubmenu('按它排序')
    fireEvent.click(await screen.findByRole('menuitem', { name: '取消排序' }))
    expect(actions.onSort).toHaveBeenLastCalledWith(null)
  })

  it('filters an option column by ticking values, one at a time, and clears the filter', async () => {
    const actions = makeActions()
    const { rerender } = render(cell(actions))

    openMenu()
    openSubmenu('按它筛选')
    fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: '进行中' }))
    expect(actions.onFilterChange).toHaveBeenLastCalledWith({
      predicate: 'https://undefineds.co/vocab/status',
      kind: 'values',
      values: ['进行中'],
    })

    rerender(cell({ ...actions, filter: { predicate: 'https://undefineds.co/vocab/status', kind: 'values', values: ['进行中'] } }))
    // Ticking keeps the menu open, so the person can tick several values in a row.
    expect(await screen.findByRole('menuitemcheckbox', { name: '进行中' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('menuitem', { name: '清除筛选' }))
    expect(actions.onFilterChange).toHaveBeenLastCalledWith(null)
  })

  it('asks for the filter dialog for a text column instead of listing values', () => {
    const actions = makeActions()
    render(cell(actions, { label: '备注', typeLabel: 'text' }))

    openMenu('备注')
    fireEvent.click(screen.getByRole('menuitem', { name: '按它筛选' }))

    expect(actions.onOpenFilterDialog).toHaveBeenCalledTimes(1)
    expect(actions.onFilterChange).not.toHaveBeenCalled()
  })

  it('asks for the rename, type and remove dialogs, which live outside the header', () => {
    const actions = makeActions()
    render(cell(actions))

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '改显示的名字' }))
    expect(actions.onRename).toHaveBeenCalledTimes(1)

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '改值的类型…' }))
    expect(actions.onChangeType).toHaveBeenCalledTimes(1)

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '从这张表去掉…' }))
    expect(actions.onRemove).toHaveBeenCalledTimes(1)
    // Nothing is decided in the menu itself: no dialog, nothing hidden yet.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(actions.onHide).not.toHaveBeenCalled()
  })

  it('hides the column and opens the vocabulary entry straight from the menu', () => {
    const actions = makeActions()
    render(cell(actions))

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '隐藏这一列' }))
    expect(actions.onHide).toHaveBeenCalledTimes(1)

    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: '在词表里查看' }))
    expect(actions.onOpenDefinition).toHaveBeenCalledTimes(1)
  })

  it('turns 改值的类型 off for a property from a shared vocabulary', () => {
    render(cell(makeActions({ onChangeType: undefined }), { termIsEditable: false }))
    openMenu()
    expect(screen.getByRole('menuitem', { name: '改值的类型…' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('turns an item off when nothing can do it', () => {
    render(cell(makeActions({ onHide: undefined, onOpenDefinition: undefined, onRemove: undefined, onRename: undefined })))
    openMenu()
    for (const name of ['改显示的名字', '隐藏这一列', '在词表里查看', '从这张表去掉…']) {
      expect(screen.getByRole('menuitem', { name })).toHaveAttribute('aria-disabled', 'true')
    }
    expect(screen.getByRole('menuitem', { name: '按它筛选' })).not.toHaveAttribute('aria-disabled')
  })

  it('gives the 名称 column only sorting and filtering, and shows a mark while it is filtered', () => {
    render(cell(
      makeActions({ filter: { predicate: 'subject', kind: 'contains', text: '周' } }),
      { isNameColumn: true, label: '名称', typeLabel: 'text' },
    ))
    expect(screen.getByRole('button', { name: '名称 列菜单' }).querySelector('.lucide-list-filter')).not.toBeNull()
    openMenu('名称')
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['按它排序', '按它筛选'])
  })
})
