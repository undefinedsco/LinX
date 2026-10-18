import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsMenu } from './SettingsMenu'

function renderMenu(updateAvailable = false) {
  const handlers = {
    onOpenSettings: vi.fn(),
    onOpenAbout: vi.fn(),
    onSignOut: vi.fn(),
  }
  render(<SettingsMenu {...handlers} updateAvailable={updateAvailable} />)
  fireEvent.pointerDown(
    screen.getByRole('button', { name: updateAvailable ? '设置与更多，有新版本' : '设置与更多' }),
    { button: 0 },
  )
  return handlers
}

describe('SettingsMenu', () => {
  it('keeps the rail menu to settings, about and sign out', () => {
    const handlers = renderMenu()

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['设置', '关于 LinX', '退出登录'])
    fireEvent.click(screen.getByRole('menuitem', { name: '设置' }))
    expect(handlers.onOpenSettings).toHaveBeenCalledOnce()
  })

  it('mentions a waiting update without a separate badge text', () => {
    renderMenu(true)

    expect(screen.getByRole('menuitem', { name: '关于 LinX（有新版本）' })).toBeInTheDocument()
  })
})
