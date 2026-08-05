import { expect, type Page } from '@playwright/test'
import type { SeededXpodRuntime } from './seeded-xpod-runtime'

export async function loginToSeededXpod(page: Page, runtime: SeededXpodRuntime): Promise<void> {
  await installSeededXpodDesktopBridge(page, runtime)
  await page.goto('/')
  await expect(page.getByRole('dialog', { name: '登录 LinX' })).toBeVisible({ timeout: 15_000 })

  await page.getByRole('button', { name: '更多选项' }).click()
  await page.getByRole('button', { name: /添加登录方式/ }).click()
  await page.getByPlaceholder('https://pod.example.com').fill(runtime.baseUrl)

  const providerOrigin = new URL(runtime.baseUrl).origin
  const appOrigin = new URL(page.url()).origin
  await page.getByRole('button', { name: '连接' }).click()

  await expect.poll(async () => {
    const currentUrl = new URL(page.url())
    if (currentUrl.origin === providerOrigin) return 'provider'
    if (currentUrl.origin !== appOrigin || !currentUrl.pathname.startsWith('/chat')) return 'pending'

    return page.evaluate(() => {
      const db = (window as any).__SOLID_DB__
      const podUrl = (window as any).__SOLID_DB_POD_URL__
      const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
      return (window as any).__SOLID_DB_STATUS__ === 'ready'
        && typeof podUrl === 'string'
        && podUrl.length > 0
        && typeof authFetch === 'function'
        ? 'restored'
        : 'pending'
    }).catch(() => 'pending')
  }, { timeout: 30_000 }).toMatch(/^(provider|restored)$/)

  const connectedUrl = new URL(page.url())
  if (connectedUrl.origin === appOrigin) {
    await assertSeededLoginReady(page, runtime)
    return
  }

  await signInToSeededRuntime(page, runtime)
  await authorizeSeededRuntime(page, runtime)
  await waitForAppPath(page, '/chat', 30_000)
  await assertSeededLoginReady(page, runtime)
}

async function installSeededXpodDesktopBridge(page: Page, runtime: SeededXpodRuntime): Promise<void> {
  await page.addInitScript((input: { baseUrl: string }) => {
    const baseUrl = input.baseUrl.endsWith('/') ? input.baseUrl : `${input.baseUrl}/`

    Object.defineProperty(window, 'xpodDesktop', {
      configurable: true,
      value: {
        localOnboarding: {
          getSnapshot: async () => ({
            state: 'ready',
            spaceKind: 'standalone',
            localUrl: baseUrl,
            baseUrl,
            publicUrl: null,
            capabilities: null,
            cloudIdentityUrl: null,
            provisionCode: null,
            provisionUrl: null,
            nodeId: 'seeded-xpod-e2e',
            message: null,
            errorCode: null,
            canRetry: true,
            canOpenSettings: true,
          }),
          chooseSpace: async () => undefined,
          continue: async () => undefined,
          refresh: async () => undefined,
          onStateChange: () => () => undefined,
        },
      },
    })
  }, { baseUrl: runtime.baseUrl })
}

export async function assertSeededLoginReady(page: Page, runtime: SeededXpodRuntime): Promise<void> {
  try {
    await page.waitForFunction(
      () => {
        const db = (window as any).__SOLID_DB__
        const podUrl = (window as any).__SOLID_DB_POD_URL__
        const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
        return (window as any).__SOLID_DB_STATUS__ === 'ready'
          && Boolean(db)
          && typeof podUrl === 'string'
          && podUrl.length > 0
          && typeof authFetch === 'function'
      },
      null,
      { timeout: 30_000 },
    )
    await expect(page.getByRole('dialog', { name: '登录 LinX' })).toHaveCount(0)
  } catch (error) {
    const debugState = await readSeededAuthDebugState(page)
    throw new Error(`expected login route to be ready\n${JSON.stringify({
      ...debugState,
      browserCookies: await page.context().cookies(),
    }, null, 2)}`, { cause: error })
  }

  await expect.poll(async () => {
    const debugState = await readSeededAuthDebugState(page)
    return {
      dbReady: debugState.dbReady,
      dbStatus: debugState.dbStatus,
      dbError: debugState.dbError,
      dbPodUrlReady: typeof debugState.dbPodUrl === 'string' && debugState.dbPodUrl.includes(`/${runtime.podName}/`),
      dbAuthFetchReady: debugState.dbAuthFetchReady,
      currentSessionReady: Boolean(debugState.currentSession),
      storedAccountReady: typeof debugState.loginStore?.state?.storedAccount?.webId === 'string'
        && debugState.loginStore.state.storedAccount.webId.includes(`/${runtime.podName}/profile/card#me`),
    }
  }, { timeout: 30_000 }).toEqual({
    dbReady: true,
    dbStatus: 'ready',
    dbError: null,
    dbPodUrlReady: true,
    dbAuthFetchReady: true,
    currentSessionReady: true,
    storedAccountReady: true,
  })

  await expect.poll(async () => {
    const samples = []
    for (let index = 0; index < 3; index += 1) {
      const debugState = await readSeededAuthDebugState(page)
      samples.push(
        debugState.dbStatus === 'ready'
          && debugState.dbReady
          && debugState.dbAuthFetchReady
          && typeof debugState.dbPodUrl === 'string'
          && debugState.dbPodUrl.includes(`/${runtime.podName}/`),
      )
      if (index < 2) {
        await page.waitForTimeout(250)
      }
    }
    return samples.every(Boolean)
  }, { timeout: 30_000 }).toBe(true)
}

export async function readSeededAuthDebugState(page: Page) {
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
      dbPodUrl: (window as any).__SOLID_DB_POD_URL__ ?? null,
      dbAuthFetchReady: typeof (window as any).__SOLID_DB__?.getDialect?.()?.getAuthenticatedFetch?.() === 'function',
      currentSession: sessionId,
      storedSession: storedSession ? JSON.parse(storedSession) : null,
      loginStore: JSON.parse(window.localStorage.getItem('linx-login') ?? 'null'),
      localStorage: readStorage(window.localStorage),
      sessionStorage: readStorage(window.sessionStorage),
      cookie: document.cookie,
    }
  })
}

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

  throw new Error(`timed out waiting for seeded xpod consent\n${JSON.stringify(await readSeededAuthDebugState(page), null, 2)}`)
}

async function clickAccountDashboardContinue(page: Page): Promise<void> {
  const clicked = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('button, a, [role="button"]')) as HTMLElement[]
    const target = candidates.find((element) => element.textContent?.trim().includes('Continue'))
    target?.click()
    return Boolean(target)
  })

  if (!clicked) {
    throw new Error(`expected account dashboard Continue control\n${JSON.stringify(await readSeededAuthDebugState(page), null, 2)}`)
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

  throw new Error(`expected created Pod ${expectedPodUrl} to become selectable or authorizable\n${JSON.stringify(await readSeededAuthDebugState(page), null, 2)}`)
}

async function waitForAppPath(page: Page, path: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname === path) {
      return
    }
    await page.waitForTimeout(250)
  }

  throw new Error(`expected app path ${path}, got ${page.url()}`)
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
