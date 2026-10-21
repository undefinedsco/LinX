import { expect, test } from '@playwright/test'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

/**
 * The assistant's first words must stay at the top of LinX 助手's chat once the first real
 * message is sent and after a reload, without becoming part of the message tree.
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

test('the welcome stays at the top after the first message and a reload', async ({ page }) => {
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

  // The assistant's first words stay at the top of the chat (drawn, not stored as messages).
  const intro = page.getByTestId('welcome-intro-static')
  await expect(intro).toContainText('你好，我是你的助手')
  await expect(page.getByText('你好，我是你的助手')).toHaveCount(1)

  // No model is connected: the failure says where to fix it.
  await expect(page.getByText('设置 → 模型连接', { exact: false }).first()).toBeVisible({ timeout: 60_000 })

  await page.reload()
  await expect(page.locator('[data-role="user"]').filter({ hasText: '待办清单' })).toBeVisible({ timeout: 60_000 })
  await expect(intro).toContainText('你好，我是你的助手', { timeout: 30_000 })
  await expect(page.getByText('你好，我是你的助手')).toHaveCount(1)
  // The welcome is not part of the message tree: no version picker appears on the first message.
  await expect(page.getByText(/^\s*1\s*\/\s*2\s*$/)).toHaveCount(0)

})
