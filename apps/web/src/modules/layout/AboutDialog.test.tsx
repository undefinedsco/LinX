import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AboutDialog } from './AboutDialog'

describe('AboutDialog', () => {
  it('renders current and latest version details', () => {
    render(
      <AboutDialog
        open
        onOpenChange={() => {}}
        status={{
          currentVersion: '0.2.0',
          latestVersion: '0.3.0',
          releaseUrl: 'https://example.test/releases/v0.3.0',
          checkedAt: '2026-03-25T00:00:00.000Z',
          available: true,
          source: 'github-release',
          error: null,
        }}
        isChecking={false}
        onCheckUpdates={() => {}}
        onOpenReleasePage={() => {}}
      />,
    )

    expect(screen.getByText('关于 LinX')).toBeTruthy()
    expect(screen.getByText('0.2.0')).toBeTruthy()
    expect(screen.getByText('发现新版本 0.3.0')).toBeTruthy()
    expect(screen.getByRole('button', { name: '检查更新' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看发布页' })).toBeTruthy()
  })

  it('calls handlers when action buttons are clicked', () => {
    const onCheckUpdates = vi.fn()
    const onOpenReleasePage = vi.fn()

    render(
      <AboutDialog
        open
        onOpenChange={() => {}}
        status={{
          currentVersion: '0.2.0',
          latestVersion: '0.3.0',
          releaseUrl: 'https://example.test/releases/v0.3.0',
          checkedAt: '2026-03-25T00:00:00.000Z',
          available: true,
          source: 'github-release',
          error: null,
        }}
        isChecking={false}
        onCheckUpdates={onCheckUpdates}
        onOpenReleasePage={onOpenReleasePage}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '检查更新' }))
    fireEvent.click(screen.getByRole('button', { name: '查看发布页' }))

    expect(onCheckUpdates).toHaveBeenCalledTimes(1)
    expect(onOpenReleasePage).toHaveBeenCalledTimes(1)
  })
})
