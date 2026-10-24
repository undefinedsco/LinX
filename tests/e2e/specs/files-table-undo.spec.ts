import { expect, test, type Page } from '@playwright/test'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'
import { cardSubjectsInLane, openTable, podText, seedTaskTable } from '../helpers/kanban-task-table'

/**
 * R6 K6 ↶ ↷ in the table toolbar, on a seeded Pod: the person's own cell edits, new rows and
 * card moves are taken back by writing the inverse change to the Pod, and a cell that changed
 * elsewhere is never overwritten.
 */
test.use({ channel: 'chrome' })
test.describe.configure({ mode: 'serial' })
test.setTimeout(240_000)

let runtime: SeededXpodRuntime

test.beforeAll(async ({}, testInfo) => {
  testInfo.setTimeout(120_000)
  runtime = await startSeededXpodRuntime()
})

test.afterAll(async () => {
  await runtime?.stop()
})

const undoButton = (page: Page) => page.getByRole('button', { name: '撤销', exact: true })
const redoButton = (page: Page) => page.getByRole('button', { name: '重做', exact: true })

async function setStage(page: Page, rowName: string, value: string) {
  const row = page.getByRole('row').filter({ hasText: rowName }).first()
  const combo = page.getByRole('combobox', { name: /^编辑 .* 的 阶段$/ })
  await expect(async () => {
    await row.getByRole("cell").nth(2).click()
    await expect(combo).toBeVisible({ timeout: 3000 })
  }).toPass({ timeout: 20_000 })
  await combo.fill(value)
  await combo.press('Enter')
  await expect(row).toContainText(value, { timeout: 15_000 })
  await expect(page.getByText('保存中')).toHaveCount(0, { timeout: 15_000 })
}

