import { expect, test, type Page } from '@playwright/test'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

test.describe.configure({ mode: 'serial' })

test.describe('Cloud IDP + Cloud SP auth flow', () => {
  test('signs up through production Cloud, creates a Cloud Pod, and lands on chat without Local startup', async ({ page }) => {
    test.setTimeout(240_000)

    const runtime = createRuntimeIdentity()
    const localStartupCalls: string[] = []

    await page.addInitScript(() => {
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
            start: async () => {
              window.__linxCloudOnlyLocalCalls = [
                ...(window.__linxCloudOnlyLocalCalls ?? []),
                'xpod.start',
              ]
              return { success: true }
            },
            stop: async () => ({ success: true }),
            restart: async () => ({ success: true }),
            status: async () => ({ running: false, status: 'stopped' }),
            healthCheck: async () => false,
          },
          config: {
            getAll: async () => ({ CSS_PORT: '5737' }),
            getSchema: async () => ({}),
            getPath: async () => '/tmp/linx-cloud-only.env',
            update: async () => ({ success: true }),
            reset: async () => ({ success: true }),
          },
          supervisor: {
            getStatus: async () => [],
            onStatusChange: () => () => undefined,
          },
          dialog: {
            selectDirectory: async () => null,
          },
          app: {
            getVersion: async () => '0.1.0-test',
            getConfigWindowState: async () => ({ open: false, reason: 'closed', ready: false }),
            getUpdateStatus: async () => ({
              currentVersion: '0.1.0-test',
              latestVersion: null,
              releaseUrl: null,
              checkedAt: null,
              available: false,
              source: 'github-release',
              error: null,
            }),
            openExternal: async (url: string) => {
              window.location.assign(url)
            },
            openConfigWindow: async () => ({ success: true }),
            closeConfigWindow: async () => ({ success: true }),
            onConfigWindowState: () => () => undefined,
          },
          auth: {
            prepareLoopbackRedirect: async () => `${window.location.origin}/auth/callback`,
            getEmbeddedAuthorizationState: async () => ({ open: false, reason: 'dismissed', ready: false }),
            openAuthorizationWindow: async (url: string) => {
              window.location.assign(url)
            },
            openEmbeddedAuthorization: async (url: string) => {
              window.location.assign(withEmbeddedAuth(url))
            },
            closeEmbeddedAuthorization: async () => undefined,
            consumePendingRedirect: async () => null,
            onAuthorizationWindowState: () => () => undefined,
            onEmbeddedAuthorizationState: () => () => undefined,
            onRedirect: () => () => undefined,
          },
          localOnboarding: {
            getSnapshot: async () => ({
              state: 'mode_required',
              mode: null,
              localUrl: 'http://localhost:5737/',
              baseUrl: 'http://localhost:5737/',
              publicUrl: null,
              capabilities: null,
              cloudIdentityUrl: null,
              provisionCode: null,
              provisionUrl: null,
              nodeId: null,
              message: '首次使用时先确认 Local 的启动方式。',
              errorCode: null,
              canRetry: false,
              canOpenSettings: true,
            }),
            chooseMode: async () => {
              window.__linxCloudOnlyLocalCalls = [
                ...(window.__linxCloudOnlyLocalCalls ?? []),
                'local.chooseMode',
              ]
              throw new Error('Cloud-only login must not choose Local mode')
            },
            continue: async () => {
              window.__linxCloudOnlyLocalCalls = [
                ...(window.__linxCloudOnlyLocalCalls ?? []),
                'local.continue',
              ]
              throw new Error('Cloud-only login must not continue Local onboarding')
            },
            refresh: async () => undefined,
            onStateChange: () => () => undefined,
          },
        },
      })

      function withEmbeddedAuth(url: string): string {
        try {
          const parsed = new URL(url)
          const pathname = parsed.pathname.endsWith('/') ? parsed.pathname : `${parsed.pathname}/`
          if (
            pathname === '/.account/account/'
            || pathname === '/.account/oidc/consent/'
            || pathname === '/.account/login/password/'
            || pathname === '/.account/login/password/register/'
          ) {
            parsed.searchParams.set('embedded', '1')
          }
          return parsed.toString()
        } catch {
          return url
        }
      }
    })

    page.on('console', (message) => {
      console.log(`[browser:${message.type()}] ${message.text()}`)
    })
    page.on('pageerror', (error) => {
      console.error(`[pageerror] ${error.message}`)
    })
    page.on('requestfailed', (request) => {
      console.error(`[requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`)
    })
    page.on('response', (response) => {
      if (response.status() >= 400) {
        console.error(`[response:${response.status()}] ${response.url()}`)
        if (response.url().includes('/.oidc/reg')) {
          console.error(`[dcr-request] ${response.request().postData() ?? ''}`)
          void response.text().then(
            (body) => console.error(`[dcr-response:${response.status()}] ${body.slice(0, 2000)}`),
            (error) => console.error(`[dcr-response-error] ${String(error)}`),
          )
        }
        if (response.url().includes('/.account/')) {
          void response.text().then(
            (body) => console.error(`[response-body:${response.status()}] ${response.url()} ${body.slice(0, 1000)}`),
            (error) => console.error(`[response-body-error] ${response.url()} ${String(error)}`),
          )
        }
      }
    })

    await page.goto('/')
    await expect(page.getByRole('heading', { name: '选择空间' })).toBeVisible({ timeout: 15_000 })

    const cloudButton = page.getByRole('button', { name: /云端空间[\s\S]*登录|Cloud[\s\S]*Login/i }).first()
    if (!await cloudButton.isVisible({ timeout: 15_000 }).catch(() => false)) {
      throw new Error(`Cloud provider button not found\n${JSON.stringify(await readPageState(page), null, 2)}`)
    }
    await cloudButton.click()
    await page.waitForURL(/id\.undefineds\.co|\/\.account\//, { timeout: 90_000 })

    const registerResult = await registerOnProductionCloud(page, runtime)
    const consentResult = await provisionAndAuthorizeCloud(page, runtime.username)

    const landedOnChat = await waitForChatPath(page, 60_000)
    if (!landedOnChat) {
      throw new Error(`expected LinX to land on /chat\n${JSON.stringify(await readPageState(page), null, 2)}`)
    }
    await waitForSolidDbReady(page, 90_000)
    await expectSecretaryInitialized(page)

    const debug = await readPageState(page)
    localStartupCalls.push(...debug.localStartupCalls)
    expect(debug.url).toContain('/chat')
    expect(debug.dbReady).toBe(true)
    expect(debug.dbStatus).toBe('ready')
    expect(debug.dbError).toBeNull()
    expect(debug.loginStore?.state?.storedAccount?.webId).toBeTruthy()
    expect(debug.loginStore?.state?.storedAccount?.issuerUrl).toContain('https://id.undefineds.co')
    expect(debug.loginStore?.state?.storedAccount?.storageProviderLabel).toBe('Cloud')
    expect(debug.loginStore?.state?.storedAccount?.storageProviderUrl).toContain('https://id.undefineds.co')
    expect(debug.loginStore?.state?.storedAccount?.webId).toContain(`/${runtime.username}/profile/card#me`)
    expect(localStartupCalls).toEqual([])

    console.log(`[real-cloud] usernameField=${registerResult.usedUsernameField} createPod=${consentResult.usedCreatePod} addPod=${consentResult.usedAddPod}`)
  })
})

