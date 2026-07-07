import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { loginToSeededXpod } from '../helpers/seeded-auth-flow'
import { startSeededXpodRuntime, type SeededXpodRuntime } from '../helpers/seeded-xpod-runtime'

type AuditSeed = {
  podUrl: string
  folderName: string
  folderUri: string
  folderMetaUri: string
  markdownName: string
  markdownUri: string
  markdownMetaUri: string
  markdownTitle: string
  turtleName: string
  turtleUri: string
  turtleMetaUri: string
  workspaceSubject: string
  otherSubject: string
}

function repoRoot() {
  const cwd = path.resolve(process.cwd())
  return cwd.endsWith(`${path.sep}tests${path.sep}e2e`) ? path.resolve(cwd, '../..') : cwd
}

const auditDir = path.resolve(repoRoot(), '.omx/artifacts/files-production-visual-audit/2026-07-02')

function ensureAuditDir() {
  mkdirSync(auditDir, { recursive: true })
}

async function capture(page: Page, name: string) {
  ensureAuditDir()
  await page.screenshot({
    path: path.join(auditDir, `${name}.png`),
    fullPage: false,
    animations: 'disabled',
  })
}

async function openFiles(page: Page) {
  const filesNavButton = page.getByRole('navigation').getByRole('button', { name: '文件', exact: true })
  await expect(filesNavButton).toBeVisible({ timeout: 30_000 })
  await filesNavButton.click()
  await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByLabel('文件工作区')).toBeVisible({ timeout: 30_000 })
}

async function selectResource(page: Page, resourceUri: string) {
  await page.evaluate(async ({ uri }) => {
    const { useFilesStore } = await import('/src/modules/files/store.ts')
    useFilesStore.getState().selectFile(uri)
  }, { uri: resourceUri })
}

async function closeMetaDrawer(page: Page) {
  const closeButton = page.getByRole('button', { name: '关闭 .meta inspector' })
  if (await closeButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await closeButton.click()
    await expect(page.getByLabel('Resource .meta inspector')).toHaveCount(0)
  }
}

