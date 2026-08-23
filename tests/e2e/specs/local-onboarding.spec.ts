import { expect, test, type Page } from '@playwright/test'
import { expectLoginDialog, selectLoginSpace } from '../helpers/login-ui'

type Snapshot = {
  state: 'space_required' | 'idle' | 'checking' | 'starting' | 'repair_required' | 'ready' | 'error'
  spaceKind: 'local' | 'standalone' | null
  localUrl: string | null
  baseUrl: string | null
  publicUrl: string | null
  tunnel: null
  connectivity: Connectivity | null
  capabilities: {
    supported: boolean
    contract: string | null
    baseUrl: string | null
    version: string | null
  } | null
  cloudIdentityUrl: string | null
  provisionCode: string | null
  provisionUrl: string | null
  nodeId: string | null
  message: string | null
  errorCode: string | null
  canRetry: boolean
  canOpenSettings: boolean
}

type RouteProbe = {
  kind: 'local' | 'public'
  url: string | null
  reachable: boolean
  sameNode: boolean | null
  latencyMs: number | null
  baseUrl: string | null
  message: string | null
}

type Connectivity = {
  status: 'unknown' | 'checking' | 'ready' | 'local-only' | 'failed' | 'mismatch'
  checkedAt: number | null
  local: RouteProbe | null
  public: RouteProbe | null
  message: string | null
}

type DesktopScenario = {
  initialSnapshot?: Snapshot
  chooseSpaceSnapshots?: Partial<Record<'local' | 'standalone', Snapshot>>
  continueSnapshot?: Snapshot
  configOpen?: boolean
  authWindowOpen?: boolean
}

type PendingLoginAttempt = {
  issuerUrl: string
  authorizationSurface: 'window' | 'embedded' | 'external'
  returnToMicroAppId: string
}

const SPACE_REQUIRED_SNAPSHOT: Snapshot = {
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
}

const READY_LOCAL_CONNECTIVITY: Connectivity = {
  status: 'ready',
  checkedAt: 1,
  local: {
    kind: 'local',
    url: 'http://localhost:5737/',
    reachable: true,
    sameNode: true,
    latencyMs: 12,
    baseUrl: 'https://node-test.undefineds.co/',
    message: '本机入口可达。',
  },
  public: {
    kind: 'public',
    url: 'https://node-test.undefineds.co/',
    reachable: true,
    sameNode: true,
    latencyMs: 30,
    baseUrl: 'https://node-test.undefineds.co/',
    message: '公网入口可达。',
  },
  message: '本机入口和公网入口都可达，且指向同一个本地空间。',
}

const READY_LOCAL_SNAPSHOT: Snapshot = {
  state: 'ready',
  spaceKind: 'local',
  localUrl: 'http://localhost:5737/',
  baseUrl: 'https://node-test.undefineds.co/',
  publicUrl: 'https://node-test.undefineds.co/',
  tunnel: null,
  connectivity: READY_LOCAL_CONNECTIVITY,
  capabilities: {
    supported: true,
    contract: 'linx-local-onboarding/v1',
    baseUrl: 'http://localhost:5737/',
    version: '0.2.2',
  },
  cloudIdentityUrl: 'https://id.undefineds.co',
  provisionCode: 'pc-123',
  provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
  nodeId: 'node-test',
  message: 'Local 已准备好，接下来会通过 Cloud 登录并写入本地空间。',
  errorCode: null,
  canRetry: true,
  canOpenSettings: true,
}

const READY_STANDALONE_SNAPSHOT: Snapshot = {
  ...READY_LOCAL_SNAPSHOT,
  spaceKind: 'standalone',
  baseUrl: 'http://localhost:5737/',
  publicUrl: null,
  connectivity: null,
  cloudIdentityUrl: null,
  provisionCode: null,
  provisionUrl: null,
  nodeId: 'standalone-test',
  message: '独立空间已准备好，接下来通过本机账号登录。',
}

const REPAIR_SNAPSHOT: Snapshot = {
  state: 'repair_required',
  spaceKind: 'local',
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
  message: 'Local 的数据空间地址还没准备好。请回到空间选择，重新启动 Local 后再登录。',
  errorCode: 'LOCAL_CLOUD_BINDING_REQUIRED',
  canRetry: true,
  canOpenSettings: true,
}

