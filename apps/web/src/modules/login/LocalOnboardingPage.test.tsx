import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.fn()
const chooseSpaceMock = vi.fn()
const continueLocalMock = vi.fn()
const saveTunnelTokenMock = vi.fn()
const testConnectivityMock = vi.fn()
const refreshMock = vi.fn()
const openAdvancedSettingsMock = vi.fn()
const connectMock = vi.fn()
const configWindowState = {
  open: false,
  ready: false,
}
const localOnboardingState = {
  snapshot: {
    state: 'space_required',
    spaceKind: null,
    localUrl: 'http://localhost:5737/',
    baseUrl: 'http://localhost:5737/',
    publicUrl: null,
    tunnel: null,
    connectivity: null,
    capabilities: null,
    cloudIdentityUrl: null,
    provisionCode: null,
    provisionUrl: null,
    nodeId: null,
    message: '首次使用时先确认 Local 的启动方式。服务准备好后，再继续登录。',
    errorCode: null,
    canRetry: false,
    canOpenSettings: true,
  },
  loading: false,
  acting: false,
  refresh: refreshMock,
  chooseSpace: chooseSpaceMock,
  continueLocal: continueLocalMock,
  saveTunnelToken: saveTunnelTokenMock,
  testConnectivity: testConnectivityMock,
  openAdvancedSettings: openAdvancedSettingsMock,
  isDesktop: true,
}

vi.mock('@inrupt/solid-ui-react', () => ({
  useSession: () => ({
    session: {
      info: {
        isLoggedIn: false,
      },
    },
  }),
}))

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('./hooks/use-local-onboarding', () => ({
  useLocalOnboarding: () => localOnboardingState,
}))

vi.mock('./hooks/use-oidc-connect', () => ({
  useOidcConnect: () => ({
    connect: connectMock,
  }),
}))

vi.mock('./hooks/use-config-window-state', () => ({
  useConfigWindowState: () => configWindowState,
}))

import { LocalOnboardingPage } from './LocalOnboardingPage'

