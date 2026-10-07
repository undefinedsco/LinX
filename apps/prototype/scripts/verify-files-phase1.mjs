#!/usr/bin/env node

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const targetUrl = process.env.FILES_PROTOTYPE_URL || 'http://127.0.0.1:5871/'
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const assetsDir = path.join(repoRoot, 'docs/prototype/assets')
const storageKeys = [
  'linx.prototype.files.fileContentsByPath',
  'linx.prototype.files.filePropertiesByPath',
  'linx.prototype.files.sourceReviewStatesByPath',
  'linx.prototype.files.approvedClassNames',
  'linx.prototype.files.discardedClassNames',
  'linx.prototype.files.draftPredicatesByClass',
  'linx.prototype.files.approvedPredicateIds',
  'linx.prototype.files.discardedPredicateIdsByClass',
  'linx.prototype.files.hiddenPredicateIdsByClass',
  'linx.prototype.files.cellOverrides',
  'linx.prototype.files.whiteboardLayouts',
  'linx.prototype.files.sourceIngestStatesBySource',
  'linx.prototype.files.proposalResources',
]

const screenshots = {
  table: 'prototype-files-phase1-table-1440x900.png',
  tiptap: 'prototype-files-phase1-tiptap-sheet-1440x900.png',
  kanban: 'prototype-files-phase1-kanban-1440x900.png',
  whiteboard: 'prototype-files-phase1-whiteboard-1440x900.png',
  mobileTable: 'prototype-files-phase1-mobile-table-390x844.png',
}

const result = {
  ok: false,
  url: targetUrl,
  screenshots: Object.fromEntries(Object.entries(screenshots).map(([name, file]) => [name, `docs/prototype/assets/${file}`])),
  checks: [],
  durationMs: 0,
}

function pass(name, details = {}) {
  result.checks.push({ name, ok: true, ...details })
}

async function click(locator) {
  await locator.first().click()
}

async function clickTreeItem(page, label) {
  const treeRows = page.locator('[aria-label="Pod 文件树"] .tree-row')
  const row = treeRows.filter({ hasText: label }).first()
  await row.waitFor({ state: 'visible' })
  await row.click()
}

async function clickFolderRow(page, label) {
  const row = page.locator('.folder-table-row').filter({ hasText: label }).first()
  await row.waitFor({ state: 'visible' })
  await row.click()
}

async function openView(page, label) {
  await click(page.locator('.structured-tabs .add-view-button'))
  const menu = page.locator('.structured-tabs .view-menu')
  await menu.waitFor({ state: 'visible' })
  await click(menu.getByRole('button', { name: label, exact: true }))
  await page.locator(`.${label.toLowerCase()}-surface`).waitFor({ state: 'visible' })
}

async function expectAccessDialog(page, scope) {
  const dialog = page.locator(`.access-modal-layer[role="dialog"][aria-label="${scope} ACL and ACR"]`)
  await dialog.waitFor({ state: 'visible' })
  await dialog.locator('.file-access-panel').waitFor({ state: 'visible' })
  await dialog.getByRole('button', { name: 'Close access policy' }).click()
  await dialog.waitFor({ state: 'detached' })
}

async function expectContained(page, selectors, name) {
  const overflow = await page.evaluate((currentSelectors) => currentSelectors.flatMap((selector) => (
    Array.from(document.querySelectorAll(selector)).map((node) => {
      const rect = node.getBoundingClientRect()
      return { selector, left: rect.left, right: rect.right, width: rect.width }
    }).filter((item) => item.width > 0 && (item.left < -2 || item.right > window.innerWidth + 2))
  )), selectors)
  if (overflow.length > 0) throw new Error(`${name} overflow: ${JSON.stringify(overflow.slice(0, 5))}`)
  pass(name)
}

let browser
const startedAt = Date.now()

