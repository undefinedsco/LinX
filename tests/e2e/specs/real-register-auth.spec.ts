import { expect, test, type Page } from '@playwright/test'
import {
  startUnseededXpodRuntime,
  type SeededXpodRuntime,
} from '../helpers/seeded-xpod-runtime'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

test.describe.configure({ mode: 'serial' })

test.describe('Real register auth flow', () => {
  let runtime: SeededXpodRuntime

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
    runtime = await startUnseededXpodRuntime()
  })

  test.afterAll(async () => {
    await runtime?.stop()
  })

  test('registers on xpod, auto-creates pod, and lands on chat', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto('/')
    await expect(page.getByRole('heading', { name: '选择空间' })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /连接其他账号服务|连接其他 Solid 账号/ }).click()
    await page.getByPlaceholder('https://pod.example.com').fill(runtime.baseUrl)

    await Promise.all([
      page.waitForURL(new RegExp(escapeRegex(new URL(runtime.baseUrl).origin)), { timeout: 30_000 }),
      page.getByRole('button', { name: '连接' }).click(),
    ])

    await signUpToFreshRuntime(page, runtime)
    await authorizeRuntime(page)

    const landedOnChat = await waitForChatPath(page, 30_000)
    expect(landedOnChat).toBe(true)
    await assertLoginRouteReady(page, runtime)
    await expectSecretaryInitialized(page)
  })
})

async function signUpToFreshRuntime(page: Page, runtime: SeededXpodRuntime): Promise<void> {
  const signInGate = page.getByRole('button', { name: /Go to Sign in/i })
  if (await signInGate.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await signInGate.click()
  }

  const usernameInput = page.getByPlaceholder(/^Username$/i)
  const emailInput = page.getByPlaceholder(/Email(?: address)?/i)
  const passwordInput = page.getByPlaceholder(/^Password$/i)

  await emailInput.waitFor({ state: 'visible', timeout: 20_000 })

  const confirmPasswordInput = page.getByPlaceholder(/Confirm password/i)
  if (!await confirmPasswordInput.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: /^Sign up$/i }).click()
    await expect(confirmPasswordInput).toBeVisible({ timeout: 20_000 })
  }

  await expect(usernameInput).toBeVisible({ timeout: 20_000 })
  await usernameInput.fill(runtime.username ?? runtime.podName)
  await emailInput.fill(runtime.email)
  await passwordInput.fill(runtime.password)
  await confirmPasswordInput.fill(runtime.password)

  await Promise.all([
    page.waitForURL(/\/\.account\/(account|oidc\/consent)\//, { timeout: 60_000 }),
    page.getByRole('button', { name: /^Sign up$/i }).click(),
  ])

  await ensurePodExistsForConsent(page, runtime)
}

async function ensurePodExistsForConsent(page: Page, runtime: SeededXpodRuntime): Promise<void> {
  const deadline = Date.now() + 60_000
  const expectedPodUrl = new URL(`${runtime.podName}/`, runtime.baseUrl).href
  const expectedWebId = new URL(`${runtime.podName}/profile/card#me`, runtime.baseUrl).href

  while (Date.now() < deadline) {
    if (page.url().includes('/.account/account/')) {
      const bodyText = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '')
      if (bodyText.includes(expectedPodUrl) && bodyText.includes('Authorization Pending')) {
        await pickExpectedWebId(page, expectedWebId)
        await page.goto(new URL('/.account/oidc/consent/', runtime.baseUrl).href)
        continue
      }
    }

    if (/\/\.account\/oidc\/consent\//.test(page.url())) {
      const authorizeButton = page.getByRole('button', { name: /Authorize|允许访问/i })
      const missingPodMessage = page.getByText('You need to create a Pod first to get a WebID.')
      const createPodFromConsent = page.getByRole('button', { name: /^Create Pod$/i })

      if (
        await authorizeButton.isVisible({ timeout: 1_000 }).catch(() => false)
        && !await missingPodMessage.isVisible({ timeout: 500 }).catch(() => false)
      ) {
        return
      }

      if (await createPodFromConsent.isVisible({ timeout: 1_000 }).catch(() => false)) {
        await Promise.all([
          page.waitForURL(/\/\.account\/account\//, { timeout: 30_000 }),
          createPodFromConsent.click(),
        ])
        continue
      }
    }

    const addPodButton = page.getByRole('button', { name: /Add Pod/i })
    if (await addPodButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await addPodButton.click()

      const podNameInput = page.getByPlaceholder(/my-pod/i)
      await expect(podNameInput).toBeVisible({ timeout: 20_000 })
      await podNameInput.fill(runtime.podName)

      await Promise.all([
        page.waitForLoadState('networkidle'),
        page.getByRole('button', { name: /^Create$/i }).click(),
      ])

      await expect(page.getByRole('link', { name: expectedPodUrl, exact: true })).toBeVisible({ timeout: 30_000 })

      await pickExpectedWebId(page, expectedWebId)
      await page.goto(new URL('/.account/oidc/consent/', runtime.baseUrl).href)
      continue
    }

    await page.waitForTimeout(500)
  }

  throw new Error(`timed out waiting for an authorizable consent state\n${await page.textContent('body')}`)
}

async function authorizeRuntime(page: Page): Promise<void> {
  const authorizeButton = page.getByRole('button', { name: /Authorize|允许访问/i })
  await expect(authorizeButton).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('You need to create a Pod first to get a WebID.')).toHaveCount(0)
  await expect(authorizeButton).toBeEnabled({ timeout: 30_000 })
  await authorizeButton.click()
}

async function pickExpectedWebId(page: Page, webId: string): Promise<void> {
  const result = await page.evaluate(async (targetWebId) => {
    const response = await fetch('/.account/oidc/pick-webid/', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ webId: targetWebId, remember: true }),
    })

    return {
      ok: response.ok,
      status: response.status,
      url: response.url,
      body: await response.text().catch(() => ''),
    }
  }, webId)

  if (!result.ok) {
    throw new Error(`failed to pick WebID ${webId}: ${result.status} ${result.body}`)
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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

async function assertLoginRouteReady(page: Page, runtime: SeededXpodRuntime): Promise<void> {
  try {
    await page.waitForFunction(() => Boolean((window as any).__SOLID_DB__), null, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: '选择空间' })).toHaveCount(0)
  } catch (error) {
    const debugState = await readLoginDebugState(page)
    throw new Error(`expected login route to be ready\n${JSON.stringify(debugState, null, 2)}`, { cause: error })
  }

  const debugState = await readLoginDebugState(page)
  expect(debugState.url).toContain('/chat')
  expect(debugState.dbReady).toBe(true)
  expect(debugState.dbStatus).toBe('ready')
  expect(debugState.dbError).toBeNull()
  expect(debugState.currentSession).toBeTruthy()
  expect(debugState.loginStore?.state?.storedAccount?.webId).toContain(`/${runtime.podName}/profile/card#me`)
}

async function readLoginDebugState(page: Page) {
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
      currentSession: sessionId,
      storedSession: storedSession ? JSON.parse(storedSession) : null,
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
    }
  })
}
