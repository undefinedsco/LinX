import { expect, test, type Page } from '@playwright/test'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

test.describe.configure({ mode: 'serial' })

test.describe('Real seeded xpod auth flow', () => {
  let runtime: SeededXpodRuntime

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
    runtime = await startSeededXpodRuntime()
  })

  test.afterAll(async () => {
    await runtime?.stop()
  })

  test('logs into seeded xpod and lands on chat', async ({ page }) => {
    test.setTimeout(120_000)
    await page.addInitScript(() => {
      const shouldTraceKey = (key: string) =>
        key.startsWith('solid') || key.startsWith('oidc') || key.startsWith('linx')

      const patchStorage = (label: string, storage: Storage) => {
        const originalSetItem = storage.setItem.bind(storage)
        const originalRemoveItem = storage.removeItem.bind(storage)

        storage.setItem = ((key: string, value: string) => {
          if (shouldTraceKey(key)) {
            console.log(`[storage:${label}:set] ${key}=${value}`)
          }
          return originalSetItem(key, value)
        }) as Storage['setItem']

        storage.removeItem = ((key: string) => {
          if (shouldTraceKey(key)) {
            console.log(`[storage:${label}:remove] ${key}`)
          }
          return originalRemoveItem(key)
        }) as Storage['removeItem']
      }

      patchStorage('local', window.localStorage)
      patchStorage('session', window.sessionStorage)
    })

    page.on('console', (message) => {
      console.log(`[browser:${message.type()}] ${message.text()}`)
    })
    page.on('pageerror', (error) => {
      console.error(`[pageerror] ${error.message}`)
    })
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        console.log(`[nav] ${frame.url()}`)
      }
    })
    page.on('requestfailed', (request) => {
      console.error(`[requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`)
    })
    page.on('request', (request) => {
      const url = request.url()
      if (!url.startsWith(runtime.baseUrl) || !url.includes(`/${runtime.podName}/`)) {
        return
      }

      const headers = request.headers()
      const dpop = decodeDpopProof(headers.dpop)
      const dpopSummary = dpop ? `${dpop.htm ?? '?'} ${dpop.htu ?? '?'}` : headers.dpop ? 'unreadable' : 'no'
      console.log(`[pod-request] ${request.method()} ${url} auth=${headers.authorization ? headers.authorization.split(' ')[0] : 'none'} dpop=${dpopSummary}`)
    })
    page.on('response', (response) => {
      if (response.status() >= 400) {
        const headers = response.headers()
        const authChallenge = headers['www-authenticate'] ? ` www-authenticate=${headers['www-authenticate']}` : ''
        console.error(`[response:${response.status()}] ${response.url()}${authChallenge}`)
      }
    })

    await page.goto('/')

    await expect(page.getByRole('heading', { name: '选择空间' })).toBeVisible({ timeout: 15_000 })

    await page.getByRole('button', { name: /连接其他账号服务|连接其他 Solid 账号/ }).click()
    await page.getByPlaceholder('https://pod.example.com').fill(runtime.baseUrl)

    await Promise.all([
      page.waitForURL(new RegExp(escapeRegex(new URL(runtime.baseUrl).origin)), { timeout: 30_000 }),
      page.getByRole('button', { name: '连接' }).click(),
    ])

    await signInToSeededRuntime(page, runtime)
    await authorizeSeededRuntime(page, runtime)

    const landedOnChat = await waitForChatPath(page, 30_000)
    if (!landedOnChat) {
      const debugState = await readCallbackDebugState(page)
      throw new Error(`expected LinX to finish callback and land on /chat\n${JSON.stringify(debugState, null, 2)}`)
    }

    await assertLoginRouteReady(page, runtime)
    await expectSecretaryInitialized(page)
    await expect(page.getByRole('heading', { name: '选择空间' })).toHaveCount(0)
  })
})

async function signInToSeededRuntime(page: Page, runtime: SeededXpodRuntime): Promise<void> {
  const signInGate = page.getByRole('button', { name: /Go to Sign in/i })
  if (await signInGate.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await signInGate.click()
  }

  const emailInput = page.getByPlaceholder(/Email(?: address)?/i)
  const passwordInput = page.getByPlaceholder(/^Password$/i)

  await emailInput.waitFor({ state: 'visible', timeout: 20_000 })
  await emailInput.fill(runtime.email)
  await passwordInput.fill(runtime.password)

  await page.getByRole('button', { name: /^Sign in$/i }).click()
  await page.waitForFunction(() => {
    const path = window.location.pathname
    const password = document.querySelector('input[type="password"]') as HTMLInputElement | null
    return path.includes('/.account/oidc/consent/')
      || path.includes('/.account/account/')
      || !password
      || password.offsetParent === null
  }, undefined, { timeout: 30_000 })
}

