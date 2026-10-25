import { expect, test, type Page } from '@playwright/test'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

/**
 * R6 K4 whiteboard against a seeded local xpod:
 *  - a table row on the board shows its properties by their column names,
 *  - double click edits a note card in place and the text survives a reload,
 *  - a resized card keeps its size after a reload,
 *  - the note's card lists the board under 被引用 (在白板上),
 *  - the table's 预览 panel names properties by their column, not an internal id.
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
      : { cache: 'no-store', headers: { Accept: '*/*' } })
    return { status: response.status, text: init ? '' : await response.text() }
  }, { path, init })
}

async function goToFiles(page: Page) {
  await page.evaluate(() => { history.pushState({}, '', '/files'); dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByRole('textbox', { name: '搜索文件树' })).toBeVisible({ timeout: 20_000 })
}

async function openTable(page: Page, name: string) {
  await page.getByRole('tree').first().getByRole('treeitem', { name: new RegExp(name) }).click()
  await expect(page.getByRole('button', { name: '表格', exact: true })).toBeVisible({ timeout: 30_000 })
}

async function openWhiteboard(page: Page) {
  const tab = page.getByRole('button', { name: '白板', exact: true })
  if (!(await tab.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: '+ 视图' }).click()
    await page.getByRole('menuitem', { name: '白板' }).click()
  } else {
    await tab.click()
  }
  await expect(page.locator('[data-whiteboard-canvas-scroll]')).toBeVisible({ timeout: 20_000 })
}

const card = (page: Page, text: string) => page.locator('[data-whiteboard-card]').filter({ hasText: text })

