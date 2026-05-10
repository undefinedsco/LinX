import { expect, test, type Page } from '@playwright/test'

type Snapshot = {
  state: 'mode_required' | 'idle' | 'checking' | 'starting' | 'repair_required' | 'ready' | 'error'
  mode: 'device-only' | 'remote-ready' | null
  localUrl: string | null
  baseUrl: string | null
  capabilities: {
    supported: boolean
    contract: string | null
    baseUrl: string | null
    version: string | null
  } | null
  message: string | null
  errorCode: string | null
  canRetry: boolean
  canOpenSettings: boolean
}

type DesktopScenario = {
  initialSnapshot?: Snapshot
  chooseModeSnapshots?: Partial<Record<'device-only' | 'remote-ready', Snapshot>>
  continueSnapshot?: Snapshot
  configOpen?: boolean
  authWindowOpen?: boolean
}

type PendingLoginAttempt = {
  issuerUrl: string
  authorizationSurface: 'window' | 'embedded' | 'external'
  returnToMicroAppId: string
}

const MODE_REQUIRED_SNAPSHOT: Snapshot = {
  state: 'mode_required',
  mode: null,
  localUrl: 'http://localhost:5737/',
  baseUrl: 'http://localhost:5737/',
  capabilities: null,
  message: '首次使用时先确认 Local 的启动方式。服务准备好后，再继续登录。',
  errorCode: null,
  canRetry: false,
  canOpenSettings: true,
}

const READY_SNAPSHOT: Snapshot = {
  state: 'ready',
  mode: 'device-only',
  localUrl: 'http://localhost:5737/',
  baseUrl: 'http://localhost:5737/',
  capabilities: {
    supported: true,
    contract: 'linx-local-onboarding/v1',
    baseUrl: 'http://localhost:5737/',
    version: '0.2.2',
  },
  message: 'Local 已准备好，可以继续登录。',
  errorCode: null,
  canRetry: true,
  canOpenSettings: true,
}

const REPAIR_SNAPSHOT: Snapshot = {
  state: 'repair_required',
  mode: 'remote-ready',
  localUrl: 'http://localhost:5737/',
  baseUrl: 'http://localhost:5737/',
  capabilities: null,
  message: '要让其他设备接入 Local，还需要先准备一个固定可访问地址。',
  errorCode: 'LOCAL_REMOTE_READY_REQUIRES_SETUP',
  canRetry: true,
  canOpenSettings: true,
}

