import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
  const podDatabaseSource = readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'pod-database.js'), 'utf-8')
  const podDialectSource = readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'pod-dialect.js'), 'utf-8')
  const podSessionSource = readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'pod-session.js'), 'utf-8')
  const podExecutorSource = readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'execution', 'pod-executor.js'), 'utf-8')
  const sparqlStrategySource = readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'execution', 'sparql-strategy.js'), 'utf-8')
  const comunicaPatchSource = readFileSync(comunicaPatchPath, 'utf-8')
  const sparqlEngineSource = readFileSync(sparqlEnginePath, 'utf-8')

  assert.match(resolverSource, /resolveTemplateVariable/)
  assert.match(resolverSource, /Unresolved URI template variable/)
  assert.match(tripleBuilderSource, /__currentRecord/)
  assert.match(tripleBuilderSource, /createContext\(record, currentTable\)/)
  assert.match(podDatabaseSource, /findByIriViaExactResource/)
  assert.match(podDatabaseSource, /collection sidecar SPARQL endpoint/)
  assert.match(podDatabaseSource, /CONTAINS\(STR\(\?subject\)/)
  assert.match(podDatabaseSource, /subjectMatchesShortId/)
  assert.match(podDatabaseSource, /getIndexedSubject\(resource, id\)/)
  assert.match(podDatabaseSource, /lookupIndexedResourceSubject/)
  assert.match(podDatabaseSource, /LIMIT 50/)
  assert.match(podDatabaseSource, /nonIdRequiredKeys/)
  assert.match(podDatabaseSource, /local fragment id/)
  assert.match(podDialectSource, /shortIdSubjectIndex/)
  assert.match(podDialectSource, /registerResourceSubject/)
  assert.match(podDialectSource, /lookupIndexedResourceSubject/)
  assert.match(podSessionSource, /updateSubjectIndex\(operation, result\)/)
  assert.match(podSessionSource, /generateSubjectUri/)
  const baseResolverSource = readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'resource-resolver', 'base-resolver.js'), 'utf-8')
  const resourceReferenceSource = readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'resource-reference.js'), 'utf-8')
  assert.match(baseResolverSource, /parseTemplateId\(table, subjectUri\)/)
  assert.match(baseResolverSource, /extractRelativeSubjectId\(table, subjectUri\)/)
  assert.match(baseResolverSource, /resolveBaseRelativeSubjectId\(table, value\)/)
  assert.match(baseResolverSource, /row\.id is base-relative resource id|row\.id .*base-relative/)
  assert.match(resourceReferenceSource, /parsePodResourceRef/)
  assert.match(resourceReferenceSource, /extractPodResourceTemplateValue/)
  assert.match(resourceReferenceSource, /qualifyFragmentResourceId\(resource, relativeSubject\)/)
  assert.match(resourceReferenceSource, /resourceId: decodeURIComponent\(resourceId\)/)
  assert.doesNotMatch(podDatabaseSource, /function isBaseRelativeSubjectId[\s\S]*?value\.includes\(['"]\/['"]\)[\s\S]*?\n\}/)
  assert.doesNotMatch(readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'resource-reference.js'), 'utf-8'), /function isBaseRelativeSubjectId[\s\S]*?value\.includes\(['"]\/['"]\)[\s\S]*?\n\}/)
  const registerTableSource = podDialectSource.match(/async registerTable\(table\) \{[\s\S]*?\n    \}/)?.[0] ?? ''
  const registerTableSkipBlocks = registerTableSource.match(/if \(this\.shouldSkipResourcePreparation\(\)\)/g) ?? []
  assert.equal(registerTableSkipBlocks.length, 1)
  assert.match(podExecutorSource, /Exact resource reads already know the concrete Pod document/)
  assert.match(podExecutorSource, /skipResourceExistenceCheck/)
  assert.match(sparqlStrategySource, /resolvePodResourceIri\(value\)/)
  assert.match(sparqlStrategySource, /return this\.resolvePodResourceIri\(table\.config\?\.base\)/)
  const ldpExecutorSource = readFileSync(join(packageRoot, 'dist', 'esm', 'core', 'execution', 'ldp-executor.js'), 'utf-8')
  assert.match(ldpExecutorSource, /if \(options\.skipResourceExistenceCheck\) \{[\s\S]*?method: 'PATCH'/)
  assert.doesNotMatch(ldpExecutorSource, /skipResourceExistenceCheck && !group\.hasFragmentSubject/)
  assert.match(comunicaPatchSource, /export const applyComunicaPatches = /)
  assert.match(comunicaPatchSource, /ActionObserverHttp/)
  assert.match(sparqlEngineSource, /await import\('@comunica\/query-sparql-solid'\)/)
  assert.match(sparqlEngineSource, /applyComunicaPatches/)
  assert.match(sparqlEngineSource, /createNodeModuleSparqlEngineFactory/)
})

test('drizzle-solid SPARQL strategy resolves root-relative graph IRIs against Pod root', async () => {
  const { SparqlStrategy } = await import(pathToFileURL(join(packageRoot, 'dist', 'esm', 'core', 'execution', 'sparql-strategy.js')))
  const strategy = new SparqlStrategy({
    sparqlExecutor: {},
    sparqlConverter: {},
    podUrl: 'https://id.undefineds.co/ganbb/',
    uriResolver: {
      getResourceMode() {
        return 'fragment'
      },
    },
  })
  const graph = strategy.resolveTargetGraph({
    config: {
      base: '/settings/credentials.ttl',
    },
  })

  assert.equal(graph, 'https://id.undefineds.co/ganbb/settings/credentials.ttl')
})
