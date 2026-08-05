import { expect, test, type Locator, type Page } from '@playwright/test'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'

test.describe.configure({ mode: 'serial' })

test.describe('Files Kanban browser interactions', () => {
  let runtime: SeededXpodRuntime

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
    runtime = await startSeededXpodRuntime()
  })

  test.afterAll(async () => {
    await runtime?.stop()
  })

  test('supports multi-select moves, precise before-card drops, and mobile horizontal lane operations', async ({ page }) => {
    test.setTimeout(180_000)
    await loginToSeededXpod(page, runtime)

    const board = await seedKanbanBoard(page)
    await openKanbanBoard(page, board.resourceUri, board.fileName)

    const alphaCard = page.getByRole('button', { name: 'Alpha task', exact: true })
    const betaCard = page.getByRole('button', { name: 'Beta task', exact: true })
    await alphaCard.click()
    await betaCard.click({ modifiers: ['Shift'] })
    await expect(page.getByText('已选 2')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: `Move ${board.alphaSubject}` }).press('Enter')
    await page.getByRole('menuitem', { name: '移动 2 张到 ready' }).press('Enter')
    const readyLane = page.getByLabel('Kanban column ready')
    const queueLane = page.getByLabel('Kanban column queue')
    await expect.poll(async () => cardSubjectsInLane(readyLane), { timeout: 30_000 }).toEqual(expect.arrayContaining([
      board.alphaSubject,
      board.betaSubject,
      board.readySubject,
    ]))
    await expect.poll(async () => cardSubjectsInLane(queueLane), { timeout: 30_000 }).toEqual([
      board.moverSubject,
      board.parkSubject,
    ])

    await dragCardBefore(page, board.moverSubject, board.readySubject)
    await expect(page.locator(`[data-kanban-drop-before="${board.readySubject}"]`)).toBeVisible({ timeout: 5_000 })
    await page.mouse.up()

    await expect.poll(async () => {
      const subjects = await cardSubjectsInLane(readyLane)
      return subjects.indexOf(board.readySubject) - subjects.indexOf(board.moverSubject)
    }, { timeout: 30_000 }).toBe(1)

    await page.setViewportSize({ width: 390, height: 844 })
    const horizontalBoard = page.locator('[data-kanban-board="horizontal"]')
    await expect(horizontalBoard).toBeVisible()
    await expect.poll(async () => horizontalBoard.evaluate((element) => {
      element.scrollLeft = element.scrollWidth
      return {
        clientWidth: element.clientWidth,
        scrollLeft: element.scrollLeft,
        scrollWidth: element.scrollWidth,
      }
    }), { timeout: 10_000 }).toMatchObject({
      scrollLeft: expect.any(Number),
    })
    const scrollState = await horizontalBoard.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollLeft: element.scrollLeft,
      scrollWidth: element.scrollWidth,
    }))
    expect(scrollState.scrollWidth).toBeGreaterThan(scrollState.clientWidth)
    expect(scrollState.scrollLeft).toBeGreaterThan(0)

    await page.getByRole('button', { name: '折叠 ready' }).click()
    await expect(readyLane).toHaveAttribute('data-lane-collapsed', 'true')
  })
})

