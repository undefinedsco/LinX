import { expect, test, type Page } from '@playwright/test'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'

test.describe.configure({ mode: 'serial' })

test.describe('Inrupt simple local auth', () => {
  let runtime: SeededXpodRuntime

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
    runtime = await startSeededXpodRuntime()
  })

  test.afterAll(async () => {
    await runtime?.stop()
  })

  test('shows raw auth result against seeded xpod', async ({ page }) => {
    test.setTimeout(120_000)
    const browserMessages: string[] = []
    page.on('console', (message) => {
      browserMessages.push(message.text())
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

    const target = `/test/inrupt-simple?issuer=${encodeURIComponent(runtime.baseUrl)}&tokenType=Bearer`
    await page.goto(target)

    await expect(page.getByRole('heading', { name: /Inrupt Simple Test/i })).toBeVisible({ timeout: 15_000 })
    console.log(`[inrupt-simple-before-click]\n${await page.locator('pre').innerText()}`)
    await page.getByRole('button', { name: '登录 CSS v8' }).click()

    await signInToSeededRuntime(page, runtime)
    await authorizeSeededRuntime(page)

    await page.waitForURL(/\/test\/inrupt-simple/, { timeout: 30_000 })
    await expect.poll(() => browserMessages.join('\n'), {
      timeout: 15_000,
    }).toContain('Successfully connected to Solid Pod')

    const logs = await page.locator('pre').innerText()
    console.log(`[inrupt-simple-logs]\n${logs}`)

    expect(browserMessages.join('\n')).not.toContain('Failed to fetch WebID profile: 401 Unauthorized')
  })
})

async function signInToSeededRuntime(page: Page, runtime: SeededXpodRuntime): Promise<void> {
  console.log(`[sign-in] landed at ${page.url()}`)
  const signInGate = page.getByRole('button', { name: /Go to Sign in/i })
  if (await signInGate.isVisible({ timeout: 5_000 }).catch(() => false)) {
    console.log('[sign-in] clicking sign-in gate')
    await signInGate.click()
  }

  const emailInput = page.getByPlaceholder(/Email(?: address)?/i)
  const passwordInput = page.getByPlaceholder(/^Password$/i)

  try {
    await emailInput.waitFor({ state: 'visible', timeout: 20_000 })
  } catch (error) {
    await dumpPageState(page, 'email-input-not-visible')
    throw error
  }

  console.log('[sign-in] filling credentials')
  await emailInput.fill(runtime.email)
  await passwordInput.fill(runtime.password)

  console.log('[sign-in] submitting form')
  try {
    await Promise.all([
      page.waitForURL(/\/\.account\/oidc\/consent\//, { timeout: 30_000 }),
      page.getByRole('button', { name: /^Sign in$/i }).click(),
    ])
    console.log(`[sign-in] reached consent ${page.url()}`)
  } catch (error) {
    await dumpPageState(page, 'sign-in-submit-failed')
    throw error
  }
}

async function authorizeSeededRuntime(page: Page): Promise<void> {
  const authorizeButton = page.getByRole('button', { name: /Authorize|允许访问/i })
  try {
    await expect(authorizeButton).toBeVisible({ timeout: 20_000 })
    await expect(authorizeButton).toBeEnabled({ timeout: 20_000 })
  } catch (error) {
    await dumpPageState(page, 'authorize-button-not-ready')
    throw error
  }

  console.log('[authorize] clicking authorize')
  await authorizeButton.click()
}

async function dumpPageState(page: Page, label: string): Promise<void> {
  const state = await page.evaluate(() => ({
    url: window.location.href,
    title: document.title,
    body: document.body.innerText,
  }))

  console.log(`[${label}] ${JSON.stringify(state, null, 2)}`)
}
