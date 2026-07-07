#!/usr/bin/env node

import { chromium } from 'playwright'

const targetUrl = process.env.FILES_PROTOTYPE_URL || 'http://127.0.0.1:5178/'
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
  'linx.prototype.files.proposalResources',
]

const result = {
  ok: false,
  url: targetUrl,
  checks: [],
  durationMs: 0,
}
const startedAt = Date.now()

function pass(name, details = {}) {
  result.checks.push({ name, ok: true, ...details })
}

function fail(name, message, details = {}) {
  const error = new Error(message)
  error.check = { name, ...details }
  throw error
}

function toFailure(error) {
  return {
    name: error?.check?.name || error?.name || 'Error',
    message: error?.message || String(error),
    ...error?.check,
  }
}

async function openFiles(page) {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })
  await page.locator('.prototype-shell').waitFor({ state: 'visible' })
  await page.locator('.module-nav button[aria-label="文件"]').click()
  await page.locator('.prototype-shell[data-module="files"]').waitFor({ state: 'visible' })
}

async function clickTreeItem(page, label) {
  const mobileTreeButton = page.locator('.mobile-files-tree-button')
  if (await mobileTreeButton.isVisible().catch(() => false)) {
    if (await page.locator('.tree-pane.mobile-open').count() === 0) {
      await mobileTreeButton.click()
      await page.locator('.tree-pane.mobile-open').waitFor({ state: 'visible' })
    }
  }
  await page.locator('[aria-label="Pod file tree"]').getByRole('button', { name: label, exact: true }).click()
}

async function expectSingleAccessibleClose(page, selector, label, name) {
  const count = await page.locator(`${selector} button[aria-label="${label}"]`).count()
  if (count !== 1) {
    fail(name, `Expected exactly one accessible "${label}" button, found ${count}`, { count })
  }
  pass(name, { count })
}

async function expectDetached(page, selector, name) {
  await page.locator(selector).waitFor({ state: 'detached' })
  pass(name)
}

