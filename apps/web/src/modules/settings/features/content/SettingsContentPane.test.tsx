import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mockNavigate = vi.fn()
const mockRefresh = vi.fn().mockResolvedValue(undefined)
const mockOpenReleasePage = vi.fn().mockResolvedValue(undefined)
const mockSetTheme = vi.fn()
const mockLocalRefresh = vi.fn().mockResolvedValue(undefined)
const mockSaveNetworkConfig = vi.fn().mockResolvedValue({ errorCode: null })
const mockTestConnectivity = vi.fn().mockResolvedValue(undefined)
const localOnboardingState = {
  snapshot: {
    state: 'ready',
    spaceKind: 'local',
    localUrl: 'http://localhost:5737/',
    baseUrl: 'https://node-0000.undefineds.co/',
    publicUrl: 'https://node-0000.undefineds.co/',
    tunnel: {
      provider: 'cloudflare',
      hasToken: true,
      endpoint: null,
    },
    connectivity: {
      status: 'local-only',
      checkedAt: Date.now(),
      local: {
        kind: 'local',
        url: 'http://localhost:5737/',
        reachable: true,
        sameNode: true,
        latencyMs: 3,
        baseUrl: 'https://node-0000.undefineds.co/',
        message: '本机入口可达。',
      },
      public: {
        kind: 'public',
        url: 'https://node-0000.undefineds.co/',
        reachable: false,
        sameNode: false,
        latencyMs: null,
        baseUrl: null,
        message: '公网入口不可达。',
      },
      message: '本机入口可用，公网入口暂不可达。可以继续本机使用，外网访问需要配置隧道。',
    },
    capabilities: {
      supported: true,
      contract: 'linx-local-onboarding/v1',
      baseUrl: 'https://node-0000.undefineds.co/',
      version: '0.3.31',
    },
    cloudIdentityUrl: 'https://id.undefineds.co',
    provisionCode: 'pc-123',
    provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
    nodeId: 'node-123',
    message: '本机空间已准备好。',
    errorCode: null,
    canRetry: true,
    canOpenSettings: true,
  },
  loading: false,
  acting: false,
  refresh: mockLocalRefresh,
  chooseSpace: vi.fn(),
  continueLocal: vi.fn(),
  saveTunnelToken: vi.fn(),
  saveNetworkConfig: mockSaveNetworkConfig,
  testConnectivity: mockTestConnectivity,
  openAdvancedSettings: vi.fn(),
  isDesktop: true,
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/modules/layout/use-theme-mode', () => ({
  useThemePreference: () => ['dark', mockSetTheme],
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

vi.mock('@/modules/login/hooks/use-local-onboarding', () => ({
  useLocalOnboarding: () => localOnboardingState,
}))

import { SettingsContentPane } from './SettingsContentPane'
import { useNotificationPrefs } from '../../app/notification-prefs'
import { useSettingsStore } from '../../app/store'
import { OPEN_SERVICE_MANAGEMENT_EVENT } from '../../app/events'

describe('SettingsContentPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ selectedSection: 'general' })
    localOnboardingState.loading = false
    localOnboardingState.acting = false
    localOnboardingState.isDesktop = true
    mockSaveNetworkConfig.mockResolvedValue({ errorCode: null })
  })

  it('renders the general settings surface: appearance, language, three notification switches', () => {
    render(<SettingsContentPane theme="dark" />)

    expect(screen.getByRole('radio', { name: '跟随系统' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '深色' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('简体中文')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '新消息' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '有事等你决定' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: '持续任务没成功' })).toBeInTheDocument()
    expect(screen.queryByText('运行环境')).not.toBeInTheDocument()
  })

  it('changes appearance and notification switches', () => {
    render(<SettingsContentPane theme="dark" />)

    fireEvent.click(screen.getByRole('radio', { name: '浅色' }))
    expect(mockSetTheme).toHaveBeenCalledWith('light')

    const toggle = screen.getByRole('switch', { name: '新消息' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(toggle)
    expect(useNotificationPrefs.getState().prefs.newMessages).toBe(false)
  })

  it('checks for updates from the 版本更新 section', () => {
    useSettingsStore.setState({ selectedSection: 'updates' })
    render(<SettingsContentPane theme="dark" />)

    expect(screen.getByText('有新版本 0.2.2')).toBeInTheDocument()
    fireEvent.click(screen.getByText('检查更新'))
    expect(mockRefresh).toHaveBeenCalledWith(true, 'manual')
  })

  it('keeps 关于 LinX under settings with version and update check', () => {
    useSettingsStore.setState({ selectedSection: 'about' })
    render(<SettingsContentPane theme="dark" />)

    expect(screen.getByRole('heading', { name: '关于 LinX' })).toBeInTheDocument()
    expect(screen.getByText('0.2.1（Desktop）')).toBeInTheDocument()
    fireEvent.click(screen.getByText('检查更新'))
    expect(mockRefresh).toHaveBeenCalledWith(true, 'manual')
  })

  it('opens model connections from 模型连接', () => {
    useSettingsStore.setState({ selectedSection: 'models' })
    render(<SettingsContentPane theme="dark" />)

    fireEvent.click(screen.getByText('打开模型连接'))
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'model-services' },
    })
  })

  it('shows one level at a time when compact', () => {
    useSettingsStore.setState({ selectedSection: 'general', compactLevel: 'list' })
    render(<SettingsContentPane theme="dark" compact />)

    fireEvent.click(screen.getByText('关于 LinX'))
    expect(useSettingsStore.getState()).toMatchObject({ selectedSection: 'about', compactLevel: 'section' })
  })

  it('dispatches the service-management request event', () => {
    const listener = vi.fn()
    window.addEventListener(OPEN_SERVICE_MANAGEMENT_EVENT, listener)

    useSettingsStore.setState({ selectedSection: 'runtime' })
    render(<SettingsContentPane theme="dark" />)
    fireEvent.click(screen.getByText('管理本机服务'))

    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(OPEN_SERVICE_MANAGEMENT_EVENT, listener)
  })

  it('saves Local network config and runs reachability validation', async () => {
    useSettingsStore.setState({ selectedSection: 'network' })
    render(<SettingsContentPane theme="dark" />)

    expect(screen.getByText('让手机和别的电脑也能打开这台电脑上的空间。')).toBeInTheDocument()
    expect(screen.getAllByText('https://node-0000.undefineds.co/').length).toBeGreaterThan(0)
    expect(screen.getAllByText('http://localhost:5737/').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('我自己的域名（可选）')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '高级网络设置' }))

    expect(screen.getByText('已保存，不显示。')).toBeInTheDocument()
    expect(screen.queryByText('token-123')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('我自己的域名（可选）'), {
      target: { value: 'pod.example.com' },
    })
    fireEvent.change(screen.getByLabelText('隧道密钥（可选）'), {
      target: { value: 'cloudflared tunnel run --token token-123' },
    })

    fireEvent.click(screen.getByText('保存'))

    expect(mockSaveNetworkConfig).toHaveBeenCalledWith({
      publicDomain: 'pod.example.com',
      tunnelProvider: 'cloudflare',
      tunnelToken: 'cloudflared tunnel run --token token-123',
    })
    expect(await screen.findByText('已保存。')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('cloudflared tunnel run --token token-123')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('再检查'))

    expect(mockTestConnectivity).toHaveBeenCalledTimes(1)
  })
})
