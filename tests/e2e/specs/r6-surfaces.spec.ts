import { expect, test, type Page } from '@playwright/test'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

/**
 * R6 regression pass over every main surface, against a seeded local xpod. Each surface must
 * open without the error page and show its key content. With SHOTS_DIR set, a screenshot of
 * each surface is saved for comparison with the boards in docs/design/r6-interaction-canvas.
 * Run with LINX_E2E_BROWSER_CHANNEL=chrome when the bundled Chromium is missing.
 */
test.describe.configure({ mode: 'serial' })
test.setTimeout(300_000)

let runtime: SeededXpodRuntime

async function open(page: Page, path: string) {
  await page.evaluate((target) => { history.pushState({}, '', target); dispatchEvent(new PopStateEvent('popstate')) }, path)
  await page.waitForTimeout(1500)
  await expect(page.getByText('页面暂时无法打开')).toHaveCount(0)
}

async function shot(page: Page, name: string) {
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/r6-surface-${name}.png` })
}

test.beforeAll(async () => {
  runtime = await startSeededXpodRuntime()
})

test.afterAll(async () => {
  await runtime?.stop?.()
})

test('every R6 surface opens with its key content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  await loginToSeededXpod(page, runtime)
  await expectSecretaryInitialized(page)

  // Chat: welcome shown once, WeChat-style composer (no divider), / commands, 聊天信息.
  await open(page, '/chat')
  await expect(page.getByText('你好，我是你的助手', { exact: false })).toHaveCount(1)
  const composerInput = page.getByRole('textbox', { name: '消息' })
  await expect(composerInput).toBeVisible()
  const composerDivider = await composerInput.evaluate((input) => {
    let node: HTMLElement | null = input as HTMLElement
    while (node && !node.matches('form, [data-aui-composer-root], .bg-background')) node = node.parentElement
    return node ? getComputedStyle(node).borderTopWidth : 'missing'
  })
  expect(composerDivider).toBe('0px')
  for (const tool of ['添加附件', '生成图片', '截图记录', '联网搜索', '语音对话', '发送']) {
    await expect(page.getByRole('button', { name: tool }).first()).toBeVisible()
  }
  await composerInput.click()
  await composerInput.pressSequentially('/')
  await expect(page.getByRole('option', { name: '分享这段聊天' })).toBeVisible()
  await shot(page, 'chat-slash')
  await composerInput.press('Escape')
  await composerInput.fill('')
  await shot(page, 'chat')
  await page.getByRole('button', { name: '聊天信息' }).first().click()
  await page.waitForTimeout(800)
  await shot(page, 'chat-info')
  await page.keyboard.press('Escape')

  // Inbox.
  await open(page, '/inbox')
  await expect(page.getByRole('main').or(page.locator('body'))).toContainText('收件箱')
  await shot(page, 'inbox')

  // Contacts.
  await open(page, '/contacts')
  await expect(page.locator('body')).toContainText('LinX 助手')
  await shot(page, 'contacts')

  // Files: tree with 我的空间 / 共享给我.
  await open(page, '/files')
  await expect(page.getByRole('textbox', { name: '搜索文件树' })).toBeVisible()
  await expect(page.locator('body')).toContainText('我的空间')
  await expect(page.locator('body')).toContainText('共享给我')
  await shot(page, 'files')

  // Favorites: three panes.
  await open(page, '/favorites')
  await expect(page.locator('body')).toContainText('收藏')
  await shot(page, 'favorites')

  // Profile: saves on edit, says who can see it.
  await open(page, '/profile')
  await expect(page.locator('body')).toContainText('还有谁能看到')
  await shot(page, 'profile')

  // Settings: startup options.
  await open(page, '/settings')
  await expect(page.locator('body')).toContainText('启动时打开')
  await shot(page, 'settings')

  expect(pageErrors).toEqual([])
})