async function authorizeSeededRuntime(page: Page, runtime: SeededXpodRuntime): Promise<void> {
  const deadline = Date.now() + 90_000

  while (Date.now() < deadline) {
    const authorizeButton = page.getByRole('button', { name: /Authorize|允许访问/i })
    const missingPodMessage = page.getByText('You need to create a Pod first to get a WebID.')
    const createPodButton = page.getByRole('button', { name: /^Create Pod$/i })
    const addPodButton = page.getByRole('button', { name: /Add Pod/i })
    const expectedPodUrl = new URL(`${runtime.podName}/`, runtime.baseUrl).href

    if (page.url().includes('/.account/account/')) {
      const bodyText = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '')
      if (bodyText.includes(expectedPodUrl) && bodyText.includes('Authorization Pending')) {
        await clickAccountDashboardContinue(page)
        await page.waitForURL(/\/\.account\/oidc\/consent\//, { timeout: 30_000 })
        continue
      }

      await page.waitForTimeout(500)
      continue
    }

    const continueButton = page.getByRole('button', { name: /Continue/i }).first()
    if (await continueButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await Promise.all([
        page.waitForURL(/\/\.account\/oidc\/consent\//, { timeout: 30_000 }),
        continueButton.click(),
      ])
      continue
    }

    if (
      await missingPodMessage.isVisible({ timeout: 1_000 }).catch(() => false)
      && await createPodButton.isVisible({ timeout: 500 }).catch(() => false)
    ) {
      await createPodButton.click()
      continue
    }

    if (await addPodButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await addPodButton.click()

      const podNameInput = page.getByPlaceholder(/my-pod/i)
      await expect(podNameInput).toBeVisible({ timeout: 20_000 })
      await podNameInput.fill(runtime.podName)

      const submitPodButton = page.getByRole('button', { name: /^Create(?: Pod)?$/i })
      await expect(submitPodButton).toBeEnabled({ timeout: 20_000 })
      await submitPodButton.click()
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)

      await waitForPodCreationOutcome(page, expectedPodUrl)
      continue
    }

    if (await authorizeButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await expect(missingPodMessage).toHaveCount(0)
      await expect(authorizeButton).toBeEnabled({ timeout: 20_000 })
      await authorizeButton.click()
      return
    }

    await page.waitForTimeout(500)
  }

  throw new Error(`timed out waiting for seeded xpod consent\n${JSON.stringify(await readCallbackDebugState(page), null, 2)}`)
}

async function clickAccountDashboardContinue(page: Page): Promise<void> {
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]')) as HTMLElement[]
    const target = candidates.find((element) => element.textContent?.trim().includes('Continue'))
    target?.click()
    return Boolean(target)
  })

  if (!clicked) {
    throw new Error(`expected account dashboard Continue control\n${JSON.stringify(await readCallbackDebugState(page), null, 2)}`)
  }
}

async function waitForPodCreationOutcome(page: Page, expectedPodUrl: string): Promise<void> {
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    const bodyText = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '')
    if (bodyText.includes(expectedPodUrl)) {
      return
    }

    const authorizeButton = page.getByRole('button', { name: /Authorize|允许访问/i })
    const missingPodMessage = page.getByText('You need to create a Pod first to get a WebID.')
    if (
      page.url().includes('/.account/oidc/consent/')
      && await authorizeButton.isVisible({ timeout: 500 }).catch(() => false)
      && await missingPodMessage.isVisible({ timeout: 500 }).then((visible) => !visible, () => true)
    ) {
      return
    }

    await page.waitForTimeout(500)
  }

  throw new Error(`expected created Pod ${expectedPodUrl} to become selectable or authorizable\n${JSON.stringify(await readCallbackDebugState(page), null, 2)}`)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeDpopProof(value: string | undefined): { htm?: string; htu?: string } | null {
  const payload = value?.split('.')[1]
  if (!payload) {
    return null
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { htm?: string; htu?: string }
  } catch {
    return null
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

async function assertLoginRouteReady(page: Page, runtime: SeededXpodRuntime): Promise<void> {
  try {
    await page.waitForFunction(() => Boolean((window as any).__SOLID_DB__), null, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: '选择空间' })).toHaveCount(0)
  } catch (error) {
    const debugState = await readCallbackDebugState(page)
    throw new Error(`expected login route to be ready\n${JSON.stringify(debugState, null, 2)}`, { cause: error })
  }

  const debugState = await readCallbackDebugState(page)
  expect(debugState.url).toContain('/chat')
  expect(debugState.dbReady).toBe(true)
  expect(debugState.dbStatus).toBe('ready')
  expect(debugState.dbError).toBeNull()
  expect(debugState.currentSession).toBeTruthy()
  expect(debugState.loginStore?.state?.storedAccount?.webId).toContain(`/${runtime.podName}/profile/card#me`)
}

async function readCallbackDebugState(page: Page) {
  return page.evaluate(() => {
    const readStorage = (storage: Storage) =>
      Object.fromEntries(
        Object.keys(storage)
          .filter((key) => key.startsWith('solid') || key.startsWith('linx') || key.startsWith('oidc'))
          .map((key) => [key, storage.getItem(key)]),
      )

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
      dbBootstrap: (window as any).__SOLID_DB_BOOTSTRAP__ ?? null,
      currentSession: sessionId,
      storedSession: storedSession ? JSON.parse(storedSession) : null,
      loginStore: JSON.parse(window.localStorage.getItem('linx-login') ?? 'null'),
      localStorage: readStorage(window.localStorage),
      sessionStorage: readStorage(window.sessionStorage),
      cookie: document.cookie,
    }
  })
}
