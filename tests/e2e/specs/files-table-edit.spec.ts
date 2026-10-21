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
  await expect(page.getByRole('dialog').getByText('会议纪要.md').first()).toBeVisible({ timeout: 20_000 })
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
