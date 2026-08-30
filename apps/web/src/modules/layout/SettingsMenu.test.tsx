import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsMenu } from './SettingsMenu'

function renderMenu(theme: 'light' | 'dark' = 'light') {
  const onToggleTheme = vi.fn()
  render(
    <SettingsMenu
      theme={theme}
      onToggleTheme={onToggleTheme}
      onNavigate={vi.fn()}
      onOpenServiceManagement={vi.fn()}
      onOpenAbout={vi.fn()}
      onSignOut={vi.fn()}
      aboutLabel="关于"
    />,
  )
  fireEvent.pointerDown(screen.getByRole('button', { name: '设置' }), { button: 0 })
  return { onToggleTheme }
}

describe('SettingsMenu', () => {
  it('offers dark mode from the settings menu in light mode', () => {
    const { onToggleTheme } = renderMenu('light')

    fireEvent.click(screen.getByRole('menuitem', { name: '切换到深色模式' }))

    expect(onToggleTheme).toHaveBeenCalledOnce()
  })

  it('offers light mode from the settings menu in dark mode', () => {
    renderMenu('dark')

    expect(screen.getByRole('menuitem', { name: '切换到浅色模式' })).toBeInTheDocument()
  })
})
