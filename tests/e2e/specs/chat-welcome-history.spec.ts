import { expect, test } from '@playwright/test'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

/**
 * The welcome (greeting + naming + "好，以后我叫…") must stay in the timeline once the
 * first real message is sent, survive a reload, and show in the chat list preview.
 * Seeded local xpod; no model is configured, so the reply is the 模型连接 guidance.
 */
test.setTimeout(300_000)

let runtime: SeededXpodRuntime

test.beforeAll(async () => {
  runtime = await startSeededXpodRuntime()
})

test.afterAll(async () => {
  await runtime?.stop?.()
})

test('welcome messages stay after the first message and a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await loginToSeededXpod(page, runtime)
  await expectSecretaryInitialized(page)
  await page.evaluate(() => { history.pushState({}, '', '/chat'); dispatchEvent(new PopStateEvent('popstate')) })

  await expect(page.getByText('先给我起个名字吧')).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: /^就叫/ }).click()
  await expect(page.getByText(/好，以后我叫.*想先做点什么/)).toBeVisible()

  const input = page.getByRole('textbox', { name: '消息' })
  await input.fill('帮我整理一份这周的待办清单')
  await input.press('Enter')
  await expect(page.locator('[data-role="user"]').filter({ hasText: '待办清单' })).toBeVisible({ timeout: 30_000 })

  // Earlier messages are still there, as real messages.
  await expect(page.getByText(/好，以后我叫.*想先做点什么/)).toBeVisible()
  await expect(page.locator('[data-role="assistant"]').filter({ hasText: '你好，我是你的助手' })).toHaveCount(1, { timeout: 30_000 })

  await page.reload()
  await expect(page.locator('[data-role="user"]').filter({ hasText: '待办清单' })).toBeVisible({ timeout: 60_000 })
  await expect(page.locator('[data-role="assistant"]').filter({ hasText: '你好，我是你的助手' })).toHaveCount(1)
  await expect(page.locator('[data-role="assistant"]').filter({ hasText: /好，以后我叫/ })).toHaveCount(1)

  // No model is connected: the failure says where to fix it.
  await expect(page.getByText('设置 → 模型连接', { exact: false }).first()).toBeVisible({ timeout: 60_000 })
})
