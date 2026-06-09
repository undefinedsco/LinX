import { expect, test, type Page } from '@playwright/test'
import { startRealLocalCloudRuntime } from '../helpers/real-local-cloud-runtime.cjs'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

test.describe.configure({ mode: 'serial' })

test.describe('Real Local -> Cloud auth flow', () => {
  test.skip(
    !process.env.LINX_REAL_LOCAL_PUBLIC_URL && !process.env.LINX_REAL_LOCAL_DOMAIN,
    'requires LINX_REAL_LOCAL_PUBLIC_URL=https://your-public-or-tunnel-domain/ mapped to LINX_REAL_LOCAL_PORT; set LINX_REAL_LOCAL_TUNNEL_TOKEN to let xpod start cloudflared',
  )

  test('starts Local, signs up through production Cloud, and lands on chat', async ({ page }) => {
    test.setTimeout(240_000)

    const runtime = await startRealLocalCloudRuntime(page)
    const podCreateRequests: Array<{
      target: string
      hasName: boolean
      hasProvisionCode: boolean
    }> = []

    page.on('console', (message) => {
      console.log(`[browser:${message.type()}] ${message.text()}`)
    })
    page.on('pageerror', (error) => {
      console.error(`[pageerror] ${error.message}`)
    })
    page.on('requestfailed', (request) => {
      console.error(`[requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`)
    })
    page.on('request', (request) => {
      const method = request.method().toUpperCase()
      if (method !== 'POST') {
        return
      }
      const body = request.postData() ?? ''
      if (!body.includes('"name"')) {
        return
      }
      let parsed: any = null
      try {
        parsed = JSON.parse(body)
      } catch {
        // ignore non-JSON requests
      }
      if (!parsed?.name) {
        return
      }
      const entry = {
        target: request.url(),
        hasName: true,
        hasProvisionCode: Boolean(parsed?.settings?.provisionCode),
      }
      podCreateRequests.push(entry)
      console.log(`[real-local-cloud] pod-create target=${entry.target} hasProvisionCode=${entry.hasProvisionCode}`)
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

      await clickLocalSpaceEntry(page)
      await waitForLocalReady(page, runtime, 180_000)
      await continueToLocalAccountSurface(page)

      const registerResult = await registerOnProductionCloud(page, runtime)
      const consentResult = await provisionAndAuthorize(page, runtime)
      expect(
        podCreateRequests.some((request) => request.hasProvisionCode),
        `Cloud pod create request must include provisionCode\n${JSON.stringify(podCreateRequests, null, 2)}`,
      ).toBe(true)

      const landedOnChat = await waitForChatPath(page, 60_000)
      if (!landedOnChat) {
        throw new Error(`expected LinX to land on /chat\n${JSON.stringify(await collectDebugState(page, runtime), null, 2)}`)
      }
      await waitForSolidDbReady(page, 90_000)
      await expectSecretaryInitialized(page)

      const debug = await collectDebugState(page, runtime)
      expect(debug.snapshot.state).toBe('ready')
      expect(debug.snapshot.cloudIdentityUrl).toBe('https://id.undefineds.co')
      expect(debug.url).toContain('/chat')
      expect(debug.dbReady).toBe(true)
      expect(debug.dbStatus).toBe('ready')
      expect(debug.dbError).toBeNull()
      expect(debug.loginStore?.state?.storedAccount?.webId).toBeTruthy()
      expect(debug.loginStore?.state?.storedAccount?.storageProviderLabel).toBe('Local')
      expect(normalizeUrl(debug.loginStore?.state?.storedAccount?.issuerUrl)).toBe('https://id.undefineds.co/')
      expect(normalizeUrl(debug.loginStore?.state?.storedAccount?.storageProviderUrl)).toBe(normalizeUrl(debug.snapshot.publicUrl))
      expect(debug.dbPodUrl).toMatch(new RegExp(`^${escapeRegExp(normalizeUrl(debug.snapshot.publicUrl))}`))
      expect(debug.dbPodUrl).not.toMatch(/^https:\/\/id\.undefineds\.co\//)
      expect(debug.accessRoute?.canonicalPodUrl).toBe(debug.dbPodUrl)
      expect(normalizeUrl(debug.accessRoute?.canonicalBaseUrl)).toBe(normalizeUrl(debug.snapshot.publicUrl))
      expect(['local', 'lan', 'public', 'canonical']).toContain(debug.accessRoute?.kind)
      expect(debug.accessRoute?.accessBaseUrl).toBeTruthy()
      if (debug.accessRoute?.kind !== 'canonical') {
        expect(normalizeUrl(debug.accessRoute?.accessBaseUrl)).not.toBe(normalizeUrl(debug.accessRoute?.canonicalBaseUrl))
      }
      expect(
        Object.keys(debug.localStorage).some((key) => key.startsWith('solidClientAuthn:') || key.startsWith('solidClientAuthenticationUser:')),
      ).toBe(true)

      console.log(`[real-local-cloud] usernameField=${registerResult.usedUsernameField} createPod=${consentResult.usedCreatePod} addPod=${consentResult.usedAddPod}`)
    } finally {
      await runtime.stop()
    }
  })
})

async function clickLocalSpaceEntry(page: Page): Promise<void> {
  const currentProductEntry = page.getByRole('button', { name: /本地空间[\s\S]*(开始|登录|继续)/ })
  if (await currentProductEntry.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await currentProductEntry.click()
    return
  }

  await page.getByRole('button', { name: /Local/ }).click()
}

async function continueToLocalAccountSurface(page: Page): Promise<void> {
  if (await page.getByPlaceholder(/Email(?: address)?/i).isVisible({ timeout: 1_000 }).catch(() => false)) {
    return
  }

  const continueButton = page.getByRole('button', { name: /继续登录|Continue/i })
  if (!await continueButton.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await page.waitForURL(/id\.undefineds\.co|\/\.account\//, { timeout: 30_000, waitUntil: 'domcontentloaded' })
    return
  }

  await Promise.all([
    page.waitForURL(/id\.undefineds\.co|\/\.account\//, { timeout: 30_000, waitUntil: 'domcontentloaded' }),
    continueButton.evaluate((element) => {
      ;(element as HTMLElement).click()
    }),
  ])
}

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
    const continueAuthorizationLink = page.getByRole('link', { name: /^Continue$/i })
    const firstPodNameInput = page.getByPlaceholder(/^alice$/i)
    const createStorageButton = page.getByRole('button', { name: /^Create storage$/i })
    const refreshAuthorizationButton = page.getByRole('button', { name: /^Refresh authorization$/i })

    if (await continueAuthorizationLink.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await Promise.all([
        page.waitForURL(/\/\.account\/oidc\/consent\//, { timeout: 30_000 }),
        continueAuthorizationLink.click(),
      ])
      continue
    }

    if (await createStorageButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      if (!await firstPodNameInput.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await page.waitForTimeout(500)
        continue
      }
      usedAddPod = true
      await ensureProvisionCodeOnCloudPage(page, runtime)
      try {
        await firstPodNameInput.fill(runtime.username, { timeout: 5_000 })
      } catch {
        await page.waitForTimeout(500)
        continue
      }
      await expect(createStorageButton).toBeEnabled({ timeout: 20_000 })
      await createStorageButton.click()
      continue
    }

    if (await refreshAuthorizationButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await refreshAuthorizationButton.click()
      continue
    }

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

async function waitForLocalReady(
  page: Page,
  runtime: Awaited<ReturnType<typeof startRealLocalCloudRuntime>>,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const snapshot = await runtime.getSnapshot()
    if (snapshot.state === 'ready') {
      return
    }
    if (snapshot.state === 'error' || snapshot.state === 'repair_required') {
      throw new Error(`Local failed before Cloud login\n${JSON.stringify(await collectDebugState(page, runtime), null, 2)}`)
    }
    await page.waitForTimeout(500)
  }

  throw new Error(`Local did not become ready\n${JSON.stringify(await collectDebugState(page, runtime), null, 2)}`)
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
