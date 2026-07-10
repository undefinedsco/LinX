#!/usr/bin/env node

import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const targetUrl = process.env.FILES_PROTOTYPE_URL || 'http://127.0.0.1:5871/'
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const assetsDir = path.join(repoRoot, 'docs/prototype/assets')
const typedText = `Phase 1 verifier typed ${Date.now()}`
const startedAt = Date.now()
const prototypeStorageKeys = [
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
  'linx.prototype.files.sourceIndexStatesBySource',
  'linx.prototype.files.parserIndexStatesBySource',
  'linx.prototype.files.proposalResources',
]

const screenshots = {
  table: path.join(assetsDir, 'prototype-files-phase1-table-1440x900.png'),
  subjectPeek: path.join(assetsDir, 'prototype-files-phase1-subject-peek-1440x900.png'),
  subjectSource: path.join(assetsDir, 'prototype-files-phase1-subject-source-1440x900.png'),
  tiptap: path.join(assetsDir, 'prototype-files-phase1-tiptap-sheet-1440x900.png'),
  kanban: path.join(assetsDir, 'prototype-files-phase1-kanban-1440x900.png'),
  whiteboard: path.join(assetsDir, 'prototype-files-phase1-whiteboard-1440x900.png'),
  mobileTable: path.join(assetsDir, 'prototype-files-phase1-mobile-table-390x844.png'),
  mobileTiptap: path.join(assetsDir, 'prototype-files-phase1-mobile-tiptap-sheet-390x844.png'),
}

const result = {
  ok: false,
  url: targetUrl,
  screenshots: Object.fromEntries(
    Object.entries(screenshots).map(([name, filePath]) => [name, path.relative(repoRoot, filePath)]),
  ),
  checks: [],
  durationMs: 0,
}

function pass(name, details = {}) {
  result.checks.push({ name, ok: true, ...details })
}

function toFailure(error) {
  return {
    name: error?.name || 'Error',
    message: error?.message || String(error),
  }
}

async function expectCountAtLeast(page, selector, minimum, name, timeout = 10000) {
  await page.waitForFunction(
    ({ selector: currentSelector, minimum: currentMinimum }) => {
      return document.querySelectorAll(currentSelector).length >= currentMinimum
    },
    { selector, minimum },
    { timeout },
  )
  const count = await page.locator(selector).count()
  pass(name, { count })
  return count
}

async function clickTreeItem(page, label) {
  const mobileTreeButton = page.locator('.mobile-files-tree-button')
  if (await mobileTreeButton.isVisible().catch(() => false)) {
    const treeOpen = await page.locator('.tree-pane.mobile-open').count()
    if (treeOpen === 0) {
      await dispatchDomClick(mobileTreeButton)
      await page.waitForFunction(() => {
        const tree = document.querySelector('.tree-pane.mobile-open')
        if (!(tree instanceof HTMLElement)) return false
        return tree.getBoundingClientRect().left >= -1
      })
    }
  }
  await dispatchDomClick(page.locator('.folder-tree button').filter({ hasText: label }).first())
}

async function clickFileTreeItem(page, label) {
  await dispatchDomClick(page.locator('[aria-label="Pod file tree"]').getByRole('button', { name: label, exact: true }))
}

async function chooseView(page, label) {
  await dispatchDomClick(page.locator('.structured-tabs .add-view-button'))
  await page.locator('.structured-tabs .view-menu').waitFor({ state: 'visible' })
  await dispatchDomClick(page.locator('.structured-tabs .view-menu button').filter({ hasText: label }).first())
}

async function expectViewMenuExcludes(page, label, name) {
  await dispatchDomClick(page.locator('.structured-tabs .add-view-button'))
  await page.locator('.structured-tabs .view-menu').waitFor({ state: 'visible' })
  const optionCount = await page.locator('.structured-tabs .view-menu button').filter({ hasText: label }).count()
  if (optionCount !== 0) {
    throw new Error(`Expected + View menu to hide ${label}, found ${optionCount}`)
  }
  await dispatchDomClick(page.locator('.structured-tabs .add-view-button'))
  await page.locator('.structured-tabs .view-menu').waitFor({ state: 'detached' })
  pass(name)
}

async function ensureStructuredSearchOpen(page) {
  const input = page.locator('.structured-search-input').first()
  const visible = await input.isVisible().catch(() => false)
  if (!visible) {
    await dispatchDomClick(page.locator('button[aria-label="Search structured table"]'))
  }
  await input.waitFor({ state: 'visible' })
  return input
}

async function dispatchClick(locator) {
  await locator.click()
}

async function dispatchDomClick(locator) {
  await locator.evaluate((node) => {
    if (node instanceof HTMLElement) node.click()
  })
}

