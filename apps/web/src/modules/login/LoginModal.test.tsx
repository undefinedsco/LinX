import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

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
    ...overrides,
  }
}

describe('LoginModal', () => {
  it('returns null when authenticated', () => {
    const props = createProps({ state: 'authenticated' })
    const { container } = render(<LoginModal {...props} />)
    expect(container.innerHTML).toBe('')
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
    expect(screen.getByText(/这个账号还没有完成当前本地空间的创建/)).toBeTruthy()

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

  it('shows account view when idle with stored account', () => {
    const props = createProps({
      state: 'idle',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://cloud.example.com',
        issuerLabel: 'Cloud',
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('Ganlu')).toBeTruthy()
    expect(screen.getByText('继续登录')).toBeTruthy()
    expect(screen.queryByText('选择空间')).toBeNull()
    expect(screen.queryByText('继续进入你上次使用的空间。如果需要换账号或换空间，再点下面的“切换账号”。')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '继续登录' }))
    expect(props.onContinueStoredAccount).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '切换账号' }))
    expect(props.onSwitchAccount).toHaveBeenCalledTimes(1)
  })

  it('shows enter action only when a restorable session exists', () => {
    const props = createProps({
      hasRestorableSession: true,
      state: 'idle',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://cloud.example.com',
        issuerLabel: 'Cloud',
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByRole('button', { name: '进入 LinX' })).toBeTruthy()
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
    expect(container.querySelector('.bg-violet-200\\/90')).toBeTruthy()
  })

  it('shows provider selection when idle without stored account', () => {
    const props = createProps()

    const { container } = render(<LoginModal {...props} />)

    expect(screen.getByText('选择空间')).toBeTruthy()
    expect(screen.getByText('登录方式')).toBeTruthy()
    expect(screen.getAllByText('云端空间').length).toBeGreaterThan(0)
    expect(screen.queryByText('官方')).toBeNull()
    expect(screen.queryByText('未配置')).toBeNull()
    expect(screen.getAllByText('登录').length).toBeGreaterThan(0)
    expect(screen.getAllByText('云端空间').length).toBeGreaterThan(0)
    expect(screen.getByText('本机空间')).toBeTruthy()
    expect(screen.getByLabelText('使用云端账号登录，数据保存在云端。')).toBeTruthy()
    expect(screen.getByLabelText('使用云端账号登录，数据写入这台电脑上的本地空间。')).toBeTruthy()
    expect(screen.getByLabelText('账号和数据都留在这台电脑，不绑定云端账号。')).toBeTruthy()
    expect(container.querySelector('[data-provider-source="cloud"] img')).toBeTruthy()
    expect(container.querySelector('[data-provider-status-dot="primary"]')).toBeTruthy()
    expect(container.querySelector('[data-provider-status-dot="neutral"]')).toBeTruthy()
    expect(container.querySelector('[data-provider-source="local"] img')).toBeTruthy()
    expect(container.querySelector('[data-provider-source="local"] [data-provider-local-marker]')).toBeTruthy()
    expect(container.querySelector('[data-provider-source="standalone"] [data-provider-standalone-marker]')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /云端空间/ }))
    expect(props.onConnect).toHaveBeenCalledWith('cloud')
  })

  it('exposes Standalone as its own product login entry', () => {
    const props = createProps()

    const { container } = render(<LoginModal {...props} />)

    expect(screen.getAllByText('云端空间').length).toBeGreaterThan(0)
    expect(screen.getAllByText('本地空间').length).toBeGreaterThan(0)
    expect(screen.getAllByText('独立空间').length).toBeGreaterThan(0)
    expect(container.querySelector('[data-provider-source="standalone"] [data-provider-standalone-marker]')).toBeTruthy()
  })

  it('shows Local startup status inline inside the same modal', () => {
    const props = createProps({
      localLoginStatus: {
        active: true,
        message: '正在启动 Local…',
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('正在启动本地空间…')).toBeTruthy()
    expect(screen.getByText('选择空间')).toBeTruthy()
  })

  it('shows user-facing Local startup progress after selecting Local', () => {
    const props = createProps({
      view: 'local',
      localOnboarding: {
        state: 'starting',
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
        message: '下载 xpod runtime',
        progress: {
          phase: 'install-bun',
          label: '下载 xpod runtime',
          detail: '@undefineds.co/xpod@0.3.4',
        },
        errorCode: null,
        canRetry: false,
        canOpenSettings: false,
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('正在准备本地空间')).toBeTruthy()
    expect(screen.getByText('首次启动可能需要下载，完成后会自动继续。')).toBeTruthy()
    expect(screen.queryByText('下载 xpod runtime')).toBeNull()
    expect(screen.queryByText('@undefineds.co/xpod@0.3.4')).toBeNull()
  })

  it('hides raw Local startup diagnostics in the Local view', () => {
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
        nodeId: null,
        message: "Cannot find module 'jsonld'\nRequire stack:\n- /Users/ganlu/Library/Application Support/@linx/desktop/xpod.js",
        errorCode: 'LOCAL_START_FAILED',
        canRetry: true,
        canOpenSettings: true,
      },
    })

    render(<LoginModal {...props} />)

    expect(screen.getByText('本地空间启动文件损坏。请重启 LinX 让它自动修复；如果仍失败，请打开本地空间设置修复。')).toBeTruthy()
    expect(screen.queryByText(/Cannot find module/)).toBeNull()
    expect(screen.queryByText(/Application Support/)).toBeNull()
  })

  it('marks remembered Local accounts on the avatar', () => {
    const props = createProps({
      state: 'idle',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-0000.undefineds.co/',
        storageProviderLabel: 'Local',
      },
    })

    const { container } = render(<LoginModal {...props} />)

    expect(container.querySelector('[data-account-local-marker]')).toBeTruthy()
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

  it('shows custom providers in a separate section', () => {
    const props = createProps({
      providers: [
        ...createProps().providers,
        {
          id: 'custom',
          url: 'https://pod.example.com',
          label: 'pod.example.com',
          source: 'custom',
          oidcProvider: {
            kind: 'custom',
            url: 'https://pod.example.com',
            label: 'pod.example.com',
          },
          storageProvider: {
            kind: 'custom',
            url: 'https://pod.example.com',
            label: 'pod.example.com',
          },
        },
      ],
    })

    render(<LoginModal {...props} />)

    expect(screen.getAllByText('其他账号服务').length).toBeGreaterThan(0)
    expect(screen.getAllByText('pod.example.com')).toHaveLength(2)
  })

  it('shows Local provider subtitle from onboarding state', () => {
    const props = createProps({
      providers: [
        {
          id: 'local',
          url: 'http://localhost:5737',
          label: '本地空间',
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
            status: 'stopped',
            canStart: true,
            canCreate: false,
            onboarding: {
              state: 'repair_required',
              spaceKind: 'local',
              message: '要让其他设备接入 Local，首次启动前需要先准备固定公网地址。',
            },
          },
        },
      ],
    })

    render(<LoginModal {...props} />)

    expect(screen.getAllByText('本地空间').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('使用云端账号登录，数据写入这台电脑上的本地空间。')).toBeTruthy()
    expect(screen.queryByText('需设置')).toBeNull()
    expect(screen.getByText('设置')).toBeTruthy()
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

  it('does not expose managed Local network configuration in the login path', () => {
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
          message: '本机入口可用，公网入口暂不可达。配置并启动 tunnel 后再重试。',
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

    expect(screen.getByRole('button', { name: '继续登录' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /高级配置/ })).toBeNull()
    expect(screen.queryByText('拿到 Local 域名')).toBeNull()
    expect(screen.queryByText('配置 Cloudflare Tunnel')).toBeNull()
    expect(screen.queryByText('测试联通性')).toBeNull()
    expect(screen.queryByText('https://node-0000.undefineds.co/')).toBeNull()
    expect(screen.queryByPlaceholderText('粘贴 tunnel token 或完整命令')).toBeNull()
    expect(props.onSaveLocalTunnelToken).not.toHaveBeenCalled()
    expect(props.onTestLocalConnectivity).not.toHaveBeenCalled()
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
    expect(screen.getByText('本地空间')).toBeTruthy()
    expect(screen.getByText('node-0000.undefineds.co')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '换一个空间' }))
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

  it('labels split Cloud IDP and Local SP auth as Local authorization', () => {
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
