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
    message: '首次使用时先确认本地空间的启动方式。服务准备好后，再继续登录。',
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
      message: '首次使用时先确认本地空间的启动方式。服务准备好后，再继续登录。',
      errorCode: null,
      canRetry: false,
      canOpenSettings: true,
    } as any
  })

  it('starts Local by default', async () => {
    render(<LocalOnboardingPage />)

    expect(screen.getByText('正在启动本地空间…')).toBeTruthy()
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
      message: '本地空间尚未运行。你可以先启动本地空间，或先配置启动参数。',
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    expect(screen.getByText('正在启动本地空间…')).toBeTruthy()
    await waitFor(() => {
      expect(continueLocalMock).toHaveBeenCalledTimes(1)
    })
  })

  it('hides raw startup diagnostics while Local is starting', () => {
    localOnboardingState.snapshot = {
      state: 'starting',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'https://node-0000.undefineds.co/',
      publicUrl: 'https://node-0000.undefineds.co/',
      tunnel: null,
      connectivity: null,
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: null,
      nodeId: 'node-123',
      message: "Cannot find module 'jsonld'\nRequire stack:\n- /Users/ganlu/Library/Application Support/@linx/desktop/xpod.js",
      errorCode: null,
      canRetry: false,
      canOpenSettings: false,
    } as any

    render(<LocalOnboardingPage />)

    expect(screen.getByText('本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。')).toBeTruthy()
    expect(screen.queryByText(/Cannot find module/)).toBeNull()
    expect(screen.queryByText(/Application Support/)).toBeNull()
    expect(screen.queryByText(/localhost:5737/)).toBeNull()
  })

  it('hides raw startup diagnostics in the Local repair card', () => {
    localOnboardingState.snapshot = {
      state: 'error',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'https://node-0000.undefineds.co/',
      publicUrl: 'https://node-0000.undefineds.co/',
      tunnel: null,
      connectivity: null,
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: null,
      nodeId: 'node-123',
      message: 'Invalid resource IRI: file:///Users/ganlu/Library/Application Support/@linx/desktop/local/runtime/config/local.json',
      errorCode: 'LOCAL_START_FAILED',
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    expect(screen.getByText('本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。')).toBeTruthy()
    expect(screen.queryByText(/Invalid resource IRI/)).toBeNull()
    expect(screen.queryByText(/Application Support/)).toBeNull()
    expect(screen.queryByText(/localhost:5737/)).toBeNull()
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
      message: '本地空间已准备好，可以继续登录。',
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    expect(connectMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '继续登录' }))

    expect(connectMock).toHaveBeenCalledWith('http://localhost:5737/', expect.objectContaining({
      authorizationSurface: 'embedded',
      route: 'standalone',
      storageProviderUrl: 'http://localhost:5737/',
      storageProviderLabel: 'Standalone',
      issuerLabel: 'Standalone',
      strictDiscovery: true,
    }))
  })

  it('waits for an explicit click before starting Local sign-in through the Local SP facade', async () => {
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
      message: '本地空间已准备好，可以继续登录。',
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    expect(connectMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '继续登录' }))

    expect(connectMock).toHaveBeenCalledWith('https://pod.example.com/', expect.objectContaining({
      authorizationSurface: 'embedded',
      route: 'local',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://pod.example.com/',
      storageProviderLabel: 'Local',
      issuerLabel: 'Cloud',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      strictDiscovery: true,
      nodeId: 'node-123',
    }))
    expect(connectMock).not.toHaveBeenCalledWith('https://id.undefineds.co', expect.anything())
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
        message: '本地空间已准备好，可以继续登录。',
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

  it('shows Local reachability status without exposing network configuration in the login path', () => {
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
        message: '本机入口可用，公网入口暂不可达。可以继续本机使用，外网访问需要配置隧道。',
      },
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'node-123',
      message: '本地空间已准备好，可以继续登录。',
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    expect(screen.getByRole('button', { name: '继续登录' })).toBeTruthy()
    expect(screen.getByText('本机可以访问')).toBeTruthy()
    expect(screen.getByText('公网可以访问')).toBeTruthy()
    expect(screen.getByLabelText('本机可以访问：是')).toBeTruthy()
    expect(screen.getByLabelText('公网可以访问：否')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /高级配置/ })).toBeNull()
    expect(screen.queryByText('拿到本地空间域名')).toBeNull()
    expect(screen.queryByText('配置 Cloudflare Tunnel')).toBeNull()
    expect(screen.queryByText('测试联通性')).toBeNull()
    expect(screen.queryByText('https://node-0000.undefineds.co/')).toBeNull()
    expect(screen.queryByPlaceholderText('粘贴 tunnel token 或完整命令')).toBeNull()
    expect(saveTunnelTokenMock).not.toHaveBeenCalled()
    expect(testConnectivityMock).not.toHaveBeenCalled()
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
      message: '要让其他设备接入本地空间，首次启动前需要先准备固定公网地址。',
      errorCode: 'LOCAL_REMOTE_READY_REQUIRES_SETUP',
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    expect(screen.getByText('还差一步让其他设备接入本地空间')).toBeTruthy()
    expect(screen.getByText('如果只想账号和数据都留在本机，请返回空间选择并选择独立空间。')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '去完成本地空间设置' }))
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
      message: '要让其他设备接入本地空间，首次启动前需要先准备固定公网地址。',
      errorCode: 'LOCAL_REMOTE_READY_REQUIRES_SETUP',
      canRetry: true,
      canOpenSettings: true,
    } as any

    render(<LocalOnboardingPage />)

    fireEvent.click(screen.getByRole('button', { name: '去完成本地空间设置' }))

    await waitFor(() => {
      expect(screen.getByText('本地空间设置没有打开。请稍后重试。')).toBeTruthy()
    })
    expect(screen.queryByText('xpod dashboard unavailable')).toBeNull()
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
      message: '要让其他设备接入本地空间，首次启动前需要先准备固定公网地址。',
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