try {
  await mkdir(assetsDir, { recursive: true })
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(15000)
  await page.addInitScript((keys) => {
    const marker = 'linx.prototype.files.verifyStorageReset.v2'
    if (window.sessionStorage.getItem(marker)) return
    keys.forEach((key) => window.localStorage.removeItem(key))
    window.sessionStorage.setItem(marker, '1')
  }, storageKeys)
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  await page.locator('.prototype-shell').waitFor({ state: 'visible' })
  await click(page.locator('.module-nav button[aria-label="文件"]'))
  await page.locator('.prototype-shell[data-module="files"]').waitFor({ state: 'visible' })
  pass('files-nav-opens')

  const tree = page.locator('[aria-label="Pod 文件树"]')
  const main = page.locator('.prototype-shell[data-module="files"]')

  await main.locator('main.structured-work h1').filter({ hasText: '.vocab/terms.ttl' }).waitFor()
  await main.locator('.canonical-vocab-table').waitFor()
  if (await main.locator('.structured-tabs .add-view-button').count() !== 0) {
    throw new Error('Locked vocab must not expose + View')
  }
  pass('vocab-locked-view-hides-add-view')
  await click(main.locator('.files-header button[title="Access"]'))
  await expectAccessDialog(page, 'Vocab')
  pass('vocab-access-modal-opens')

  await clickTreeItem(page, 'shapes.ttl')
  await main.locator('main.structured-work h1').filter({ hasText: '.vocab/shapes.ttl' }).waitFor()
  await main.locator('.canonical-vocab-table').filter({ hasText: 'Source-linked card shape' }).waitFor()
  pass('vocab-shapes-readonly-table')

  await clickTreeItem(page, 'namespaces.ttl')
  await main.locator('main.structured-work h1').filter({ hasText: '.vocab/namespaces.ttl' }).waitFor()
  await main.locator('.canonical-vocab-table').filter({ hasText: 'Undefineds vocabulary' }).waitFor()
  pass('vocab-namespaces-readonly-table')

  await clickTreeItem(page, 'docs')
  await main.locator('main.file-open-work h1').filter({ hasText: 'docs' }).first().waitFor()
  await main.locator('.folder-table').waitFor()
  await main.locator('.folder-table-row').first().waitFor()
  pass('folder-opens-finder-table')

  await click(main.locator('.files-header button[title="Access"]'))
  await expectAccessDialog(page, 'Folder')
  await click(main.locator('.files-header button[title="Show .meta"]'))
  await main.locator('.meta-side').filter({ hasText: 'docs.meta' }).waitFor()
  await click(main.locator('.files-header button[title="Hide .meta"]'))
  await main.locator('.meta-side').waitFor({ state: 'detached' })
  pass('folder-meta-drawer-toggles')

  await click(main.locator('.folder-viewbar button[title="Grid"]'))
  await main.locator('.folder-grid-view').waitFor()
  await click(main.locator('.folder-viewbar button[title="Table"]'))
  await main.locator('.folder-table-row').first().waitFor()
  pass('folder-table-grid-switches')

  await clickFolderRow(page, 'prototype-layout.png')
  await main.locator('main.file-open-work h1').filter({ hasText: 'prototype-layout.png' }).first().waitFor()
  await main.locator('.file-preview-surface.image.readonly').waitFor()
  pass('image-opens-readonly-preview')

  await clickTreeItem(page, 'docs')
  await clickFolderRow(page, 'multi-channel-access.md')
  await main.locator('.doc-preview').waitFor()
  await main.getByRole('button', { name: '编辑', exact: true }).waitFor()
  pass('editable-file-opens-readonly-preview')
  await click(main.getByRole('button', { name: '编辑', exact: true }))
  await page.locator('.file-detail-layer[role="dialog"]').waitFor()
  await page.locator('.rich-editor-shell [contenteditable="true"]').waitFor()
  await page.screenshot({ path: path.join(assetsDir, screenshots.tiptap), fullPage: true })
  await page.locator('[aria-label="Close file detail"]').click()
  await page.locator('.file-detail-layer[role="dialog"]').waitFor({ state: 'detached' })
  pass('editable-file-explicitly-opens-rich-editor')

  await clickTreeItem(page, 'docs')
  await clickFolderRow(page, 'linx-prototype.ttl')
  await main.locator('main.structured-work h1').filter({ hasText: '/files/docs/linx-prototype.ttl' }).waitFor()
  await main.locator('.subject-grid').waitFor()
  await main.locator('.subject-head .schema-head-label').first().waitFor()
  if ((await main.locator('.subject-head .schema-head-label').first().innerText()).trim() !== 'Subject') {
    throw new Error('Structured table must expose Subject as the first schema column')
  }
  pass('structured-table-uses-subject-first-schema')
  await page.screenshot({ path: path.join(assetsDir, screenshots.table), fullPage: true })

  await click(main.locator('.class-scope-button'))
  await main.locator('.structured-filter-menu').waitFor()
  await main.locator('.class-filter-pick').filter({ hasText: 'GrantPage' }).waitFor()
  pass('structured-class-filter-is-collapsed-menu')
  await page.keyboard.press('Escape')

  await click(main.locator('button[aria-label="列与命名空间"]'))
  await main.locator('.predicate-visibility-menu').waitFor()
  await main.locator('.predicate-visibility-menu [role="switch"]').waitFor()
  await page.keyboard.press('Escape')
  pass('structured-predicate-and-namespace-visibility-menu')
  await page.waitForTimeout(50)

  await openView(page, 'Raw')
  await main.locator('.raw-surface pre[data-raw-format="text/turtle"]').waitFor()
  pass('structured-raw-view')
  await click(main.locator('.structured-tabs button[title="Table"]'))
  await openView(page, 'Kanban')
  await main.locator('.kanban-surface').waitFor()
  await page.screenshot({ path: path.join(assetsDir, screenshots.kanban), fullPage: true })
  pass('structured-kanban-view')
  await click(main.locator('.structured-tabs button[title="Table"]'))
  await openView(page, 'Whiteboard')
  await main.locator('.whiteboard-surface').waitFor()
  await main.locator('[data-whiteboard-shape="subject-card"]').first().waitFor()
  await page.screenshot({ path: path.join(assetsDir, screenshots.whiteboard), fullPage: true })
  pass('structured-whiteboard-view')

  await clickTreeItem(page, 'docs')
  await clickFolderRow(page, 'empty-notes.ttl')
  await main.locator('main.structured-work h1').filter({ hasText: 'empty-notes.ttl' }).waitFor()
  await main.locator('.empty-state').filter({ hasText: '还没有任何 class' }).waitFor()
  await main.locator('.class-scope-button[title="选择 Class"]').waitFor()
  await click(main.locator('.class-scope-button[title="选择 Class"]'))
  await main.locator('.class-create-trigger').waitFor()
  pass('empty-ttl-guides-class-creation')

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
  mobile.setDefaultTimeout(15000)
  await mobile.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  await click(mobile.locator('.module-nav button[aria-label="文件"]'))
  await mobile.locator('.prototype-shell[data-module="files"]').waitFor()
  await expectContained(mobile, ['.prototype-shell[data-module="files"]', '.work-pane'], 'mobile-files-layout-contained')
  await mobile.screenshot({ path: path.join(assetsDir, screenshots.mobileTable), fullPage: true })
  await mobile.close()

  result.ok = true
} catch (error) {
  result.error = {
    name: error?.name || 'Error',
    message: error?.message || String(error),
  }
} finally {
  result.durationMs = Date.now() - startedAt
  if (browser) await browser.close()
  console.log(JSON.stringify(result))
  if (!result.ok) process.exitCode = 1
}
