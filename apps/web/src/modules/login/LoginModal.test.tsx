import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LoginModal } from './LoginModal'
import type { LoginModalProps } from './types'

function createProps(overrides: Partial<LoginModalProps> = {}): LoginModalProps {
  return {
    view: 'default',
    state: 'idle',
    error: null,
    storedAccount: null,
    storageConflict: null,
    hasRestorableSession: false,
    providers: [
      {
        id: 'cloud',
        url: 'https://cloud.example.com',
        label: 'Cloud',
        source: 'cloud',
        isDefault: true,
        oidcProvider: {
          kind: 'cloud',
          url: 'https://cloud.example.com',
          label: 'Cloud',
        },
        storageProvider: {
          kind: 'cloud',
          url: 'https://cloud.example.com',
          label: 'Cloud',
        },
      },
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        oidcProvider: {
          kind: 'cloud',
          url: 'https://id.undefineds.co',
          label: 'Cloud',
        },
        storageProvider: {
          kind: 'local',
          url: 'http://localhost:5737',
          label: 'Local',
        },
        runtime: {
          kind: 'local-pod',
          status: 'missing',
          canStart: true,
          canCreate: true,
        },
      },
      {
        id: 'standalone',
        url: 'http://localhost:5737',
        label: 'Standalone',
        source: 'standalone',
        oidcProvider: {
          kind: 'local',
          url: 'http://localhost:5737',
          label: 'Standalone',
        },
        storageProvider: {
          kind: 'local',
          url: 'http://localhost:5737',
          label: 'Standalone',
        },
        runtime: {
          kind: 'local-pod',
          status: 'missing',
          canStart: true,
          canCreate: true,
        },
      },
    ],
    onBackFromLocal: vi.fn(),
    onContinueLocalLogin: vi.fn(),
    onSaveLocalTunnelToken: vi.fn(),
    onTestLocalConnectivity: vi.fn(),
    onSwitchAccount: vi.fn(),
    onContinueStoredAccount: vi.fn(),
    onConnect: vi.fn(),
    onCancelConnecting: vi.fn(),
    onAddProvider: vi.fn(),
    onClearError: vi.fn(),
    onDismissStorageConflict: vi.fn(),
    onOpenCurrentSpacePodSetup: vi.fn(),
    localLoginStatus: {
      active: false,
      message: null,
    },
    authWindowStatus: {
      open: false,
      reason: 'dismissed',
      ready: false,
    },
    connectingProvider: null,
    localOnboarding: null,
    localProviderSource: 'local',
    preferredSpace: 'cloud',
    onSelectSpace: vi.fn(),
    ...overrides,
  }
}