const IDLE_LOCAL_SNAPSHOT: Snapshot = {
  state: 'idle',
  spaceKind: 'local',
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
  message: 'Local 尚未运行。你可以先启动服务，或先配置启动参数。',
  errorCode: null,
  canRetry: true,
  canOpenSettings: true,
}

async function installDesktopBridge(page: Page, scenario: DesktopScenario = {}) {
  await page.addInitScript((input: DesktopScenario) => {
    const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
    const listeners = {
      local: new Set<(snapshot: Snapshot) => void>(),
      config: new Set<(state: { open: boolean; reason: 'opened' | 'closed'; ready: boolean }) => void>(),
      auth: new Set<(state: { open: boolean; reason: 'opened' | 'completed' | 'dismissed'; ready: boolean }) => void>(),
    }

    let snapshot: Snapshot = clone(input.initialSnapshot ?? {
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
    })

    let configOpen = Boolean(input.configOpen)
    let authWindowOpen = Boolean(input.authWindowOpen)

    const playState = {
      chosenSpaces: [] as Array<'local' | 'standalone'>,
      continueCalls: 0,
      getSnapshotCalls: 0,
      refreshCalls: 0,
      openConfigCalls: 0,
      closeConfigCalls: 0,
      authWindowOpenCalls: 0,
      authWindowCloseCalls: 0,
      authWindowUrls: [] as string[],
      authWindowLabels: [] as Array<string | null>,
    }

    const emitLocal = () => {
      const next = clone(snapshot)
      listeners.local.forEach((callback) => callback(next))
    }

    const emitConfig = (reason: 'opened' | 'closed') => {
      const next = { open: configOpen, reason, ready: configOpen }
      listeners.config.forEach((callback) => callback(next))
    }

    const emitAuth = (reason: 'opened' | 'completed' | 'dismissed') => {
      const next = { open: authWindowOpen, reason, ready: authWindowOpen }
      listeners.auth.forEach((callback) => callback(next))
    }

    Object.defineProperty(window, '__linxPlaywrightState', {
      value: playState,
      writable: false,
      configurable: true,
    })

    Object.defineProperty(window, 'xpodDesktop', {
      configurable: true,
      value: {
        provider: {
          list: async () => [],
          get: async () => undefined,
          getDefault: async () => undefined,
          add: async () => ({ success: true }),
          update: async () => ({ success: true }),
          remove: async () => ({ success: true }),
          setDefault: async () => ({ success: true }),
          detect: async () => ({ success: false }),
        },
        xpod: {
          start: async () => ({ success: true }),
          stop: async () => ({ success: true }),
          restart: async () => ({ success: true }),
          status: async () => ({
            running: snapshot.state === 'ready',
            status: snapshot.state === 'ready' ? 'running' : 'stopped',
            localUrl: snapshot.localUrl ?? undefined,
            baseUrl: snapshot.baseUrl ?? undefined,
          }),
          healthCheck: async () => snapshot.state === 'ready',
        },
        config: {
          getAll: async () => ({ CSS_PORT: '5737' }),
          getSchema: async () => ({}),
          getPath: async () => '/tmp/linx-test.env',
          update: async () => ({ success: true }),
          reset: async () => ({ success: true }),
        },
        supervisor: {
          getStatus: async () => [],
          onStatusChange: () => undefined,
        },
        dialog: {
          selectDirectory: async () => null,
        },
        app: {
          getVersion: async () => '0.1.0-test',
          getConfigWindowState: async () => ({
            open: configOpen,
            reason: configOpen ? 'opened' : 'closed',
            ready: configOpen,
          }),
          getUpdateStatus: async () => ({
            currentVersion: '0.1.0-test',
            latestVersion: null,
            releaseUrl: null,
            checkedAt: null,
            available: false,
            source: 'github-release',
            error: null,
          }),
          openExternal: async () => undefined,
          openConfigWindow: async () => {
            playState.openConfigCalls += 1
            configOpen = true
            emitConfig('opened')
            return { success: true }
          },
          closeConfigWindow: async () => {
            playState.closeConfigCalls += 1
            configOpen = false
            emitConfig('closed')
            return { success: true }
          },
          onConfigWindowState: (callback: (state: { open: boolean; reason: 'opened' | 'closed'; ready: boolean }) => void) => {
            listeners.config.add(callback)
            return () => listeners.config.delete(callback)
          },
        },
        auth: {
          prepareLoopbackRedirect: async () => 'http://localhost:5173/auth/callback',
          getEmbeddedAuthorizationState: async () => ({
            open: authWindowOpen,
            reason: authWindowOpen ? 'opened' : 'dismissed',
            ready: authWindowOpen,
          }),
          openAuthorizationWindow: async (url: string, options?: { providerLabel?: string }) => {
            playState.authWindowOpenCalls += 1
            playState.authWindowUrls.push(url)
            playState.authWindowLabels.push(options?.providerLabel ?? null)
            authWindowOpen = true
            emitAuth('opened')
          },
          openEmbeddedAuthorization: async (url: string, options?: { providerLabel?: string }) => {
            playState.authWindowOpenCalls += 1
            playState.authWindowUrls.push(url)
            playState.authWindowLabels.push(options?.providerLabel ?? null)
            authWindowOpen = true
            emitAuth('opened')
          },
          closeEmbeddedAuthorization: async () => {
            playState.authWindowCloseCalls += 1
            authWindowOpen = false
            emitAuth('dismissed')
          },
          consumePendingRedirect: async () => null,
          onAuthorizationWindowState: () => () => undefined,
          onEmbeddedAuthorizationState: (callback: (state: { open: boolean; reason: 'opened' | 'completed' | 'dismissed'; ready: boolean }) => void) => {
            listeners.auth.add(callback)
            return () => listeners.auth.delete(callback)
          },
          onRedirect: () => () => undefined,
        },
        localOnboarding: {
          getSnapshot: async () => {
            playState.getSnapshotCalls += 1
            return clone(snapshot)
          },
          chooseSpace: async (spaceKind: 'local' | 'standalone') => {
            playState.chosenSpaces.push(spaceKind)
            snapshot = clone(input.chooseSpaceSnapshots?.[spaceKind] ?? {
              ...snapshot,
              spaceKind,
            })
            emitLocal()
            return clone(snapshot)
          },
          continue: async () => {
            playState.continueCalls += 1
            if (input.continueSnapshot) {
              snapshot = clone(input.continueSnapshot)
              emitLocal()
            }
            return clone(snapshot)
          },
          refresh: async () => {
            playState.refreshCalls += 1
            return clone(snapshot)
          },
          testConnectivity: async () => {
            snapshot = clone({
              ...snapshot,
              connectivity: snapshot.connectivity ?? READY_LOCAL_CONNECTIVITY,
            })
            emitLocal()
            return clone(snapshot)
          },
          onStateChange: (callback: (next: Snapshot) => void) => {
            listeners.local.add(callback)
            return () => listeners.local.delete(callback)
          },
        },
      },
    })
  }, scenario)
}

