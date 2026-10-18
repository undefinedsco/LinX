#!/usr/bin/env node
/**
 * Release-candidate metadata for LinX Web (docs/RELEASE.md).
 *
 * Only `staging` produces candidates. The version comes from the root package.json and the
 * workflow run: `<version>-rc.<run>`; a whole-workflow rerun gets `<version>-rc.<run>.<attempt>`.
 * Prints JSON: { candidate, sourceSha, shaTag, version }.
 */
import { readFileSync } from 'node:fs'
import process from 'node:process'

export function resolveCandidate({ branch, runNumber, runAttempt, sha, version }) {
  if (branch !== 'staging') throw new Error('merge into staging before requesting an RC')
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`source sha must be a full commit sha: ${sha}`)
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`root package.json version must be X.Y.Z: ${version}`)
  const run = Number(runNumber)
  const attempt = Number(runAttempt)
  if (!Number.isInteger(run) || run < 1) throw new Error(`invalid run number: ${runNumber}`)
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error(`invalid run attempt: ${runAttempt}`)
  const candidate = attempt > 1 ? `${version}-rc.${run}.${attempt}` : `${version}-rc.${run}`
  return { candidate, sourceSha: sha, shaTag: `sha-${sha}`, version }
}

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    console.log(JSON.stringify(resolveCandidate({
      branch: readArg('branch'),
      runNumber: readArg('run-number'),
      runAttempt: readArg('run-attempt'),
      sha: readArg('sha'),
      version: pkg.version,
    })))
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
