import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = new URL('../../..', import.meta.url).pathname
const libRoot = join(repoRoot, 'apps/cli/src/lib')
const adapterSegment = `${join('pi-adapter')}/`

test('non-adapter shell/core modules do not import from pi-adapter internals', () => {
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (importsPiAdapterInternal(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

function listSourceFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path))
      continue
    }
    if (/\.[cm]?tsx?$/u.test(entry)) {
      files.push(path)
    }
  }
  return files
}

function importsPiAdapterInternal(source) {
  return /\bfrom\s+['"][^'"]*pi-adapter\/[^'"]*['"]/u.test(source)
    || /\bimport\s*\(\s*['"][^'"]*pi-adapter\/[^'"]*['"]\s*\)/u.test(source)
}
