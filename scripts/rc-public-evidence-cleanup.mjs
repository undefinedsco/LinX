import { lstatSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

/**
 * Reduce the RC job's Playwright results tree to public, credential-free
 * evidence before `candidate.yml` uploads it.
 *
 * The job runs three specs: the public `deployed-web-smoke`, and two specs that
 * sign in with the per-run seeded accounts (`deployed-signed-in` with Alice,
 * `rc-shared-group` with Alice and Bob). The provider pages of those two carry
 * that run's passwords. `trace/screenshot/video = off` does not stop Playwright
 * from writing `error-context.md` for a failed attempt: its page snapshot
 * contains live input values, including the password field. The upload only runs
 * on failure, which is exactly when that file exists.
 *
 * This is an allow-list, not a blocklist: only the known-public smoke results,
 * Playwright's own `.last-run.json`, and explicit `native-evidence` survive.
 * Everything else — both signed-in specs, retry/suffix attachments, and any
 * future spec this job may add — is removed. A list of "known bad" names would
 * silently miss the next authenticated spec, which is the defect this replaces.
 *
 * A missing results root means nothing was produced to sanitize (success). Any
 * other failure (unreadable directory, unremovable entry, symlinked root)
 * throws, so the workflow fails closed and uploads nothing.
 */

/** Public, non-credential results that must stay useful to the release record. */
const PUBLIC_RESULT_NAMES = ['native-evidence', '.last-run.json']
/**
 * `deployed-web-smoke` never signs in; Playwright appends the test title and
 * project to its output directory, so only a prefix identifies it.
 */
const PUBLIC_RESULT_PREFIXES = ['deployed-web-smoke-']

/** True when a direct child of the results root is known-public evidence. */
function isPublicEntry(name) {
  return PUBLIC_RESULT_NAMES.includes(name)
    || PUBLIC_RESULT_PREFIXES.some((prefix) => name.startsWith(prefix))
}

/**
 * Delete a direct child without following symlinks out of the root.
 *
 * The recursive walk is explicit (`lstat` each entry, `unlink` links/files,
 * `rmdir` real directories) rather than `rmSync(..., { recursive: true })`, so
 * the no-follow rule is enforced here instead of relying on another API's
 * platform behavior. A link anywhere inside a removed directory is unlinked,
 * never walked through.
 */
function removeEntry(target) {
  const stats = lstatSync(target)
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    unlinkSync(target)
    return
  }
  for (const name of readdirSync(target)) {
    const child = path.join(target, name)
    // readdir cannot return separators, but keep the containment check explicit.
    if (path.dirname(child) !== target) {
      throw new Error(`RC evidence cleanup refused an outside path: ${name}`)
    }
    removeEntry(child)
  }
  rmdirSync(target)
}

/**
 * @param {string} resultsRoot absolute path to `tests/e2e/test-results`
 * @returns {{removed: string[], kept: string[], absent: boolean}}
 */
export function cleanPublicEvidenceArtifacts(resultsRoot) {
  if (typeof resultsRoot !== 'string' || !path.isAbsolute(resultsRoot)) {
    throw new Error('RC evidence cleanup requires an absolute results root')
  }
  const root = path.resolve(resultsRoot)
  // The root itself must be a real directory: readdirSync would follow a symlinked
  // root and this function would then delete entries outside the tree the caller
  // meant to sanitize. A missing root is still just "nothing to sanitize".
  let rootStats
  try {
    rootStats = lstatSync(root)
  } catch (error) {
    if (error?.code === 'ENOENT') return { removed: [], kept: [], absent: true }
    throw new Error(`RC evidence cleanup could not stat ${root}: ${error?.code ?? 'unknown'}`)
  }
  if (rootStats.isSymbolicLink()) {
    throw new Error(`RC evidence cleanup refused a symlinked results root: ${root}`)
  }
  if (!rootStats.isDirectory()) {
    throw new Error(`RC evidence cleanup requires a directory results root: ${root}`)
  }
  let names
  try {
    names = readdirSync(root)
  } catch (error) {
    if (error?.code === 'ENOENT') return { removed: [], kept: [], absent: true }
    throw new Error(`RC evidence cleanup could not read ${root}: ${error?.code ?? 'unknown'}`)
  }
  const removed = []
  const kept = []
  for (const name of [...names].sort()) {
    if (isPublicEntry(name)) {
      kept.push(name)
      continue
    }
    const target = path.join(root, name)
    // Refuse to escape the results root even though the child came from readdir.
    if (path.dirname(target) !== root) {
      throw new Error(`RC evidence cleanup refused an outside path: ${name}`)
    }
    try {
      removeEntry(target)
    } catch (error) {
      throw new Error(`RC evidence cleanup could not remove ${name}: ${error?.code ?? 'unknown'}`)
    }
    removed.push(name)
  }
  return { removed, kept, absent: false }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = process.argv[2]
  if (!root) {
    console.error('usage: node scripts/rc-public-evidence-cleanup.mjs <results-root>')
    process.exit(2)
  }
  try {
    const { removed, absent } = cleanPublicEvidenceArtifacts(root)
    if (absent) console.log('RC evidence: no results root, nothing to sanitize')
    else console.log(`RC evidence: removed ${removed.length} non-public entr${removed.length === 1 ? 'y' : 'ies'}`)
  } catch (error) {
    console.error(`::error::${error.message}`)
    process.exit(1)
  }
}