async function setDomInputValue(locator, value) {
  await locator.evaluate((node, nextValue) => {
    if (!(node instanceof HTMLInputElement)) return
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(node, nextValue)
    node.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

const expectedAccessPolicy = {
  File: { kind: 'ACL', sidecar: '.acl' },
  Folder: { kind: 'ACR', sidecar: '.acr' },
  Vocab: { kind: 'ACR', sidecar: '.acr' },
}

async function expectAccessDialog(page, scope, name) {
  const policy = expectedAccessPolicy[scope]
  const dialog = page.locator(`.access-modal-layer[role="dialog"][aria-label="${scope} ACL and ACR"]`)
  await dialog.waitFor()
  await dialog.locator(`.file-access-panel[data-access-kind="${policy.kind}"][data-access-sidecar="${policy.sidecar}"]`).waitFor()
  await dialog.filter({ hasText: 'ACL' }).waitFor()
  await dialog.filter({ hasText: 'ACR' }).waitFor()
  await dialog.filter({ hasText: 'Effective policy' }).waitFor()
  await dialog.filter({ hasText: policy.kind }).waitFor()
  await dialog.filter({ hasText: policy.sidecar }).waitFor()
  await dialog.getByRole('button', { name: 'Open policy source' }).waitFor()
  await dispatchClick(dialog.locator('button[aria-label="Close access policy"]').last())
  await dialog.waitFor({ state: 'detached' })
  pass(name, policy)
}

async function expectProposalResource(page, { kind, action, target, scope }, name) {
  const records = await page.evaluate(() => {
    return JSON.parse(window.localStorage.getItem('linx.prototype.files.proposalResources') || '[]')
  })
  const match = records.find((record) => (
    record.kind === kind
    && record.action === action
    && record.target === target
    && record.scope === scope
    && typeof record.uri === 'string'
    && record.uri.startsWith('/.data/proposals/')
  ))
  if (!match) {
    throw new Error(`Missing proposal resource ${kind}:${scope}:${target}:${action}; records=${JSON.stringify(records)}`)
  }
  pass(name, { uri: match.uri })
}

async function expectViewportContained(page, selectors, name) {
  const overflowing = await page.evaluate((targetSelectors) => {
    const viewportWidth = window.innerWidth
    return targetSelectors.flatMap((selector) => (
      Array.from(document.querySelectorAll(selector))
        .filter((node) => {
          const rect = node.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
        .map((node) => {
          const rect = node.getBoundingClientRect()
          return {
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            selector,
            viewportWidth,
            width: Math.round(rect.width),
          }
        })
    )).filter((item) => item.left < -2 || item.right > item.viewportWidth + 2)
  }, selectors)

  if (overflowing.length) {
    throw new Error(`${name} viewport overflow: ${JSON.stringify(overflowing.slice(0, 5))}`)
  }

  pass(name)
}

let browser

try {
  await mkdir(assetsDir, { recursive: true })

  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(15000)
  await page.addInitScript((keys) => {
    const resetMarker = 'linx.prototype.files.verifyStorageReset'
    if (window.sessionStorage.getItem(resetMarker)) return
    keys.forEach((key) => window.localStorage.removeItem(key))
    window.sessionStorage.setItem(resetMarker, '1')
  }, prototypeStorageKeys)

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  await page.locator('.prototype-shell').waitFor({ state: 'visible' })

  await dispatchClick(page.locator('.module-nav button[aria-label="文件"]'))
  await page.locator('.prototype-shell[data-module="files"]').waitFor({ state: 'visible' })
  pass('files-nav-opens')

  const shell = page.locator('.prototype-shell[data-module="files"]')
  const metaDrawer = page.locator('.detail-pane.resource-detail')
  const editorLayer = page.locator('.file-detail-layer[role="dialog"]')

  const initialAddViewButtons = await page.locator('.prototype-shell[data-module="files"] .structured-tabs .add-view-button').count()
  if (initialAddViewButtons !== 0) {
    throw new Error(`Expected locked vocab view to hide + View, found ${initialAddViewButtons}`)
  }
  await page.locator('main.structured-work h1', { hasText: '.vocab/terms.ttl' }).waitFor()
  await page.locator('.canonical-vocab-table').waitFor()
  pass('vocab-locked-view-hides-add-view')
  await dispatchClick(page.locator('.files-header button[title="Access"]').first())
  await expectAccessDialog(page, 'Vocab', 'vocab-access-modal-opens')

  await clickFileTreeItem(page, 'shapes.ttl')
  await page.locator('main.structured-work h1', { hasText: '.vocab/shapes.ttl' }).waitFor()
  await page.locator('.canonical-vocab-table').filter({ hasText: 'Source-linked card shape' }).waitFor()
  const shapeAddViewButtons = await page.locator('.prototype-shell[data-module="files"] .structured-tabs .add-view-button').count()
  if (shapeAddViewButtons !== 0) {
    throw new Error(`Expected locked shape registry to hide + View, found ${shapeAddViewButtons}`)
  }
  await dispatchClick(page.locator('.files-header button[title="Show .meta"]').first())
  await page.locator('.detail-pane.resource-detail').filter({ hasText: 'shapes.ttl.meta' }).waitFor()
  pass('vocab-shapes-registry-opens-readonly-table')

  await clickFileTreeItem(page, 'namespaces.ttl')
  await page.locator('main.structured-work h1', { hasText: '.vocab/namespaces.ttl' }).waitFor()
  await page.locator('.canonical-vocab-table').filter({ hasText: 'Undefineds vocabulary' }).waitFor()
  const namespaceAddViewButtons = await page.locator('.prototype-shell[data-module="files"] .structured-tabs .add-view-button').count()
  if (namespaceAddViewButtons !== 0) {
    throw new Error(`Expected locked namespace registry to hide + View, found ${namespaceAddViewButtons}`)
  }
  await page.locator('.detail-pane.resource-detail').filter({ hasText: 'namespaces.ttl.meta' }).waitFor()
  pass('vocab-namespaces-registry-opens-readonly-table')

  await clickFileTreeItem(page, 'docs')
  await page.locator('main.file-open-work h1', { hasText: 'docs' }).waitFor()
  await page.locator('.folder-browser-list[aria-label="docs children"]').waitFor()
  pass('tree-folder-opens-folder-browser')
  await dispatchClick(page.locator('.files-header button[title="Access"]').first())
  await expectAccessDialog(page, 'Folder', 'folder-access-modal-opens')
  await dispatchClick(page.locator('.files-header button[title="Hide .meta"]').first())
  await metaDrawer.waitFor({ state: 'detached' })

  await dispatchClick(page.locator('button[aria-label="Folder icon view"]'))
  await page.locator('.folder-browser[data-view="icon"]').waitFor()
  await dispatchClick(page.locator('button[aria-label="Folder column view"]'))
  await page.locator('.folder-browser[data-view="column"]').waitFor()
  await dispatchClick(page.locator('button[aria-label="Folder list view"]'))
  await page.locator('.folder-browser[data-view="list"]').waitFor()
  pass('folder-view-mode-switches')

  await dispatchClick(page.locator('.folder-child[data-resource-name="prototype-layout.png"][data-resource-kind="readonly-image"]'))
  await page.locator('.folder-preview-pane[aria-label="Selected folder item preview"][data-selected-resource="prototype-layout.png"]').waitFor()
  await page.locator('.folder-preview-card[data-folder-preview="image"]').filter({ hasText: 'Image preview' }).waitFor()
  await editorLayer.waitFor({ state: 'detached' })
  pass('folder-child-image-updates-preview-without-editor')

  await dispatchClick(page.locator('.folder-child[data-resource-name="multi-channel-access.md"][data-resource-kind="editable-file"]'))
  await page.locator('.folder-preview-pane[data-selected-resource="multi-channel-access.md"]').waitFor()
  await dispatchClick(page.locator('.folder-open-child'))
  await page.locator('.file-detail-layer[role="dialog"][aria-label="multi-channel-access.md detail"]').waitFor()
  await page.locator('.rich-editor-shell[aria-label="multi-channel-access.md editor"] [contenteditable="true"]').waitFor()
  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await editorLayer.waitFor({ state: 'detached' })
  pass('folder-child-document-opens-tiptap-sheet')

  await dispatchClick(page.locator('.folder-child[data-resource-name="files-module-notes.md"][data-resource-kind="editable-file"]'))
  await page.locator('.folder-preview-pane[data-selected-resource="files-module-notes.md"]').waitFor()
  await dispatchClick(page.locator('.folder-open-child'))
  await page.locator('.file-detail-layer[role="dialog"][aria-label="files-module-notes.md detail"]').filter({ hasText: '/files/docs/files-module-notes.md' }).waitFor()
  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await editorLayer.waitFor({ state: 'detached' })
  pass('folder-child-document-opens-its-own-file-detail')

  await dispatchClick(page.locator('.folder-child[data-resource-name="linx-prototype.ttl"][data-resource-kind="structured-data"]'))
  await page.locator('.folder-preview-pane[data-selected-resource="linx-prototype.ttl"]').waitFor()
  await page.locator('.folder-preview-card[data-folder-preview="structured-data"]').waitFor()
  await dispatchClick(page.locator('.folder-open-child'))
  await page.locator('main.structured-work h1', { hasText: '.data/workspaces/linx-prototype.ttl' }).waitFor()
  pass('folder-child-ttl-opens-structured-table')

  await clickFileTreeItem(page, 'docs')
  await page.locator('main.file-open-work h1', { hasText: 'docs' }).waitFor()

  await dispatchClick(page.locator('.files-header button[title="Show .meta"]').first())
  await metaDrawer.filter({ hasText: 'docs.meta' }).waitFor()
  const shellExpandedForFolder = await shell.evaluate((node) => !node.classList.contains('files-detail-collapsed'))
  if (!shellExpandedForFolder) {
    throw new Error('Expected folder meta drawer to expand the files shell')
  }
  pass('folder-meta-drawer-opens')

  await dispatchClick(page.locator('.files-header button[title="Hide .meta"]').first())
  await metaDrawer.waitFor({ state: 'detached' })
  await page.locator('.prototype-shell.files-detail-collapsed').waitFor()
  pass('folder-meta-drawer-closes')

  await dispatchClick(page.locator('.files-header button[title="Show .meta"]').first())
  await metaDrawer.filter({ hasText: 'docs.meta' }).waitFor()

  await clickFileTreeItem(page, 'multi-channel-access.md')
  await page.locator('.file-detail-layer[role="dialog"][aria-label="multi-channel-access.md detail"]').waitFor()
  await page.locator('.rich-editor-shell[aria-label="multi-channel-access.md editor"] [contenteditable="true"]').waitFor()
  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Access"]').first())
  await expectAccessDialog(page, 'File', 'file-detail-access-modal-opens')
  const documentFavoriteButton = page.locator('button[data-file-action="favorite"][data-file-path="/files/docs/multi-channel-access.md"]').first()
  await documentFavoriteButton.waitFor()
  await dispatchClick(documentFavoriteButton)
  await page.locator('button[data-file-action="favorite"][data-file-path="/files/docs/multi-channel-access.md"][aria-pressed="true"]').waitFor()
  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await editorLayer.waitFor({ state: 'detached' })
  await dispatchClick(page.locator('.module-nav button[aria-label="收藏"]'))
  await page.locator('[data-favorites-surface="feed"] [data-favorite-item="/files/docs/multi-channel-access.md"]').filter({ hasText: 'multi-channel-access.md' }).waitFor()
  pass('file-favorite-appears-in-favorites')

  await dispatchClick(page.locator('.module-nav button[aria-label="文件"]'))
  await page.locator('.file-detail-layer[role="dialog"][aria-label="multi-channel-access.md detail"]').waitFor()
  await dispatchClick(page.locator('button[data-file-action="favorite"][data-file-path="/files/docs/multi-channel-access.md"]').first())
  await page.locator('button[data-file-action="favorite"][data-file-path="/files/docs/multi-channel-access.md"][aria-pressed="false"]').waitFor()
  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await editorLayer.waitFor({ state: 'detached' })
  await dispatchClick(page.locator('.module-nav button[aria-label="收藏"]'))
  const removedFavoriteCount = await page.locator('[data-favorite-item="/files/docs/multi-channel-access.md"]').count()
  if (removedFavoriteCount !== 0) {
    throw new Error(`Expected removed file favorite to disappear, found ${removedFavoriteCount}`)
  }
  pass('file-favorite-removes-from-favorites')

  await dispatchClick(page.locator('.module-nav button[aria-label="文件"]'))
  await metaDrawer.waitFor({ state: 'detached' })
  await page.locator('.prototype-shell.files-detail-collapsed').waitFor()
  pass('document-auto-opens-tiptap-and-closes-meta-drawer')

  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await editorLayer.waitFor({ state: 'detached' })

  await clickFileTreeItem(page, 'restricted.ttl')
  await page.locator('.resource-error[data-error-kind="permission-denied"]').filter({ hasText: 'No access' }).waitFor()
  await page.locator('.resource-error[data-error-kind="permission-denied"]').filter({ hasText: 'Request access' }).waitFor()
  await dispatchClick(page.locator('.resource-error-actions button').filter({ hasText: 'Request access' }).first())
  await expectAccessDialog(page, 'File', 'restricted-resource-access-modal-opens')
  pass('restricted-resource-shows-permission-denied')

  await clickFileTreeItem(page, 'prototype-layout.png')
  await page.locator('main.file-open-work h1', { hasText: 'prototype-layout.png' }).waitFor()
  await page.locator('.file-preview-surface.image.readonly').waitFor()
  await page.locator('.image-preview').filter({ hasText: 'prototype-layout.png' }).waitFor()
  await editorLayer.waitFor({ state: 'detached' })
  pass('image-opens-preview-without-editor-modal')

  await clickTreeItem(page, 'linx-prototype.ttl')
  await page.locator('main.structured-work h1', { hasText: '.data/workspaces/linx-prototype.ttl' }).waitFor()
  const subjectHeaderText = await page.locator('.subject-head .schema-head-label').first().innerText()
  if (subjectHeaderText !== 'Subject') {
    throw new Error(`Expected subject table header to be Subject, got ${subjectHeaderText}`)
  }
  pass('subject-table-header-is-readable')
  await page.screenshot({ path: screenshots.table, fullPage: true })
  pass('data-linx-prototype-opens-table')

  const resizableTitleHeader = page.locator('.predicate-head-cell[data-predicate-id="dcterms:title"]').first()
  const resizeHandle = resizableTitleHeader.locator('.predicate-resize-handle')
  await resizeHandle.waitFor()
  const beforeResize = await resizableTitleHeader.boundingBox()
  const handleBox = await resizeHandle.boundingBox()
  if (!beforeResize || !handleBox) throw new Error('Missing predicate header resize geometry')
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 48, handleBox.y + handleBox.height / 2)
  await page.mouse.up()
  const afterResize = await resizableTitleHeader.boundingBox()
  if (!afterResize || afterResize.width <= beforeResize.width + 20) {
    throw new Error(`Expected predicate header resize to widen dcterms:title, before=${beforeResize.width}, after=${afterResize?.width}`)
  }
  pass('predicate-header-divider-resizes-column', { before: beforeResize.width, after: afterResize.width })

  const firstSubject = page.locator('.subject-resource-link').first()
  const firstSubjectText = await firstSubject.innerText()
  await dispatchClick(firstSubject)
  await page.locator('.subject-peek').filter({ hasText: firstSubjectText }).waitFor()
  await page.screenshot({ path: screenshots.subjectPeek, fullPage: true })
  pass('subject-click-shows-resource-peek', { subject: firstSubjectText })

  await dispatchClick(page.locator('.class-scope-button').first())
  await dispatchClick(page.locator('.class-filter-pick').filter({ hasText: 'Class' }).first())
  await dispatchClick(page.locator('.subject-resource-link').filter({ hasText: '#FileResource' }).first())
  await page.locator('.subject-peek').filter({ hasText: 'file resource' }).waitFor()
  await dispatchClick(page.locator('.subject-peek-actions button').filter({ hasText: 'Open' }).first())
  await page.locator('.file-detail-layer[role="dialog"]').waitFor()
  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await page.locator('.file-detail-layer').waitFor({ state: 'detached' })
  pass('file-resource-subject-opens-file-detail-sheet')

  await dispatchClick(page.locator('.subject-resource-link').filter({ hasText: '/.vocab/terms.ttl#tags' }).first())
  await page.locator('.subject-peek').filter({ hasText: 'vocab term' }).waitFor()
  await dispatchClick(page.locator('.subject-peek-actions button').filter({ hasText: 'Open' }).first())
  await page.locator('.file-detail-layer[role="dialog"]').filter({ hasText: 'Vocabulary term' }).waitFor()
  await page.locator('.source-ingest-preview').filter({ hasText: 'shape' }).waitFor()
  await dispatchDomClick(page.locator('.file-detail-actions button[aria-label="Close subject detail"]'))
  await page.locator('.file-detail-layer').waitFor({ state: 'detached' })
  pass('vocab-term-subject-opens-definition-sheet')

  await dispatchClick(page.locator('.subject-resource-link').filter({ hasText: '/.vocab/terms.ttl#tags' }).first())
  await page.locator('.subject-peek').filter({ hasText: 'vocab term' }).waitFor()
  await dispatchClick(page.locator('.subject-peek-actions button[aria-label="Open resource file"]').first())
  await page.locator('main.structured-work h1', { hasText: '.vocab/terms.ttl' }).waitFor()
  await page.locator('main.structured-work[data-last-route-subject="/.vocab/terms.ttl#tags"][data-last-route-kind="vocab-term"][data-last-route-destination="structuredVocab"]').waitFor()
  await page.locator('.canonical-vocab-table').waitFor()
  pass('subject-resource-action-opens-containing-vocab-file')

  await clickTreeItem(page, 'linx-prototype.ttl')
  await dispatchClick(page.locator('.class-scope-button').first())
  await dispatchClick(page.locator('.class-filter-pick').filter({ hasText: 'Class' }).first())
  await page.locator('.subject-row[data-subject="/.vocab/terms.ttl#tags"] .subject-resource-link').press('Enter')
  await page.locator('.file-detail-layer[role="dialog"][aria-label="/.vocab/terms.ttl#tags resource detail"]').filter({ hasText: 'Vocabulary term' }).waitFor()
  await page.locator('.subject-peek').waitFor({ state: 'detached' })
  await dispatchDomClick(page.locator('.file-detail-actions button[aria-label="Close subject detail"]'))
  await page.locator('.file-detail-layer').waitFor({ state: 'detached' })
  pass('subject-enter-opens-target-directly')

  await dispatchClick(page.locator('.class-scope-button').first())
  await dispatchClick(page.locator('.class-filter-pick').filter({ hasText: 'Workspace' }).first())
  await dispatchClick(page.locator('.subject-resource-link').filter({ hasText: '#WorkspaceMeta' }).first())
  await page.locator('.subject-peek').filter({ hasText: 'fragment subject' }).waitFor()
  await dispatchClick(page.locator('.subject-peek-actions button').filter({ hasText: 'Open' }).first())
  await page.locator('.file-detail-layer[role="dialog"]').filter({ hasText: 'RDF fragment subject' }).waitFor()
  await page.locator('.source-ingest-preview').filter({ hasText: 'table · class scope · row retained' }).waitFor()
  await page.locator('.subject-return-context[data-route-kind="fragment-subject"][data-route-source="table"][data-route-class="Workspace"][data-route-view="table"][data-route-subject="#WorkspaceMeta"][data-route-search=""][data-route-sort="none"]').waitFor()
  await page.locator('.subject-return-context[data-route-row-index="0"][data-route-scroll-top]').waitFor()
  await dispatchDomClick(page.locator('.file-detail-actions button[aria-label="Close subject detail"]'))
  await page.locator('.file-detail-layer').waitFor({ state: 'detached' })
  await page.locator('main.structured-work[data-last-route-subject="#WorkspaceMeta"][data-last-route-kind="fragment-subject"][data-last-route-class="Workspace"][data-last-route-view="table"][data-last-route-search=""][data-last-route-sort="none"]').waitFor()
  await page.locator('button.class-scope-button[title="Filter: Workspace"][aria-label="Filter class Workspace"]').waitFor()
  await page.locator('.subject-row[data-subject="#WorkspaceMeta"][data-route-restored="true"] .subject-resource-link').waitFor()
  pass('fragment-subject-opens-resource-context-sheet')

  await dispatchClick(page.locator('.class-scope-button').first())
  await dispatchClick(page.locator('.class-filter-pick').filter({ hasText: 'GrantPage' }).first())
  await page.locator('.subject-row[data-subject="#GrantWikiPage"] .subject-resource-link').dblclick()
  await page.locator('.file-detail-layer[role="dialog"][aria-label="grant-wiki-page.card.md detail"]').filter({ hasText: 'Source-linked card' }).waitFor()
  await page.locator('.file-detail-layer[role="dialog"]').filter({ hasText: '/files/docs/cards/grant-wiki-page.card.md' }).waitFor()
  await page.locator('.file-detail-layer[role="dialog"]').filter({ hasText: '/.data/cards/' }).waitFor()
  pass('source-linked-card-uses-scattered-container-path')
  await page.locator('.file-property-panel[data-file-property-panel="/files/docs/cards/grant-wiki-page.card.md"]').filter({ hasText: 'https://solidproject.org/TR/protocol' }).waitFor()
  pass('source-linked-card-shows-file-properties')
  const sourceCardPropertyPanel = page.locator('.file-property-panel[data-file-property-panel="/files/docs/cards/grant-wiki-page.card.md"]')
  await dispatchDomClick(sourceCardPropertyPanel.locator('.file-property-row[data-property-id="udfs:reviewStatus"] .cell-editor'))
  await dispatchDomClick(sourceCardPropertyPanel.locator('.enum-option-pick').filter({ hasText: 'Ready' }))
  await page.locator('.file-property-panel[data-file-property-panel="/files/docs/cards/grant-wiki-page.card.md"][data-property-status="Ready"]').waitFor()
  pass('source-linked-card-properties-edit-status')
  await page.locator('.source-review-panel[data-review-state="pending"][data-source-ingest-status="lazy chunks"][data-source-update-count="12"][data-local-kept-count="0"]').filter({ hasText: '12 new ingest chunks' }).waitFor()
  await dispatchDomClick(page.locator('button[aria-label="Review Ingest changes"]'))
  await page.locator('.source-review-body').filter({ hasText: 'lazy chunks · 38/112 read · 12 changed' }).waitFor()
  await dispatchDomClick(page.locator('button[aria-label="Read Ingest chunks"]'))
  await page.locator('.source-review-panel[data-read-chunks="50"][data-total-chunks="112"]').waitFor()
  await page.locator('.source-review-body').filter({ hasText: 'lazy chunks · 50/112 read · 12 changed' }).waitFor()
  pass('source-linked-card-ingest-read-progresses')
  await dispatchDomClick(page.locator('button[aria-label="Accept Ingest"]'))
  await page.locator('.source-review-panel[data-review-state="accepted"][data-read-chunks="50"][data-source-update-count="0"][data-local-kept-count="0"]').filter({ hasText: '12 chunks applied' }).waitFor()
  pass('source-linked-card-accepts-source-update')
  await expectProposalResource(page, {
    action: 'accept',
    kind: 'source-update',
    scope: 'https://solidproject.org/TR/protocol',
    target: '/files/docs/cards/grant-wiki-page.card.md',
  }, 'source-linked-card-accept-records-proposal-resource')
  await page.locator('.subject-peek').waitFor({ state: 'detached' })
  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await page.locator('.file-detail-layer').waitFor({ state: 'detached' })
  await page.locator('button.class-scope-button[title="Filter: GrantPage"][aria-label="Filter class GrantPage"]').waitFor()
  await page.locator('.subject-row[data-subject="#GrantWikiPage"] .subject-resource-link').waitFor()
  pass('subject-double-click-opens-target-directly')

  await dispatchClick(page.locator('.subject-resource-link').filter({ hasText: '#GrantWikiPage' }).first())
  await page.locator('.subject-peek').filter({ hasText: 'source-linked card' }).waitFor()
  await dispatchClick(page.locator('.subject-peek-actions button').filter({ hasText: 'Open' }).first())
  await page.locator('.file-detail-layer[role="dialog"]').filter({ hasText: 'Source-linked card' }).waitFor()
  await page.locator('.rich-editor-shell[data-seed-format="blocks-with-double-newline-html"][data-seed-block-count="5"]').filter({ hasText: 'This card is an editable local note derived from ingested Solid Protocol chunks.' }).waitFor()
  await page.locator('.file-property-panel[data-file-property-panel="/files/docs/cards/grant-wiki-page.card.md"][data-property-status="Ready"]').waitFor()
  await page.locator('.source-review-panel[data-review-state="accepted"][data-read-chunks="50"][data-source-update-count="0"][data-local-kept-count="0"]').filter({ hasText: '12 chunks applied' }).waitFor()
  pass('source-linked-card-properties-persist-after-page-reload')
  pass('source-linked-card-editor-seeds-from-ingest-blocks')
  await dispatchDomClick(page.locator('button[aria-label="Review Ingest changes"]'))
  const keepButtonsAfterAccept = await page.locator('button[aria-label="Keep local edits"]').count()
  if (keepButtonsAfterAccept !== 0) throw new Error('Accepted source-linked card should not offer Keep local edits on reopen')
  pass('source-linked-card-accept-persists-after-reopen')

  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await page.locator('.file-detail-layer').waitFor({ state: 'detached' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.prototype-shell').waitFor({ state: 'visible' })
  await dispatchClick(page.locator('.module-nav button[aria-label="文件"]'))
  await page.locator('.prototype-shell[data-module="files"]').waitFor({ state: 'visible' })
  await clickTreeItem(page, 'linx-prototype.ttl')
  await page.locator('main.structured-work h1', { hasText: '.data/workspaces/linx-prototype.ttl' }).waitFor()
  await dispatchClick(page.locator('.class-scope-button').first())
  await dispatchClick(page.locator('.class-filter-pick').filter({ hasText: 'GrantPage' }).first())
  await dispatchClick(page.locator('.subject-resource-link').filter({ hasText: '#GrantWikiPage' }).first())
  await page.locator('.subject-peek').filter({ hasText: 'source-linked card' }).waitFor()
  await dispatchClick(page.locator('.subject-peek-actions button').filter({ hasText: 'Open' }).first())
  await page.locator('.file-detail-layer[role="dialog"]').filter({ hasText: 'Source-linked card' }).waitFor()
  await page.locator('.source-review-panel[data-review-state="accepted"][data-read-chunks="50"][data-source-update-count="0"][data-local-kept-count="0"]').filter({ hasText: '12 chunks applied' }).waitFor()
  pass('source-linked-card-ingest-read-persists-after-page-reload')
  pass('source-linked-card-accept-persists-after-page-reload')
  await page.screenshot({ path: screenshots.subjectSource, fullPage: true })
  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await page.locator('.file-detail-layer').waitFor({ state: 'detached' })
  pass('source-linked-card-subject-opens-editor-sheet')

  const keepContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await keepContext.addInitScript((keys) => {
    const resetMarker = 'linx.prototype.files.keepBranchStorageReset'
    if (window.sessionStorage.getItem(resetMarker)) return
    keys.forEach((key) => window.localStorage.removeItem(key))
    window.sessionStorage.setItem(resetMarker, '1')
  }, prototypeStorageKeys)
  const keepPage = await keepContext.newPage()
  keepPage.setDefaultTimeout(15000)
  await keepPage.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  await keepPage.locator('.prototype-shell').waitFor({ state: 'visible' })
  await dispatchClick(keepPage.locator('.module-nav button[aria-label="文件"]'))
  await keepPage.locator('.prototype-shell[data-module="files"]').waitFor({ state: 'visible' })
  await clickTreeItem(keepPage, 'linx-prototype.ttl')
  await dispatchClick(keepPage.locator('.class-scope-button').first())
  await dispatchClick(keepPage.locator('.class-filter-pick').filter({ hasText: 'GrantPage' }).first())
  await dispatchClick(keepPage.locator('.subject-resource-link').filter({ hasText: '#GrantWikiPage' }).first())
  await keepPage.locator('.subject-peek').filter({ hasText: 'source-linked card' }).waitFor()
  await dispatchClick(keepPage.locator('.subject-peek-actions button').filter({ hasText: 'Open' }).first())
  await keepPage.locator('.source-review-panel[data-review-state="pending"][data-source-update-count="12"]').waitFor()
  await dispatchDomClick(keepPage.locator('button[aria-label="Review Ingest changes"]'))
  await dispatchDomClick(keepPage.locator('button[aria-label="Keep local edits"]'))
  await keepPage.locator('.source-review-panel[data-review-state="kept"][data-source-update-count="0"][data-local-kept-count="3"]').filter({ hasText: '3 protected blocks' }).waitFor()
  pass('source-linked-card-keeps-local-edits')
  await expectProposalResource(keepPage, {
    action: 'keep',
    kind: 'source-update',
    scope: 'https://solidproject.org/TR/protocol',
    target: '/files/docs/cards/grant-wiki-page.card.md',
  }, 'source-linked-card-keep-records-proposal-resource')
  await dispatchClick(keepPage.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await keepPage.locator('.file-detail-layer').waitFor({ state: 'detached' })
  await keepPage.reload({ waitUntil: 'domcontentloaded' })
  await keepPage.locator('.prototype-shell').waitFor({ state: 'visible' })
  await dispatchClick(keepPage.locator('.module-nav button[aria-label="文件"]'))
  await clickTreeItem(keepPage, 'linx-prototype.ttl')
  await dispatchClick(keepPage.locator('.class-scope-button').first())
  await dispatchClick(keepPage.locator('.class-filter-pick').filter({ hasText: 'GrantPage' }).first())
  await dispatchClick(keepPage.locator('.subject-resource-link').filter({ hasText: '#GrantWikiPage' }).first())
  await keepPage.locator('.subject-peek').filter({ hasText: 'source-linked card' }).waitFor()
  await dispatchClick(keepPage.locator('.subject-peek-actions button').filter({ hasText: 'Open' }).first())
  await keepPage.locator('.source-review-panel[data-review-state="kept"][data-source-update-count="0"][data-local-kept-count="3"]').filter({ hasText: '3 protected blocks' }).waitFor()
  pass('source-linked-card-keep-persists-after-page-reload')
  await keepContext.close()

  await dispatchClick(page.locator('.subject-resource-link').filter({ hasText: 'https://solidproject.org/TR/protocol' }).first())
  await page.locator('.subject-peek').filter({ hasText: 'external URL' }).waitFor()
  await dispatchClick(page.locator('.subject-peek-actions button').filter({ hasText: 'Open' }).first())
  await page.locator('.file-detail-layer[role="dialog"]').filter({ hasText: 'External source' }).waitFor()
  await page.locator('.source-ingest-preview').filter({ hasText: 'progressive chunks load only when read' }).waitFor()
  await page.locator('.source-ingest-preview').filter({ hasText: 'existing Ingest manifest reused when hash matches' }).waitFor()
  await page.locator('.source-ingest-preview[data-source-ingest-source="https://solidproject.org/TR/protocol"][data-source-ingest-read-chunks="50"][data-source-ingest-total-chunks="112"][data-source-ingest-manifest="/.data/ingest/sources/solid-protocol/manifest.ttl"]').waitFor()
  await dispatchDomClick(page.locator('button[aria-label="Read external Ingest chunks"]'))
  await page.locator('.source-ingest-preview[data-source-ingest-source="https://solidproject.org/TR/protocol"][data-source-ingest-read-chunks="68"][data-source-ingest-total-chunks="112"][data-source-ingest-sync="read on demand"]').waitFor()
  await page.locator('.subject-return-context[data-route-kind="external-url"][data-route-source="table"][data-route-class="GrantPage"][data-route-view="table"][data-route-subject="https://solidproject.org/TR/protocol"][data-route-search=""][data-route-sort="none"]').waitFor()
  await dispatchDomClick(page.locator('.file-detail-actions button[aria-label="Close subject detail"]'))
  await page.locator('.file-detail-layer').waitFor({ state: 'detached' })
  await page.locator('main.structured-work[data-last-route-subject="https://solidproject.org/TR/protocol"][data-last-route-kind="external-url"][data-last-route-class="GrantPage"][data-last-route-view="table"][data-last-route-search=""][data-last-route-sort="none"]').waitFor()
  pass('external-url-subject-opens-ingest-preview-sheet')
  pass('external-url-ingest-read-progresses-shared-index')

  await setDomInputValue(await ensureStructuredSearchOpen(page), 'solid')
  await page.locator('.subject-resource-link').filter({ hasText: 'https://solidproject.org/TR/protocol' }).waitFor()
  await page.locator('.subject-row[data-subject="#GrantWikiPage"]').waitFor({ state: 'detached' })
  const hiddenBySearch = await page.locator('.subject-resource-link').filter({ hasText: '#GrantWikiPage' }).count()
  if (hiddenBySearch !== 0) {
    throw new Error(`Expected search to hide #GrantWikiPage, found ${hiddenBySearch}`)
  }
  pass('structured-search-filters-subject-rows')

  await page.locator('.subject-row[data-subject="https://solidproject.org/TR/protocol"] .subject-resource-link').press('Enter')
  await page.locator('.subject-return-context[data-route-kind="external-url"][data-route-source="table"][data-route-class="GrantPage"][data-route-view="table"][data-route-subject="https://solidproject.org/TR/protocol"][data-route-search="solid"][data-route-sort="none"]').waitFor()
  await page.locator('.source-ingest-preview[data-source-ingest-source="https://solidproject.org/TR/protocol"][data-source-ingest-read-chunks="68"][data-source-ingest-total-chunks="112"]').waitFor()
  await dispatchDomClick(page.locator('.file-detail-actions button[aria-label="Close subject detail"]'))
  await page.locator('.file-detail-layer').waitFor({ state: 'detached' })
  await page.locator('main.structured-work[data-last-route-subject="https://solidproject.org/TR/protocol"][data-last-route-kind="external-url"][data-last-route-class="GrantPage"][data-last-route-view="table"][data-last-route-search="solid"][data-last-route-sort="none"]').waitFor()
  await ensureStructuredSearchOpen(page)
  await page.locator('.subject-row[data-subject="https://solidproject.org/TR/protocol"] .subject-resource-link').waitFor()
  pass('subject-route-context-preserves-search-scope')

  await setDomInputValue(await ensureStructuredSearchOpen(page), '')
  await page.locator('.subject-resource-link').filter({ hasText: '#GrantWikiPage' }).waitFor()

  await dispatchClick(page.locator('.class-scope-button').first())
  const grantPageClassPick = page.locator('.structured-filter-menu .class-filter-pick').filter({ hasText: 'GrantPage' }).first()
  await grantPageClassPick.locator('.vocab-state-star').waitFor()
  await dispatchDomClick(page.locator('button[aria-label="Edit GrantPage class definition"]'))
  await dispatchDomClick(page.locator('button[aria-label="Approve GrantPage class"]'))
  await grantPageClassPick.locator('.vocab-state-star').waitFor({ state: 'detached' })
  pass('pending-class-approval-removes-star')
  await expectProposalResource(page, {
    action: 'approve',
    kind: 'class',
    scope: 'GrantPage',
    target: 'GrantPage',
  }, 'pending-class-approval-records-proposal-resource')

  await dispatchDomClick(page.locator('.class-filter-pick').filter({ hasText: 'Class' }).first())
  const fileTagsCell = page.locator('.subject-row[data-subject="#FileResource"] .predicate-value[data-predicate-id="udfs:tags"] .cell-editor')
  await dispatchDomClick(fileTagsCell)
  await setDomInputValue(page.locator('.enum-popover input'), 'new-signal')
  await dispatchDomClick(page.locator('.enum-create-option').filter({ hasText: 'new-signal' }))
  const pendingNewSignal = page.locator('.enum-chip[data-enum-option="new-signal"] .vocab-state-star')
  await pendingNewSignal.first().waitFor()
  await expectProposalResource(page, {
    action: 'create',
    kind: 'enum-option',
    scope: 'Class',
    target: 'udfs:tags:new-signal',
  }, 'pending-enum-option-create-records-proposal-resource')
  await dispatchDomClick(page.locator('button[aria-label="Edit new-signal definition"]'))
  await dispatchDomClick(page.locator('button[aria-label="Approve new-signal enum option"]'))
  await pendingNewSignal.first().waitFor({ state: 'detached' })
  await page.locator('.enum-chip[data-enum-option="new-signal"]').first().waitFor()
  pass('pending-enum-option-approval-removes-star')
  await expectProposalResource(page, {
    action: 'approve',
    kind: 'enum-option',
    scope: 'Class',
    target: 'udfs:tags:new-signal',
  }, 'pending-enum-option-approval-records-proposal-resource')

  await setDomInputValue(page.locator('.enum-popover input'), 'discard-signal')
  await dispatchDomClick(page.locator('.enum-create-option').filter({ hasText: 'discard-signal' }))
  await page.locator('.enum-chip[data-enum-option="discard-signal"] .vocab-state-star').first().waitFor()
  await expectProposalResource(page, {
    action: 'create',
    kind: 'enum-option',
    scope: 'Class',
    target: 'udfs:tags:discard-signal',
  }, 'discarded-enum-option-create-records-proposal-resource')
  await dispatchDomClick(page.locator('button[aria-label="Edit discard-signal definition"]'))
  await dispatchDomClick(page.locator('button[aria-label="Discard discard-signal enum option"]'))
  await page.waitForFunction(() => {
    return document.querySelectorAll(
      '.subject-row[data-subject="#FileResource"] .predicate-value[data-predicate-id="udfs:tags"] .cell-editor .enum-chip[data-enum-option="discard-signal"]',
    ).length === 0
  })
  pass('pending-enum-option-discard-removes-value')
  await expectProposalResource(page, {
    action: 'discard',
    kind: 'enum-option',
    scope: 'Class',
    target: 'udfs:tags:discard-signal',
  }, 'pending-enum-option-discard-records-proposal-resource')

  await page.keyboard.press('Escape')

  await dispatchClick(page.locator('.class-scope-button').first())
  await dispatchClick(page.locator('.class-filter-pick').filter({ hasText: 'Workspace' }).first())
  const pendingRuntimeHeader = page.locator('.predicate-head-cell[data-predicate-id="udfs:runtimeStatus"]')
  await pendingRuntimeHeader.locator('.vocab-state-star').waitFor()
  await dispatchDomClick(pendingRuntimeHeader.locator('button[aria-label="Edit udfs:runtimeStatus definition"]'))
  await dispatchDomClick(page.locator('button[aria-label="Approve udfs:runtimeStatus predicate"]'))
  await pendingRuntimeHeader.locator('.vocab-state-star').waitFor({ state: 'detached' })
  await pendingRuntimeHeader.waitFor()
  pass('pending-predicate-approval-removes-star')
  await expectProposalResource(page, {
    action: 'approve',
    kind: 'predicate',
    scope: 'Workspace',
    target: 'udfs:runtimeStatus',
  }, 'pending-predicate-approval-records-proposal-resource')

  await dispatchDomClick(page.locator('.add-predicate-head > button[title="Add predicate"]'))
  await dispatchDomClick(page.locator('.predicate-menu .create-predicate'))
  await dispatchDomClick(page.locator('.predicate-create-button'))
  const draftPredicateHeader = page.locator('.predicate-head-cell[data-predicate-id="udfs:workspaceReviewStatus1"]')
  await draftPredicateHeader.locator('.vocab-state-star').waitFor()
  await expectProposalResource(page, {
    action: 'create',
    kind: 'predicate',
    scope: 'Workspace',
    target: 'udfs:workspaceReviewStatus1',
  }, 'pending-predicate-create-records-proposal-resource')

  await expectViewMenuExcludes(page, 'Discover', 'add-view-menu-hides-discover')

  await chooseView(page, 'Kanban')
  await page.locator('.kanban-surface .structured-predicate-index [data-projection-predicate="udfs:workspaceReviewStatus1"]').waitFor({ state: 'attached' })
  pass('proposed-predicate-appears-in-kanban-projection')

  await chooseView(page, 'Raw')
  await page.locator('.raw-surface .structured-predicate-index [data-projection-predicate="udfs:workspaceReviewStatus1"]').waitFor({ state: 'attached' })
  pass('proposed-predicate-appears-in-raw-projection')

  await chooseView(page, 'Whiteboard')
  await page.locator('.whiteboard-predicate-index [data-whiteboard-predicate="udfs:workspaceReviewStatus1"]').waitFor({ state: 'attached' })
  pass('proposed-predicate-appears-in-whiteboard-projection')

  await page.locator('.structured-tabs button').filter({ hasText: 'Table' }).first().click()
  await page.locator('.predicate-head-cell[data-predicate-id="udfs:workspaceReviewStatus1"]').waitFor()
  await dispatchDomClick(draftPredicateHeader.locator('button[aria-label="Edit udfs:workspaceReviewStatus1 definition"]'))
  await dispatchDomClick(page.locator('button[aria-label="Discard udfs:workspaceReviewStatus1 predicate"]'))
  await draftPredicateHeader.waitFor({ state: 'detached' })
  pass('pending-predicate-discard-removes-column')
  await expectProposalResource(page, {
    action: 'discard',
    kind: 'predicate',
    scope: 'Workspace',
    target: 'udfs:workspaceReviewStatus1',
  }, 'pending-predicate-discard-records-proposal-resource')

  await dispatchClick(page.locator('.class-scope-button').first())
  await dispatchClick(page.locator('.class-filter-pick').filter({ hasText: 'GrantPage' }).first())
  await dispatchClick(page.locator('button[aria-label^="Sort structured table"]'))
  await page.locator('button[aria-label^="Sort structured table"][title*="asc"]').waitFor()
  await dispatchClick(page.locator('button[aria-label^="Sort structured table"]'))
  await page.locator('button[aria-label^="Sort structured table"][title*="desc"]').waitFor()
  const firstSortedSubject = await page.locator('.subject-resource-link').first().innerText()
  if (!firstSortedSubject.includes('https://solidproject.org/TR/protocol')) {
    throw new Error(`Expected desc sort to put external URL first, found ${firstSortedSubject}`)
  }
  pass('structured-sort-reorders-subject-rows', { first: firstSortedSubject })

  const titleHeader = page.locator('.predicate-head-cell[data-predicate-id="dcterms:title"]')
  await titleHeader.waitFor()
  await dispatchClick(page.locator('button[aria-label="Show or hide predicate columns"]'))
  await dispatchClick(page.locator('.predicate-visibility-option[data-predicate-id="dcterms:title"]'))
  await titleHeader.waitFor({ state: 'detached' })
  pass('predicate-visibility-hides-title-column')

  await setDomInputValue(await ensureStructuredSearchOpen(page), 'solid')
  await chooseView(page, 'Kanban')
  await page.locator('.kanban-surface[data-class-scope="GrantPage"]').waitFor()
  await page.locator('.kanban-card[data-subject="https://solidproject.org/TR/protocol"]').waitFor()
  const hiddenKanbanGrantCards = await page.locator('.kanban-card[data-subject="#GrantWikiPage"]').count()
  if (hiddenKanbanGrantCards !== 0) {
    throw new Error(`Expected Kanban search projection to hide #GrantWikiPage, found ${hiddenKanbanGrantCards}`)
  }
  const hiddenKanbanTitleChips = await page.locator('.kanban-predicate-chip[data-predicate-id="dcterms:title"]').count()
  if (hiddenKanbanTitleChips !== 0) {
    throw new Error(`Expected hidden dcterms:title predicate to stay hidden in Kanban, found ${hiddenKanbanTitleChips}`)
  }
  pass('kanban-shares-table-search-and-visibility-projection')

  await chooseView(page, 'Raw')
  await page.locator('.raw-surface[data-class-scope="GrantPage"][data-subject-count="1"] pre[data-raw-format="text/turtle"]').waitFor()
  const searchedRawText = await page.locator('.raw-surface pre').innerText()
  if (!searchedRawText.includes('<https://solidproject.org/TR/protocol> a udfs:GrantPage')) {
    throw new Error('Expected Raw search projection to include the external Solid source')
  }
  if (searchedRawText.includes('<#GrantWikiPage> a') || searchedRawText.includes('  dcterms:title')) {
    throw new Error('Expected Raw projection to hide #GrantWikiPage as a subject and dcterms:title')
  }
  pass('raw-shares-table-search-and-visibility-projection')

  await chooseView(page, 'Whiteboard')
  await page.locator('.whiteboard-surface[data-class-scope="GrantPage"][data-subject-count="1"]').waitFor()
  await page.locator('.whiteboard-subject-index [data-whiteboard-subject="https://solidproject.org/TR/protocol"]').waitFor({ state: 'attached' })
  const hiddenWhiteboardGrantSubjects = await page.locator('.whiteboard-subject-index [data-whiteboard-subject="#GrantWikiPage"]').count()
  if (hiddenWhiteboardGrantSubjects !== 0) {
    throw new Error(`Expected Whiteboard search projection to hide #GrantWikiPage, found ${hiddenWhiteboardGrantSubjects}`)
  }
  pass('whiteboard-shares-table-search-projection')

  await page.locator('.structured-tabs button').filter({ hasText: 'Table' }).first().click()
  await setDomInputValue(await ensureStructuredSearchOpen(page), '')
  await page.locator('.subject-row[data-subject="#GrantWikiPage"] .subject-resource-link').waitFor()

  await clickTreeItem(page, 'multi-channel-access.md')
  await page.locator('.file-detail-layer[role="dialog"][aria-label="multi-channel-access.md detail"]').waitFor()
  const editor = page.locator('.rich-editor-shell[aria-label="multi-channel-access.md editor"] .ProseMirror').first()
  await editor.waitFor({ state: 'visible' })
  if (await page.locator('.rich-editor-shell .rich-editor-toolbar').count() !== 0) {
    throw new Error('Expected the rich editor toolbar to stay hidden until the editor receives focus')
  }
  await page.locator('.rich-editor-shell[data-seed-format="blocks-with-double-newline-html"][data-seed-block-count="6"]').filter({ hasText: 'Local, LAN, tunnel, and cloud routes are access channels over the same Pod resource identity.' }).waitFor()
  if (await page.locator('.rich-editor-shell .note-title-block > span, .rich-editor-shell .note-title-block > div').count() !== 0) {
    throw new Error('Expected the note title block to avoid duplicating byline and tail metadata')
  }
  pass('markdown-editor-keeps-one-title-without-duplicate-meta')
  pass('markdown-editor-seeds-from-file-blocks')
  await page.locator('.file-property-panel[data-file-property-panel="/files/docs/multi-channel-access.md"][data-property-status="Draft"]').filter({ hasText: 'Properties' }).waitFor()
  const filePropertyPanel = page.locator('.file-property-panel[data-file-property-panel="/files/docs/multi-channel-access.md"]')
  await dispatchDomClick(filePropertyPanel.locator('.file-property-row[data-property-id="udfs:reviewStatus"] .cell-editor'))
  await dispatchDomClick(filePropertyPanel.locator('.enum-option-pick').filter({ hasText: 'Ready' }))
  await page.locator('.file-property-panel[data-file-property-panel="/files/docs/multi-channel-access.md"][data-property-status="Ready"]').waitFor()
  pass('file-detail-properties-edit-status')
  await editor.click()
  await page.locator('.rich-editor-shell .rich-editor-toolbar').waitFor({ state: 'visible' })
  pass('markdown-editor-reveals-low-chrome-toolbar-on-focus')
  const toolbarOverlapsContent = await page.evaluate(() => {
    const toolbar = document.querySelector('.rich-editor-shell .rich-editor-toolbar')
    const body = document.querySelector('.rich-editor-shell .rich-editor-body')
    if (!(toolbar instanceof HTMLElement) || !(body instanceof HTMLElement)) return true
    const toolbarRect = toolbar.getBoundingClientRect()
    const bodyRect = body.getBoundingClientRect()
    return toolbarRect.bottom > bodyRect.top
  })
  if (toolbarOverlapsContent) {
    throw new Error('Expected the low-chrome rich editor toolbar not to cover the first content block')
  }
  pass('markdown-editor-toolbar-does-not-cover-content')
  await editor.press('End')
  await editor.type(`\n${typedText}`)
  await page.locator('.rich-editor-shell .ProseMirror').filter({ hasText: typedText }).waitFor()
  const storedEditorContent = await page.evaluate(() => {
    return JSON.parse(window.localStorage.getItem('linx.prototype.files.fileContentsByPath') || '{}')['/files/docs/multi-channel-access.md']
  })
  if (
    !storedEditorContent
    || storedEditorContent.format !== 'tiptap-json'
    || storedEditorContent.version !== 1
    || storedEditorContent.doc?.type !== 'doc'
    || !Array.isArray(storedEditorContent.chunks)
    || storedEditorContent.chunks.length !== 6
  ) {
    throw new Error(`Expected persisted Tiptap JSON content, got ${JSON.stringify(storedEditorContent)}`)
  }
  pass('markdown-editor-persists-tiptap-json')
  await page.screenshot({ path: screenshots.tiptap, fullPage: true })
  pass('markdown-opens-tiptap-prosemirror-editor-and-accepts-text')

  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await page.locator('.file-detail-layer').waitFor({ state: 'detached' })
  await dispatchClick(page.locator('.file-open-placeholder button').filter({ hasText: 'Open detail' }))
  await page.locator('.file-detail-layer[role="dialog"][aria-label="multi-channel-access.md detail"]').waitFor()
  await page.locator('.rich-editor-shell .ProseMirror').filter({ hasText: typedText }).waitFor()
  await page.locator('.file-property-panel[data-file-property-panel="/files/docs/multi-channel-access.md"][data-property-status="Ready"]').waitFor()
  pass('markdown-editor-content-persists-after-close-reopen')
  pass('file-detail-properties-persist-after-close-reopen')

  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await page.locator('.file-detail-layer').waitFor({ state: 'detached' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.prototype-shell').waitFor({ state: 'visible' })
  await dispatchClick(page.locator('.module-nav button[aria-label="文件"]'))
  await page.locator('.prototype-shell[data-module="files"]').waitFor({ state: 'visible' })
  await clickTreeItem(page, 'multi-channel-access.md')
  await page.locator('.file-detail-layer[role="dialog"][aria-label="multi-channel-access.md detail"]').waitFor()
  await page.locator('.rich-editor-shell .ProseMirror').filter({ hasText: typedText }).waitFor()
  await page.locator('.file-property-panel[data-file-property-panel="/files/docs/multi-channel-access.md"][data-property-status="Ready"]').waitFor()
  pass('markdown-editor-content-persists-after-page-reload')
  pass('file-detail-properties-persist-after-page-reload')

  await dispatchClick(page.locator('.file-detail-actions button[aria-label="Close file detail"]'))
  await page.locator('.file-detail-layer').waitFor({ state: 'detached' })

  await clickTreeItem(page, 'linx-prototype.ttl')
  await dispatchClick(page.locator('.class-scope-button').first())
  await dispatchClick(page.locator('.class-filter-pick').filter({ hasText: 'GrantPage' }).first())
  await chooseView(page, 'Kanban')
  await page.locator('.kanban-surface[data-class-scope="GrantPage"]').waitFor()
  pass('kanban-follows-current-class-scope')
  await page.locator('.kanban-column[data-kanban-status="Draft"] .kanban-card[data-subject="#GrantWikiPage"]').waitFor()
  await page.locator('.kanban-column[data-kanban-status="Ready"] .kanban-card[data-subject="https://solidproject.org/TR/protocol"]').waitFor()
  await page.locator('.kanban-column[data-kanban-status="Draft"] .kanban-subject-section[data-kanban-subject="#GrantWikiPage"]').waitFor()
  await page.locator('.kanban-card[data-subject="#GrantWikiPage"][data-card-kind="source-linked-card"]').waitFor()
  await page.locator('.kanban-card[data-subject="#GrantWikiPage"] .kanban-card-byline[data-source-url="https://solidproject.org/TR/protocol"][data-source-path="/files/docs/cards/grant-wiki-page.card.md"]').waitFor()
  await page.locator('.kanban-card[data-subject="#GrantWikiPage"] .kanban-predicate-chip[data-predicate-id="schema:about"]').filter({ hasText: 'approval policy' }).waitFor()
  await page.locator('.kanban-card[data-subject="#GrantWikiPage"] .kanban-relation-action[data-relation-count]').filter({ hasText: 'relation' }).waitFor()
  pass('kanban-card-shows-byline-predicates-and-relations')
  await expectCountAtLeast(page, '.kanban-card', 2, 'kanban-shows-derived-review-status-cards')
  const grantCard = page.locator('.kanban-card[data-subject="#GrantWikiPage"]')
  const readyColumn = page.locator('.kanban-column[data-kanban-status="Ready"]')
  await grantCard.dragTo(readyColumn)
  await page.locator('.kanban-column[data-kanban-status="Ready"] .kanban-card[data-subject="#GrantWikiPage"]').waitFor()
  await page.locator('.kanban-column[data-kanban-status="Ready"] .kanban-subject-section[data-kanban-subject="#GrantWikiPage"]').waitFor()
  pass('kanban-drag-updates-review-status-column')
  await page.screenshot({ path: screenshots.kanban, fullPage: true })

  await page.locator('.structured-tabs button').filter({ hasText: 'Table' }).first().click()
  await page.locator('.subject-row[data-subject="#GrantWikiPage"] .predicate-value[data-predicate-id="udfs:reviewStatus"]').filter({ hasText: 'Ready' }).waitFor()
  pass('kanban-drag-persists-to-table-cell')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.prototype-shell').waitFor({ state: 'visible' })
  await dispatchClick(page.locator('.module-nav button[aria-label="文件"]'))
  await page.locator('.prototype-shell[data-module="files"]').waitFor({ state: 'visible' })
  await clickTreeItem(page, 'linx-prototype.ttl')
  await page.locator('main.structured-work h1', { hasText: '.data/workspaces/linx-prototype.ttl' }).waitFor()
  await dispatchClick(page.locator('.class-scope-button').first())
  await dispatchClick(page.locator('.class-filter-pick').filter({ hasText: 'GrantPage' }).first())
  await page.locator('.subject-row[data-subject="#GrantWikiPage"] .predicate-value[data-predicate-id="udfs:reviewStatus"]').filter({ hasText: 'Ready' }).waitFor()
  pass('kanban-drag-cell-override-persists-after-page-reload')

  await chooseView(page, 'Raw')
  await page.locator('.raw-surface[data-class-scope="GrantPage"][data-subject-count="2"] pre[data-raw-format="text/turtle"]').waitFor()
  await page.locator('.raw-surface pre').filter({ hasText: '<#GrantWikiPage> a udfs:GrantPage' }).waitFor()
  await page.locator('.raw-surface pre').filter({ hasText: 'udfs:reviewStatus "Ready"' }).waitFor()
  const rawText = await page.locator('.raw-surface pre').innerText()
  if (rawText.includes('<#WorkspaceMeta>')) {
    throw new Error('Expected GrantPage Raw output to exclude #WorkspaceMeta')
  }
  pass('raw-follows-current-class-scope-and-overrides')

  await chooseView(page, 'Whiteboard')
  await page.locator('.whiteboard-surface[data-class-scope="GrantPage"][data-subject-count="2"]').waitFor()
  await page.locator('.whiteboard-subject-index [data-whiteboard-subject="#GrantWikiPage"]').waitFor({ state: 'attached' })
  await page.locator('.whiteboard-subject-index [data-whiteboard-subject="https://solidproject.org/TR/protocol"]').waitFor({ state: 'attached' })
  const workspaceWhiteboardSubjects = await page.locator('.whiteboard-subject-index [data-whiteboard-subject="#WorkspaceMeta"]').count()
  if (workspaceWhiteboardSubjects !== 0) {
    throw new Error(`Expected GrantPage whiteboard to exclude #WorkspaceMeta, found ${workspaceWhiteboardSubjects}`)
  }
  pass('whiteboard-follows-current-class-scope')
  await page.locator('.whiteboard-board-frame').waitFor({ state: 'visible' })
  pass('whiteboard-shows-board-frame')
  await expectCountAtLeast(page, '.whiteboard-board-frame [data-whiteboard-shape]', 4, 'whiteboard-shows-at-least-four-shapes')
  const whiteboardGrantCard = page.locator('.whiteboard-card[data-whiteboard-subject="#GrantWikiPage"]').first()
  const beforeMove = await whiteboardGrantCard.boundingBox()
  if (!beforeMove) throw new Error('Expected #GrantWikiPage whiteboard card bounding box before move')
  await page.mouse.move(beforeMove.x + 40, beforeMove.y + 24)
  await page.mouse.down()
  await page.mouse.move(beforeMove.x + 146, beforeMove.y + 86, { steps: 8 })
  await page.mouse.up()
  await page.waitForFunction(() => {
    const card = document.querySelector('.whiteboard-card[data-whiteboard-subject="#GrantWikiPage"]')
    if (!(card instanceof HTMLElement)) return false
    return Number(card.dataset.layoutX ?? 0) > 120 && Number(card.dataset.layoutY ?? 0) > 90
  })
  const movedLayout = await whiteboardGrantCard.evaluate((node) => {
    if (!(node instanceof HTMLElement)) throw new Error('Expected whiteboard card element')
    return { x: Number(node.dataset.layoutX), y: Number(node.dataset.layoutY) }
  })
  const storedWhiteboardLayout = await page.evaluate(() => window.localStorage.getItem('linx.prototype.files.whiteboardLayouts') ?? '')
  if (!storedWhiteboardLayout.includes('#GrantWikiPage')) {
    throw new Error('Expected whiteboard layout storage to include #GrantWikiPage')
  }
  pass('whiteboard-card-drag-persists-layout-state', movedLayout)

  await page.locator('.structured-tabs button').filter({ hasText: 'Table' }).first().click()
  await chooseView(page, 'Whiteboard')
  await page.locator('.whiteboard-card[data-whiteboard-subject="#GrantWikiPage"][data-layout-x="' + movedLayout.x + '"][data-layout-y="' + movedLayout.y + '"]').waitFor()
  pass('whiteboard-card-layout-persists-after-view-switch')

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.prototype-shell').waitFor({ state: 'visible' })
  await dispatchClick(page.locator('.module-nav button[aria-label="文件"]'))
  await page.locator('.prototype-shell[data-module="files"]').waitFor({ state: 'visible' })
  await clickTreeItem(page, 'linx-prototype.ttl')
  await dispatchClick(page.locator('.class-scope-button').first())
  await dispatchClick(page.locator('.class-filter-pick').filter({ hasText: 'GrantPage' }).first())
  await chooseView(page, 'Whiteboard')
  await page.locator('.whiteboard-card[data-whiteboard-subject="#GrantWikiPage"][data-layout-x="' + movedLayout.x + '"][data-layout-y="' + movedLayout.y + '"]').waitFor()
  pass('whiteboard-card-layout-persists-after-page-reload')

  const visibleStylePanels = await page.locator('.whiteboard-board-frame .tlui-style-panel:visible').count()
  if (visibleStylePanels !== 0) {
    throw new Error(`Expected no visible whiteboard style panel, found ${visibleStylePanels}`)
  }
  pass('whiteboard-style-panel-not-visible')
  await page.screenshot({ path: screenshots.whiteboard, fullPage: true })

  const mobilePage = await browser.newPage({ isMobile: true, viewport: { width: 390, height: 844 } })
  mobilePage.setDefaultTimeout(15000)
  await mobilePage.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  await mobilePage.locator('.prototype-shell').waitFor({ state: 'visible' })
  await dispatchClick(mobilePage.locator('.module-nav button[aria-label="文件"]'))
  await mobilePage.locator('.prototype-shell[data-module="files"]').waitFor({ state: 'visible' })
  await mobilePage.locator('.mobile-files-tree-button').waitFor({ state: 'visible' })
  const initiallyOpenMobileTree = await mobilePage.locator('.tree-pane.mobile-open').count()
  if (initiallyOpenMobileTree !== 0) {
    throw new Error(`Expected mobile file tree to start collapsed, found ${initiallyOpenMobileTree}`)
  }
  pass('mobile-file-tree-starts-collapsed')
  await clickTreeItem(mobilePage, 'linx-prototype.ttl')
  await mobilePage.locator('.tree-pane.mobile-open').waitFor({ state: 'detached' })
  pass('mobile-file-tree-closes-after-selection')
  await mobilePage.locator('main.structured-work h1', { hasText: '.data/workspaces/linx-prototype.ttl' }).waitFor()
  await expectViewportContained(
    mobilePage,
    ['.prototype-shell[data-module="files"]', '.mobile-files-tree-button', '.files-header', '.resource-viewbar'],
    'mobile-table-shell-fits-viewport',
  )
  await mobilePage.locator('.subject-grid').evaluate((node) => {
    if (!(node instanceof HTMLElement)) throw new Error('Expected subject grid element')
    if (node.scrollWidth <= node.clientWidth) throw new Error('Expected structured table grid to expose internal horizontal scroll on mobile')
  })
  pass('mobile-table-uses-contained-horizontal-scroll')
  await mobilePage.screenshot({ path: screenshots.mobileTable, fullPage: true })

  await clickTreeItem(mobilePage, 'multi-channel-access.md')
  await mobilePage.locator('.file-detail-layer[role="dialog"][aria-label="multi-channel-access.md detail"]').waitFor()
  await mobilePage.locator('.rich-editor-shell[aria-label="multi-channel-access.md editor"] [contenteditable="true"]').waitFor()
  await mobilePage.locator('.file-property-panel[data-file-property-panel="/files/docs/multi-channel-access.md"]').waitFor()
  await mobilePage.locator('.file-detail-tail').filter({ hasText: 'multi-channel-access.md.meta' }).waitFor()
  await mobilePage.locator('.tree-pane.mobile-open').waitFor({ state: 'detached' })
  await mobilePage.waitForFunction(() => {
    const tree = document.querySelector('.tree-pane')
    return tree instanceof HTMLElement && tree.getBoundingClientRect().right <= 1
  })
  pass('mobile-file-tree-closes-before-file-sheet-opens')
  await expectViewportContained(
    mobilePage,
    ['.file-detail-layer', '.file-detail-dialog', '.file-detail-header', '.rich-editor-shell', '.file-property-panel', '.file-detail-tail'],
    'mobile-tiptap-sheet-fits-viewport',
  )
  await mobilePage.screenshot({ path: screenshots.mobileTiptap, fullPage: true })
  await mobilePage.close()

  result.ok = true
} catch (error) {
  result.error = toFailure(error)
} finally {
  if (browser) await browser.close()
  result.durationMs = Date.now() - startedAt
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (!result.ok) process.exitCode = 1
}
