import assert from 'node:assert/strict'
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { cleanPublicEvidenceArtifacts } from './rc-public-evidence-cleanup.mjs'

function workspace(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rc-public-evidence-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const results = path.join(root, 'test-results')
  mkdirSync(results, { recursive: true })
  return { root, results }
}

/** A failed attempt directory with the page snapshot Playwright writes even without traces. */
function failedAttempt(results, name, text) {
  const dir = path.join(results, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'error-context.md'),
    `# Page snapshot\n- textbox "密码": ${text}\n`,
  )
  return dir
}

test('drops both authenticated specs and any unknown spec, keeps public evidence', (t) => {
  const { results } = workspace(t)
  // Both RC specs that sign in with the seeded accounts leave the same shape:
  // per-test directory, error context with the filled password, retry suffix.
  const signedIn = failedAttempt(results, 'deployed-signed-in-signs-in-chromium', 'Linx-fake-alice-password')
  const signedInRetry = failedAttempt(results, 'deployed-signed-in-signs-in-chromium-retry1', 'Linx-fake-alice-password')
  const sharedGroup = failedAttempt(results, 'rc-shared-group-shared-group-acceptance-chromium', 'Linx-fake-bob-password')
  // A future authenticated spec the allow-list has not been taught about yet:
  // it must be dropped too (fail closed), not uploaded because its name is new.
  const futureSpec = failedAttempt(results, 'future-seeded-acceptance-some-test-chromium', 'Linx-fake-future-password')
  writeFileSync(path.join(results, 'deployed-signed-in-signs-in-chromium.txt'), 'fake stdout\n')
  writeFileSync(path.join(results, 'rc-shared-group-shared-group-acceptance-chromium.txt'), 'fake stdout\n')
  // Public, non-credential evidence that must stay useful to the release record.
  const smokeDir = failedAttempt(results, 'deployed-web-smoke-smoke-chromium', 'public smoke context')
  mkdirSync(path.join(results, 'native-evidence'), { recursive: true })
  writeFileSync(path.join(results, 'native-evidence', 'budget.json'), '{}\n')
  writeFileSync(path.join(results, '.last-run.json'), '{"status":"failed"}\n')

  const { removed, kept, absent } = cleanPublicEvidenceArtifacts(results)

  assert.equal(absent, false)
  assert.deepEqual(removed.sort(), [
    'deployed-signed-in-signs-in-chromium',
    'deployed-signed-in-signs-in-chromium-retry1',
    'deployed-signed-in-signs-in-chromium.txt',
    'future-seeded-acceptance-some-test-chromium',
    'rc-shared-group-shared-group-acceptance-chromium',
    'rc-shared-group-shared-group-acceptance-chromium.txt',
  ])
  assert.deepEqual(kept.sort(), ['.last-run.json', 'deployed-web-smoke-smoke-chromium', 'native-evidence'])
  // lstat proves the entry nodes are gone; a remaining empty directory would
  // still throw on readFileSync, so that assertion alone is not evidence.
  for (const removedPath of [signedIn, signedInRetry, sharedGroup, futureSpec]) {
    assert.throws(() => lstatSync(removedPath), { code: 'ENOENT' })
  }
  assert.throws(() => lstatSync(path.join(results, 'deployed-signed-in-signs-in-chromium.txt')), { code: 'ENOENT' })
  // No surviving file in the tree still contains any fake seeded password.
  for (const relative of ['.last-run.json', 'deployed-web-smoke-smoke-chromium/error-context.md', 'native-evidence/budget.json']) {
    assert.doesNotMatch(readFileSync(path.join(results, relative), 'utf8'), /Linx-fake-(alice|bob|future)-password/u)
  }
  assert.match(readFileSync(path.join(smokeDir, 'error-context.md'), 'utf8'), /public smoke context/u)
})

test('a missing results root is nothing to sanitize, not an error', (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'rc-public-evidence-absent-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const missing = path.join(root, 'test-results')
  assert.deepEqual(cleanPublicEvidenceArtifacts(missing), { removed: [], kept: [], absent: true })
})

test('a matching symlink is removed as a link, never as its target', (t) => {
  const { root, results } = workspace(t)
  const outside = path.join(root, 'outside')
  mkdirSync(outside, { recursive: true })
  const precious = path.join(outside, 'keep.txt')
  writeFileSync(precious, 'outside content that must survive\n')
  const link = path.join(results, 'deployed-signed-in-signs-in-chromium')
  symlinkSync(outside, link)
  // A directory removed by the allow-list can also hide a link to an outside
  // path; recursive removal must unlink it instead of following it.
  const linkedInside = path.join(results, 'rc-shared-group-with-link')
  mkdirSync(linkedInside, { recursive: true })
  symlinkSync(outside, path.join(linkedInside, 'escape'))

  const { removed } = cleanPublicEvidenceArtifacts(results)

  assert.deepEqual(removed.sort(), [
    'deployed-signed-in-signs-in-chromium',
    'rc-shared-group-with-link',
  ])
  assert.throws(() => lstatSync(link), { code: 'ENOENT' })
  assert.throws(() => lstatSync(linkedInside), { code: 'ENOENT' })
  // The directory the links pointed at and its file are intact.
  assert.equal(readFileSync(precious, 'utf8'), 'outside content that must survive\n')
})

test('a symlinked results root is refused so outside entries are never deleted', (t) => {
  const { root } = workspace(t)
  const external = path.join(root, 'external')
  mkdirSync(external, { recursive: true })
  const outsider = path.join(external, 'deployed-signed-in-signs-in-chromium.txt')
  writeFileSync(outsider, 'external evidence that must survive\n')
  const externalDir = path.join(external, 'deployed-signed-in-signs-in-chromium')
  mkdirSync(externalDir, { recursive: true })
  const linkedRoot = path.join(root, 'linked-test-results')
  symlinkSync(external, linkedRoot)

  assert.throws(() => cleanPublicEvidenceArtifacts(linkedRoot), /symlinked results root/)
  // Fail closed means the entries outside the intended root survive.
  assert.equal(readFileSync(outsider, 'utf8'), 'external evidence that must survive\n')
  assert.ok(lstatSync(externalDir).isDirectory())
})

test('an unsanitizable root fails closed instead of reporting success', (t) => {
  const { root } = workspace(t)
  // A regular file where the results directory belongs is not an enumerable root.
  const asFile = path.join(root, 'not-a-directory')
  writeFileSync(asFile, 'not a results directory\n')
  assert.throws(() => cleanPublicEvidenceArtifacts(asFile), /requires a directory results root/)
  assert.throws(() => cleanPublicEvidenceArtifacts('relative/test-results'), /absolute results root/)
})
