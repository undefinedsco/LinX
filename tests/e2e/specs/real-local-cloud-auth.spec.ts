import { expect, test, type Page } from '@playwright/test'
import { startRealLocalCloudRuntime } from '../helpers/real-local-cloud-runtime.cjs'

test.describe.configure({ mode: 'serial' })

test.describe('Real Local -> Cloud auth flow', () => {
  test.skip(
    !process.env.LINX_REAL_LOCAL_PUBLIC_URL && !process.env.LINX_REAL_LOCAL_DOMAIN,
    'requires LINX_REAL_LOCAL_PUBLIC_URL=https://your-public-or-tunnel-domain/ mapped to LINX_REAL_LOCAL_PORT; set LINX_REAL_LOCAL_TUNNEL_TOKEN to let xpod start cloudflared',
  )

  test('starts Local, signs up through production Cloud, and lands on chat', async ({ page }) => {
    test.setTimeout(240_000)

    const runtime = await startRealLocalCloudRuntime(page)

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
        if (response.url().includes('/.account/') || response.url().includes('/provision/')) {
          void response.text().then(
            (body) => console.error(`[response-body:${response.status()}] ${response.url()} ${body.slice(0, 1000)}`),
            (error) => console.error(`[response-body-error] ${response.url()} ${String(error)}`),
          )
        }
      }
    })

    try {
      await page.goto('/')
      await expect(page.getByRole('heading', { name: '选择空间' })).toBeVisible({ timeout: 15_000 })

      await page.getByRole('button', { name: /Local/ }).click()
      await expect(page.getByRole('button', { name: '继续登录' })).toBeVisible({ timeout: 180_000 })
      await page.getByRole('button', { name: '继续登录' }).click()
      await page.waitForURL(/id\.undefineds\.co|\/\.account\//, { timeout: 180_000 })

      const registerResult = await registerOnProductionCloud(page, runtime)
      const consentResult = await provisionAndAuthorize(page, runtime)

      const landedOnChat = await waitForChatPath(page, 60_000)
      if (!landedOnChat) {
        throw new Error(`expected LinX to land on /chat\n${JSON.stringify(await collectDebugState(page, runtime), null, 2)}`)
      }
      await waitForSolidDbReady(page, 90_000)

      const debug = await collectDebugState(page, runtime)
      expect(debug.snapshot.state).toBe('ready')
      expect(debug.snapshot.cloudIdentityUrl).toBe('https://id.undefineds.co')
      expect(debug.url).toContain('/chat')
      expect(debug.dbReady).toBe(true)
      expect(debug.dbStatus).toBe('ready')
      expect(debug.dbError).toBeNull()
      expect(debug.loginStore?.state?.storedAccount?.webId).toBeTruthy()
      expect(debug.loginStore?.state?.storedAccount?.providerLabel).toBe('Local')
      expect(normalizeUrl(debug.loginStore?.state?.storedAccount?.issuerUrl)).toBe('https://id.undefineds.co/')
      expect(normalizeUrl(debug.loginStore?.state?.storedAccount?.providerUrl)).toBe(normalizeUrl(debug.snapshot.publicUrl))
      expect(debug.dbPodUrl).toMatch(new RegExp(`^${escapeRegExp(normalizeUrl(debug.snapshot.publicUrl))}`))
      expect(debug.dbPodUrl).not.toMatch(/^https:\/\/id\.undefineds\.co\//)
      expect(
        Object.keys(debug.localStorage).some((key) => key.startsWith('solidClientAuthn:') || key.startsWith('solidClientAuthenticationUser:')),
      ).toBe(true)

      console.log(`[real-local-cloud] usernameField=${registerResult.usedUsernameField} createPod=${consentResult.usedCreatePod} addPod=${consentResult.usedAddPod}`)
    } finally {
      await runtime.stop()
    }
  })
})

async function registerOnProductionCloud(
  page: Page,
  runtime: Awaited<ReturnType<typeof startRealLocalCloudRuntime>>,
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
  const usedUsernameField = await usernameInput.isVisible().catch(() => false)

  if (usedUsernameField) {
    await usernameInput.fill(runtime.username)
  }
  await emailInput.fill(runtime.email)
  await page.getByPlaceholder(/^Password$/i).fill(runtime.password)
  await confirmPasswordInput.fill(runtime.password)
  await ensureProvisionCodeOnCloudPage(page, runtime)

  await Promise.all([
    page.waitForURL(/\/\.account\/(account|oidc\/consent)\//, { timeout: 90_000 }),
    page.getByRole('button', { name: /^Sign up$/i }).click(),
  ])

  return { usedUsernameField }
}

async function provisionAndAuthorize(
  page: Page,
  runtime: Awaited<ReturnType<typeof startRealLocalCloudRuntime>>,
): Promise<{ usedCreatePod: boolean; usedAddPod: boolean }> {
  let usedCreatePod = false
  let usedAddPod = false
  const deadline = Date.now() + 120_000

  while (Date.now() < deadline) {
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
      await ensureProvisionCodeOnCloudPage(page, runtime)
      await podNameInput.fill(runtime.username)

      await Promise.all([
        page.waitForLoadState('networkidle'),
        page.getByRole('button', { name: /^Create$/i }).click(),
      ])

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

    await page.waitForTimeout(500)
  }

  throw new Error(`timed out waiting for consent\n${JSON.stringify(await readPageState(page), null, 2)}`)
}

async function ensureProvisionCodeOnCloudPage(
  page: Page,
  runtime: Awaited<ReturnType<typeof startRealLocalCloudRuntime>>,
): Promise<void> {
  const snapshot = await runtime.getSnapshot()
  const provisionCode = snapshot.provisionCode
  expect(provisionCode, 'Local remote-ready snapshot must expose a Cloud provision code').toBeTruthy()

  await page.evaluate((value) => {
    window.sessionStorage.setItem('provisionCode', value)
  }, provisionCode)

  await expect.poll(
    () => page.evaluate(() => window.sessionStorage.getItem('provisionCode')),
    { timeout: 10_000 },
  ).toBe(provisionCode)
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

async function collectDebugState(page: Page, runtime: Awaited<ReturnType<typeof startRealLocalCloudRuntime>>) {
  const pageState = await readPageState(page)
  const runtimeState = await runtime.getDebugState()

  return {
    ...pageState,
    ...runtimeState,
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
      dbPodUrl: (window as any).__SOLID_DB_POD_URL__ ?? null,
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
      storedSession: storedSession ? JSON.parse(storedSession) : null,
    }
  })
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
