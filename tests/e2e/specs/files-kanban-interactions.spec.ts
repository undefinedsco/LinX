import { expect, test, type Locator, type Page } from '@playwright/test'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'
import { cardSubjectsInLane, openTable, podText, seedTaskTable } from '../helpers/kanban-task-table'

/**
 * R6 K6 / K6d on a seeded Pod: a table whose 阶段 column is a confirmed 选项 property.
 * Sort and text search on the table, 看板 grouped by 阶段, multi-select moves, a drop before a
 * card, adding a card from a lane, lanes that persist across reload, and the 390px strip.
 */
test.use({ channel: 'chrome' })
test.describe.configure({ mode: 'serial' })

// The order the 阶段 options were defined in the vocab, not the order the data happens to list them.
const STAGE_LANES = ['看板列 待办', '看板列 进行中', '看板列 完成']

test.describe('Files table and 看板 browser interactions', () => {
  let runtime: SeededXpodRuntime

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
    runtime = await startSeededXpodRuntime()
  })

  test.afterAll(async () => {
    await runtime?.stop()
  })

  test('sorts and searches the table, then groups, moves, adds, collapses and scrolls the 看板', async ({ page }) => {
    test.setTimeout(240_000)
    await loginToSeededXpod(page, runtime)

    const board = await seedTaskTable(page)
    await openTable(page, board)
    await expect(page.getByRole('columnheader').filter({ hasText: '阶段' })).toBeVisible({ timeout: 30_000 })
    // rdfs:label is the row's name (名称), not a column of its own.
    await expect(page.getByRole('columnheader').filter({ hasText: /^Label$|^label$/i })).toHaveCount(0)

    // Table: sort by 点数 (number column), ascending then descending.
    const rowNames = async () => (await page.getByRole('row').allTextContents())
      .slice(1)
      .map((text) => text.match(/^(Alpha|Beta|Gamma|Delta|Eps)/)?.[1])
      .filter(Boolean)
    // (R6 K6d: the header opens the column's menu; 按它排序 picks the direction.)
    await page.getByRole('button', { name: '点数 列菜单' }).click()
    await page.getByRole('menuitem', { name: '按它排序' }).click()
    await page.getByRole('menuitem', { name: '升序（小到大）' }).click()
    await expect.poll(rowNames).toEqual(['Delta', 'Beta', 'Eps', 'Alpha', 'Gamma'])
    await page.getByRole('button', { name: '点数 列菜单' }).click()
    await page.getByRole('menuitem', { name: '按它排序' }).click()
    await page.getByRole('menuitem', { name: '降序（大到小）' }).click()
    await expect.poll(rowNames).toEqual(['Gamma', 'Alpha', 'Eps', 'Beta', 'Delta'])

    // The sort menu uses the same names as the headers.
    await page.getByRole('button', { name: '排序', exact: true }).click()
    await expect(page.getByRole('menuitem', { name: '点数 升序' })).toBeVisible()
    await page.keyboard.press('Escape')

    // Table: text search narrows the rows.
    await page.getByLabel('搜索卡片').fill('Gamma')
    await expect.poll(rowNames).toEqual(['Gamma'])
    await page.getByLabel('搜索卡片').fill('')
    await expect.poll(async () => (await rowNames()).length).toBe(5)

    // + 视图 → 看板, then group by the 阶段 option property (option properties are listed first).
    await page.getByRole('button', { name: '+ 视图' }).click()
    await page.getByRole('menuitem', { name: '看板' }).click()
    await page.getByRole('button', { name: '看板分组' }).click()
    await expect(page.getByRole('menuitem').first()).toHaveText('阶段')
    await page.getByRole('menuitem', { name: '阶段' }).click()

    // One lane per option value.
    await expect.poll(async () => laneLabels(page), { timeout: 30_000 }).toEqual(STAGE_LANES)
    const todoLane = page.getByLabel('看板列 待办')
    const doingLane = page.getByLabel('看板列 进行中')
    const doneLane = page.getByLabel('看板列 完成')
    await expect.poll(async () => cardSubjectsInLane(todoLane)).toEqual([board.alpha, board.beta])

    // Cards name their type by its label (任务), not the class's local name (Task).
    const alphaCard = page.locator(`[data-kanban-card-subject="${board.alpha}"]`).first()
    await expect(alphaCard).toContainText('任务')
    await expect(alphaCard).not.toContainText(/Task/)

    // Multi-select (click + shift-click) and move both to 进行中 from the card menu.
    await page.getByRole('button', { name: 'Alpha task', exact: true }).click()
    await page.getByRole('button', { name: 'Beta task', exact: true }).click({ modifiers: ['Shift'] })
    await expect(page.getByText('已选 2')).toBeVisible({ timeout: 10_000 })
    await page.getByRole('button', { name: '移动 Alpha task' }).press('Enter')
    await page.getByRole('menuitem', { name: '移动 2 张到 进行中' }).press('Enter')
    await expect.poll(async () => cardSubjectsInLane(doingLane), { timeout: 30_000 }).toEqual(
      expect.arrayContaining([board.alpha, board.beta, board.gamma, board.eps]),
    )
    await expect.poll(async () => cardSubjectsInLane(todoLane)).toEqual([])

    // A card move is a real write: it survives a reload.
    await expect.poll(async () => podText(page, board.resourceUri), { timeout: 30_000 }).toMatch(/Alpha[\s\S]*?"进行中"/)
    // The view is saved a moment after the last change (autosave debounce).
    await page.waitForTimeout(2000)
    await page.reload()
    await openTable(page, board)
    // The 看板 view and its grouping are saved with the table: it reopens as a board.
    await expect.poll(async () => cardSubjectsInLane(page.getByLabel('看板列 进行中')), { timeout: 30_000 }).toEqual(
      expect.arrayContaining([board.alpha, board.beta]),
    )

    // Drop before a card: Delta (完成) is dragged over 进行中 and lands right before the card the
    // placeholder bar shows (the one under the pointer).
    await dragCardBefore(page, board.delta, board.alpha)
    const dropBar = page.locator('[data-kanban-drop-before]')
    await expect(dropBar).toHaveCount(1, { timeout: 5_000 })
    const beforeSubject = (await dropBar.getAttribute('data-kanban-drop-before'))!
    await page.mouse.up()
    await expect.poll(async () => {
      const subjects = await cardSubjectsInLane(page.getByLabel('看板列 进行中'))
      return subjects.indexOf(beforeSubject) - subjects.indexOf(board.delta)
    }, { timeout: 30_000 }).toBe(1)

    // Add a card from the 完成 lane: it is written with that lane's value.
    await page.getByRole('button', { name: '添加卡片到 完成' }).click()
    await page.getByLabel('完成 里新卡片的标题').fill('Zeta')
    await page.getByLabel('完成 里新卡片的标题').press('Enter')
    await expect.poll(async () => (await cardSubjectsInLane(page.getByLabel('看板列 完成'))).some((s) => s?.endsWith('#Zeta')), {
      timeout: 30_000,
    }).toBe(true)
    await expect.poll(async () => podText(page, board.resourceUri), { timeout: 30_000 }).toMatch(/Zeta[\s\S]*?"完成"/)

    // Collapse a lane.
    await page.getByRole('button', { name: '折叠 完成' }).click()
    await expect(page.getByLabel('看板列 完成')).toHaveAttribute('data-lane-collapsed', 'true')

    // 390px: the lane strip scrolls horizontally inside the pane and lane controls stay usable.
    await page.setViewportSize({ width: 390, height: 844 })
    const horizontalBoard = page.locator('[data-kanban-board="horizontal"]')
    await expect(horizontalBoard).toBeVisible()
    await expect.poll(async () => horizontalBoard.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
      return element.scrollWidth > element.clientWidth && element.scrollLeft > 0 && element.clientWidth <= window.innerWidth
    }), { timeout: 10_000 }).toBe(true)
    await page.getByRole('button', { name: '展开 完成' }).click()
    await expect(page.getByLabel('看板列 完成')).toHaveAttribute('data-lane-collapsed', 'false')
    await page.getByRole('button', { name: '折叠 进行中' }).click()
    await expect(page.getByLabel('看板列 进行中')).toHaveAttribute('data-lane-collapsed', 'true')
  })
})

async function laneLabels(page: Page) {
  return page.locator('[data-kanban-column]').evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label')))
}

async function dragCardBefore(page: Page, subject: string, beforeSubject: string) {
  const source = page.locator(`[data-kanban-card-subject="${subject}"]`).first()
  const target = page.locator(`[data-kanban-card-subject="${beforeSubject}"]`).first()
  await expect(source).toBeVisible({ timeout: 10_000 })
  await expect(target).toBeVisible({ timeout: 10_000 })
  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) throw new Error('expected Kanban drag source and target to have browser layout boxes')
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 16 })
}