test('takes back a cell edit, a new row and a card move, and never overwrites a cell changed elsewhere', async ({ page }) => {
  await loginToSeededXpod(page, runtime)
  const board = await seedTaskTable(page)
  await openTable(page, board)
  await expect(page.getByRole('columnheader').filter({ hasText: '阶段' })).toBeVisible({ timeout: 30_000 })
  const row = (name: string) => page.getByRole('row').filter({ hasText: name }).first()
  const stageOf = async (name: string) => {
    const text = await podText(page, board.resourceUri)
    return new RegExp(`#${name}> <https://undefineds\\.co/vocab/stage> "([^"]+)"`).exec(text)?.[1]
  }

  // Nothing to take back yet.
  await expect(undoButton(page)).toBeDisabled()
  await expect(redoButton(page)).toBeDisabled()

  // A cell edit: 待办 → 进行中, then ↶ writes 待办 back to the Pod and ↷ writes 进行中 again.
  await setStage(page, 'Alpha', '进行中')
  await expect(undoButton(page)).toBeEnabled()
  await expect(undoButton(page)).toHaveAttribute('title', '撤销：把 阶段 改成 进行中')
  await expect(redoButton(page)).toBeDisabled()
  await undoButton(page).click()
  await expect(row('Alpha')).toContainText('待办', { timeout: 20_000 })
  await expect(redoButton(page)).toBeEnabled()
  await expect(redoButton(page)).toHaveAttribute('title', '重做：把 阶段 改成 进行中')
  await expect(undoButton(page)).toBeDisabled()
  await expect.poll(async () => stageOf('Alpha'), { timeout: 20_000 }).toBe('待办')

  // The take-back is a real write: it is what a reload (and another device) sees.
  await page.reload()
  await openTable(page, board)
  await expect(row('Alpha')).toContainText('待办', { timeout: 30_000 })
  await expect(undoButton(page)).toBeDisabled() // history is per session, gone after a reload

  // Redo, then Cmd/Ctrl+Z / Shift+Cmd/Ctrl+Z with the table focused.
  await setStage(page, 'Alpha', '进行中')
  await undoButton(page).click()
  await expect(row('Alpha')).toContainText('待办', { timeout: 20_000 })
  await redoButton(page).click()
  await expect(row('Alpha')).toContainText('进行中', { timeout: 20_000 })
  await expect.poll(async () => stageOf('Alpha'), { timeout: 20_000 }).toBe('进行中')
  await page.locator('[data-structured-resource-viewport]').focus()
  await page.keyboard.press('ControlOrMeta+Z')
  await expect(row('Alpha')).toContainText('待办', { timeout: 20_000 })
  await page.keyboard.press('ControlOrMeta+Shift+Z')
  await expect(row('Alpha')).toContainText('进行中', { timeout: 20_000 })

  // A new row: ↶ removes it from the table and from the Pod.
  await page.getByLabel('新的一行', { exact: true }).fill('Omega')
  await page.getByLabel('新的一行', { exact: true }).press('Enter')
  await expect(page.getByRole('row').filter({ hasText: 'Omega' })).toHaveCount(1, { timeout: 20_000 })
  await expect.poll(async () => podText(page, board.resourceUri), { timeout: 20_000 }).toContain('#Omega')
  await expect(undoButton(page)).toHaveAttribute('title', '撤销：添加「Omega」')
  await undoButton(page).click()
  await expect(page.getByRole('row').filter({ hasText: 'Omega' })).toHaveCount(0, { timeout: 20_000 })
  await expect.poll(async () => podText(page, board.resourceUri), { timeout: 20_000 }).not.toContain('#Omega')
  await redoButton(page).click()
  await expect(page.getByRole('row').filter({ hasText: 'Omega' })).toHaveCount(1, { timeout: 20_000 })
  await undoButton(page).click()
  await expect(page.getByRole('row').filter({ hasText: 'Omega' })).toHaveCount(0, { timeout: 20_000 })

  // 看板: moving a card between lanes is a cell change, so ↶ moves it back.
  await page.getByRole('button', { name: '+ 视图' }).click()
  await page.getByRole('menuitem', { name: '看板' }).click()
  await page.getByRole('button', { name: '看板分组' }).click()
  await page.getByRole('menuitem', { name: '阶段' }).click()
  const todoLane = page.getByLabel('看板列 待办')
  const doneLane = page.getByLabel('看板列 完成')
  await expect.poll(async () => cardSubjectsInLane(todoLane), { timeout: 30_000 }).toContain(board.beta)
  await page.getByRole('button', { name: '移动 Beta task' }).press('Enter')
  await page.getByRole('menuitem', { name: '移动到 完成' }).press('Enter')
  await expect.poll(async () => cardSubjectsInLane(doneLane), { timeout: 30_000 }).toContain(board.beta)
  // Moving a card from its menu also opens the card preview, which covers the toolbar.
  const peek = page.locator('aside[data-structured-subject-peek]')
  if (await peek.waitFor({ state: 'visible', timeout: 5_000 }).then(() => true, () => false)) {
    await peek.getByRole('button').first().click()
    await expect(peek).toHaveCount(0)
  }
  await expect(undoButton(page)).toHaveAttribute('title', '撤销：把 阶段 改成 完成')
  await undoButton(page).click()
  await expect.poll(async () => cardSubjectsInLane(todoLane), { timeout: 30_000 }).toContain(board.beta)
  await expect.poll(async () => stageOf('Beta'), { timeout: 20_000 }).toBe('待办')

  // Changed elsewhere: Beta is moved on by someone else, so ↷ must not overwrite it.
  await page.evaluate(async (uri) => {
    const authFetch = (window as any).__SOLID_DB__.getDialect().getAuthenticatedFetch()
    const response = await authFetch(uri, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/sparql-update' },
      body: `DELETE DATA { <${uri}#Beta> <https://undefineds.co/vocab/stage> "待办" } ; INSERT DATA { <${uri}#Beta> <https://undefineds.co/vocab/stage> "进行中" }`,
    })
    if (!response.ok) throw new Error(`external edit failed ${response.status}`)
  }, board.resourceUri)
  await expect(redoButton(page)).toBeEnabled()
  await redoButton(page).click()
  await expect(page.getByText(/刚被别处改过/).first()).toBeVisible({ timeout: 20_000 })
  await expect(redoButton(page)).toBeDisabled()
  await expect.poll(async () => stageOf('Beta'), { timeout: 20_000 }).toBe('进行中')
})