async function runDesktopChecks(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.setDefaultTimeout(10000)
  await page.addInitScript((keys) => {
    keys.forEach((key) => window.localStorage.removeItem(key))
  }, prototypeStorageKeys)
  await openFiles(page)

  await page.locator('main.structured-work h1', { hasText: '.vocab/terms.ttl' }).waitFor()
  await page.locator('.files-header button[title="Access"]').first().click()
  await page.locator('.access-modal-layer[role="dialog"]').waitFor()
  await expectSingleAccessibleClose(page, '.access-modal-layer', 'Close access policy', 'access-dialog-has-single-close-target')
  await page.keyboard.press('Escape')
  await expectDetached(page, '.access-modal-layer', 'access-dialog-closes-on-escape')

  await clickTreeItem(page, 'linx-prototype.ttl')
  await page.locator('main.structured-work h1', { hasText: '.data/workspaces/linx-prototype.ttl' }).waitFor()

  await page.locator('.class-scope-button').first().click()
  await page.locator('.structured-filter-menu').waitFor()
  await page.keyboard.press('Escape')
  await expectDetached(page, '.structured-filter-menu', 'class-filter-closes-on-escape')
  await page.locator('.class-scope-button').first().click()
  await page.locator('.structured-filter-menu').waitFor()
  await page.locator('button[aria-label="Show or hide predicate columns"]').click()
  await page.locator('.predicate-visibility-menu').waitFor()
  const stackedFilterCount = await page.locator('.structured-filter-menu').count()
  if (stackedFilterCount !== 0) {
    fail('opening-predicate-visibility-closes-class-filter', `Expected class filter to close, found ${stackedFilterCount}`)
  }
  pass('opening-predicate-visibility-closes-class-filter')

  const sortButton = page.locator('button[aria-label^="Sort structured table"]').first()
  await sortButton.click()
  await page.locator('.structured-sort-state[data-sort-mode="asc"]').waitFor()
  const sortLabel = await sortButton.getAttribute('aria-label')
  if (!sortLabel?.includes('ascending')) {
    fail('sort-button-exposes-current-state', `Expected sort aria-label to include ascending, got ${sortLabel}`)
  }
  pass('sort-button-exposes-current-state', { ariaLabel: sortLabel })

  await page.locator('.class-scope-button').first().click()
  await page.locator('.class-filter-pick').filter({ hasText: 'Workspace' }).first().click()
  const enumCell = page.locator('.subject-row[data-subject="#WorkspaceMeta"] .predicate-value[data-predicate-id="udfs:runtimeStatus"] .cell-editor')
  await enumCell.click()
  await page.locator('.enum-popover').waitFor()
  const nestedPopoverCount = await page.locator('.cell-editor .enum-popover').count()
  if (nestedPopoverCount !== 0) {
    fail('enum-popover-is-not-nested-in-clickable-cell', `Expected enum popover outside cell editor, found ${nestedPopoverCount}`)
  }
  await page.locator('.enum-option-pick').filter({ hasText: 'paused' }).click()
  await page.locator('.subject-row[data-subject="#WorkspaceMeta"] .predicate-value[data-predicate-id="udfs:runtimeStatus"]').filter({ hasText: 'paused' }).waitFor()
  pass('enum-cell-opens-and-commits-with-stable-popover')

  await clickTreeItem(page, 'files')
  await page.locator('main.file-open-work h1', { hasText: 'files' }).waitFor()
  await page.locator('.folder-browser[data-folder-root="files"]').waitFor()
  pass('root-files-tree-row-opens-folder-detail')

  await clickTreeItem(page, 'docs')
  await page.locator('main.file-open-work h1', { hasText: 'docs' }).waitFor()
  await page.locator('button[aria-label="Folder column view"]').click()
  await page.locator('.folder-browser[data-view="column"] .folder-middle-column').waitFor()
  await page.locator('button[aria-label="Folder icon view"]').click()
  await page.locator('.folder-browser[data-view="icon"] .folder-browser-list[data-layout="icon-grid"]').waitFor()
  await page.locator('button[aria-label="Folder list view"]').click()
  await page.locator('.folder-browser[data-view="list"] .folder-browser-list[data-layout="list"]').waitFor()
  pass('folder-view-modes-render-distinct-layouts')

  await clickTreeItem(page, 'multi-channel-access.md')
  await page.locator('.file-detail-layer[role="dialog"][aria-label="multi-channel-access.md detail"]').waitFor()
  await expectSingleAccessibleClose(page, '.file-detail-layer', 'Close file detail', 'file-detail-has-single-close-target')
  await page.keyboard.press('Escape')
  await expectDetached(page, '.file-detail-layer', 'file-detail-closes-on-escape')

  const treePaddingBottom = await page.locator('.folder-tree').evaluate((node) => {
    return Number.parseFloat(window.getComputedStyle(node).paddingBottom)
  })
  if (treePaddingBottom < 40) {
    fail('desktop-file-tree-reserves-bottom-breathing-room', `Expected >= 40px bottom padding, got ${treePaddingBottom}`)
  }
  pass('desktop-file-tree-reserves-bottom-breathing-room', { paddingBottom: treePaddingBottom })

  await page.close()
}

async function runMobileChecks(browser) {
  const page = await browser.newPage({ isMobile: true, viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(10000)
  await page.addInitScript((keys) => {
    keys.forEach((key) => window.localStorage.removeItem(key))
  }, prototypeStorageKeys)
  await openFiles(page)

  await clickTreeItem(page, 'docs')
  await page.locator('main.file-open-work h1', { hasText: 'docs' }).waitFor()
  await clickTreeItem(page, 'linx-prototype.ttl')
  await page.locator('.tree-pane.mobile-open').waitFor({ state: 'detached' })
  await page.locator('main.structured-work h1', { hasText: '.data/workspaces/linx-prototype.ttl' }).waitFor()
  pass('mobile-tree-direct-ttl-navigation-switches-content')

  await page.close()
}

let browser

try {
  browser = await chromium.launch({ headless: true })
  await runDesktopChecks(browser)
  await runMobileChecks(browser)
  result.ok = true
} catch (error) {
  result.error = toFailure(error)
  process.exitCode = 1
} finally {
  if (browser) await browser.close()
  result.durationMs = Date.now() - startedAt
  process.stdout.write(`${JSON.stringify(result)}\n`)
}
