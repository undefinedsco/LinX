import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const mockNavigate = vi.fn()
const mockRefresh = vi.fn().mockResolvedValue(undefined)
const mockOpenReleasePage = vi.fn().mockResolvedValue(undefined)
const mockSetTheme = vi.fn()
const mockToggleTheme = vi.fn()
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
    message: '本地空间已准备好。',
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

vi.mock('@/modules/login/hooks/use-local-onboarding', () => ({
  useLocalOnboarding: () => localOnboardingState,
}))

import { SettingsContentPane } from './SettingsContentPane'
import { useSettingsStore } from '../store'
import { OPEN_SERVICE_MANAGEMENT_EVENT } from '../events'

describe('SettingsContentPane', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSettingsStore.setState({ selectedSection: 'general' })
    localOnboardingState.loading = false
    localOnboardingState.acting = false
    localOnboardingState.isDesktop = true
    mockSaveNetworkConfig.mockResolvedValue({ errorCode: null })
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

  it('saves Local network config and runs reachability validation', async () => {
    useSettingsStore.setState({ selectedSection: 'network' })
    render(<SettingsContentPane theme="dark" />)

    expect(screen.getByText('本地网络')).toBeInTheDocument()
    expect(screen.getAllByText('https://node-0000.undefineds.co/').length).toBeGreaterThan(0)
    expect(screen.getAllByText('http://localhost:5737/').length).toBeGreaterThan(0)
    expect(screen.getByText('已保存 token，不显示明文。')).toBeInTheDocument()
    expect(screen.queryByText('token-123')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('自有公网域名（可选）'), {
      target: { value: 'pod.example.com' },
    })
    fireEvent.change(screen.getByLabelText('Cloudflare Tunnel token（可选）'), {
      target: { value: 'cloudflared tunnel run --token token-123' },
    })

    fireEvent.click(screen.getByText('保存网络设置'))

    expect(mockSaveNetworkConfig).toHaveBeenCalledWith({
      publicDomain: 'pod.example.com',
      tunnelProvider: 'cloudflare',
      tunnelToken: 'cloudflared tunnel run --token token-123',
    })
    expect(await screen.findByText('网络配置已保存。')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('cloudflared tunnel run --token token-123')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('检测可达性'))

    expect(mockTestConnectivity).toHaveBeenCalledTimes(1)
  })
})
