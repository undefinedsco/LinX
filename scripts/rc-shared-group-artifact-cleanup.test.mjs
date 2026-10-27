import assert from 'node:assert/strict'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { cleanSharedGroupArtifacts } from './rc-shared-group-artifact-cleanup.mjs'

function workspace(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rc-shared-group-cleanup-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const results = path.join(root, 'test-results')
  mkdirSync(results, { recursive: true })
  return { root, results }
}

test('removes only the shared-group spec output and keeps unrelated results', (t) => {
  const { results } = workspace(t)
  // A failed shared-group attempt leaves a directory with error context that can
  // quote the provider page, plus the attachment Playwright wrote beside it.
  const sharedDir = path.join(results, 'rc-shared-group-shared-group-acceptance-chromium')
  mkdirSync(sharedDir, { recursive: true })
  writeFileSync(path.join(sharedDir, 'error-context.md'), 'provider password: fake-key-should-not-survive\n')
  writeFileSync(path.join(sharedDir, 'test-failed-1.png'), 'fake-png-bytes')
  writeFileSync(path.join(results, 'rc-shared-group-shared-group-acceptance-chromium.txt'), 'fake-key-should-not-survive\n')
  // Unrelated evidence that must stay: another spec, a smoke run, native output.
  const smokeDir = path.join(results, 'deployed-web-smoke-smoke-chromium')
  mkdirSync(smokeDir, { recursive: true })
  writeFileSync(path.join(smokeDir, 'error-context.md'), 'unrelated smoke context\n')
  writeFileSync(path.join(results, 'deployed-signed-in-signed-in-chromium.txt'), 'signed-in result\n')
  mkdirSync(path.join(results, 'native-evidence'), { recursive: true })
  writeFileSync(path.join(results, 'native-evidence', 'budget.json'), '{}\n')
  writeFileSync(path.join(results, '.last-run.json'), '{}\n')

  const { removed, absent } = cleanSharedGroupArtifacts(results)

  assert.equal(absent, false)
  assert.deepEqual(removed.sort(), [
    'rc-shared-group-shared-group-acceptance-chromium',
    'rc-shared-group-shared-group-acceptance-chromium.txt',
  ])
  // The fake secret material is gone from the tree. lstat proves the entries
  // themselves are unlinked: readFileSync alone would also throw EISDIR on a
  // surviving directory, so it cannot show deletion.
  assert.throws(() => lstatSync(sharedDir), { code: 'ENOENT' })
  assert.throws(() => lstatSync(path.join(results, 'rc-shared-group-shared-group-acceptance-chromium.txt')), { code: 'ENOENT' })
  assert.throws(() => lstatSync(path.join(sharedDir, 'error-context.md')), { code: 'ENOENT' })
  // Everything unrelated survives untouched.
  assert.equal(readFileSync(path.join(smokeDir, 'error-context.md'), 'utf8'), 'unrelated smoke context\n')
  assert.equal(readFileSync(path.join(results, 'deployed-signed-in-signed-in-chromium.txt'), 'utf8'), 'signed-in result\n')
  assert.equal(readFileSync(path.join(results, 'native-evidence', 'budget.json'), 'utf8'), '{}\n')
  assert.equal(readFileSync(path.join(results, '.last-run.json'), 'utf8'), '{}\n')
})

test('a missing results root is nothing to sanitize, not an error', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rc-shared-group-absent-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const missing = path.join(root, 'test-results')
  const result = cleanSharedGroupArtifacts(missing)
  assert.deepEqual(result, { removed: [], absent: true })
})

test('a matching symlink is removed as a link, never as its target', (t) => {
  const { root, results } = workspace(t)
  const outside = path.join(root, 'outside')
  mkdirSync(outside, { recursive: true })
  const precious = path.join(outside, 'keep.txt')
  writeFileSync(precious, 'outside content that must survive\n')
  const link = path.join(results, 'rc-shared-group-shared-group-acceptance-chromium')
  symlinkSync(outside, link)

  const { removed } = cleanSharedGroupArtifacts(results)

  assert.deepEqual(removed, ['rc-shared-group-shared-group-acceptance-chromium'])
  // lstat proves the link node itself is gone; readFileSync would also throw
  // EISDIR on a surviving link-to-directory, so it cannot evidence deletion.
  assert.throws(() => lstatSync(link), { code: 'ENOENT' })
  // The directory it pointed at and its file are intact.
  assert.equal(readFileSync(precious, 'utf8'), 'outside content that must survive\n')
})

test('a symlinked results root is refused so outside entries are never deleted', (t) => {
  const { root } = workspace(t)
  const external = path.join(root, 'external')
  mkdirSync(external, { recursive: true })
  const outsider = path.join(external, 'rc-shared-group-shared-group-acceptance-chromium.txt')
  writeFileSync(outsider, 'external evidence that must survive\n')
  const externalDir = path.join(external, 'rc-shared-group-shared-group-acceptance-chromium')
  mkdirSync(externalDir, { recursive: true })
  const linkedRoot = path.join(root, 'linked-test-results')
  symlinkSync(external, linkedRoot)

  assert.throws(() => cleanSharedGroupArtifacts(linkedRoot), /symlinked results root/)
  // Fail closed means the matching entries outside the intended root survive.
  assert.equal(readFileSync(outsider, 'utf8'), 'external evidence that must survive\n')
  assert.ok(lstatSync(externalDir).isDirectory())
})

test('an unsanitizable root fails closed instead of reporting success', (t) => {
  const { root } = workspace(t)
  // A regular file where the results directory belongs is not an enumerable root.
  const asFile = path.join(root, 'not-a-directory')
  writeFileSync(asFile, 'not a results directory\n')
  assert.throws(() => cleanSharedGroupArtifacts(asFile), /requires a directory results root/)
  assert.throws(() => cleanSharedGroupArtifacts('relative/test-results'), /absolute results root/)
})
