import { expect, test, type Page } from '@playwright/test'
import { startRealLocalDeviceRuntime } from '../helpers/real-local-cloud-runtime.cjs'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

test.describe.configure({ mode: 'serial' })

test.describe('Real Local device-only auth flow', () => {
  test('starts Local without public URL or tunnel, signs up locally, and lands on chat', async ({ page }) => {
    test.setTimeout(180_000)

    const runtime = await startRealLocalDeviceRuntime(page)

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
      }
    })

    try {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: '选择空间' })).toBeVisible({ timeout: 15_000 })

      await page.getByRole('button', { name: /独立空间[\s\S]*(开始|启动|查看|设置|登录|继续)|Standalone/ }).click()

      await waitForLocalAccountPage(page, 90_000)

      await registerOnLocal(page, runtime)
      await provisionAndAuthorizeLocal(page, runtime.username)

      const landedOnChat = await waitForChatPath(page, 60_000)
      if (!landedOnChat) {
        throw new Error(`expected LinX to land on /chat\n${JSON.stringify(await collectDebugState(page, runtime), null, 2)}`)
      }
      await waitForSolidDbReady(page, 60_000)
      await expectSecretaryInitialized(page)

      const debug = await collectDebugState(page, runtime)
      const localOrigin = new URL(debug.snapshot.localUrl ?? debug.snapshot.baseUrl).origin

      expect(debug.snapshot.state).toBe('ready')
      expect(debug.snapshot.spaceKind).toBe('standalone')
      expect(debug.snapshot.publicUrl).toBeNull()
      expect(debug.snapshot.provisionCode).toBeNull()
      expect(debug.url).toContain('/chat')
      expect(debug.dbReady).toBe(true)
      expect(debug.dbStatus).toBe('ready')
      expect(debug.dbError).toBeNull()
      expect(debug.loginStore?.state?.storedAccount?.webId).toContain(localOrigin)
      expect(debug.loginStore?.state?.storedAccount?.storageProviderLabel).toBe('Standalone')
      expect(normalizeUrl(debug.loginStore?.state?.storedAccount?.issuerUrl)).toBe(normalizeUrl(localOrigin))
      expect(normalizeUrl(debug.loginStore?.state?.storedAccount?.storageProviderUrl)).toBe(normalizeUrl(localOrigin))
      expect(debug.dbPodUrl).toMatch(new RegExp(`^${escapeRegExp(normalizeUrl(localOrigin))}`))
      expect(debug.accessRoute?.canonicalPodUrl).toBe(debug.dbPodUrl)
      expect(debug.accessRoute?.kind).toBe('standalone')
      expect(normalizeUrl(debug.accessRoute?.canonicalBaseUrl)).toBe(normalizeUrl(localOrigin))
      expect(normalizeUrl(debug.accessRoute?.accessBaseUrl)).toBe(normalizeUrl(localOrigin))
      expect(debug.accessRoute?.accessPodUrl).toBe(debug.dbPodUrl)
    } finally {
      await runtime.stop()
    }
  })
})

async function waitForLocalAccountPage(page: Page, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (page.url().includes('/.account/')) {
      return
    }

    const continueButton = page.getByRole('button', { name: '继续登录' })
    if (await continueButton.isVisible({ timeout: 250 }).catch(() => false)) {
      await continueButton.dispatchEvent('click')
    }

    const emailInput = page.getByPlaceholder(/Email(?: address)?/i)
    const signUpButton = page.getByRole('button', { name: /^Sign up$/i })
    if (
      await emailInput.isVisible({ timeout: 500 }).catch(() => false)
      || await signUpButton.isVisible({ timeout: 500 }).catch(() => false)
    ) {
      return
    }

    await page.waitForTimeout(250)
  }

  throw new Error(`timed out waiting for Local account page\n${JSON.stringify(await readPageState(page), null, 2)}`)
}