async function seedAuditResources(page: Page): Promise<AuditSeed> {
  return page.evaluate(async () => {
    const db = (window as any).__SOLID_DB__
    const podUrl = (window as any).__SOLID_DB_POD_URL__
    const authFetch = db?.getDialect?.()?.getAuthenticatedFetch?.()
    if (!podUrl || !authFetch) {
      throw new Error('Solid DB authenticated fetch is not ready.')
    }
    const { filesAppMetaResourceUri, filesMetaInsertDataPatch } = await import('/src/modules/files/files-rdf-contract.ts')

    const ensureContainer = async (resourcePath: string) => {
      const normalizedPath = resourcePath.endsWith('/') ? resourcePath : `${resourcePath}/`
      const uri = new URL(normalizedPath, podUrl).href
      const existing = await authFetch(uri)
      if (existing.ok) return uri

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
      return uri
    }

    const putText = async (uri: string, contentType: string, body: string) => {
      const response = await authFetch(uri, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body,
      })
      if (!response.ok) {
        throw new Error(`failed to write ${uri}: ${response.status} ${await response.text()}`)
      }
    }

    const writeMeta = async (ownerUri: string, body: string) => {
      const metaUri = filesAppMetaResourceUri(ownerUri, { currentPodRootUri: podUrl })
      const response = await authFetch(metaUri, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: filesMetaInsertDataPatch(metaUri, body),
      })
      if (!response.ok) {
        throw new Error(`failed to write meta ${metaUri}: ${response.status} ${await response.text()}`)
      }
      return metaUri
    }

    await ensureContainer('.data/')
    await ensureContainer('.vocab/')

    const stamp = Date.now()
    const folderName = `files-visual-audit-${stamp}`
    const folderUri = await ensureContainer(`${folderName}/`)
    const markdownName = 'audit-note.md'
    const markdownUri = new URL(markdownName, folderUri).href
    const imageUri = new URL('diagram.png', folderUri).href
    const childTurtleUri = new URL('folder-graph.ttl', folderUri).href
    const turtleUri = new URL(`.data/visual-audit-${stamp}.ttl`, podUrl).href
    const termsUri = new URL('.vocab/terms.ttl', podUrl).href
    const shapesUri = new URL('.vocab/shapes.ttl', podUrl).href
    const namespacesUri = new URL('.vocab/namespaces.ttl', podUrl).href

    const termsContent = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '<> a udfs:VocabTermRegistry .',
      '<#Workspace> a udfs:ClassTerm ;',
      '  rdfs:label "Workspace" ;',
      '  rdfs:comment "Personal workspace class." ;',
      '  udfs:status "active" .',
      '<#title> a udfs:PredicateTerm ;',
      '  rdfs:label "title" ;',
      '  rdfs:comment "Human-readable subject title." ;',
      '  udfs:predicate <https://undefineds.co/vocab/title> ;',
      '  udfs:valueType "text" .',
      '<#status> a udfs:PredicateTerm ;',
      '  rdfs:label "status" ;',
      '  rdfs:comment "Review status." ;',
      '  udfs:predicate <https://undefineds.co/vocab/status> ;',
      '  udfs:valueType "enum" ;',
      '  udfs:shape "class udfs:Workspace · option Draft · option Ready · option Blocked · editor select" .',
      '<#mode> a udfs:PredicateTerm ;',
      '  rdfs:label "mode" ;',
      '  rdfs:comment "Workflow lane." ;',
      '  udfs:predicate <https://undefineds.co/vocab/mode> ;',
      '  udfs:valueType "enum" ;',
      '  udfs:shape "class udfs:Workspace · option queue · option ready · option shipped · editor select" .',
      '<#related> a udfs:PredicateTerm ;',
      '  rdfs:label "related" ;',
      '  rdfs:comment "Related subject." ;',
      '  udfs:predicate <https://undefineds.co/vocab/related> ;',
      '  udfs:valueType "relation" .',
      '<#Draft> a udfs:EnumOptionTerm ;',
      '  rdfs:label "Draft" ;',
      '  udfs:predicate <https://undefineds.co/vocab/status> .',
      '<#Ready> a udfs:EnumOptionTerm ;',
      '  rdfs:label "Ready" ;',
      '  udfs:predicate <https://undefineds.co/vocab/status> .',
      '<#Blocked> a udfs:EnumOptionTerm ;',
      '  rdfs:label "Blocked" ;',
      '  udfs:predicate <https://undefineds.co/vocab/status> .',
      '',
    ].join('\n')
    const shapesContent = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '<> a udfs:VocabShapeRegistry .',
      '<#status-shape> a udfs:ShapeRule ;',
      '  rdfs:label "Status shape" ;',
      `  udfs:term <${termsUri}#status> ;`,
      '  udfs:classScope "udfs:Workspace" ;',
      '  udfs:constraint "maxCount 1" ;',
      '  udfs:valueType "enum" ;',
      '  udfs:status "active" .',
      '<#related-shape> a udfs:ShapeRule ;',
      '  rdfs:label "Related subject shape" ;',
      `  udfs:term <${termsUri}#related> ;`,
      '  udfs:classScope "udfs:Workspace" ;',
      '  udfs:constraint "range resource" ;',
      '  udfs:valueType "relation" ;',
      '  udfs:status "active" .',
      '',
    ].join('\n')
    const namespacesContent = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix sh: <http://www.w3.org/ns/shacl#> .',
      '<> a udfs:VocabNamespaceRegistry .',
      '<#udfs> a udfs:Namespace ;',
      '  sh:prefix "udfs" ;',
      '  sh:namespace "https://undefineds.co/vocab/" .',
      '',
    ].join('\n')
    const dataContent = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '<#Workspace> a udfs:Workspace ;',
      '  udfs:title "Visual Audit Workspace" ;',
      '  udfs:status "Draft" ;',
      '  udfs:mode "queue" ;',
      '  udfs:related <#Other> .',
      '<#Other> a udfs:Workspace ;',
      '  udfs:title "Visual Audit Peer" ;',
      '  udfs:status "Ready" ;',
      '  udfs:mode "ready" .',
      '',
    ].join('\n')
    const childTurtleContent = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '<#FolderGraph> a udfs:Workspace ;',
      '  udfs:title "Folder Graph" ;',
      '  udfs:mode "ready" .',
      '',
    ].join('\n')
    const markdownContent = [
      '# Visual Audit Note',
      '',
      'This is a real editable markdown resource opened through the Files detail sheet.',
      '',
      'The editor sheet should keep content primary and put file meta at the bottom.',
    ].join('\n')
    const folderMetaContent = [
      '@prefix dcterms: <http://purl.org/dc/terms/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '',
      `<${folderUri}>`,
      '  rdfs:label "Visual audit folder" ;',
      '  dcterms:description "Finder-style folder detail audit." ;',
      '  udfs:reviewStatus "Ready" .',
      '',
    ].join('\n')
    const markdownMetaContent = [
      '@prefix dcterms: <http://purl.org/dc/terms/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '',
      '<#meta> rdfs:label "Visual Audit Note" ;',
      '  dcterms:source <https://source.example/files-visual-audit> ;',
      '  udfs:tags "files", "audit" ;',
      `  udfs:vocab <${termsUri}> .`,
      '',
    ].join('\n')
    const turtleMetaContent = [
      '@prefix dcterms: <http://purl.org/dc/terms/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '',
      `<${turtleUri}>`,
      '  rdfs:label "Visual Audit Workspace Table" ;',
      `  udfs:vocab <${termsUri}> ;`,
      `  udfs:shape <${shapesUri}#status-shape> ;`,
      '  dcterms:description "Structured table visual audit data." .',
      '',
    ].join('\n')

    await Promise.all([
      putText(termsUri, 'text/turtle', termsContent),
      putText(shapesUri, 'text/turtle', shapesContent),
      putText(namespacesUri, 'text/turtle', namespacesContent),
      putText(turtleUri, 'text/turtle', dataContent),
      putText(childTurtleUri, 'text/turtle', childTurtleContent),
      putText(markdownUri, 'text/markdown', markdownContent),
      putText(imageUri, 'image/png', 'visual-audit-image-placeholder'),
    ])
    const [folderMetaUri, markdownMetaUri, turtleMetaUri] = await Promise.all([
      writeMeta(folderUri, folderMetaContent),
      writeMeta(markdownUri, markdownMetaContent),
      writeMeta(turtleUri, turtleMetaContent),
    ])

    return {
      podUrl,
      folderName,
      folderUri,
      folderMetaUri,
      markdownName,
      markdownUri,
      markdownMetaUri,
      markdownTitle: 'Visual Audit Note',
      turtleName: new URL(turtleUri).pathname.split('/').filter(Boolean).at(-1)!,
      turtleUri,
      turtleMetaUri,
      workspaceSubject: `${turtleUri}#Workspace`,
      otherSubject: `${turtleUri}#Other`,
    }
  })
}

