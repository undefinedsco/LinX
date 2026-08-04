import { fireEvent, render, screen, within } from '@testing-library/react'
import { Grid3X3, List, Search } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { ResourceViewBar } from './ResourceViewBar'

describe('ResourceViewBar', () => {
  it('renders available views, one trailing add view control, and compact right actions in one row', () => {
    const onSelectView = vi.fn()
    const onAddView = vi.fn()

    render(
      <ResourceViewBar
        ariaLabel="Resource views"
        views={[
          { id: 'list', label: '列表', icon: List },
          { id: 'grid', label: '网格', icon: Grid3X3 },
        ]}
        activeViewId="list"
        addViewLabel="添加视图"
        onSelectView={onSelectView}
        onAddView={onAddView}
        rightActions={<button type="button" aria-label="搜索"><Search aria-hidden="true" /></button>}
      />,
    )

    const toolbar = screen.getByRole('toolbar', { name: 'Resource views' })
    expect(toolbar).toHaveAttribute('data-resource-view-bar', 'true')
    expect(toolbar).toHaveClass('flex', 'h-10', 'items-center')

    const viewGroup = within(toolbar).getByLabelText('View options')
    expect(within(viewGroup).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      '列表',
      '网格',
      '添加视图',
    ])
    expect(screen.getByRole('button', { name: '列表' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '网格' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getAllByRole('button', { name: '添加视图' })).toHaveLength(1)
    expect(within(toolbar).getByLabelText('Resource view actions')).toContainElement(screen.getByRole('button', { name: '搜索' }))

    fireEvent.click(screen.getByRole('button', { name: '网格' }))
    fireEvent.click(screen.getByRole('button', { name: '添加视图' }))

    expect(onSelectView).toHaveBeenCalledWith('grid')
    expect(onAddView).toHaveBeenCalledTimes(1)
  })
})