function createRuntimeIdentity(): { email: string; password: string; username: string } {
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return {
    email: `linx-cloud-${runId}@example.com`,
    password: 'TestIntegration123!',
    username: `linx${runId.replace(/[^a-z0-9]/gi, '').toLowerCase()}`.slice(0, 20),
  }
}

async function registerOnProductionCloud(
  page: Page,
  runtime: { email: string; password: string; username: string },
): Promise<{ usedUsernameField: boolean }> {
  const signInGate = page.getByRole('button', { name: /Go to Sign in/i })
  if (await signInGate.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await signInGate.click()
  }

  const emailInput = page.getByPlaceholder(/Email(?: address)?/i)
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 })

  const confirmPasswordInput = page.getByPlaceholder(/Confirm password/i)
  if (!await confirmPasswordInput.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /^Sign up$/i }).click()
    await expect(confirmPasswordInput).toBeVisible({ timeout: 20_000 })
  }

  const usernameInput = page.getByPlaceholder(/^Username$/i)
  await expect(usernameInput, 'Cloud signup must collect username so the first Cloud Pod can use the canonical slug').toBeVisible({ timeout: 20_000 })
  await assertCloudIdentityAvailabilityEndpointHealthy(page, runtime.username)
  await usernameInput.fill(runtime.username)
  await emailInput.fill(runtime.email)
  await page.getByPlaceholder(/^Password$/i).fill(runtime.password)
  await confirmPasswordInput.fill(runtime.password)

  await Promise.all([
    page.waitForURL(/\/\.account\/(account|oidc\/consent)\//, { timeout: 90_000 }),
    page.getByRole('button', { name: /^Sign up$/i }).click(),
  ])

  return { usedUsernameField: true }
}

async function assertCloudIdentityAvailabilityEndpointHealthy(page: Page, username: string): Promise<void> {
  const status = await page.evaluate(async (value) => {
    try {
      const response = await fetch(`https://id.undefineds.co/api/v1/identity/${encodeURIComponent(value)}`, {
        headers: { Accept: 'application/json' },
      })
      return {
        ok: response.ok,
        status: response.status,
        body: await response.text(),
      }
    } catch (error: any) {
      return {
        ok: false,
        status: 0,
        body: error?.message ?? String(error),
      }
    }
  }, username)

  if (status.status === 404 || status.status === 200 || status.status === 409) {
    return
  }

  throw new Error(
    `Cloud username availability API is unhealthy: GET /api/v1/identity/${username} returned `
    + `${status.status} ${status.body.slice(0, 500)}`,
  )
}

