import { expect, test, type Page } from '@playwright/test'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { expectSecretaryInitialized } from '../helpers/secretary-bootstrap'

/**
 * Files data writes against a seeded local xpod whose Pod is path-based (`/<name>/`):
 * creating at the top of 我的空间, 新建表格 with ordered columns, adding rows, editing cells.
 */
test.use({ channel: 'chrome' })
test.describe.configure({ mode: 'serial' })
test.setTimeout(100_000)

let runtime: SeededXpodRuntime

async function pod(page: Page, path: string) {
  return page.evaluate(async (path) => {
    const w = window as any
    const authFetch = w.__SOLID_DB__.getDialect().getAuthenticatedFetch()
    const base = String(w.__SOLID_DB_POD_URL__).replace(/\/?$/, '/')
    const response = await authFetch(`${base}${path}`, { cache: 'no-store', headers: { Accept: 'text/turtle' } })
    return { status: response.status, text: await response.text() }
  }, path)
}

async function goToFiles(page: Page) {
  await page.evaluate(() => { history.pushState({}, '', '/files'); dispatchEvent(new PopStateEvent('popstate')) })
  await expect(page.getByRole('textbox', { name: '搜索文件树' })).toBeVisible({ timeout: 20_000 })
}

async function openAddMenu(page: Page, action: string) {
  await page.getByRole('button', { name: '添加' }).first().click()
  await page.getByRole('menuitem', { name: action }).click()
}

test.beforeAll(async () => {
  runtime = await startSeededXpodRuntime()
})

test.afterAll(async () => {
  await runtime?.stop?.()
})