describe('LocalOnboardingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openAdvancedSettingsMock.mockReset()
    configWindowState.open = false
    configWindowState.ready = false
    localOnboardingState.snapshot = {
      state: 'space_required',
      spaceKind: null,
      localUrl: 'http://localhost:5737/',
      baseUrl: 'http://localhost:5737/',
    publicUrl: null,
    tunnel: null,
    connectivity: null,
    capabilities: null,
    cloudIdentityUrl: null,
      provisionCode: null,
      provisionUrl: null,
      nodeId: null,
      message: '首次使用时先确认 Local 的启动方式。服务准备好后，再继续登录。',
      errorCode: null,
      canRetry: false,
      canOpenSettings: true,
    } as any
  })

  it('starts Local by default', async () => {
    render(<LocalOnboardingPage />)

    expect(screen.getByText('正在启动 Local…')).toBeTruthy()
    await waitFor(() => {
      expect(chooseSpaceMock).toHaveBeenCalledWith('local')
      expect(continueLocalMock).toHaveBeenCalledTimes(1)
    })
  })

  it('auto starts Local when a space has already been selected', async () => {
    localOnboardingState.snapshot = {
      state: 'idle',
      spaceKind: 'standalone',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'http://localhost:5737/',
      capabilities: null,
      message: 'Local 尚未运行。你可以先启动 Local，或先配置启动参数。',
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    expect(screen.getByText('正在启动 Local…')).toBeTruthy()
    await waitFor(() => {
      expect(continueLocalMock).toHaveBeenCalledTimes(1)
    })
  })

  it('waits for an explicit click before starting Standalone sign-in when runtime is ready', async () => {
    localOnboardingState.snapshot = {
      state: 'ready',
      spaceKind: 'standalone',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'http://localhost:5737/',
      publicUrl: null,
      tunnel: null,
      connectivity: null,
      capabilities: {
        supported: true,
        contract: 'linx-local-onboarding/v1',
        baseUrl: 'http://localhost:5737/',
        version: '0.2.2',
      },
      cloudIdentityUrl: null,
      provisionCode: null,
      provisionUrl: null,
      nodeId: null,
      message: 'Local 已准备好，可以继续登录。',
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    expect(connectMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '继续登录' }))

    expect(connectMock).toHaveBeenCalledWith('http://localhost:5737/', {
      authorizationSurface: 'embedded',
      storageProviderUrl: 'http://localhost:5737/',
      storageProviderLabel: 'Standalone',
      issuerLabel: 'Standalone',
    })
  })

  it('waits for an explicit click before starting Local sign-in with the Cloud issuer and Local public SP URL', async () => {
    localOnboardingState.snapshot = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'https://pod.example.com/',
      publicUrl: 'https://pod.example.com/',
      tunnel: {
        provider: 'cloudflare',
        hasToken: false,
        endpoint: null,
      },
      connectivity: null,
      capabilities: {
        supported: true,
        contract: 'linx-local-onboarding/v1',
        baseUrl: 'https://pod.example.com/',
        version: '0.2.2',
      },
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'node-123',
      message: 'Local 已准备好，可以继续登录。',
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    expect(connectMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '继续登录' }))

    expect(connectMock).toHaveBeenCalledWith('https://id.undefineds.co', {
      authorizationSurface: 'embedded',
      storageProviderUrl: 'https://pod.example.com/',
      storageProviderLabel: 'Local',
      issuerLabel: 'Cloud',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
    })
  })

  it('does not auto start Local sign-in after Local becomes ready', async () => {
    continueLocalMock.mockImplementation(async () => {
      localOnboardingState.snapshot = {
        state: 'ready',
        spaceKind: 'standalone',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://localhost:5737/',
        publicUrl: null,
        tunnel: null,
        connectivity: null,
        capabilities: {
          supported: true,
          contract: 'linx-local-onboarding/v1',
          baseUrl: 'http://localhost:5737/',
          version: '0.2.2',
        },
        cloudIdentityUrl: null,
        provisionCode: null,
        provisionUrl: null,
        nodeId: null,
        message: 'Local 已准备好，可以继续登录。',
        errorCode: null,
        canRetry: true,
        canOpenSettings: true,
      } as any
    })

    const view = render(<LocalOnboardingPage />)

    await waitFor(() => {
      expect(continueLocalMock).toHaveBeenCalledTimes(1)
    })

    view.rerender(<LocalOnboardingPage />)

    expect(screen.getByRole('button', { name: '继续登录' })).toBeTruthy()
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('shows Local domain, Cloudflare tunnel token input, and connectivity controls', () => {
    localOnboardingState.snapshot = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'https://node-0000.undefineds.co/',
      publicUrl: 'https://node-0000.undefineds.co/',
      tunnel: {
        provider: 'cloudflare',
        hasToken: false,
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
        message: '本机入口可用，公网入口暂不可达。配置并启动 tunnel 后再重试。',
      },
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'node-123',
      message: 'Local 已准备好，可以继续登录。',
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    expect(screen.getByText('拿到 Local 域名')).toBeTruthy()
    expect(screen.getAllByText('https://node-0000.undefineds.co/').length).toBeGreaterThan(0)
    expect(screen.getByText('配置 Cloudflare Tunnel')).toBeTruthy()
    expect(screen.getByText(/Service URL 填 http:\/\/localhost:5737/)).toBeTruthy()
    expect(screen.getByText(/cloudflared tunnel run --token/)).toBeTruthy()
    expect(screen.getByText('测试联通性')).toBeTruthy()
    expect(screen.getByText('3ms')).toBeTruthy()
    expect(screen.getByText('失败')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('粘贴 tunnel token 或完整命令'), {
      target: { value: 'cloudflared tunnel run --token token-123' },
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(saveTunnelTokenMock).toHaveBeenCalledWith('cloudflared tunnel run --token token-123')

    fireEvent.click(screen.getByRole('button', { name: '测试' }))
    expect(testConnectivityMock).toHaveBeenCalledTimes(1)
  })

  it('returns to the main login surface when the user goes back', async () => {
    render(<LocalOnboardingPage />)

    fireEvent.click(screen.getByRole('button', { name: '返回空间选择' }))
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'chat' },
    })
  })

  it('opens Local settings from the repair state', async () => {
    localOnboardingState.snapshot = {
      state: 'repair_required',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'http://localhost:5737/',
      publicUrl: null,
      capabilities: null,
      cloudIdentityUrl: null,
      provisionCode: null,
      provisionUrl: null,
      nodeId: null,
      message: '要让其他设备接入 Local，首次启动前需要先准备固定公网地址。',
      errorCode: 'LOCAL_REMOTE_READY_REQUIRES_SETUP',
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    expect(screen.getByText('还差一步让其他设备接入 Local')).toBeTruthy()
    expect(screen.getByText('如果只想账号和数据都留在本机，请回到空间选择并选择 Standalone。')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '去完成 Local 设置' }))
    expect(openAdvancedSettingsMock).toHaveBeenCalledTimes(1)
  })

  it('shows an actionable error when opening Local settings fails', async () => {
    openAdvancedSettingsMock.mockRejectedValueOnce(new Error('xpod dashboard unavailable'))
    localOnboardingState.snapshot = {
      state: 'repair_required',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'http://localhost:5737/',
      publicUrl: null,
      capabilities: null,
      cloudIdentityUrl: null,
      provisionCode: null,
      provisionUrl: null,
      nodeId: null,
      message: '要让其他设备接入 Local，首次启动前需要先准备固定公网地址。',
      errorCode: 'LOCAL_REMOTE_READY_REQUIRES_SETUP',
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    fireEvent.click(screen.getByRole('button', { name: '去完成 Local 设置' }))

    await waitFor(() => {
      expect(screen.getByText('xpod dashboard unavailable')).toBeTruthy()
    })
  })

  it('does not silently downgrade Local to Standalone from the repair state', async () => {
    localOnboardingState.snapshot = {
      state: 'repair_required',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'http://localhost:5737/',
      publicUrl: null,
      capabilities: null,
      cloudIdentityUrl: null,
      provisionCode: null,
      provisionUrl: null,
      nodeId: null,
      message: '要让其他设备接入 Local，首次启动前需要先准备固定公网地址。',
      errorCode: 'LOCAL_REMOTE_READY_REQUIRES_SETUP',
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    expect(screen.queryByRole('button', { name: '改为只给这台设备用' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '返回空间选择' }))

    await waitFor(() => {
      expect(chooseSpaceMock).not.toHaveBeenCalled()
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/$microAppId',
        params: { microAppId: 'chat' },
      })
    })
  })

  it('refreshes Local state after the Local settings overlay closes', async () => {
    configWindowState.open = true
    configWindowState.ready = true

    const view = render(<LocalOnboardingPage />)
    expect(refreshMock).toHaveBeenCalledTimes(0)

    configWindowState.open = false
    configWindowState.ready = false
    view.rerender(<LocalOnboardingPage />)

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1)
    })
  })
})