async function size(page: Page, text: string) {
  return card(page, text).evaluate((element) => {
    const rect = (element.closest('.react-flow__node') as HTMLElement).getBoundingClientRect()
    const zoom = Number(getComputedStyle(element.closest('.react-flow__viewport') as HTMLElement).transform.match(/matrix\(([^,]+)/)?.[1] ?? 1)
    return { width: Math.round(rect.width / zoom), height: Math.round(rect.height / zoom) }
  })
}

test.beforeAll(async () => {
  runtime = await startSeededXpodRuntime()
})

test.afterAll(async () => {
  await runtime?.stop?.()
})

test('a board shows row properties, edits and resizes cards in place, and the card lists the board', async ({ page }) => {
  await loginToSeededXpod(page, runtime)
  await expectSecretaryInitialized(page)
  await pod(page, 'notes/计划.md', { method: 'PUT', type: 'text/markdown', body: '# 计划\n\n先做原型。\n' })
  await goToFiles(page)

  // A table with an option column and one row whose status is set.
  await page.getByRole('button', { name: '添加' }).first().click()
  await page.getByRole('menuitem', { name: '新建表格' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('表格名字').fill('任务')
  await dialog.getByLabel('第 1 列的名字').fill('状态')
  await dialog.getByLabel('第 1 列的类型').selectOption('enum')
  await dialog.getByRole('button', { name: '创建' }).click()
  await expect.poll(async () => (await pod(page, encodeURIComponent('任务.ttl'))).status, { timeout: 20_000 }).toBe(200)
  await expect(page.getByRole('button', { name: '状态 列菜单' })).toBeVisible({ timeout: 30_000 })
  await page.getByLabel('新的一行', { exact: true }).fill('写方案')
  await page.getByLabel('新的一行', { exact: true }).press('Enter')
  await expect.poll(async () => decodeURIComponent((await pod(page, encodeURIComponent('任务.ttl'))).text), { timeout: 20_000 }).toContain('#写方案')
  const row = page.getByRole('row').filter({ hasText: '写方案' }).first()
  const combo = page.getByRole('combobox', { name: /^编辑 .* 的 状态$/ })
  await expect(async () => {
    await row.getByRole('cell').nth(1).click()
    await expect(combo).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 20_000 })
  await combo.fill('进行中')
  await combo.press('Enter')
  await expect(row.getByRole('cell').nth(1)).toContainText('进行中', { timeout: 15_000 })
  await expect(page.getByText('保存中')).toHaveCount(0, { timeout: 15_000 })

  // 预览 in the table names the property by its column and keeps the address behind 更多信息.
  await row.hover()
  await page.getByRole('button', { name: '预览 写方案' }).click()
  const peek = page.getByLabel('卡片预览')
  await expect(peek.getByText('状态', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(peek.getByText('进行中')).toBeVisible()
  await expect(peek.getByText(/\bp-[a-z0-9]{6,}\b/)).toHaveCount(0)
  await expect(peek.getByText('URI', { exact: true })).toHaveCount(0)
  await expect(peek.getByText('Subject URI')).toHaveCount(0)
  await peek.getByRole('button', { name: '关闭卡片预览' }).click()

  // The board: the row and the note.
  await openWhiteboard(page)
  const library = page.getByRole('complementary', { name: '卡片库' })
  await expect(library).toBeVisible()
  await library.getByRole('button', { name: /写方案/ }).click()
  await library.getByRole('button', { name: '文件', exact: true }).click()
  await library.getByLabel('搜卡片、文件').fill('计划')
  await library.getByRole('button', { name: /计划/ }).first().click()
  await library.getByRole('button', { name: '关闭卡片库' }).click()

  // The row card shows its status by name.
  const rowCard = card(page, '写方案')
  await expect(rowCard).toBeVisible()
  await expect(rowCard.getByText('状态', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(rowCard.getByText('进行中')).toBeVisible()
  await expect(rowCard.getByText(/\bp-[a-z0-9]{6,}\b/)).toHaveCount(0)
  await expect(page.getByText('已保存到你的空间')).toBeVisible({ timeout: 20_000 })

  // Double click edits the note in place; clicking away saves it to the file.
  const noteCard = card(page, '先做原型。')
  await expect(noteCard).toBeVisible({ timeout: 20_000 })
  await noteCard.dblclick()
  const editor = page.locator('[data-whiteboard-body-editor] [contenteditable="true"]').first()
  await expect(editor).toBeVisible({ timeout: 20_000 })
  await editor.click()
  await page.keyboard.press('ControlOrMeta+End')
  await page.keyboard.type(' 再做评审。')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-whiteboard-body-editor]')).toHaveCount(0)
  await expect.poll(async () => (await pod(page, encodeURIComponent('notes/计划.md').replace('%2F', '/'))).text, { timeout: 20_000 }).toContain('再做评审')
  await expect(card(page, '再做评审')).toBeVisible({ timeout: 20_000 })

  // Resize the row card from its corner.
  await rowCard.click()
  const before = await size(page, '写方案')
  const handle = page.locator('.react-flow__node.selected .react-flow__resize-control.handle.bottom.right')
  await expect(handle).toBeVisible()
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 90, box.y + 70, { steps: 8 })
  await page.mouse.up()
  const after = await size(page, '写方案')
  expect(after.width).toBeGreaterThan(before.width + 40)
  expect(after.height).toBeGreaterThan(before.height + 30)
  await expect(page.getByText('已保存到你的空间')).toBeVisible({ timeout: 20_000 })
  // Wait until the board file itself holds the new size (saving is debounced), not just the earlier 已保存.
  await expect.poll(async () => {
    const listing = (await pod(page, '.data/views/whiteboard/')).text
    const files = [...new Set([...listing.matchAll(/([^\s"<>/]+\.canvas)/g)].map((match) => match[1]))]
    const widths: number[] = []
    for (const file of files) {
      const parsed = JSON.parse((await pod(page, `.data/views/whiteboard/${file}`)).text) as { nodes: Array<{ width: number }> }
      widths.push(...parsed.nodes.map((node) => node.width))
    }
    return widths.some((width) => Math.abs(width - after.width) <= 2)
  }, { timeout: 20_000 }).toBe(true)

  // Everything is still there after a reload.
  await page.reload()
  await goToFiles(page)
  await openTable(page, '任务')
  await openWhiteboard(page)
  await expect(card(page, '再做评审')).toBeVisible({ timeout: 30_000 })
  await expect(card(page, '写方案').getByText('进行中')).toBeVisible()
  const restored = await size(page, '写方案')
  expect(Math.abs(restored.width - after.width)).toBeLessThanOrEqual(2)
  expect(Math.abs(restored.height - after.height)).toBeLessThanOrEqual(2)

  // The note's card lists this board under 被引用.
  await card(page, '再做评审').click()
  await page.locator('[data-whiteboard-canvas-scroll]').press('Space')
  const noteDialog = page.getByRole('dialog')
  const references = noteDialog.getByLabel('被引用')
  await expect(references).toBeVisible({ timeout: 30_000 })
  await expect(references.getByText('在白板上')).toBeVisible()
  await expect(references.getByText('任务')).toBeVisible()
  await references.getByText('任务').click()
  await expect(page.locator('[data-whiteboard-canvas-scroll]')).toBeVisible({ timeout: 20_000 })
  await expect(noteDialog).toHaveCount(0)

  // The row card's title and body are edited in place too, through the table's own write.
  await card(page, '写方案').dblclick()
  const titleInput = page.getByRole('textbox', { name: '卡片标题' })
  await expect(titleInput).toBeVisible({ timeout: 20_000 })
  await titleInput.fill('写方案定稿')
  await titleInput.press('Enter')
  await page.keyboard.type('先写目标')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-whiteboard-body-editor]')).toHaveCount(0)
  await expect.poll(async () => decodeURIComponent((await pod(page, encodeURIComponent('任务.ttl'))).text), { timeout: 20_000 }).toContain('写方案定稿')
  await expect.poll(async () => decodeURIComponent((await pod(page, encodeURIComponent('任务.ttl'))).text), { timeout: 20_000 }).toContain('先写目标')
  await expect(card(page, '写方案定稿')).toBeVisible({ timeout: 20_000 })
  await expect(card(page, '先写目标')).toBeVisible()
})