test('creates at the top of 我的空间, builds an ordered table, and keeps edited rows after reload', async ({ page }) => {
  await loginToSeededXpod(page, runtime)
  await expectSecretaryInitialized(page)
  await goToFiles(page)

  // A document at the top of 我的空间 lands inside the Pod, not at the server origin.
  await openAddMenu(page, '新建文档')
  await page.getByRole('dialog').getByRole('textbox').fill('会议纪要')
  await page.getByRole('dialog').getByRole('button', { name: /创建|确定/ }).click()
  await expect.poll(async () => (await pod(page, encodeURIComponent('会议纪要.md'))).status, { timeout: 20_000 }).toBe(200)
  await expect(page.getByRole('dialog').getByText('会议纪要', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(async () => {
    await page.keyboard.press('Escape')
    const discard = page.getByRole('button', { name: '放弃修改' })
    if (await discard.isVisible().catch(() => false)) await discard.click()
    // Not obscured by the editor sheet any more.
    await page.getByRole('button', { name: '打开文件详情' }).click({ trial: true, timeout: 1500 })
  }).toPass({ timeout: 20_000 })

  // 新建表格 at the top, columns kept in the order they were typed.
  await openAddMenu(page, '新建表格')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('表格名字').fill('任务')
  await dialog.getByLabel('第 1 列的名字').fill('状态')
  await dialog.getByLabel('第 1 列的类型').selectOption('enum')
  await dialog.getByRole('button', { name: '加一列' }).click()
  await dialog.getByLabel('第 2 列的名字').fill('截止')
  await dialog.getByLabel('第 2 列的类型').selectOption('date')
  await dialog.getByRole('button', { name: '加一列' }).click()
  await dialog.getByLabel('第 3 列的名字').fill('金额')
  await dialog.getByLabel('第 3 列的类型').selectOption('number')
  await dialog.getByRole('button', { name: '创建' }).click()
  await expect.poll(async () => (await pod(page, encodeURIComponent('任务.ttl'))).status, { timeout: 20_000 }).toBe(200)

  // The new table is in the tree without a reload.
  await expect(page.getByRole('tree').first().getByRole('treeitem', { name: /任务/ })).toBeVisible({ timeout: 20_000 })

  const headers = page.getByRole('columnheader')
  await expect(headers.filter({ hasText: '金额' })).toBeVisible({ timeout: 30_000 })
  const texts = (await headers.allTextContents()).join('|')
  expect(texts.indexOf('状态')).toBeLessThan(texts.indexOf('截止'))
  expect(texts.indexOf('截止')).toBeLessThan(texts.indexOf('金额'))

  // Rows: the type triple is written (it used `rdf:type` without declaring the prefix).
  for (const name of ['买菜', '写周报']) {
    await page.getByLabel('新的一行', { exact: true }).fill(name)
    await page.getByLabel('新的一行', { exact: true }).press('Enter')
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 20_000 })
  }
  await expect(page.getByText('没保存成功')).toHaveCount(0)
  // Each new row shows once: no second greyed "待确认" copy next to the saved row.
  await expect(page.getByRole('row').filter({ hasText: '买菜' })).toHaveCount(1)
  await expect(page.getByRole('row').filter({ hasText: '写周报' })).toHaveCount(1)
  await expect.poll(async () => decodeURIComponent((await pod(page, encodeURIComponent('任务.ttl'))).text), { timeout: 20_000 }).toContain('#写周报')


  // A table that lives in an ordinary folder (not .data) is editable too: cells are written straight to the document.
  await page.evaluate(async () => {
    const w = window as any
    const af = w.__SOLID_DB__.getDialect().getAuthenticatedFetch()
    const base = String(w.__SOLID_DB_POD_URL__).replace(/\/?$/, '/')
    const body = [
      '@prefix schema: <http://schema.org/> .',
      '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
      '@prefix ex: <https://example.org/ns#> .',
      '<#o1> a ex:Order ; schema:name "订单一" ; ex:amount "10"^^xsd:integer ; ex:due "2026-10-01"^^xsd:date ; ex:status "新建" .',
      '<#o2> a ex:Order ; schema:name "订单二" ; ex:amount "20"^^xsd:integer ; ex:due "2026-10-02"^^xsd:date ; ex:status "新建" .',
      '',
    ].join('\n')
    const r = await af(`${base}work/orders.ttl`, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body })
    if (!r.ok) throw new Error(`seed failed ${r.status}`)
  })
  await page.reload()
  await goToFiles(page)
  await page.getByRole('tree').first().getByRole('treeitem', { name: /work/ }).click()
  await page.getByRole('tree').first().getByRole('treeitem', { name: /orders/ }).click()
  await expect(page.getByRole('row').filter({ hasText: '订单一' }).first()).toBeVisible({ timeout: 30_000 })
  const orderRow = () => page.getByRole('row').filter({ hasText: '订单一' }).first()
  const editCell = async (column: number, text: string) => {
    await orderRow().getByRole('cell').nth(column).click()
    const input = orderRow().getByRole('cell').nth(column).locator('input,textarea').first()
    await input.fill(text)
    // Some editors commit on change and close themselves before Enter.
    await input.press('Enter', { timeout: 3000 }).catch(() => {})
    await expect(page.getByText('保存中')).toHaveCount(0, { timeout: 15_000 })
  }
  await editCell(2, '99')
  await editCell(3, '2026-12-31')
  await editCell(4, '已发货')
  await expect(page.getByText('没保存成功')).toHaveCount(0)
  const orders = async () => decodeURIComponent((await pod(page, 'work/orders.ttl')).text)
  await expect.poll(orders, { timeout: 20_000 }).toMatch(/#o1> <https:\/\/example\.org\/ns#amount> 99 \./)
  await expect.poll(orders, { timeout: 20_000 }).toMatch(/#o1> <https:\/\/example\.org\/ns#due> "2026-12-31"/)
  await expect.poll(orders, { timeout: 20_000 }).toMatch(/#o1> <https:\/\/example\.org\/ns#status> "已发货"/)
  // The old values are replaced, not kept next to the new ones.
  const written = await orders()
  expect(written).not.toMatch(/#o1> <https:\/\/example\.org\/ns#amount> 10 \./)
  expect(written).not.toContain('2026-10-01')

  await page.reload()
  await goToFiles(page)
  await page.getByRole('tree').first().getByRole('treeitem', { name: /work/ }).click()
  await page.getByRole('tree').first().getByRole('treeitem', { name: /orders/ }).click()
  await expect(orderRow()).toContainText('99', { timeout: 30_000 })
  await expect(orderRow()).toContainText('2026-12-31')
  await expect(orderRow()).toContainText('已发货')
})

test('a table made by the person works at once: option column, cells, header menu, filter chips, and the view survives a reload', async ({ page }) => {
  await loginToSeededXpod(page, runtime)
  await expectSecretaryInitialized(page)
  await goToFiles(page)

  // 新建表格 with an option column and a number column.
  await openAddMenu(page, '新建表格')
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('表格名字').fill('活动')
  await dialog.getByLabel('第 1 列的名字').fill('状态')
  await dialog.getByLabel('第 1 列的类型').selectOption('enum')
  await dialog.getByRole('button', { name: '加一列' }).click()
  await dialog.getByLabel('第 2 列的名字').fill('预算')
  await dialog.getByLabel('第 2 列的类型').selectOption('number')
  await dialog.getByRole('button', { name: '创建' }).click()
  await expect.poll(async () => (await pod(page, encodeURIComponent('活动.ttl'))).status, { timeout: 20_000 }).toBe(200)

  // The columns are the person's own: ordinary headers, in typed order, nothing marked 待确认.
  const statusMenu = page.getByRole('button', { name: '状态 列菜单' })
  const budgetMenu = page.getByRole('button', { name: '预算 列菜单' })
  await expect(budgetMenu).toBeVisible({ timeout: 30_000 })
  await expect(statusMenu).toBeVisible()
  const headerTexts = (await page.getByRole('columnheader').allTextContents()).join('|')
  expect(headerTexts.indexOf('状态')).toBeLessThan(headerTexts.indexOf('预算'))
  await expect(page.getByText('待确认')).toHaveCount(0)
  // They went straight into the vocabulary, and nothing was sent to the inbox.
  const terms = async () => decodeURIComponent((await pod(page, '.vocab/terms.ttl')).text)
  await expect.poll(terms, { timeout: 20_000 }).toContain('"状态"')
  await expect.poll(async () => (await pod(page, '.data/proposals/vocab/')).status, { timeout: 10_000 }).toBe(404)

  // Rows, then cells that can be filled the moment the table exists.
  for (const name of ['春游', '团建', '年会']) {
    await page.getByLabel('新的一行', { exact: true }).fill(name)
    await page.getByLabel('新的一行', { exact: true }).press('Enter')
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(1, { timeout: 20_000 })
  }
  // A new row is greyed out until it is written; cells open once it is saved.
  for (const name of ['春游', '团建', '年会']) {
    await expect.poll(async () => decodeURIComponent((await pod(page, encodeURIComponent('活动.ttl'))).text), { timeout: 20_000 }).toContain(`#${name}`)
  }
  const row = (name: string) => page.getByRole('row').filter({ hasText: name }).first()
  const cellOf = (name: string, column: number) => row(name).getByRole('cell').nth(column)

  const fillOption = async (name: string, value: string) => {
    const combo = page.getByRole('combobox', { name: /^编辑 .* 的 状态$/ })
    // The table re-reads the vocabulary in the background; a click that lands while it does is retried.
    await expect(async () => {
      await cellOf(name, 1).click()
      await expect(combo).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 20_000 })
    await combo.fill(value)
    await combo.press('Enter')
    await expect(cellOf(name, 1)).toContainText(value, { timeout: 15_000 })
    await expect(page.getByText('保存中')).toHaveCount(0, { timeout: 15_000 })
  }
  await fillOption('春游', '进行中')
  await fillOption('团建', '已完成')
  await fillOption('年会', '进行中')
  const fillNumber = async (name: string, value: string) => {
    const input = cellOf(name, 2).locator('input').first()
    await expect(async () => {
      await cellOf(name, 2).click()
      await expect(input).toBeVisible({ timeout: 3000 })
    }).toPass({ timeout: 20_000 })
    await input.fill(value)
    await input.press('Enter')
    await expect(cellOf(name, 2)).toContainText(value, { timeout: 15_000 })
    await expect(page.getByText('保存中')).toHaveCount(0, { timeout: 15_000 })
  }
  await fillNumber('春游', '500')
  await fillNumber('团建', '1200')
  await fillNumber('年会', '300')
  await expect(page.getByText('没保存成功')).toHaveCount(0)
  await expect(page.getByText('待确认')).toHaveCount(0)
  // The values are on the cards, not waiting for anyone.
  const doc = async () => decodeURIComponent((await pod(page, encodeURIComponent('活动.ttl'))).text)
  await expect.poll(doc, { timeout: 20_000 }).toContain('"进行中"')
  await expect.poll(doc, { timeout: 20_000 }).toContain('1200')
  await expect.poll(async () => (await pod(page, '.data/proposals/cell/')).status, { timeout: 10_000 }).toBe(404)

  // 按它排序 from the header menu: 预算 high to low.
  const order = async () => (await page.getByRole('row').allTextContents())
    .map((text) => ['春游', '团建', '年会'].find((name) => text.includes(name)))
    .filter(Boolean)
  await budgetMenu.click()
  await page.getByRole('menuitem', { name: '按它排序' }).click()
  await page.getByRole('menuitem', { name: '降序（大到小）' }).click()
  await expect.poll(order).toEqual(['团建', '春游', '年会'])

  // 按它筛选: only 进行中.
  await statusMenu.click()
  await page.getByRole('menuitem', { name: '按它筛选' }).click()
  await page.getByRole('menuitemcheckbox', { name: '进行中' }).click()
  // Ticking keeps the menu open (to tick more); Escape closes the list, then the menu.
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect.poll(order).toEqual(['春游', '年会'])
  const chips = page.getByLabel('已用的筛选')
  await expect(chips.getByText('状态：进行中')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('filtered.png') })

  // 改显示的名字 and 隐藏这一列.
  await budgetMenu.click()
  await page.getByRole('menuitem', { name: '改显示的名字' }).click()
  await page.getByRole('dialog').getByLabel('显示的名字').fill('费用')
  await page.getByRole('dialog').getByRole('button', { name: '保存' }).click()
  await expect(page.getByRole('button', { name: '费用 列菜单' })).toBeVisible()
  await page.getByRole('button', { name: '费用 列菜单' }).click()
  await page.getByRole('menuitem', { name: '隐藏这一列' }).click()
  await expect(page.getByRole('button', { name: '费用 列菜单' })).toHaveCount(0)

  // The view is saved with the table: still filtered, renamed and hidden after a reload.
  await expect(page.getByText('保存中')).toHaveCount(0)
  await page.waitForTimeout(1500)
  await page.reload()
  await goToFiles(page)
  await page.getByRole('tree').first().getByRole('treeitem', { name: /活动/ }).click()
  await expect(page.getByRole('button', { name: '状态 列菜单' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('已用的筛选').getByText('状态：进行中')).toBeVisible()
  await expect.poll(order).toEqual(['春游', '年会'])
  await expect(page.getByRole('button', { name: '预算 列菜单' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '费用 列菜单' })).toHaveCount(0)
  // 列显示 still lists it under its new name, so it can be brought back.
  await page.getByRole('button', { name: '列显示' }).click()
  const hiddenColumn = page.getByRole('menuitemcheckbox', { name: '费用' })
  await expect(hiddenColumn).toHaveAttribute('aria-checked', 'false')
  await hiddenColumn.click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: '费用 列菜单' })).toBeVisible()
  await expect(cellOf('春游', 2)).toContainText('500')

  // Taking the chip off brings the filtered row back.
  await page.getByRole('button', { name: '去掉筛选：状态：进行中' }).click()
  await expect.poll(order).toEqual(['春游', '年会', '团建'].sort((a, b) => ['团建', '春游', '年会'].indexOf(a) - ['团建', '春游', '年会'].indexOf(b)))
  await expect(page.getByLabel('已用的筛选')).toHaveCount(0)
})

