import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const packageRoot = join(repoRoot, 'node_modules', '@undefineds.co', 'drizzle-solid')
const comunicaPatchPath = join(packageRoot, 'dist', 'esm', 'core', 'comunica-patch.js')
const sparqlEnginePath = join(packageRoot, 'dist', 'esm', 'core', 'sparql-engine.js')

test('drizzle-solid install includes the required URI-template runtime patch', () => {
  assert.equal(existsSync(comunicaPatchPath), true)
  assert.equal(existsSync(sparqlEnginePath), true)

  const resolverSource = readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'uri', 'resolver.js'), 'utf-8')
  const tripleBuilderSource = readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'triple', 'builder.js'), 'utf-8')
  const comunicaPatchSource = readFileSync(comunicaPatchPath, 'utf-8')
  const sparqlEngineSource = readFileSync(sparqlEnginePath, 'utf-8')

  assert.match(resolverSource, /resolveTemplateVariable/)
  assert.match(resolverSource, /Unresolved URI template variable/)
  assert.match(tripleBuilderSource, /__currentRecord/)
  assert.match(tripleBuilderSource, /createContext\(record, currentTable\)/)
  assert.match(comunicaPatchSource, /export const applyComunicaPatches = /)
  assert.match(comunicaPatchSource, /ActionObserverHttp/)
  assert.match(sparqlEngineSource, /await import\('@comunica\/query-sparql-solid'\)/)
  assert.match(sparqlEngineSource, /applyComunicaPatches/)
  assert.match(sparqlEngineSource, /createNodeModuleSparqlEngineFactory/)
})