async function installPendingLoginState(page: Page, input: {
  microAppId: string
  attempt: PendingLoginAttempt
}) {
  await page.addInitScript((state: { microAppId: string; attempt: PendingLoginAttempt }) => {
    window.sessionStorage.setItem('linx-post-login-micro-app', state.microAppId)
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify(state.attempt))
  }, input)
}

async function installMockOidcProvider(page: Page, origin = 'http://localhost:5737') {
  const normalizedOrigin = origin.replace(/\/$/, '')

  await page.route(`${normalizedOrigin}/.well-known/openid-configuration`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        issuer: normalizedOrigin,
        authorization_endpoint: `${normalizedOrigin}/authorize`,
        token_endpoint: `${normalizedOrigin}/token`,
        jwks_uri: `${normalizedOrigin}/jwks`,
        registration_endpoint: `${normalizedOrigin}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        scopes_supported: ['openid', 'profile', 'offline_access', 'webid'],
        claims_supported: ['sub', 'iss', 'aud', 'exp', 'iat', 'webid'],
      }),
    })
  })

  await page.route(`${normalizedOrigin}/register`, async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        client_id: 'linx-e2e-client',
        client_id_issued_at: Math.floor(Date.now() / 1000),
        redirect_uris: ['http://localhost:5173/auth/callback'],
        token_endpoint_auth_method: 'none',
      }),
    })
  })
}

async function selectLocalSpace(page: Page) {
  await page.goto('/')
  await expect(page).toHaveURL(/\/(?:$|chat$)/)
  await expectLoginDialog(page)
  await selectLoginSpace(page, 'local')
  await expect(page).toHaveURL(/\/(?:$|chat$)/)
}

async function openLocalFlow(page: Page, expectedHeading: '本机空间' | '独立空间') {
  await selectLocalSpace(page)
  await expect(page.getByRole('heading', { name: expectedHeading })).toBeVisible({ timeout: 15000 })
}

async function expectLocalReadyFlowOpenedAuthorization(page: Page, providerLabel: 'Local' | 'Standalone') {
  await expect(page.getByText('等待登录完成')).toBeVisible({ timeout: 15000 })

  const result = await expect.poll(async () => {
    return page.evaluate(() => {
      const playState = (window as any).__linxPlaywrightState
      const pendingAttempt = window.sessionStorage.getItem('linx-pending-login-attempt')
      return {
        authWindowOpenCalls: playState.authWindowOpenCalls,
        authWindowUrls: playState.authWindowUrls,
        authWindowLabels: playState.authWindowLabels,
        pendingAttempt,
      }
    })
  }).toMatchObject({
    authWindowOpenCalls: 1,
    authWindowLabels: [providerLabel],
  })

  return result
}

test.describe('Local onboarding', () => {
  test('从登录页进入独立空间子流程', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: SPACE_REQUIRED_SNAPSHOT,
    })

    await openLocalFlow(page, '独立空间')

    await expect(page.getByRole('heading', { name: '独立空间' })).toBeVisible()
    await expect(page.getByText('正在准备独立空间')).toBeVisible()
    await expect(page.getByText('正在启动本机服务')).toBeVisible()
    await expect(page.getByRole('button', { name: '返回空间选择' })).toBeVisible()
  })

  test('不可用的本机空间会进入恢复界面', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: REPAIR_SNAPSHOT,
    })

    await page.goto('/')
    await expectLoginDialog(page)
    await selectLoginSpace(page, 'local')
    await expect(page.getByRole('heading', { name: '独立空间' })).toBeVisible()
    await expect(page.getByText('本机空间暂时不可用')).toBeVisible()
  })

  test('首次启动会进入独立空间 xpod 登录流', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: SPACE_REQUIRED_SNAPSHOT,
      continueSnapshot: READY_STANDALONE_SNAPSHOT,
    })
    await installMockOidcProvider(page)

    await selectLocalSpace(page)

    await expectLocalReadyFlowOpenedAuthorization(page, 'Standalone')

    const playState = await page.evaluate(() => (window as any).__linxPlaywrightState)
    expect(playState.chosenSpaces).toEqual(['standalone'])
    expect(playState.continueCalls).toBe(1)
    expect(playState.authWindowUrls).toHaveLength(1)
    const openedUrl = new URL(playState.authWindowUrls[0])
    expect(openedUrl.origin).toBe('http://localhost:5737')
    expect(openedUrl.searchParams.get('provisionCode')).toBeNull()

    const pending = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('linx-pending-login-attempt') ?? 'null'))
    expect(pending).toMatchObject({
      issuerUrl: 'http://localhost:5737',
      accountIssuerUrl: 'http://localhost:5737',
      authorizationSurface: 'embedded',
      storageProviderUrl: 'http://localhost:5737',
      storageProviderLabel: 'Standalone',
      loginTransaction: {
        route: 'standalone',
        oidcEntryUrl: 'http://localhost:5737',
        oidcIssuerUrl: 'http://localhost:5737',
        accountIssuerUrl: 'http://localhost:5737',
        storageProviderUrl: 'http://localhost:5737',
        storageProviderLabel: 'Standalone',
        nodeId: 'standalone-test',
      },
    })
  })

  test('只有本机入口时会按独立空间继续启动', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: IDLE_LOCAL_SNAPSHOT,
    })

    await openLocalFlow(page, '独立空间')

    await expect(page.getByText('正在准备独立空间')).toBeVisible()

    const playState = await page.evaluate(() => (window as any).__linxPlaywrightState)
    expect(playState.continueCalls).toBe(1)
  })

  test('已有 Local 空间时进入后不切换到 Standalone', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: {
        ...IDLE_LOCAL_SNAPSHOT,
        baseUrl: 'https://node-test.undefineds.co/',
        message: 'Local 尚未运行。',
      },
      continueSnapshot: {
        ...READY_LOCAL_SNAPSHOT,
        baseUrl: 'https://node-test.undefineds.co/',
        publicUrl: 'https://node-test.undefineds.co/',
        cloudIdentityUrl: 'https://id.undefineds.co',
        provisionCode: 'pc-123',
        provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
        nodeId: 'node-test',
      } as Snapshot,
    })
    await installMockOidcProvider(page, 'https://id.undefineds.co')

    await selectLocalSpace(page)

    await expectLocalReadyFlowOpenedAuthorization(page, 'Local')

    const playState = await page.evaluate(() => (window as any).__linxPlaywrightState)
    expect(playState.chosenSpaces).toEqual([])
    expect(playState.continueCalls).toBe(1)
    expect(playState.authWindowUrls).toHaveLength(1)
    const openedUrl = new URL(playState.authWindowUrls[0])
    expect(openedUrl.origin).toBe('https://id.undefineds.co')
    expect(openedUrl.searchParams.get('provisionCode')).toBe('pc-123')

    const pending = await page.evaluate(() => JSON.parse(window.sessionStorage.getItem('linx-pending-login-attempt') ?? 'null'))
    expect(pending?.loginTransaction).toMatchObject({
      route: 'local',
      accountIssuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'https://node-test.undefineds.co',
      storageProviderLabel: 'Local',
    })
  })

  test('repair 态可从当前卡片拉起 Local 设置', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: REPAIR_SNAPSHOT,
    })

    await openLocalFlow(page, '独立空间')

    await expect(page.getByText('本机空间暂时不可用')).toBeVisible()
    await expect(page.getByText('请重试或打开设置检查本机服务。不会自动切换到云端空间。')).toBeVisible()
    await page.getByRole('button', { name: '打开设置' }).click()

    const afterOpen = await page.evaluate(() => (window as any).__linxPlaywrightState)
    expect(afterOpen.openConfigCalls).toBe(1)
  })

  test('callback 错误页重试 Local 时保留原始 micro app 目标', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: READY_LOCAL_SNAPSHOT,
    })
    await installPendingLoginState(page, {
      microAppId: 'files',
      attempt: {
        issuerUrl: 'http://localhost:5737',
        authorizationSurface: 'window',
        returnToMicroAppId: 'files',
      },
    })
    await installMockOidcProvider(page)

    await page.goto('/auth/callback?error=access_denied&error_description=Denied')

    await expect(page.getByText('登录未完成')).toBeVisible()
    await expect(page.getByText('Denied')).toBeVisible()
    await expect(page.getByRole('button', { name: '重试本机空间' })).toBeVisible()

    expect(await page.evaluate(() => window.sessionStorage.getItem('linx-post-login-micro-app'))).toBe('files')

    await page.getByRole('button', { name: '重试本机空间' }).click()

    await expect.poll(async () => {
      const playState = await page.evaluate(() => (window as any).__linxPlaywrightState)
      const pendingAttempt = await page.evaluate(() => window.sessionStorage.getItem('linx-pending-login-attempt'))
      const pendingTarget = await page.evaluate(() => window.sessionStorage.getItem('linx-post-login-micro-app'))
      return {
        authWindowOpenCalls: playState.authWindowOpenCalls,
        pendingAttempt,
        pendingTarget,
      }
    }).toMatchObject({
      authWindowOpenCalls: 1,
      pendingTarget: 'files',
    })
  })
})