async function provisionAndAuthorizeCloud(
  page: Page,
  podName: string,
): Promise<{ usedCreatePod: boolean; usedAddPod: boolean }> {
  let usedCreatePod = false
  let usedAddPod = false
  const deadline = Date.now() + 120_000

  while (Date.now() < deadline) {
    await assertNoCloudPodProvisioningFailure(page)

    const authorizeButton = page.getByRole('button', { name: /Authorize|允许访问/i })
    const missingPodMessage = page.getByText('You need to create a Pod first to get a WebID.')
    const createPodButton = page.getByRole('button', { name: /^Create Pod$/i })
    const addPodButton = page.getByRole('button', { name: /Add Pod/i })

    if (await createPodButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      usedCreatePod = true
      await Promise.all([
        page.waitForURL(/\/\.account\/account\//, { timeout: 30_000 }),
        createPodButton.click(),
      ])
      continue
    }

    if (await addPodButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      usedAddPod = true
      await addPodButton.click()
      const podNameInput = page.getByPlaceholder(/my-pod/i)
      await expect(podNameInput).toBeVisible({ timeout: 20_000 })
      await podNameInput.fill(podName)

      await Promise.all([
        page.waitForLoadState('networkidle'),
        page.getByRole('button', { name: /^Create$/i }).click(),
      ])

      const expectedPodUrl = `${new URL(page.url()).origin}/${podName}/`
      await expect(page.getByRole('link', { name: expectedPodUrl, exact: true })).toBeVisible({ timeout: 30_000 })

      const consentUrl = new URL('/.account/oidc/consent/', page.url()).toString()
      await page.goto(consentUrl)
      continue
    }

    if (await authorizeButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await expect(missingPodMessage).toHaveCount(0)
      await expect(authorizeButton).toBeEnabled({ timeout: 20_000 })
      await authorizeButton.click()
      return { usedCreatePod, usedAddPod }
    }

    if (await missingPodMessage.isVisible({ timeout: 500 }).catch(() => false)) {
      throw new Error(
        'Cloud consent reports no WebID, but the Cloud account page did not expose a Pod creation entry. '
        + `This is the Cloud+Cloud regression for missing controls.account.pod.\n${JSON.stringify(await readPageState(page), null, 2)}`,
      )
    }

    await page.waitForTimeout(500)
  }

  throw new Error(`timed out waiting for Cloud consent\n${JSON.stringify(await readPageState(page), null, 2)}`)
}

async function assertNoCloudPodProvisioningFailure(page: Page): Promise<void> {
  const bodyText = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '')
  if (/Pod creation endpoint not found/i.test(bodyText)) {
    throw new Error(
      'Cloud account controls are missing the Pod creation endpoint. '
      + 'Cloud+Cloud signup reached account registration, but Pod creation cannot continue.',
    )
  }
}

async function waitForChatPath(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname === '/chat') {
      return true
    }
    await page.waitForTimeout(250)
  }

  return false
}

async function waitForSolidDbReady(page: Page, timeoutMs: number): Promise<void> {
  try {
    await page.waitForFunction(
      () => (window as any).__SOLID_DB_STATUS__ === 'ready' && Boolean((window as any).__SOLID_DB__),
      undefined,
      { timeout: timeoutMs },
    )
  } catch (error) {
    throw new Error(`expected Solid DB to become ready\n${JSON.stringify(await readPageState(page), null, 2)}`, {
      cause: error,
    })
  }
}

async function readPageState(page: Page) {
  return page.evaluate(() => {
    const sessionId = window.localStorage.getItem('solidClientAuthn:currentSession')
    const storedSession = sessionId
      ? window.localStorage.getItem(`solidClientAuthenticationUser:${sessionId}`)
      : null

    return {
      url: window.location.href,
      title: document.title,
      body: document.body.innerText,
      dbReady: Boolean((window as any).__SOLID_DB__),
      dbStatus: (window as any).__SOLID_DB_STATUS__ ?? null,
      dbError: (window as any).__SOLID_DB_ERROR__ ?? null,
      localStartupCalls: (window as any).__linxCloudOnlyLocalCalls ?? [],
      loginStore: JSON.parse(window.localStorage.getItem('linx-login') ?? 'null'),
      currentSession: sessionId,
      storedSession: storedSession ? JSON.parse(storedSession) : null,
      localStorage: Object.fromEntries(
        Object.keys(window.localStorage)
          .filter((key) => key.startsWith('solid') || key.startsWith('linx') || key.startsWith('oidc'))
          .map((key) => [key, window.localStorage.getItem(key)]),
      ),
      sessionStorage: Object.fromEntries(
        Object.keys(window.sessionStorage)
          .filter((key) => key.startsWith('solid') || key.startsWith('linx') || key.startsWith('oidc'))
          .map((key) => [key, window.sessionStorage.getItem(key)]),
      ),
    }
  })
}
