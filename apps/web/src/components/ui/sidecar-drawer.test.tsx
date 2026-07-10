import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SidecarDrawer } from './sidecar-drawer'

describe('SidecarDrawer', () => {
  it('renders a right-side sidecar shell and closes through the icon button', () => {
    const onClose = vi.fn()

    render(
      <SidecarDrawer
        open
        ariaLabel="Resource .meta drawer"
        title="Resource .meta"
        icon={<span data-testid="drawer-icon" />}
        closeLabel="关闭 .meta drawer"
        onClose={onClose}
      >
        <p>drawer body</p>
      </SidecarDrawer>,
    )

    const drawer = screen.getByLabelText('Resource .meta drawer')
    expect(drawer).toHaveClass('absolute', 'right-0', 'w-[320px]', 'bg-background')
    expect(drawer).not.toHaveClass('bg-background/98')
    expect(screen.getByText('Resource .meta')).toBeInTheDocument()
    expect(screen.getByText('drawer body')).toBeInTheDocument()
    expect(screen.getByTestId('drawer-icon')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '关闭 .meta drawer' }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('covers the content area as a right-side inspector drawer', () => {
    render(
      <SidecarDrawer
        open
        ariaLabel="Resource .meta drawer"
        title="Resource .meta"
        coverage="content"
        onClose={vi.fn()}
      >
        <p>drawer body</p>
      </SidecarDrawer>,
    )

    const drawer = screen.getByLabelText('Resource .meta drawer')
    expect(drawer).toHaveAttribute('data-sidecar-coverage', 'content')
    expect(drawer).toHaveClass('absolute', 'inset-y-0', 'right-0', 'w-[360px]', 'max-w-full')
    expect(drawer).not.toHaveClass('inset-0', 'w-full', 'max-w-none')
  })

  it('does not render when closed', () => {
    render(
      <SidecarDrawer
        open={false}
        ariaLabel="Resource .meta drawer"
        title="Resource .meta"
        onClose={vi.fn()}
      >
        <p>drawer body</p>
      </SidecarDrawer>,
    )

    expect(screen.queryByLabelText('Resource .meta drawer')).not.toBeInTheDocument()
  })
})
