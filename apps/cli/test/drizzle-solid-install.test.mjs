import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const obsoletePatchPath = join(repoRoot, 'patches', '@undefineds.co+drizzle-solid+0.3.0.patch')
const packageRoot = join(repoRoot, 'node_modules', '@undefineds.co', 'drizzle-solid')
const comunicaPatchPath = join(packageRoot, 'dist', 'esm', 'core', 'comunica-patch.js')
const sparqlEnginePath = join(packageRoot, 'dist', 'esm', 'core', 'sparql-engine.js')

test('drizzle-solid install no longer relies on local patch-package override', () => {
  assert.equal(existsSync(obsoletePatchPath), false)
  assert.equal(existsSync(comunicaPatchPath), true)
  assert.equal(existsSync(sparqlEnginePath), true)

  const comunicaPatchSource = readFileSync(comunicaPatchPath, 'utf-8')
  const sparqlEngineSource = readFileSync(sparqlEnginePath, 'utf-8')

  assert.match(comunicaPatchSource, /applyComunicaPatches = \(\) => false/)
  assert.match(sparqlEngineSource, /await import\('@comunica\/query-sparql-solid'\)/)
  assert.match(sparqlEngineSource, /void resolveFrom;/)
  assert.doesNotMatch(sparqlEngineSource, /resolveCreateRequire/)
})