describe('LoginModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null when authenticated', () => {
    const props = createProps({ state: 'authenticated' })
    const { container } = render(<LoginModal {...props} />)
    expect(container.innerHTML).toBe('')
  })

  it('exposes the blocking login surface as a modal dialog', () => {
    render(<LoginModal {...createProps()} />)

    expect(screen.getByRole('dialog', { name: '登录 LinX' })).toHaveAttribute('aria-modal', 'true')
  })

  it('shows restoring view with spinner', () => {
    const props = createProps({ state: 'restoring' })
    render(<LoginModal {...props} />)
    expect(screen.getByText('正在恢复登录状态...')).toBeTruthy()
  })

  it('shows the storage conflict view when the current space does not match the profile binding', () => {
    const props = createProps({
      state: 'authenticated',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu/profile/card#me',
      },
      storageConflict: {
        expectedStorageUrl: 'https://node-abc123.undefineds.co/ganlu/',
        actualStorageUrl: 'https://node-old999.undefineds.co/ganlu/',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        managementUrl: 'https://node-abc123.undefineds.co/.account/account/',
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('空间不匹配')).toBeTruthy()
    expect(screen.getByText(/当前账号绑定的是另一个空间/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '在当前空间创建' }))
    expect(props.onOpenCurrentSpacePodSetup).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '返回登录并重新选择空间' }))
    expect(props.onDismissStorageConflict).toHaveBeenCalledTimes(1)
  })

  it('shows the Local first space setup copy when Local needs provisioned storage', () => {
    const props = createProps({
      state: 'authenticated',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu/profile/card#me',
      },
      storageConflict: {
        expectedStorageUrl: 'https://node-abc123.undefineds.co/ganlu/',
        actualStorageUrl: 'https://id.undefineds.co/ganlu/',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        managementUrl: 'https://node-abc123.undefineds.co/.account/account/',
        setupUrl: 'https://node-abc123.undefineds.co/.account/create-pod/?provisionCode=pc-123',
        setupKind: 'create-pod',
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('需要创建空间')).toBeTruthy()
    expect(screen.getByText(/这个账号还没有完成当前本机空间的创建/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '创建当前空间' }))
    expect(props.onOpenCurrentSpacePodSetup).toHaveBeenCalledTimes(1)
  })

  it('shows restoring view with account avatar when stored account exists', () => {
    const props = createProps({
      state: 'restoring',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://cloud.example.com',
      },
    })
    render(<LoginModal {...props} />)
    expect(screen.getByText('Ganlu')).toBeTruthy()
    expect(screen.getByText('正在恢复登录状态...')).toBeTruthy()
  })

  it('shows remembered account without offering a storage switch', () => {
    const props = createProps({
      state: 'idle',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://cloud.example.com',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://cloud.example.com',
        storageProviderLabel: 'Cloud',
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('Ganlu')).toBeTruthy()
    expect(screen.getByText('Cloud · 云端空间')).toBeTruthy()
    expect(screen.getByRole('button', { name: '进入' })).toBeTruthy()
    expect(screen.queryByText('数据保存位置')).toBeNull()
    expect(screen.queryByRole('button', { name: /云端/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /本机/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '进入' }))
    expect(props.onContinueStoredAccount).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '切换账号' }))
    expect(props.onSwitchAccount).toHaveBeenCalledTimes(1)
  })

  it('labels the remembered-account primary action as enter', () => {
    const props = createProps({
      hasRestorableSession: true,
      state: 'idle',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://cloud.example.com',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://cloud.example.com',
        storageProviderLabel: 'Cloud',
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByRole('button', { name: '进入' })).toBeTruthy()
  })

  it('does not expose raw internal login errors in the provider selection banner', () => {
    const props = createProps({
      state: 'idle',
      error: '读取 WebID Profile 失败：HTTP 401',
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('登录状态已失效。请重新登录。')).toBeTruthy()
    expect(screen.queryByText(/WebID Profile|HTTP 401/)).toBeNull()
  })

  it('renders LinX logo avatars with a visible framed background on white surfaces', () => {
    const props = createProps({
      state: 'idle',
      storedAccount: {
        displayName: 'LinX 用户',
        issuerUrl: 'https://cloud.example.com',
        avatarUrl: '/linx-logo.png',
      },
    })

    const { container } = render(<LoginModal {...props} />)
    expect(container.querySelector('.bg-muted')).toBeTruthy()
  })

  it('shows compact first login with one-tap continue and remembered space hint', () => {
    const props = createProps()

    const { container } = render(<LoginModal {...props} />)

    expect(screen.getByText('LinX')).toBeTruthy()
    expect(screen.getByText('你的数据，存在你选的地方')).toBeTruthy()
    expect(screen.getByRole('button', { name: '登录' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '更多选项' })).toBeTruthy()
    expect(screen.getByText('数据保存位置：云端空间')).toBeTruthy()
    const loginCard = container.querySelector('[data-login-card-size="compact"]')
    expect(loginCard?.classList.contains('bg-card')).toBe(true)
    expect(loginCard?.classList.contains('border')).toBe(true)
    expect(loginCard?.classList.contains('border-border/50')).toBe(true)
    expect(loginCard?.classList.contains('warm-card')).toBe(false)

    expect(screen.queryByText('使用 undefineds 账号')).toBeNull()
    expect(screen.queryByText('选择空间')).toBeNull()
    expect(screen.queryByText('独立空间')).toBeNull()
    expect(screen.queryByText('IDP')).toBeNull()
    expect(screen.queryByText('SP')).toBeNull()
    expect(screen.queryByText('provisionCode')).toBeNull()
  })

  it('continues with the preferred provider on the welcome view', () => {
    const props = createProps({ preferredSpace: 'local' })
    render(<LoginModal {...props} />)

    expect(screen.getByText('数据保存位置：本机空间')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(props.onConnect).toHaveBeenCalledWith('local')
  })

  it('connects directly from the space chips in the login method list', () => {
    const props = createProps()
    render(<LoginModal {...props} />)

    fireEvent.click(screen.getByRole('button', { name: '更多选项' }))
    fireEvent.click(screen.getByRole('button', { name: '本机空间' }))

    expect(props.onSelectSpace).toHaveBeenCalledWith('local')
    expect(props.onConnect).toHaveBeenCalledWith('local')
  })

  it('shows Local startup status inline without leaving the compact login state', () => {
    const props = createProps({
      localLoginStatus: {
        active: true,
        message: '正在启动 Local…',
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('正在启动本机空间…')).toBeTruthy()
    expect(screen.getByText('你的数据，存在你选的地方')).toBeTruthy()
  })

  it('shows compact Local preparation copy without raw progress detail', () => {
    const props = createProps({
      view: 'local',
      localProviderSource: 'local',
      localOnboarding: {
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
        provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
        nodeId: 'node-123',
        message: '安装 xpod runtime 包与生产依赖',
        progress: {
          phase: 'install-bun',
          label: '安装 xpod runtime 包与生产依赖',
          detail: 'bun install · @undefineds.co/xpod@0.3.4',
        },
        errorCode: null,
        canRetry: true,
        canOpenSettings: true,
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('正在准备本机空间')).toBeTruthy()
    expect(screen.getByText('正在启动本机服务')).toBeTruthy()
    expect(screen.queryByText('bun install · @undefineds.co/xpod@0.3.4')).toBeNull()
    expect(screen.queryByText('安装 xpod runtime 包与生产依赖')).toBeNull()
  })

  it('shows compact Local unavailable recovery without Cloud fallback or raw diagnostics', () => {
    const props = createProps({
      view: 'local',
      localProviderSource: 'local',
      localOnboarding: {
        state: 'error',
        spaceKind: 'local',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'https://node-0000.undefineds.co/',
        publicUrl: 'https://node-0000.undefineds.co/',
        tunnel: null,
        connectivity: null,
        capabilities: null,
        cloudIdentityUrl: 'https://id.undefineds.co',
        provisionCode: null,
        provisionUrl: null,
        nodeId: 'node-123',
        message: 'Cannot find module jsonld',
        errorCode: 'LOCAL_START_FAILED',
        canRetry: true,
        canOpenSettings: true,
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('本机空间暂时不可用')).toBeTruthy()
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '打开设置' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '切换账号' })).toBeTruthy()
    expect(screen.queryByText(/使用云端/)).toBeNull()
    expect(screen.queryByText(/Cannot find module/)).toBeNull()
  })

  it('shows remembered Local account with avatar and binding label without storage switch', () => {
    const props = createProps({
      state: 'idle',
      storedAccount: {
        displayName: 'Alice',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'undefineds',
        storageProviderUrl: 'https://node-0000.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/alice/profile/card#me',
      },
    })

    const { container } = render(<LoginModal {...props} />)

    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.getByText('undefineds · 本机空间')).toBeTruthy()
    expect(screen.getByRole('button', { name: '进入' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '切换账号' })).toBeTruthy()
    expect(screen.queryByText('数据保存位置')).toBeNull()
    expect(screen.queryByRole('button', { name: /云端/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /本机/ })).toBeNull()
    expect(container.querySelector('[data-account-local-marker]')).toBeTruthy()
  })

  it('shows remembered Cloud account with cloud binding label', () => {
    const props = createProps({
      hasRestorableSession: true,
      state: 'idle',
      storedAccount: {
        displayName: 'Bob',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'undefineds',
        storageProviderUrl: 'https://cloud.undefineds.co/',
        storageProviderLabel: 'Cloud',
        webId: 'https://id.undefineds.co/bob/profile/card#me',
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('undefineds · 云端空间')).toBeTruthy()
    expect(screen.getByRole('button', { name: '进入' })).toBeTruthy()
  })

  it('marks remembered Standalone accounts with the standalone avatar badge', () => {
    const props = createProps({
      state: 'idle',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'http://localhost:5737',
        issuerLabel: 'Standalone',
        storageProviderUrl: 'http://localhost:5737',
        storageProviderLabel: 'Standalone',
      },
    })

    const { container } = render(<LoginModal {...props} />)

    expect(container.querySelector('[data-account-standalone-marker]')).toBeTruthy()
    expect(container.querySelector('[data-account-local-marker]')).toBeNull()
  })

  it('treats localhost fallback accounts as Standalone instead of Local', () => {
    const props = createProps({
      state: 'idle',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'http://localhost:5737',
        webId: 'http://localhost:5737/profile/card#me',
      },
    })

    const { container } = render(<LoginModal {...props} />)

    expect(container.querySelector('[data-account-standalone-marker]')).toBeTruthy()
    expect(container.querySelector('[data-account-local-marker]')).toBeNull()
  })

  it('treats LAN fallback accounts as Standalone instead of Local', () => {
    const props = createProps({
      state: 'idle',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'http://192.168.1.23:5737',
        webId: 'http://192.168.1.23:5737/profile/card#me',
      },
    })

    const { container } = render(<LoginModal {...props} />)

    expect(container.querySelector('[data-account-standalone-marker]')).toBeTruthy()
    expect(container.querySelector('[data-account-local-marker]')).toBeNull()
  })

  it('does not ship a default third-party provider catalog', () => {
    render(<LoginModal {...createProps()} />)

    fireEvent.click(screen.getByRole('button', { name: '更多选项' }))

    expect(screen.getByText('更多选项')).toBeTruthy()
    expect(screen.getByText('LinX 账号')).toBeTruthy()
    expect(screen.getByRole('button', { name: '云端空间' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '本机空间' })).toBeTruthy()
    expect(screen.getByText('添加登录方式')).toBeTruthy()
    expect(screen.queryByText('Google')).toBeNull()
    expect(screen.queryByText('GitHub')).toBeNull()
    expect(screen.queryByText('企业 SSO')).toBeNull()
  })

  it('lists only configured third-party providers and connects them directly', () => {
    const props = createProps({
      providers: [
        ...createProps().providers,
        {
          id: 'acme-sso',
          url: 'https://sso.acme.example',
          label: 'Acme SSO',
          source: 'custom',
          oidcProvider: {
            kind: 'custom',
            url: 'https://sso.acme.example',
            label: 'Acme SSO',
          },
          storageProvider: {
            kind: 'custom',
            url: 'https://sso.acme.example',
            label: 'Acme SSO',
          },
        },
      ],
    })
    render(<LoginModal {...props} />)

    fireEvent.click(screen.getByRole('button', { name: '更多选项' }))
    fireEvent.click(screen.getByRole('button', { name: /Acme SSO/ }))

    expect(props.onConnect).toHaveBeenCalledWith('acme-sso')
  })

  it('keeps an invalid custom provider URL in place and explains how to fix it', () => {
    const props = createProps()
    render(<LoginModal {...props} />)

    fireEvent.click(screen.getByRole('button', { name: '更多选项' }))
    fireEvent.click(screen.getByRole('button', { name: '添加登录方式' }))
    fireEvent.change(screen.getByRole('textbox', { name: '登录方式地址' }), {
      target: { value: 'https://' },
    })
    fireEvent.click(screen.getByRole('button', { name: '连接' }))

    expect(screen.getByRole('alert')).toHaveTextContent('请输入有效的 http(s) 地址')
    expect(screen.getByRole('textbox', { name: '登录方式地址' })).toHaveValue('https://')
    expect(props.onAddProvider).not.toHaveBeenCalled()
    expect(props.onConnect).not.toHaveBeenCalled()
  })

  it('waits for an explicit click before continuing from the ready Local view', () => {
    const props = createProps({
      view: 'local',
      localOnboarding: {
        state: 'ready',
        spaceKind: 'standalone',
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
        message: null,
        errorCode: null,
        canRetry: true,
        canOpenSettings: true,
      },
    })

    render(<LoginModal {...props} />)

    expect(props.onContinueLocalLogin).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '继续登录' }))

    expect(props.onContinueLocalLogin).toHaveBeenCalledTimes(1)
    expect(props.onBackFromLocal).not.toHaveBeenCalled()
  })

  it('shows Local reachability status without exposing managed network configuration in the login path', () => {
    const props = createProps({
      view: 'local',
      localProviderSource: 'local',
      localOnboarding: {
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
        message: null,
        errorCode: null,
        canRetry: true,
        canOpenSettings: true,
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('本机空间 已准备好')).toBeTruthy()
    expect(screen.getByRole('button', { name: '继续登录' })).toBeTruthy()
    expect(screen.getByText('本机可以访问')).toBeTruthy()
    expect(screen.getByText('公网可以访问')).toBeTruthy()
    expect(screen.getByLabelText('本机可以访问：是')).toBeTruthy()
    expect(screen.getByLabelText('公网可以访问：否')).toBeTruthy()
    expect(screen.queryByText(/外网访问/)).toBeNull()
    expect(screen.queryByRole('button', { name: /高级配置/ })).toBeNull()
    expect(screen.queryByText('拿到 Local 域名')).toBeNull()
    expect(screen.queryByText('配置 Cloudflare Tunnel')).toBeNull()
    expect(screen.queryByText('测试联通性')).toBeNull()
    expect(screen.queryByText('https://node-0000.undefineds.co/')).toBeNull()
    expect(screen.queryByPlaceholderText('粘贴 tunnel token 或完整命令')).toBeNull()
    expect(props.onSaveLocalTunnelToken).not.toHaveBeenCalled()
    expect(props.onTestLocalConnectivity).not.toHaveBeenCalled()
  })

  it('starts a background reachability check when Local is ready but not yet probed', async () => {
    const props = createProps({
      view: 'local',
      localProviderSource: 'local',
      onTestLocalConnectivity: vi.fn(),
      localOnboarding: {
        state: 'ready',
        spaceKind: 'local',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'https://node-0000.undefineds.co/',
        publicUrl: 'https://node-0000.undefineds.co/',
        tunnel: null,
        connectivity: {
          status: 'unknown',
          checkedAt: null,
          local: null,
          public: null,
          message: '尚未测试公网联通性。',
        },
        capabilities: null,
        cloudIdentityUrl: 'https://id.undefineds.co',
        provisionCode: 'pc-123',
        provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
        nodeId: 'node-123',
        message: null,
        errorCode: null,
        canRetry: true,
        canOpenSettings: true,
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('本机可以访问')).toBeTruthy()
    expect(screen.getByText('公网可以访问')).toBeTruthy()
    expect(screen.getByLabelText('本机可以访问：是')).toBeTruthy()
    expect(screen.getByLabelText('公网可以访问：检测中')).toBeTruthy()

    await waitFor(() => {
      expect(props.onTestLocalConnectivity).toHaveBeenCalledTimes(1)
    })
  })

  it('does not render the old footer copy', () => {
    render(<LoginModal {...createProps()} />)
    expect(screen.queryByText('当前阶段仅支持 Solid Pod 登录')).toBeNull()
  })

  it('shows connecting view with spinner', () => {
    const props = createProps({ state: 'connecting' })
    render(<LoginModal {...props} />)
    expect(screen.getByText('正在连接')).toBeTruthy()
  })

  it('shows the selected provider while connecting and can return to provider selection', () => {
    const props = createProps({
      state: 'connecting',
      connectingProvider: {
        issuerLabel: 'Cloud',
        issuerUrl: 'https://id.undefineds.co',
        storageProviderLabel: 'Local',
        storageProviderUrl: 'https://node-0000.undefineds.co/',
      },
    })
    render(<LoginModal {...props} />)

    expect(screen.getByText('正在连接')).toBeTruthy()
    expect(screen.getByText('本机空间')).toBeTruthy()
    expect(screen.getByText('node-0000.undefineds.co')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(props.onCancelConnecting).toHaveBeenCalledTimes(1)
  })

  it('tells the user to finish login in the auth window while embedded auth is open', () => {
    const props = createProps({
      state: 'connecting',
      connectingProvider: {
        issuerLabel: 'Cloud',
        issuerUrl: 'https://id.undefineds.co',
        storageProviderLabel: 'Cloud',
        storageProviderUrl: 'https://id.undefineds.co',
      },
      authWindowStatus: {
        open: true,
        reason: 'opened',
        ready: true,
      },
    })
    render(<LoginModal {...props} />)
    expect(screen.getByText('等待登录完成')).toBeTruthy()
    expect(screen.getByText('请在登录窗口完成')).toBeTruthy()
  })

  it('labels split Local auth as Local authorization', () => {
    const props = createProps({
      state: 'connecting',
      connectingProvider: {
        issuerLabel: 'Cloud',
        issuerUrl: 'https://id.undefineds.co',
        storageProviderLabel: 'Local',
        storageProviderUrl: 'https://node-0000.undefineds.co',
      },
      authWindowStatus: {
        open: true,
        reason: 'opened',
        ready: true,
      },
    })
    render(<LoginModal {...props} />)
    expect(screen.getByText('等待登录完成')).toBeTruthy()
    expect(screen.getByText('请在登录窗口完成')).toBeTruthy()
  })

  it('shows verification copy after the auth window completes', () => {
    const props = createProps({
      state: 'connecting',
      authWindowStatus: {
        open: false,
        reason: 'completed',
        ready: false,
      },
    })
    render(<LoginModal {...props} />)
    expect(screen.getByText('正在验证身份')).toBeTruthy()
  })

  it('shows error banner and allows dismissal', () => {
    const props = createProps({ error: '连接失败' })
    render(<LoginModal {...props} />)

    expect(screen.getByText('连接失败')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '关闭错误提示' }))
    expect(props.onClearError).toHaveBeenCalledTimes(1)
  })
})