const IDLE_DEVICE_ONLY_SNAPSHOT: Snapshot = {
  state: 'idle',
  mode: 'device-only',
  localUrl: 'http://localhost:5737/',
  baseUrl: 'http://localhost:5737/',
  capabilities: null,
  message: 'Local 尚未运行。你可以先启动 Local，或先配置启动参数。',
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
      state: 'mode_required',
      mode: null,
      localUrl: 'http://localhost:5737/',
      baseUrl: 'http://localhost:5737/',
      capabilities: null,
      message: '首次使用时先确认 Local 的启动方式。服务准备好后，再继续登录。',
      errorCode: null,
      canRetry: false,
      canOpenSettings: true,
    })

    let configOpen = Boolean(input.configOpen)
    let authWindowOpen = Boolean(input.authWindowOpen)

    const playState = {
      chosenModes: [] as Array<'device-only' | 'remote-ready'>,
      continueCalls: 0,
      getSnapshotCalls: 0,
      refreshCalls: 0,
      openConfigCalls: 0,
      closeConfigCalls: 0,
      authWindowOpenCalls: 0,
      authWindowCloseCalls: 0,
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
          openAuthorizationWindow: async () => {
            playState.authWindowOpenCalls += 1
            authWindowOpen = true
            emitAuth('opened')
          },
          openEmbeddedAuthorization: async () => {
            playState.authWindowOpenCalls += 1
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
          chooseMode: async (mode: 'device-only' | 'remote-ready') => {
            playState.chosenModes.push(mode)
            snapshot = clone(input.chooseModeSnapshots?.[mode] ?? {
              ...snapshot,
              mode,
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

async function installMockOidcProvider(page: Page) {
  await page.route('http://localhost:5737/.well-known/openid-configuration', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        issuer: 'http://localhost:5737',
        authorization_endpoint: 'http://localhost:5737/authorize',
        token_endpoint: 'http://localhost:5737/token',
        jwks_uri: 'http://localhost:5737/jwks',
        registration_endpoint: 'http://localhost:5737/register',
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

  await page.route('http://localhost:5737/register', async (route) => {
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

async function openLocalFlow(page: Page) {
  await page.goto('/')
  await expect(page).toHaveURL(/\/(?:$|chat$)/)
  await expect(page.getByRole('heading', { name: '选择空间' })).toBeVisible({ timeout: 15000 })
  await page.getByText('Local', { exact: true }).click()
  await expect(page).toHaveURL(/\/(?:$|chat$)/)
  await expect(page.getByRole('heading', { name: 'Local' })).toBeVisible({ timeout: 15000 })
}

test.describe('Local onboarding', () => {
  test('从登录页进入 Local 子流程', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: MODE_REQUIRED_SNAPSHOT,
    })

    await openLocalFlow(page)

    await expect(page.getByText('Cloud', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Local' })).toBeVisible()
    await expect(page.getByText('正在启动 Local…')).toBeVisible()
    await expect(page.getByRole('button', { name: '返回空间选择' })).toBeVisible()
  })

  test('登录首页会反映 Local 需要补充设置的状态', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: REPAIR_SNAPSHOT,
    })

    await page.goto('/')

    await expect(page.getByText('Local', { exact: true })).toBeVisible()
    await expect(page.getByText('这台设备上的本地空间')).toBeVisible()
    await expect(page.locator('span').filter({ hasText: '需设置' })).toBeVisible()
  })

  test('默认按仅本地模式启动后会转入标准 xpod 登录流', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: MODE_REQUIRED_SNAPSHOT,
      continueSnapshot: READY_SNAPSHOT,
    })

    await openLocalFlow(page)

    await expect(page.getByText('Local 已准备好', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '继续登录' })).toBeVisible()
    await expect(page.getByText('linx-local-onboarding/v1')).toBeVisible()

    const playState = await page.evaluate(() => (window as any).__linxPlaywrightState)
    expect(playState.chosenModes).toEqual(['device-only'])
    expect(playState.continueCalls).toBe(1)
  })

  test('已有 Local 模式时进入后会直接继续启动', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: IDLE_DEVICE_ONLY_SNAPSHOT,
    })

    await openLocalFlow(page)

    await expect(page.getByText('正在启动 Local…')).toBeVisible()

    const playState = await page.evaluate(() => (window as any).__linxPlaywrightState)
    expect(playState.continueCalls).toBe(1)
  })

  test('已有 remote-ready Local 模式时进入后不降级为仅本机模式', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: {
        ...IDLE_DEVICE_ONLY_SNAPSHOT,
        mode: 'remote-ready',
        baseUrl: 'https://node-test.undefineds.co/',
        message: 'Local 尚未运行。',
      },
      continueSnapshot: {
        ...READY_SNAPSHOT,
        mode: 'remote-ready',
        baseUrl: 'https://node-test.undefineds.co/',
        publicUrl: 'https://node-test.undefineds.co/',
        cloudIdentityUrl: 'https://id.undefineds.co',
        provisionCode: 'pc-123',
        provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
        nodeId: 'node-test',
      } as Snapshot,
    })

    await openLocalFlow(page)

    await expect(page.getByText('Local 已准备好', { exact: true })).toBeVisible()

    const playState = await page.evaluate(() => (window as any).__linxPlaywrightState)
    expect(playState.chosenModes).toEqual([])
    expect(playState.continueCalls).toBe(1)
  })

  test('repair 态可从当前卡片拉起 Local 设置', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: REPAIR_SNAPSHOT,
    })

    await openLocalFlow(page)

    await expect(page.getByText('还差一步让其他设备接入 Local')).toBeVisible()
    await expect(page.getByText('如果你现在只是想先开始使用，也可以直接切回“只给这台设备用”，不需要额外设置。')).toBeVisible()
    await page.getByRole('button', { name: '去完成 Local 设置' }).click()

    const afterOpen = await page.evaluate(() => (window as any).__linxPlaywrightState)
    expect(afterOpen.openConfigCalls).toBe(1)
  })

  test('callback 错误页重试 Local 时保留原始 micro app 目标', async ({ page }) => {
    await installDesktopBridge(page, {
      initialSnapshot: READY_SNAPSHOT,
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
    await expect(page.getByRole('button', { name: '重试 Local' })).toBeVisible()

    expect(await page.evaluate(() => window.sessionStorage.getItem('linx-post-login-micro-app'))).toBe('files')

    await page.getByRole('button', { name: '重试 Local' }).click()

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
