import { lstatSync, readdirSync, rmSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

/**
 * Remove the shared-group spec's own Playwright output entries before the RC job
 * uploads `tests/e2e/test-results`.
 *
 * The RC shared-group spec drives two real seed sign-ins, so its provider pages
 * carry that run's seed passwords. The spec disables trace/screenshot/video, but
 * Playwright still emits per-test output directories (error context, network
 * attachments, and whatever it captured for a failed attempt), and the workflow
 * uploads the whole `test-results` tree on failure. This drops only entries whose
 * name belongs to that spec; every other result, gate and native evidence stays.
 *
 * A missing results root means the run produced nothing to sanitize, which is a
 * success. Any other failure (unreadable directory, entry that cannot be
 * removed) throws so the workflow can fail closed instead of uploading.
 */

/** Playwright output entries start with the spec basename, followed by the test/project suffix. */
const SHARED_GROUP_PREFIX = 'rc-shared-group-'

/** True when a direct child of the results root belongs to the shared-group spec. */
function isSharedGroupEntry(name) {
  return name.startsWith(SHARED_GROUP_PREFIX)
}

/**
 * Delete matching direct children without following symlinks out of the root.
 *
 * `rmSync` with `recursive` removes a symlink itself rather than its target, but
 * an explicit lstat keeps that guarantee independent of the implementation.
 */
function removeEntry(target) {
  const stats = lstatSync(target)
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    unlinkSync(target)
    return
  }
  rmSync(target, { recursive: true, force: true })
}

/**
 * @param {string} resultsRoot absolute path to `tests/e2e/test-results`
 * @returns {{removed: string[], absent: boolean}}
 */
export function cleanSharedGroupArtifacts(resultsRoot) {
  if (typeof resultsRoot !== 'string' || !path.isAbsolute(resultsRoot)) {
    throw new Error('shared-group artifact cleanup requires an absolute results root')
  }
  // The root itself must be a real directory: readdirSync would follow a symlinked
  // root and this function would then delete matching entries outside the tree the
  // caller meant to sanitize. A missing root is still just "nothing to sanitize".
  let rootStats
  try {
    rootStats = lstatSync(resultsRoot)
  } catch (error) {
    if (error?.code === 'ENOENT') return { removed: [], absent: true }
    throw new Error(`shared-group artifact cleanup could not stat ${resultsRoot}: ${error?.code ?? 'unknown'}`)
  }
  if (rootStats.isSymbolicLink()) {
    throw new Error(`shared-group artifact cleanup refused a symlinked results root: ${resultsRoot}`)
  }
  if (!rootStats.isDirectory()) {
    throw new Error(`shared-group artifact cleanup requires a directory results root: ${resultsRoot}`)
  }
  let names
  try {
    names = readdirSync(resultsRoot)
  } catch (error) {
    if (error?.code === 'ENOENT') return { removed: [], absent: true }
    throw new Error(`shared-group artifact cleanup could not read ${resultsRoot}: ${error?.code ?? 'unknown'}`)
  }
  const removed = []
  for (const name of names.filter(isSharedGroupEntry).sort()) {
    const target = path.join(resultsRoot, name)
    // Refuse to escape the results root even though the child came from readdir.
    if (path.dirname(target) !== path.resolve(resultsRoot)) {
      throw new Error(`shared-group artifact cleanup refused an outside path: ${name}`)
    }
    try {
      removeEntry(target)
    } catch (error) {
      throw new Error(`shared-group artifact cleanup could not remove ${name}: ${error?.code ?? 'unknown'}`)
    }
    removed.push(name)
  }
  return { removed, absent: false }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = process.argv[2]
  if (!root) {
    console.error('usage: node scripts/rc-shared-group-artifact-cleanup.mjs <results-root>')
    process.exit(2)
  }
  try {
    const { removed, absent } = cleanSharedGroupArtifacts(root)
    if (absent) console.log('shared-group artifacts: no results root, nothing to sanitize')
    else console.log(`shared-group artifacts: removed ${removed.length} entr${removed.length === 1 ? 'y' : 'ies'}`)
  } catch (error) {
    console.error(`::error::${error.message}`)
    process.exit(1)
  }
}
