import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mockNavigate = vi.fn()
const mockRefresh = vi.fn().mockResolvedValue(undefined)
const mockOpenReleasePage = vi.fn().mockResolvedValue(undefined)
const mockSetTheme = vi.fn()
const mockToggleTheme = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/modules/layout/use-theme-mode', () => ({
  useThemeMode: () => ['dark', mockToggleTheme, mockSetTheme],
}))

vi.mock('@/modules/layout/use-app-update-status', () => ({
  useAppUpdateStatus: () => ({
    status: {
      currentVersion: '0.2.1',
      latestVersion: '0.2.2',
      releaseUrl: 'https://github.com/undefinedsco/linx/releases/tag/v0.2.2',
      checkedAt: '2026-03-27T02:00:00.000Z',
      available: true,
      source: 'github-release',
      error: null,
    },
    isChecking: false,
    refresh: mockRefresh,
    openReleasePage: mockOpenReleasePage,
  }),
}))

vi.mock('@/lib/runtime-shell', () => ({
  getRuntimeShellInfo: () => ({
    id: 'desktop',
    label: 'Desktop',
    authLabel: 'Solid Pod 登录',
    description: 'Electron shell + shared web app',
  }),
}))

vi.mock('@/components/ShellStatusBadge', () => ({
  ShellStatusBadge: () => <div>ShellStatusBadge</div>,
}))

import { SettingsContentPane } from './SettingsContentPane'
import { useSettingsStore } from '../store'
import { OPEN_SERVICE_MANAGEMENT_EVENT } from '../events'

describe('SettingsContentPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ selectedSection: 'general' })
  })

  it('renders the general settings surface', () => {
    render(<SettingsContentPane theme="dark" />)

    expect(screen.getByText('主题')).toBeInTheDocument()
    expect(screen.getByText('版本更新')).toBeInTheDocument()
    expect(screen.getByText('运行环境')).toBeInTheDocument()
    expect(screen.getByText('ShellStatusBadge')).toBeInTheDocument()
  })

  it('lets the user check updates and open model services', () => {
    render(<SettingsContentPane theme="dark" />)

    fireEvent.click(screen.getByText('检查更新'))
    fireEvent.click(screen.getByText('打开模型服务'))

    expect(mockRefresh).toHaveBeenCalledWith(true, 'manual')
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'model-services' },
    })
  })

  it('dispatches the service-management request event', () => {
    const listener = vi.fn()
    window.addEventListener(OPEN_SERVICE_MANAGEMENT_EVENT, listener)

    render(<SettingsContentPane theme="dark" />)
    fireEvent.click(screen.getByText('打开服务管理'))

    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(OPEN_SERVICE_MANAGEMENT_EVENT, listener)
  })
})
