import { expect, test, type Page } from '@playwright/test'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

/**
 * R6 K2b 撤回 and the 数据 (.data) folder, against a seeded local xpod.
 * Run with LINX_E2E_BROWSER_CHANNEL=chrome when the bundled Chromium is missing.
 */
test.describe.configure({ mode: 'serial' })
test.setTimeout(240_000)

let runtime: SeededXpodRuntime

async function pod(page: Page, path: string, init?: { method: 'PUT'; body: string; type: string }) {
  return page.evaluate(async ({ path, init }) => {
    const w = window as any
    const authFetch = w.__SOLID_DB__.getDialect().getAuthenticatedFetch()
    const base = String(w.__SOLID_DB_POD_URL__).replace(/\/?$/, '/')
    const response = await authFetch(`${base}${path}`, init
      ? { method: init.method, headers: { 'Content-Type': init.type }, body: init.body }
      : { headers: { Accept: 'text/turtle' } })
    return { status: response.status, text: init ? '' : await response.text() }
  }, { path, init })
}

async function goToFiles(page: Page) {
  await page.evaluate(() => { history.pushState({}, '', '/files'); dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByRole('textbox', { name: '搜索文件树' })).toBeVisible({ timeout: 20_000 })
}

async function openNoteFromSearch(page: Page) {
  await page.getByRole('textbox', { name: '搜索文件树' }).fill('维护成本')
  const hits = page.getByRole('region', { name: '正文里的结果' })
  await expect(hits.getByRole('button').first()).toBeVisible({ timeout: 30_000 })
  await hits.getByRole('button').first().click()
  await expect(page.getByRole('dialog').getByText('meeting-notes.md').first()).toBeVisible({ timeout: 20_000 })
}

test.beforeAll(async () => {
  runtime = await startSeededXpodRuntime()
})

test.afterAll(async () => {
  await runtime?.stop?.()
})

test('withdraws a card, keeps it withdrawn after reload, and puts it back into use', async ({ page }) => {
  await loginToSeededXpod(page, runtime)
  await expectSecretaryInitialized(page)
  await pod(page, 'notes/meeting-notes.md', { method: 'PUT', type: 'text/markdown', body: '# 会议纪要\n\n维护成本太高，先不自己做。\n' })
  await goToFiles(page)
  await openNoteFromSearch(page)

  await page.getByRole('dialog').getByRole('button', { name: '更多' }).click()
  await page.getByRole('menuitem', { name: '撤回…' }).click()
  const confirm = page.getByRole('dialog').filter({ hasText: '以后的工作不再使用它' })
  await expect(confirm).toContainText('已完成的工作和原来的聊天不受影响')
  await confirm.getByRole('button', { name: '撤回' }).click()
  await expect(page.getByText('已撤回：以后的工作不再使用这张卡片。')).toBeVisible()
  await expect.poll(async () => (await pod(page, 'settings/linx/withdrawn-cards.ttl')).text).toContain('notes/meeting-notes.md')

  await page.reload()
  await goToFiles(page)
  await openNoteFromSearch(page)
  await expect(page.getByText('已撤回：以后的工作不再使用这张卡片。')).toBeVisible()
  await page.getByRole('button', { name: '恢复使用' }).click()
  await expect(page.getByText('已撤回：以后的工作不再使用这张卡片。')).toHaveCount(0)
  await expect.poll(async () => (await pod(page, 'settings/linx/withdrawn-cards.ttl')).text).not.toContain('notes/meeting-notes.md')
})

test('shows .data as 数据 and hides only LinX bookkeeping folders', async ({ page }) => {
  await loginToSeededXpod(page, runtime)
  await pod(page, '.data/proposals/vocab/x.ttl', { method: 'PUT', type: 'text/turtle', body: '<#a> <#b> <#c> .\n' })
  await pod(page, '.data/history/x.json', { method: 'PUT', type: 'application/json', body: '{}' })
  await pod(page, '.data/other-app/orders.ttl', { method: 'PUT', type: 'text/turtle', body: '<#o1> a <#Order> .\n' })
  await goToFiles(page)

  await page.getByRole('treeitem', { name: '数据' }).first().click()
  const tree = page.getByRole('tree').first()
  await expect(tree.getByRole('treeitem', { name: 'other-app' })).toBeVisible({ timeout: 20_000 })
  await expect(tree.getByRole('treeitem', { name: 'proposals' })).toHaveCount(0)
  await expect(tree.getByRole('treeitem', { name: 'history' })).toHaveCount(0)
  await expect(page.getByText('各应用共用的数据').first()).toBeVisible()
  await expect(page.getByText('.data', { exact: true })).toHaveCount(0)
})