async function seedKanbanBoard(page: Page) {
  return page.evaluate(async () => {
    const db = (window as any).__SOLID_DB__
    const podUrl = (window as any).__SOLID_DB_POD_URL__
    const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
    if (!podUrl || !authFetch) {
      throw new Error('Solid DB authenticated fetch is not ready.')
    }

    const ensureContainer = async (path: string) => {
      const normalizedPath = path.endsWith('/') ? path : `${path}/`
      const uri = new URL(normalizedPath, podUrl).href
      const existing = await authFetch(uri)
      if (existing.ok) return

      const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
      const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
      const response = await authFetch(new URL(parentPath, podUrl).href, {
        method: 'POST',
        headers: {
          Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          Slug: slug,
        },
      })
      if (![200, 201, 204, 409].includes(response.status)) {
        throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
      }
    }
    for (const path of [
      'inbox/',
      '.data/',
      '.data/approvals/',
      '.data/audits/',
      '.data/proposals/',
      '.data/proposals/cell/',
    ]) {
      await ensureContainer(path)
    }

    const stem = `kanban-interactions-${Date.now()}`
    const resourceUri = new URL(`.data/${stem}.ttl`, podUrl).href
    const modePredicate = 'https://undefineds.co/vocab/mode'
    const content = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '',
      '<#Alpha> a udfs:Workspace ;',
      '  rdfs:label "Alpha task" ;',
      `  <${modePredicate}> "queue" .`,
      '',
      '<#Beta> a udfs:Workspace ;',
      '  rdfs:label "Beta task" ;',
      `  <${modePredicate}> "queue" .`,
      '',
      '<#Mover> a udfs:Workspace ;',
      '  rdfs:label "Mover task" ;',
      `  <${modePredicate}> "queue" .`,
      '',
      '<#Park> a udfs:Workspace ;',
      '  rdfs:label "Park task" ;',
      `  <${modePredicate}> "queue" .`,
      '',
      '<#Ready> a udfs:Workspace ;',
      '  rdfs:label "Ready task" ;',
      `  <${modePredicate}> "ready" .`,
      '',
    ].join('\n')

    const response = await authFetch(resourceUri, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/turtle' },
      body: content,
    })
    if (!response.ok) {
      throw new Error(`failed to write ${resourceUri}: ${response.status} ${await response.text()}`)
    }

    return {
      fileName: new URL(resourceUri).pathname.split('/').filter(Boolean).at(-1)!,
      resourceUri,
      alphaSubject: `${resourceUri}#Alpha`,
      betaSubject: `${resourceUri}#Beta`,
      moverSubject: `${resourceUri}#Mover`,
      parkSubject: `${resourceUri}#Park`,
      readySubject: `${resourceUri}#Ready`,
    }
  })
}

async function openKanbanBoard(page: Page, resourceUri: string, fileName: string) {
  await page.getByRole('navigation').getByRole('button', { name: '文件', exact: true }).click()
  await expect(page.locator('[data-applet-id="files"]')).toBeVisible({ timeout: 10_000 })

  await page.evaluate(async ({ selectedResourceUri }) => {
    const { useFilesStore } = await import('/src/modules/files/store.ts')
    useFilesStore.getState().selectFile(selectedResourceUri)
  }, { selectedResourceUri: resourceUri })
  await expect(page.getByRole('heading', { name: fileName })).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: '+ 视图' }).click()
  await page.getByRole('menuitem', { name: 'Kanban' }).click()
  await page.getByRole('button', { name: 'Kanban 分组 predicate' }).click()
  await page.getByRole('menuitem', { name: 'mode' }).click()
  await expect(page.getByLabel('Kanban column queue')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('Kanban column ready')).toBeVisible({ timeout: 30_000 })
}

async function dragCardBefore(page: Page, subject: string, beforeSubject: string) {
  const source = page.locator(`[data-kanban-card-subject="${subject}"]`).first()
  const target = page.locator(`[data-kanban-card-subject="${beforeSubject}"]`).first()
  await expect(source).toBeVisible({ timeout: 10_000 })
  await expect(target).toBeVisible({ timeout: 10_000 })

  const sourceBox = await source.boundingBox()
  const targetBox = await target.boundingBox()
  if (!sourceBox || !targetBox) {
    throw new Error('expected Kanban drag source and target to have browser layout boxes')
  }

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 4, { steps: 16 })
}

async function cardSubjectsInLane(lane: Locator) {
  return lane.locator('[data-kanban-card-subject]').evaluateAll((elements) => (
    elements.map((element) => element.getAttribute('data-kanban-card-subject'))
  ))
}
