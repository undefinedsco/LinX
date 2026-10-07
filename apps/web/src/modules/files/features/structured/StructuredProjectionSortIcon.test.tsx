import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StructuredProjectionSortIcon } from './StructuredProjectionSortIcon'

describe('StructuredProjectionSortIcon', () => {
  it('renders neutral, ascending, and descending sort states as a props-only primitive', () => {
    const { rerender } = render(
      <table>
        <thead>
          <tr>
            <th>
              <button type="button" aria-label="Sort dateModified">
                <span>dateModified</span>
                <StructuredProjectionSortIcon columnKey="schema:dateModified" sortKey="title" sortDirection="asc" />
              </button>
            </th>
          </tr>
        </thead>
      </table>,
    )
    expect(screen.getByRole('button', { name: 'Sort dateModified' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /dateModified/ })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: /schema:dateModified/ })).not.toBeInTheDocument()

    rerender(
      <button type="button" aria-label="Sort subject">
        <StructuredProjectionSortIcon columnKey="subject" sortKey="subject" sortDirection="asc" />
      </button>,
    )
    expect(screen.getByRole('button', { name: 'Sort subject' }).querySelector('svg')).toHaveClass('text-primary')

    rerender(
      <button type="button" aria-label="Sort subject">
        <StructuredProjectionSortIcon columnKey="subject" sortKey="subject" sortDirection="desc" />
      </button>,
    )
    expect(screen.getByRole('button', { name: 'Sort subject' }).querySelector('svg')).toHaveClass('text-primary')
  })
})