async function openStructuredTable(
  page: Page,
  seed: AuditSeed,
  options: { requireTitleVisible?: boolean } = {},
) {
  await selectResource(page, seed.turtleUri)
  const workspace = page.getByLabel('文件工作区')
  if (options.requireTitleVisible !== false) {
    await expect(workspace.getByText(seed.turtleName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  }
  const tableButton = page.getByRole('button', { name: 'Table' })
  await expect(tableButton).toBeVisible({ timeout: 30_000 })
  await tableButton.click()
  await expect(page.getByRole('button', { name: '当前 class：Workspace' })).toBeVisible({ timeout: 30_000 })
  await expect(workspace.getByRole('button', { name: '#Workspace', exact: true })).toBeVisible()
  await expect(workspace.getByText('"Visual Audit Workspace"')).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

test.describe('Files production visual audit', () => {
  let runtime: SeededXpodRuntime

  test.beforeAll(async ({}, testInfo) => {
    testInfo.setTimeout(120_000)
    runtime = await startSeededXpodRuntime()
  })

  test.afterAll(async () => {
    await runtime?.stop()
  })

  test('captures current Files module interaction surfaces', async ({ page }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    await loginToSeededXpod(page, runtime)
    const seed = await seedAuditResources(page)
    await openFiles(page)

    await selectResource(page, seed.folderUri)
    await expect(page.getByLabel('文件工作区').getByText(seed.folderName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    const folderList = page.getByLabel('Folder list view')
    await expect(folderList).toBeVisible()
    await expect(folderList.getByRole('button', { name: seed.markdownName })).toBeVisible()
    await expect(folderList.getByRole('button', { name: 'folder-graph.ttl' })).toBeVisible()
    await capture(page, '01-folder-finder-detail-1440x900')

    await page.getByRole('button', { name: '查看 .meta' }).click()
    await expect(page.getByLabel('Resource .meta inspector')).toContainText(seed.folderMetaUri)
    await capture(page, '02-folder-meta-drawer-1440x900')
    await closeMetaDrawer(page)

    await page.getByRole('button', { name: '查看 Access 来源' }).click()
    await expect(page.getByRole('dialog', { name: '权限' })).toBeVisible({ timeout: 30_000 })
    await capture(page, '03-access-modal-1440x900')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '权限' })).toHaveCount(0)

    await selectResource(page, seed.markdownUri)
    await expect(page.getByLabel('文件工作区').getByText(seed.markdownName, { exact: true }).first()).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: '打开文件详情' }).click()
    const editorSheet = page.getByRole('dialog', { name: seed.markdownTitle })
    await expect(editorSheet).toBeVisible({ timeout: 30_000 })
    await expect(editorSheet.getByTestId('rich-text-file-editor')).toBeVisible()
    await expect(editorSheet.getByLabel('文件 meta')).toContainText(seed.markdownMetaUri)
    await capture(page, '04-editable-file-sheet-1440x900')
    await editorSheet.getByRole('button', { name: 'Close' }).click()
    await expect(editorSheet).toHaveCount(0)

    await openStructuredTable(page, seed)
    await expect(page.getByRole('separator', { name: '调整 subject 列宽' })).toBeVisible()
    await capture(page, '05-structured-table-1440x900')

    await page.getByRole('button', { name: '+ predicate' }).click()
    await expect(page.getByRole('textbox', { name: '选择或创建 predicate' })).toBeVisible()
    const createPredicateButton = page.getByRole('button', { name: '新建 predicate' })
    await expect(createPredicateButton).toBeVisible({ timeout: 5_000 })
    await createPredicateButton.click()
    await expect(page.getByLabel('predicate term')).toBeVisible()
    await capture(page, '06-predicate-menu-1440x900')
    await page.keyboard.press('Escape')

    const workspaceRow = page.getByRole('row', { name: /#Workspace/ })
    const statusCell = workspaceRow.getByRole('cell', { name: 'Draft' })
    await expect(statusCell).toBeVisible({ timeout: 30_000 })
    await statusCell.click()
    const statusEditor = page.getByRole('combobox', { name: /编辑 .*#Workspace 的 status/ })
    await expect(statusEditor).toBeVisible({ timeout: 30_000 })
    await statusEditor.fill('Re')
    await expect(page.getByRole('listbox', { name: /#Workspace 的 status 选项/ })).toBeVisible()
    await capture(page, '07-enum-cell-menu-1440x900')
    await page.keyboard.press('Escape')

    await page.getByRole('button', { name: '查看 .meta' }).click()
    await expect(page.getByLabel('Resource .meta inspector')).toContainText(seed.turtleMetaUri)
    await capture(page, '08-structured-meta-drawer-1440x900')
    await closeMetaDrawer(page)

    await page.getByRole('button', { name: '+ 视图' }).click()
    await page.getByRole('menuitem', { name: 'Kanban' }).click()
    await expect(page.getByRole('button', { name: 'Kanban', exact: true })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Kanban 分组 predicate' }).click()
    await page.getByRole('menuitem', { name: 'mode' }).click()
    await expect(page.getByLabel('Kanban column queue')).toBeVisible({ timeout: 30_000 })
    await capture(page, '09-kanban-1440x900')

    await page.getByRole('button', { name: '+ 视图' }).click()
    await page.getByRole('menuitem', { name: 'Whiteboard' }).click()
    await expect(page.getByRole('button', { name: 'Whiteboard', exact: true })).toBeVisible({ timeout: 30_000 })
    for (const subject of ['#Workspace', '#Other']) {
      await page.getByRole('button', { name: '白板工具' }).click()
      const subjectItem = page.getByRole('menuitem').filter({ hasText: subject }).first()
      await expect(subjectItem).toBeVisible({ timeout: 5_000 })
      await subjectItem.click()
    }
    await expect(page.locator(`[data-whiteboard-subject="${seed.workspaceSubject}"]`)).toHaveCount(1)
    await expect(page.locator(`[data-whiteboard-subject="${seed.otherSubject}"]`)).toHaveCount(1)
    await page.getByRole('button', { name: '白板工具' }).click()
    await page.getByRole('menuitem', { name: '添加视觉关系' }).click()
    await page.getByLabel('Relation label').fill('audit relation')
    await page.getByRole('button', { name: '创建视觉关系' }).click()
    await expect(page.locator('[data-whiteboard-relation-source="visual"]')).toHaveCount(1)
    await capture(page, '10-whiteboard-1440x900')

    await page.setViewportSize({ width: 390, height: 844 })
    await selectResource(page, seed.turtleUri)
    await expect(page.locator('[data-micro-app-id="files"]')).toBeVisible()
    await expect(page.getByLabel('文件工作区')).toHaveCount(1)
    await expect(page.getByTestId('micro-app-list-panel')).toHaveCount(0)
    const mobileWorkspaceBox = await page.getByLabel('文件工作区').boundingBox()
    expect(mobileWorkspaceBox?.x ?? Number.POSITIVE_INFINITY).toBeLessThan(72)
    await expect(page.locator('[data-structured-toolbar-scroll="view-actions"]')).toBeVisible()
    await expect(page.locator('[data-structured-toolbar-scroll="subject-tools"]')).toBeVisible()
    await expect(page.locator('[data-whiteboard-toolbar-scroll="actions"]')).toBeVisible()
    await expect(page.locator('[data-whiteboard-canvas-scroll="true"]')).toBeVisible()
    await capture(page, '11-mobile-current-files-layout-390x844')
  })
})