async function registerOnLocal(
  page: Page,
  runtime: Awaited<ReturnType<typeof startRealLocalDeviceRuntime>>,
): Promise<void> {
  const signInGate = page.getByRole('button', { name: /Go to Sign in/i })
  if (await signInGate.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await signInGate.click()
  }

  await ensureLocalRegisterPage(page)

  const emailInput = page.getByPlaceholder(/Email(?: address)?/i)
  const confirmPasswordInput = page.getByPlaceholder(/Confirm password/i)
  const usernameInput = page.getByPlaceholder(/^Username$/i)
  if (await usernameInput.isVisible().catch(() => false)) {
    await usernameInput.fill(runtime.username)
  }
  await emailInput.fill(runtime.email)
  await page.getByPlaceholder(/^Password$/i).fill(runtime.password)
  await confirmPasswordInput.fill(runtime.password)

  await Promise.all([
    page.waitForURL(/\/\.account\/(account|oidc\/consent)\//, { timeout: 90_000 }),
    page.getByRole('button', { name: /^Sign up$/i }).click({ noWaitAfter: true }),
  ])
}

async function ensureLocalRegisterPage(page: Page): Promise<void> {
  const confirmPasswordInput = page.getByPlaceholder(/Confirm password/i)

  if (await confirmPasswordInput.isVisible().catch(() => false)) {
    return
  }

  const signUpButton = page.getByRole('button', { name: /^Sign up$/i })
  if (await signUpButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await signUpButton.click({ noWaitAfter: true })
    if (await confirmPasswordInput.isVisible({ timeout: 10_000 }).catch(() => false)) {
      return
    }
  }

  await page.goto(new URL('/.account/login/password/register/', page.url()).toString())
  await expect(confirmPasswordInput).toBeVisible({ timeout: 20_000 })
}

async function provisionAndAuthorizeLocal(page: Page, podName: string): Promise<void> {
  const deadline = Date.now() + 120_000

  while (Date.now() < deadline) {
    const authorizeButton = page.getByRole('button', { name: /Authorize|允许访问/i })
    const createPodButton = page.getByRole('button', { name: /^Create Pod$/i })
    const addPodButton = page.getByRole('button', { name: /Add Pod/i })
    const continueAuthorizationLink = page.getByRole('link', { name: /^Continue$/i })
    const firstPodNameInput = page.getByPlaceholder(/^alice$/i)
    const createStorageButton = page.getByRole('button', { name: /^Create storage$/i })
    const refreshAuthorizationButton = page.getByRole('button', { name: /^Refresh authorization$/i })

    if (await continueAuthorizationLink.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await page.goto(new URL('/.account/oidc/consent/', page.url()).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      })
      continue
    }

    if (await createStorageButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      if (!await firstPodNameInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await page.waitForTimeout(500)
        continue
      }
      await firstPodNameInput.fill(podName)
      await expect(createStorageButton).toBeEnabled({ timeout: 20_000 })
      await createStorageButton.click()
      continue
    }

    if (await refreshAuthorizationButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await refreshAuthorizationButton.click()
      continue
    }

    if (await createPodButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await page.goto(new URL('/.account/account/', page.url()).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      })
      continue
    }

    if (await addPodButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await addPodButton.click()

      const podNameInput = page.getByPlaceholder(/my-pod/i)
      await expect(podNameInput).toBeVisible({ timeout: 20_000 })
      await podNameInput.fill(podName)

      await page.getByRole('button', { name: /^Create$/i }).click()
      await Promise.race([
        page.getByRole('link', { name: /^Continue$/i }).waitFor({ state: 'visible', timeout: 30_000 }),
        page.getByRole('button', { name: /Authorize|允许访问/i }).waitFor({ state: 'visible', timeout: 30_000 }),
        page.waitForURL(/\/\.account\/oidc\/consent\//, { timeout: 30_000 }),
      ])
      continue
    }

    if (await authorizeButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await expect(authorizeButton).toBeEnabled({ timeout: 20_000 })
      await authorizeButton.click()
      return
    }

    await page.waitForTimeout(500)
  }

  throw new Error(`timed out waiting for local consent\n${JSON.stringify(await readPageState(page), null, 2)}`)
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

async function collectDebugState(page: Page, runtime: Awaited<ReturnType<typeof startRealLocalDeviceRuntime>>) {
  const pageState = await readPageState(page)
  const runtimeState = await runtime.getDebugState()

  return {
    ...pageState,
    ...runtimeState,
  }
}

async function readPageState(page: Page) {
  return page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    body: document.body.innerText,
    dbReady: Boolean((window as any).__SOLID_DB__),
    dbStatus: (window as any).__SOLID_DB_STATUS__ ?? null,
    dbError: (window as any).__SOLID_DB_ERROR__ ?? null,
    dbPodUrl: (window as any).__SOLID_DB_POD_URL__ ?? null,
    accessRoute: (window as any).__LINX_ACCESS_ROUTE__ ?? null,
    loginStore: JSON.parse(window.localStorage.getItem('linx-login') ?? 'null'),
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
  }))
}

function normalizeUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.trim()) {
    return ''
  }

  return url.trim().endsWith('/') ? url.trim() : `${url.trim()}/`
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
