import { expect, test, type Page } from '@playwright/test'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

/**
 * R6 K2 card popup against a seeded local xpod:
 *  - 做成卡片 from a note passage, then 被引用 at the bottom of the note's card,
 *  - + 卡片 in a table opens an empty card; a title and a body make a row that survives a reload.
 * Run with LINX_E2E_BROWSER_CHANNEL=chrome when the bundled Chromium is missing.
 */
test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

let runtime: SeededXpodRuntime

async function pod(page: Page, path: string, init?: { method: 'PUT'; body: string; type: string }) {
  return page.evaluate(async ({ path, init }) => {
    const w = window as any
    const authFetch = w.__SOLID_DB__.getDialect().getAuthenticatedFetch()
    const base = String(w.__SOLID_DB_POD_URL__).replace(/\/?$/, '/')
    const response = await authFetch(`${base}${path}`, init
      ? { method: init.method, headers: { 'Content-Type': init.type }, body: init.body }
      : { cache: 'no-store', headers: { Accept: 'text/turtle' } })
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
  const note = hits.getByRole('button').filter({ hasText: 'meeting-notes' }).first()
  await expect(note).toBeVisible({ timeout: 30_000 })
  await note.click()
  await expect(page.getByRole('dialog').locator('[data-card-title]')).toHaveText('meeting-notes', { timeout: 20_000 })
  await expect(page.getByRole('dialog').getByText('维护成本太高，先不自己做。').first()).toBeVisible({ timeout: 20_000 })
}

test.beforeAll(async () => {
  runtime = await startSeededXpodRuntime()
})

test.afterAll(async () => {
  await runtime?.stop?.()
})

test('做成卡片 from a note passage shows up under 被引用 on the note', async ({ page }) => {
  await loginToSeededXpod(page, runtime)
  await expectSecretaryInitialized(page)
  await pod(page, 'notes/meeting-notes.md', { method: 'PUT', type: 'text/markdown', body: '# 会议纪要\n\n维护成本太高，先不自己做。\n' })
  await goToFiles(page)
  await openNoteFromSearch(page)

  const card = page.getByRole('dialog')
  // Title above the body (K2), nothing pointing here yet.
  await expect(card.locator('[data-card-title]')).toHaveText('meeting-notes')
  await expect(card.getByLabel('被引用')).toHaveCount(0)

  await card.getByText('维护成本太高，先不自己做。').first().click({ clickCount: 3 })
  await page.getByRole('button', { name: '做成卡片' }).click()
  await expect(page.getByText('已做成卡片').first()).toBeVisible({ timeout: 20_000 })

  // Reopen the note: the new card is listed under 被引用 and opens in the same popup.
  await expect(async () => {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 1500 })
  }).toPass({ timeout: 15_000 })
  await page.getByRole('textbox', { name: '搜索文件树' }).fill('')
  await openNoteFromSearch(page)
  const references = page.getByRole('dialog').getByLabel('被引用')
  await expect(references).toBeVisible({ timeout: 60_000 })
  await expect(references).toContainText('被引用 · 1 处')
  await expect(references).toContainText('来源')
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/card-backlinks-note.png` })
  await references.locator('[data-card-backlink]').first().click()
  await expect(page.getByRole('dialog').locator('[data-card-title]')).toContainText('维护成本太高', { timeout: 20_000 })
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/card-backlinks.png` })
})

test('+ 卡片 opens an empty card; a title and a body make a row that survives a reload', async ({ page }) => {
  await loginToSeededXpod(page, runtime)
  await expectSecretaryInitialized(page)
  await goToFiles(page)

  await page.getByRole('button', { name: '添加' }).first().click()
  await page.getByRole('menuitem', { name: '新建表格' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('表格名字').fill('想法')
  await dialog.getByLabel('第 1 列的名字').fill('状态')
  await dialog.getByRole('button', { name: '创建' }).click()
  await expect.poll(async () => (await pod(page, encodeURIComponent('想法.ttl'))).status, { timeout: 20_000 }).toBe(200)
  await expect(page.getByRole('columnheader').filter({ hasText: '状态' })).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: '+ 卡片' }).click()
  const card = page.getByRole('dialog')
  const title = card.getByLabel('卡片标题')
  await expect(title).toBeFocused()
  // The old "新增一行" form with its English "Subject" field is gone.
  await expect(card.getByLabel('Subject')).toHaveCount(0)
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/card-new-empty.png` })

  await title.fill('周末读书会')
  await title.press('Enter')
  await expect(card.locator('[data-card-title]')).toHaveText('周末读书会', { timeout: 30_000 })

  const body = card.locator('.bn-editor').first()
  await expect(body).toBeVisible({ timeout: 20_000 })
  await body.click()
  await page.keyboard.type('先定地点，再发报名表。')
  await expect(card.locator('[data-card-save-status="saved"]')).toBeVisible({ timeout: 20_000 })
  await expect.poll(async () => decodeURIComponent((await pod(page, encodeURIComponent('想法.ttl'))).text), { timeout: 20_000 })
    .toContain('先定地点，再发报名表。')
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/card-new-filled.png` })

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('row').filter({ hasText: '周末读书会' })).toHaveCount(1)

  await page.reload()
  await goToFiles(page)
  await page.getByRole('tree').first().getByRole('treeitem', { name: /想法/ }).click()
  await expect(page.getByRole('row').filter({ hasText: '周末读书会' })).toHaveCount(1, { timeout: 30_000 })
})

test('a note cited through 问 LinX lists that chat under 用过它的工作', async ({ page }) => {
  await loginToSeededXpod(page, runtime)
  await expectSecretaryInitialized(page)
  await pod(page, 'notes/meeting-notes.md', { method: 'PUT', type: 'text/markdown', body: '# 会议纪要\n\n维护成本太高，先不自己做。\n' })
  await goToFiles(page)
  await openNoteFromSearch(page)
  await expect(page.getByRole('dialog').getByLabel('用过它的工作')).toHaveCount(0)

  await page.getByRole('dialog').getByText('维护成本太高，先不自己做。').first().click({ clickCount: 3 })
  await page.getByRole('button', { name: '问 LinX' }).click()
  await expect(page.getByTestId('composer-citation')).toContainText('meeting-notes', { timeout: 20_000 })
  const input = page.getByRole('textbox', { name: '消息' })
  await input.fill('这条为什么不自己做？')
  await input.press('Enter')
  await expect(page.locator('[data-role="user"]').filter({ hasText: '这条为什么不自己做？' })).toBeVisible({ timeout: 30_000 })

  await goToFiles(page)
  await openNoteFromSearch(page)
  const work = page.getByRole('dialog').getByLabel('用过它的工作')
  await expect(work).toBeVisible({ timeout: 60_000 })
  await expect(work).toContainText('用过它的工作 · 1 次')
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/card-work-use.png` })
  await work.locator('[data-card-work-use]').first().click()
  await expect(page.locator('[data-role="user"]').filter({ hasText: '这条为什么不自己做？' })).toBeVisible({ timeout: 30_000 })
})
