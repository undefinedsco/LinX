import { expect, test, type Frame, type Page } from '@playwright/test'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'

const DASHBOARD_PROVIDER_MARKER = /OpenAI|Anthropic/
const LOGIN_BUTTON_NAME = /^登录$|^连接$/
const CONSENT_BUTTON_NAME = /Authorize|允许访问/i
const PASSWORD_SELECTOR = 'input[type="password"]'

let runtime: SeededXpodRuntime

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000)
  runtime = await startSeededXpodRuntime()
})

test.afterAll(async () => {
  await runtime?.stop()
})

async function assertNoVisiblePasswordInput(scope: Page | Frame): Promise<void> {
  const password = scope.locator(PASSWORD_SELECTOR)
  if (await password.isVisible({ timeout: 300 }).catch(() => false)) {
    throw new Error(`SSO 验证失败：出现密码输入框 ${await scope.evaluate?.(() => window.location.href).catch(() => '')}`)
  }
}

async function driveDashboardSso(scope: Page | Frame): Promise<void> {
  const deadline = Date.now() + 90_000

  await expect(scope.getByRole('button', { name: LOGIN_BUTTON_NAME })).toBeVisible({ timeout: 30_000 })
  await scope.getByRole('button', { name: LOGIN_BUTTON_NAME }).click()

  while (Date.now() < deadline) {
    await assertNoVisiblePasswordInput(scope)

    const consentButton = scope.getByRole('button', { name: CONSENT_BUTTON_NAME })
    if (await consentButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await consentButton.click()
      continue
    }

    if (await scope.getByText(DASHBOARD_PROVIDER_MARKER).first().isVisible({ timeout: 500 }).catch(() => false)) {
      return
    }

    await (scope as Page).waitForTimeout?.(500) ?? new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error('dashboard SSO 超时：未完成免密登录')
}

test.describe('applet 共享登录态验证（一个登录，两个宿主）', () => {
  test.describe.configure({ mode: 'serial' })

  test('宿主二：dashboard 标签页复用 LinX 登录的 IdP 会话', async ({ page }) => {
    test.setTimeout(240_000)

    await loginToSeededXpod(page, runtime)

    const dashboardPage = await page.context().newPage()
    await dashboardPage.goto(`${runtime.baseUrl}settings/`)

    await driveDashboardSso(dashboardPage)
    await expect(dashboardPage.getByText(DASHBOARD_PROVIDER_MARKER).first()).toBeVisible({ timeout: 30_000 })
  })

  test('宿主二：LinX 页面内 iframe 嵌入 dashboard 同样免密', async ({ page }) => {
    test.setTimeout(240_000)

    await loginToSeededXpod(page, runtime)

    await page.evaluate((src) => {
      const iframe = document.createElement('iframe')
      iframe.src = src
      iframe.id = 'xpod-dashboard-embed'
      iframe.style.cssText = 'position:fixed;inset:5%;width:90%;height:90%;z-index:9999;border:1px solid #ccc;background:white'
      document.body.appendChild(iframe)
    }, `${runtime.baseUrl}settings/`)

    let frame: Frame | undefined
    await expect
      .poll(async () => {
        frame = page.frames().find((candidate) => candidate.url().startsWith(runtime.baseUrl))
        return frame?.url()
      }, { timeout: 30_000 })
      .toContain(runtime.baseUrl)

    if (!frame) {
      throw new Error('dashboard iframe 未加载（可能被 X-Frame-Options/CSP frame-ancestors 拦截）')
    }

    await driveDashboardSso(frame)
  })
})
