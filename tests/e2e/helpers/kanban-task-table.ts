import { expect, type Locator, type Page } from '@playwright/test'

/** A seeded 任务 table (阶段 选项 + 点数 数字) shared by the Files 看板 specs. */
export async function podText(page: Page, uri: string) {
  return page.evaluate(async (target) => {
    const authFetch = (window as any).__SOLID_DB__.getDialect().getAuthenticatedFetch()
    const response = await authFetch(target, { cache: 'no-store', headers: { Accept: 'text/turtle' } })
    return decodeURIComponent(await response.text())
  }, uri)
}

export async function seedTaskTable(page: Page) {
  return page.evaluate(async () => {
    const db = (window as any).__SOLID_DB__
    const podUrl = (window as any).__SOLID_DB_POD_URL__
    const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
    if (!podUrl || !authFetch) throw new Error('Solid DB authenticated fetch is not ready.')

    const ensureContainer = async (path: string) => {
      const normalizedPath = path.endsWith('/') ? path : `${path}/`
      const uri = new URL(normalizedPath, podUrl).href
      if ((await authFetch(uri)).ok) return uri
      const parentPath = normalizedPath.replace(/[^/]+\/$/, '')
      const slug = normalizedPath.slice(parentPath.length).replace(/\/$/, '')
      const response = await authFetch(new URL(parentPath, podUrl).href, {
        method: 'POST',
        headers: { Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"', Slug: slug },
      })
      if (![200, 201, 204, 409].includes(response.status)) {
        throw new Error(`failed to ensure container ${uri}: ${response.status} ${await response.text()}`)
      }
      return uri
    }
    const put = async (uri: string, body: string) => {
      const response = await authFetch(uri, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body })
      if (!response.ok) throw new Error(`failed to write ${uri}: ${response.status} ${await response.text()}`)
    }
    for (const path of ['inbox/', '.data/', '.data/approvals/', '.data/audits/', '.data/proposals/', '.data/proposals/cell/', '.vocab/']) {
      await ensureContainer(path)
    }

    // A confirmed 选项 column (阶段) and a 数字 column (点数) in the Pod vocab.
    const termsUri = new URL('.vocab/terms.ttl', podUrl).href
    await put(termsUri, [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '<> a udfs:VocabTermRegistry .',
      '<#Task> a udfs:ClassTerm ; rdfs:label "任务" ; udfs:status "active" .',
      '<#stage> a udfs:PredicateTerm ; rdfs:label "阶段" ; udfs:predicate <https://undefineds.co/vocab/stage> ; udfs:valueType "enum" ;',
      '  udfs:shape "class udfs:Task · option 待办 · option 进行中 · option 完成 · editor select" .',
      '<#points> a udfs:PredicateTerm ; rdfs:label "点数" ; udfs:predicate <https://undefineds.co/vocab/points> ; udfs:valueType "number" .',
      '<#待办> a udfs:EnumOptionTerm ; rdfs:label "待办" ; udfs:predicate <https://undefineds.co/vocab/stage> .',
      '<#进行中> a udfs:EnumOptionTerm ; rdfs:label "进行中" ; udfs:predicate <https://undefineds.co/vocab/stage> .',
      '<#完成> a udfs:EnumOptionTerm ; rdfs:label "完成" ; udfs:predicate <https://undefineds.co/vocab/stage> .',
      '',
    ].join('\n'))
    await put(new URL('.vocab/shapes.ttl', podUrl).href, [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '<> a udfs:VocabShapeRegistry .',
      `<#stage-shape> a udfs:ShapeRule ; rdfs:label "阶段" ; udfs:term <${termsUri}#stage> ; udfs:classScope "udfs:Task" ; udfs:constraint "maxCount 1" ; udfs:valueType "enum" ; udfs:status "active" .`,
      `<#points-shape> a udfs:ShapeRule ; rdfs:label "点数" ; udfs:term <${termsUri}#points> ; udfs:classScope "udfs:Task" ; udfs:constraint "maxCount 1" ; udfs:valueType "number" ; udfs:status "active" .`,
      '',
    ].join('\n'))
    await put(new URL('.vocab/namespaces.ttl', podUrl).href, [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix sh: <http://www.w3.org/ns/shacl#> .',
      '<> a udfs:VocabNamespaceRegistry .',
      '<#udfs> a udfs:Namespace ; sh:prefix "udfs" ; sh:namespace "https://undefineds.co/vocab/" .',
      '',
    ].join('\n'))

    const stem = `kanban-tasks-${Date.now()}`
    const resourceUri = new URL(`.data/${stem}.ttl`, podUrl).href
    const row = (id: string, stage: string, points: number) =>
      `<#${id}> a udfs:Task ; rdfs:label "${id} task" ; udfs:stage "${stage}" ; udfs:points ${points} .`
    await put(resourceUri, [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      row('Alpha', '待办', 5), row('Beta', '待办', 2), row('Gamma', '进行中', 8), row('Delta', '完成', 1), row('Eps', '进行中', 3),
      '',
    ].join('\n'))

    return {
      stem,
      resourceUri,
      alpha: `${resourceUri}#Alpha`,
      beta: `${resourceUri}#Beta`,
      gamma: `${resourceUri}#Gamma`,
      delta: `${resourceUri}#Delta`,
      eps: `${resourceUri}#Eps`,
    }
  })
}

export async function openTable(page: Page, board: { resourceUri: string; stem: string }) {
  await page.getByRole('navigation').getByRole('button', { name: '文件', exact: true }).click()
  await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
  await page.evaluate(async (uri) => {
    const { useFilesStore } = await import('/src/modules/files/store.ts')
    useFilesStore.getState().selectFile(uri)
  }, board.resourceUri)
  await expect(page.getByRole('heading', { name: board.stem })).toBeVisible({ timeout: 30_000 })
}

export async function cardSubjectsInLane(lane: Locator) {
  return lane.locator('[data-kanban-card-subject]').evaluateAll((elements) => (
    elements.map((element) => element.getAttribute('data-kanban-card-subject'))
  ))
}
