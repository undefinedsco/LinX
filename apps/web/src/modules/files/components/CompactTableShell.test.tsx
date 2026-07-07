import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { createColumnHelper, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import type { KeyboardEventHandler } from 'react'
import { CompactTableShell } from '../ui/CompactTableShell'

type Row = {
  title: string
  status: string
  locked: string
  action: string
}

const rows: Row[] = [{
  title: 'Files',
  status: 'active',
  locked: 'locked',
  action: '+',
}]

const columnHelper = createColumnHelper<Row>()

function TestTable({
  editable = true,
  onCellActivate = vi.fn(),
  onCellKeyDown = vi.fn(),
  onColumnMouseResize = vi.fn(),
  onColumnTouchResize = vi.fn(),
}: {
  editable?: boolean
  onCellActivate?: (row: Row, columnId: string, anchor: HTMLTableCellElement) => void
  onCellKeyDown?: KeyboardEventHandler<HTMLTableCellElement>
  onColumnMouseResize?: (columnId: string, startSize: number, startClientX: number) => void
  onColumnTouchResize?: (columnId: string, startSize: number, startClientX: number) => void
}) {
  const table = useReactTable({
    data: rows,
    columns: [
      columnHelper.accessor('title', {
        id: 'title',
        header: 'Title',
        cell: (info) => info.getValue(),
        size: 180,
        meta: { label: 'Title', resizable: true },
      }),
      columnHelper.accessor('status', {
        id: 'status',
        header: 'Status',
        cell: (info) => info.getValue(),
        size: 120,
      }),
      columnHelper.accessor('locked', {
        id: 'locked',
        header: 'Locked',
        cell: (info) => info.getValue(),
        size: 100,
      }),
      columnHelper.accessor('action', {
        id: 'action',
        header: 'Action',
        cell: (info) => info.getValue(),
        size: 100,
      }),
    ],
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <CompactTableShell
      table={table}
      editable={editable}
      isCellInteractive={(cell) => !['locked', 'action'].includes(cell.column.id)}
      onCellActivate={onCellActivate}
      onCellKeyDown={onCellKeyDown}
      onColumnMouseResize={onColumnMouseResize}
      onColumnTouchResize={onColumnTouchResize}
    />
  )
}

describe('CompactTableShell', () => {
  it('activates editable data cells with click, Enter, and Space', () => {
    const onCellActivate = vi.fn()
    render(<TestTable onCellActivate={onCellActivate} />)

    const titleCell = screen.getByRole('cell', { name: 'Files' })

    fireEvent.click(titleCell)
    fireEvent.keyDown(titleCell, { key: 'Enter' })
    fireEvent.keyDown(titleCell, { key: ' ' })

    expect(onCellActivate).toHaveBeenCalledTimes(3)
    expect(onCellActivate).toHaveBeenNthCalledWith(1, rows[0], 'title', titleCell)
    expect(onCellActivate).toHaveBeenNthCalledWith(2, rows[0], 'title', titleCell)
    expect(onCellActivate).toHaveBeenNthCalledWith(3, rows[0], 'title', titleCell)
  })

  it('does not activate non-interactive or non-editable cells', () => {
    const onCellActivate = vi.fn()
    const { rerender } = render(<TestTable onCellActivate={onCellActivate} />)

    fireEvent.click(screen.getByRole('cell', { name: 'locked' }))
    fireEvent.keyDown(screen.getByRole('cell', { name: 'locked' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('cell', { name: '+' }))
    fireEvent.keyDown(screen.getByRole('cell', { name: '+' }), { key: 'Enter' })

    rerender(<TestTable editable={false} onCellActivate={onCellActivate} />)
    fireEvent.click(screen.getByRole('cell', { name: 'Files' }))
    fireEvent.keyDown(screen.getByRole('cell', { name: 'Files' }), { key: 'Enter' })

    expect(onCellActivate).not.toHaveBeenCalled()
  })

  it('reports column resize start state for mouse and touch handles', () => {
    const onColumnMouseResize = vi.fn()
    const onColumnTouchResize = vi.fn()
    render(
      <TestTable
        onColumnMouseResize={onColumnMouseResize}
        onColumnTouchResize={onColumnTouchResize}
      />,
    )

    const resizeHandle = screen.getByRole('separator', { name: '调整 Title 列宽' })

    fireEvent.mouseDown(resizeHandle, { clientX: 320 })
    fireEvent.touchStart(resizeHandle, { touches: [{ clientX: 360 }] })

    expect(onColumnMouseResize).toHaveBeenCalledWith('title', 180, 320)
    expect(onColumnTouchResize).toHaveBeenCalledWith('title', 180, 360)
  })

  it('keeps column dividers subtle and cells vertically centered', () => {
    render(<TestTable />)

    const shell = screen.getByRole('table').closest('[data-compact-table-shell="true"]')
    const titleHeader = screen.getAllByRole('columnheader')[0]
    const titleCell = screen.getByRole('cell', { name: 'Files' })

    expect(shell).toHaveClass('w-full')
    expect(shell).toHaveClass('rounded-sm')
    expect(shell).toHaveClass('border-border/20')
    expect(titleHeader).toHaveClass('align-middle')
    expect(titleCell).toHaveClass('align-middle')
    expect(screen.getByRole('cell', { name: 'active' })).toHaveClass('border-l')
    expect(screen.getByRole('cell', { name: 'active' })).toHaveClass('border-border/5')
  })
})
