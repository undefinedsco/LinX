import { cpSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const packageDistRoot = path.resolve('node_modules/@undefineds.co/drizzle-solid/dist')
const packageRoot = path.dirname(packageDistRoot)
const packageEsmRoot = path.join(packageDistRoot, 'esm')
const localDrizzleSolidDistRoot = path.resolve('../drizzle-solid/dist')
const sourceMapPattern = /\n\/\/# sourceMappingURL=.*$/m

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)
    return stats.isDirectory() ? walk(fullPath) : [fullPath]
  })
}

if (statSync(path.resolve('node_modules'), { throwIfNoEntry: false }) == null) {
  process.exit(0)
}

if (statSync(packageDistRoot, { throwIfNoEntry: false }) == null) {
  process.exit(0)
}

syncLocalDrizzleSolidDist(packageDistRoot)
patchDrizzleSolidPodUrlForwarding(packageDistRoot)
patchDrizzleSolidExplicitPodUrlLock(packageDistRoot)
patchDrizzleSolidResourceIdSemantics(packageDistRoot)
patchDrizzleSolidBaseRelativeIdClassifier(packageDistRoot)
patchDrizzleSolidExactResourceReads(packageDistRoot)
patchDrizzleSolidShortIdSubjectIndex(packageDistRoot)
patchDrizzleSolidSparqlTargetGraphs(packageDistRoot)
patchDrizzleSolidResourcePreparation(packageDistRoot)
stripEsmSourceMapUrls(packageEsmRoot)
assertPatchedDrizzleSolid(packageDistRoot)
normalizeNestedDrizzleSolidInstalls(packageRoot)

function syncLocalDrizzleSolidDist(root) {
  if (statSync(localDrizzleSolidDistRoot, { throwIfNoEntry: false }) == null) {
    return
  }

  if (samePath(localDrizzleSolidDistRoot, root)) {
    return
  }

  cpSync(localDrizzleSolidDistRoot, root, { recursive: true })
}

function normalizeNestedDrizzleSolidInstalls(sourceRoot) {
  const sourceDistRoot = path.join(sourceRoot, 'dist')
  for (const nestedRoot of findNestedDrizzleSolidPackageRoots(findNodeModulesRoots())) {
    if (path.resolve(nestedRoot) === path.resolve(sourceRoot)) {
      continue
    }
    rmSync(path.join(nestedRoot, 'node_modules'), { recursive: true, force: true })
    cpSync(sourceDistRoot, path.join(nestedRoot, 'dist'), { recursive: true })
    stripEsmSourceMapUrls(path.join(nestedRoot, 'dist/esm'))
    assertPatchedDrizzleSolid(path.join(nestedRoot, 'dist'))
  }
}

function samePath(left, right) {
  try {
    return realpathSync(left) === realpathSync(right)
  } catch {
    return path.resolve(left) === path.resolve(right)
  }
}

function findNodeModulesRoots() {
  const roots = [path.resolve('node_modules')]
  for (const workspaceRoot of ['apps', 'packages']) {
    for (const entry of readdirSync(path.resolve(workspaceRoot), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const nodeModulesDir = path.resolve(workspaceRoot, entry.name, 'node_modules')
      if (statSync(nodeModulesDir, { throwIfNoEntry: false })?.isDirectory()) {
        roots.push(nodeModulesDir)
      }
    }
  }
  return roots
}

function findNestedDrizzleSolidPackageRoots(roots) {
  const matches = []

  function visitNodeModules(nodeModulesDir) {
    const candidate = path.join(nodeModulesDir, '@undefineds.co', 'drizzle-solid')
    if (statSync(candidate, { throwIfNoEntry: false })?.isDirectory()) {
      matches.push(candidate)
    }

    for (const entry of readdirSync(nodeModulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || entry.name === '.bin') continue

      if (entry.name.startsWith('@')) {
        const scopedRoot = path.join(nodeModulesDir, entry.name)
        for (const scopedEntry of readdirSync(scopedRoot, { withFileTypes: true })) {
          if (!scopedEntry.isDirectory()) continue
          const nestedNodeModules = path.join(scopedRoot, scopedEntry.name, 'node_modules')
          if (statSync(nestedNodeModules, { throwIfNoEntry: false })?.isDirectory()) {
            visitNodeModules(nestedNodeModules)
          }
        }
        continue
      }

      const nestedNodeModules = path.join(nodeModulesDir, entry.name, 'node_modules')
      if (statSync(nestedNodeModules, { throwIfNoEntry: false })?.isDirectory()) {
        visitNodeModules(nestedNodeModules)
      }
    }
  }

  for (const root of roots) {
    visitNodeModules(root)
  }
  return Array.from(new Set(matches.map((match) => path.resolve(match))))
}

function stripEsmSourceMapUrls(root) {
  if (statSync(root, { throwIfNoEntry: false }) == null) {
    return
  }

  for (const filePath of walk(root)) {
    if (!filePath.endsWith('.js')) continue

    const source = readFileSync(filePath, 'utf8')
    if (!sourceMapPattern.test(source)) continue

    writeFileSync(filePath, source.replace(sourceMapPattern, ''), 'utf8')
  }
}

function patchDrizzleSolidPodUrlForwarding(root) {
  const files = [
    path.join(root, 'driver.js'),
    path.join(root, 'esm/driver.js'),
    path.join(root, 'driver.d.ts'),
    path.join(root, 'esm/driver.d.ts'),
  ]

  for (const filePath of files) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }

    const source = readFileSync(filePath, 'utf8')
    const patched = filePath.endsWith('.d.ts')
      ? patchDriverTypes(source)
      : patchDriverRuntime(source)

    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }
}

function patchDriverRuntime(source) {
  if (source.includes('podUrl: config?.podUrl ?? session.info?.podUrl')) {
    return source
  }

  if (source.includes('podUrl: config?.podUrl')) {
    return source.replace(
      /podUrl: config\?\.podUrl/g,
      'podUrl: config?.podUrl ?? session.info?.podUrl',
    )
  }

  return source.replace(
    /(\s+storageTTL: config\?\.storageTTL,\n)/,
    `$1        podUrl: config?.podUrl ?? session.info?.podUrl,\n`,
  )
}

function patchDriverTypes(source) {
  if (source.includes('podUrl?: string;')) {
    return source
  }

  return source.replace(
    /(\s+storageTTL\?: number;\n)/,
    `$1    /** Explicit Pod base URL for IdP/SP split deployments. */\n    podUrl?: string;\n`,
  )
}

function patchDrizzleSolidExplicitPodUrlLock(root) {
  const files = [
    path.join(root, 'core/runtime/pod-runtime.js'),
    path.join(root, 'esm/core/runtime/pod-runtime.js'),
  ]

  for (const filePath of files) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }

    const source = readFileSync(filePath, 'utf8')
    const patched = patchPodRuntime(source)
    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }
}

function patchPodRuntime(source) {
  let patched = source

  if (!patched.includes('REQUEST_ID_DETECTION_TIMEOUT_MS')) {
    patched = patched.replace(
      /(\n\/\/ 生成唯一请求 ID\n)/,
      `\nconst REQUEST_ID_DETECTION_TIMEOUT_MS = 3000;\n$1`,
    )
  }

  patched = patched.replace(
    /async detectRequestIdSupport\(\) \{\n\s+const response = await globalThis\.fetch\(this\.podUrl, \{\n\s+method: 'OPTIONS',\n\s+\}\);\n\s+const allowedHeaders = response\.headers\.get\('Access-Control-Allow-Headers'\) \|\| '';\n\s+const supported = allowedHeaders\.toLowerCase\(\)\.includes\('x-request-id'\);\n\s+return supported;\n\s+\}/,
    `async detectRequestIdSupport() {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_ID_DETECTION_TIMEOUT_MS);
        try {
            const response = await globalThis.fetch(this.podUrl, {
                method: 'OPTIONS',
                signal: controller.signal,
            });
            const allowedHeaders = response.headers.get('Access-Control-Allow-Headers') || '';
            const supported = allowedHeaders.toLowerCase().includes('x-request-id');
            return supported;
        }
        catch {
            return false;
        }
        finally {
            clearTimeout(timer);
        }
    }`,
  )

  if (!patched.includes('if (this.explicitPodUrl) {\n            this.storageUrl = this.podUrl;\n            this.storageResolvedAt = Date.now();\n            return this.storageUrl;\n        }')) {
    patched = patched.replace(
      /(\s+async refreshStorage\(\) \{\n)/,
      `$1        if (this.explicitPodUrl) {
            this.storageUrl = this.podUrl;
            this.storageResolvedAt = Date.now();
            return this.storageUrl;
        }
`,
    )
  }

  if (!patched.includes('this.explicitPodUrl = typeof options.podUrl ===')) {
    patched = patched.replace(
      /(\s+this\.webId = options\.webId;\n\s+this\.podUrl = [^\n]+;\n)/,
      `$1        this.explicitPodUrl = typeof options.podUrl === 'string' && options.podUrl.trim().length > 0;\n`,
    )
  }

  patched = patched.replace(
    /(\s+if \(resolvedStorage\) \{\n\s+this\.storageUrl = resolvedStorage;\n\s+this\.storageResolvedAt = Date\.now\(\);\n\s+)if \(resolvedStorage !== this\.podUrl\) \{/g,
    `$1if (!this.explicitPodUrl && resolvedStorage !== this.podUrl) {`,
  )

  patched = patched.replace(
    /(\s+)if \((?![^)]*explicitPodUrl)resolvedStorage !== this\.podUrl\) \{\n(\s+)console\.log\(`\[PodRuntime\] IdP-SP separation detected: storage at \$\{resolvedStorage\}`\);\n(\s+)this\.podUrl = resolvedStorage;\n(\s+)\}/g,
    `$1if (!this.explicitPodUrl && resolvedStorage !== this.podUrl) {\n$2console.log(\`[PodRuntime] IdP-SP separation detected: storage at \${resolvedStorage}\`);\n$3this.podUrl = resolvedStorage;\n$4}`,
  )

  if (!patched.includes('explicit Pod URL; skip Pod root probe silently')) {
    patched = patched.replace(
      /(\s+)\/\/ 检测是否支持 X-Request-ID\n\s+this\.requestIdSupported = await this\.detectRequestIdSupport\(\);\n\s+\/\/ 重新创建 wrappedFetch（现在知道是否支持了）\n\s+this\.wrappedFetch = this\.createWrappedFetch\(\);\n\s+\/\/ 从 profile 解析 storage URL \(IdP-SP 分离支持\)\n\s+\/\/ 使用 webIdResolver 的缓存，避免重复读取 profile\n\s+const resolvedStorage = await ([^;]+)\.resolveStorage\(this\.webId, this\.wrappedFetch\);\n\s+if \(resolvedStorage\) \{\n\s+this\.storageUrl = resolvedStorage;\n\s+this\.storageResolvedAt = Date\.now\(\);\n\s+(?:\/\/ 如果 storage URL 与当前 podUrl 不同，更新 podUrl\n\s+)?if \(!this\.explicitPodUrl && resolvedStorage !== this\.podUrl\) \{\n\s+console\.log\(`\[PodRuntime\] IdP-SP separation detected: storage at \$\{resolvedStorage\}`\);\n\s+this\.podUrl = resolvedStorage;\n\s+\}\n\s+\}/,
      `$1if (this.explicitPodUrl) {
$1    this.requestIdSupported = false;
$1    this.wrappedFetch = this.createWrappedFetch();
$1    this.storageUrl = this.podUrl;
$1    this.storageResolvedAt = Date.now();
$1    this.connected = true;
$1    // explicit Pod URL; skip Pod root probe silently
$1    return;
$1}
$1// 检测是否支持 X-Request-ID
$1this.requestIdSupported = await this.detectRequestIdSupport();
$1// 重新创建 wrappedFetch（现在知道是否支持了）
$1this.wrappedFetch = this.createWrappedFetch();
$1// 从 profile 解析 storage URL (IdP-SP 分离支持)
$1// 使用 webIdResolver 的缓存，避免重复读取 profile
$1const resolvedStorage = await $2.resolveStorage(this.webId, this.wrappedFetch);
$1if (resolvedStorage) {
$1    this.storageUrl = resolvedStorage;
$1    this.storageResolvedAt = Date.now();
$1    if (resolvedStorage !== this.podUrl) {
$1        console.log(\`[PodRuntime] IdP-SP separation detected: storage at \${resolvedStorage}\`);
$1        this.podUrl = resolvedStorage;
$1    }
$1}`,
    )
  }

  if (
    !patched.includes('explicit Pod URL; skip Pod root probe silently')
    && patched.includes('if (this.explicitPodUrl) {')
    && patched.includes('this.storageResolvedAt = Date.now();')
  ) {
    patched = patched.replace(
      /(\s+if \(this\.explicitPodUrl\) \{\n\s+this\.storageUrl = this\.podUrl;\n\s+this\.storageResolvedAt = Date\.now\(\);\n)(\s+\})/,
      `$1            this.connected = true;
            // explicit Pod URL; skip Pod root probe silently
            return;
$2`,
    )
  }

  patched = patched.replace(
    /\s+console\.log\('Using explicit Pod URL; skipping Pod root probe'\);\n/g,
    '\n',
  )

  patched = patched.replace(
    /(\s+)if \(status === 500\) \{\n(\s+)const requestId = this\.requestIdSupported\n([\s\S]*?)\n\s+throw new Error\(`Failed to connect to Pod: \$\{status\} \$\{response\.statusText\}`\);\n\s+\}/,
    `$1if (status === 500 && !this.explicitPodUrl) {\n$2const requestId = this.requestIdSupported\n$3\n$2throw new Error(\`Failed to connect to Pod: \${status} \${response.statusText}\`);\n$1}\n$1if (status === 500 && this.explicitPodUrl) {\n$2console.warn(\`Pod root returned \${status} for explicit Pod URL, continuing (child resources may still be writable)\`);\n$1}`,
  )

  return patched
}

function patchDrizzleSolidResourceIdSemantics(root) {
  const podDatabaseFiles = [
    path.join(root, 'core/pod-database.js'),
    path.join(root, 'esm/core/pod-database.js'),
  ]
  const baseResolverFiles = [
    path.join(root, 'core/resource-resolver/base-resolver.js'),
    path.join(root, 'esm/core/resource-resolver/base-resolver.js'),
  ]
  const resourceReferenceFiles = [
    path.join(root, 'core/resource-reference.js'),
    path.join(root, 'esm/core/resource-reference.js'),
  ]
  const selectBuilderFiles = [
    path.join(root, 'core/query-builders/select-query-builder.js'),
    path.join(root, 'esm/core/query-builders/select-query-builder.js'),
  ]

  for (const filePath of resourceReferenceFiles) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }
    const source = readFileSync(filePath, 'utf8')
    const patched = patchResourceReferenceResourceIdSemantics(source)
    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }

  for (const filePath of baseResolverFiles) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }
    const source = readFileSync(filePath, 'utf8')
    const patched = patchBaseResolverResourceIdSemantics(source)
    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }

  for (const filePath of podDatabaseFiles) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }
    const source = readFileSync(filePath, 'utf8')
    const patched = patchPodDatabaseResourceIdSemantics(source, filePath.includes('/esm/'))
    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }

  for (const filePath of selectBuilderFiles) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }
    const source = readFileSync(filePath, 'utf8')
    const patched = patchSelectBuilderResourceIdSemantics(source, filePath.includes('/esm/'))
    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }
}

function patchResourceReferenceResourceIdSemantics(source) {
  let patched = source

  if (!patched.includes('function resourceRelativePrefix(resource)')) {
    patched = patched.replace(
      /function podResourcePath\(resource\) \{\n\s+return normalizeResourcePath\(resource\.getResourcePath\?\.\(\) \?\? resource\.config\?\.base \?\? ''\);\n\}\n/,
      (match) => `${match}function resourceRelativePrefix(resource) {
    const resourcePath = podResourcePath(resource);
    const containerPath = normalizeResourcePath(resource.getContainerPath?.() ?? resource.config?.containerPath ?? '');
    if (!resourcePath)
        return '';
    if (containerPath && resourcePath.startsWith(containerPath)) {
        return normalizeResourcePath(resourcePath.slice(containerPath.length));
    }
    return resourcePath.split('/').pop() ?? resourcePath;
}
function qualifyFragmentResourceId(resource, relativeSubject) {
    if (!relativeSubject.startsWith('#'))
        return relativeSubject;
    const prefix = resourceRelativePrefix(resource);
    return prefix ? \`\${prefix}\${relativeSubject}\` : relativeSubject;
}
function templateRelativeSubject(resource, resourceId) {
    const template = podResourceSubjectTemplate(resource);
    if (template.startsWith('#') && !resourceId.startsWith('#')) {
        const hashIndex = resourceId.indexOf('#');
        if (hashIndex >= 0)
            return resourceId.slice(hashIndex);
    }
    return resourceId;
}
`,
    )
  }

  patched = patched.replace(
    /const templateValues = extractTemplateValues\(relativeSubject, podResourceSubjectTemplate\(resource\)\);\n\s+if \(!templateValues\)\n\s+return null;\n\s+return \{\n\s+resourceId: decodeURIComponent\(relativeSubject\),\n\s+templateValues,\n\s+\};/,
    `const resourceId = qualifyFragmentResourceId(resource, relativeSubject);
    const templateValues = extractTemplateValues(templateRelativeSubject(resource, resourceId), podResourceSubjectTemplate(resource));
    if (!templateValues)
        return null;
    return {
        resourceId: decodeURIComponent(resourceId),
        templateValues,
    };`,
  )

  return patched
}

function patchBaseResolverResourceIdSemantics(source) {
  let patched = source

  patched = patched.replace(
    /return this\.parseTemplateId\(table, subjectUri\) \?\? this\.extractRelativeSubjectId\(table, subjectUri\);/g,
    'return this.extractBaseRelativeResourceId(table, subjectUri);',
  )

  if (!patched.includes('extractBaseRelativeResourceId(table, subjectUri)')) {
    patched = patched.replace(
      /(\s+extractRelativeSubjectId\(table, subjectUri\) \{[\s\S]*?\n\s+\}\n)(\s+extractTemplateRelativeSubjectId\(table, subjectUri\) \{)/,
      `$1
    extractBaseRelativeResourceId(table, subjectUri) {
        const containerUrl = this.getContainerUrl(table);
        if (subjectUri.startsWith(containerUrl)) {
            return subjectUri.substring(containerUrl.length);
        }
        return this.extractRelativeSubjectId(table, subjectUri);
    }
$2`,
    )
  }

  patched = patched.replace(
    /- uri = "http:\/\/pod\/tags\.ttl#tag-1", template = "#\{id\}" → id = "#tag-1"/g,
    '- uri = "http://pod/tags.ttl#tag-1", template = "#{id}" → id = "tags.ttl#tag-1"',
  )

  return patched
}

function patchDrizzleSolidExactResourceReads(root) {
  const podDatabaseFiles = [
    path.join(root, 'core/pod-database.js'),
    path.join(root, 'esm/core/pod-database.js'),
  ]
  const podExecutorFiles = [
    path.join(root, 'core/execution/pod-executor.js'),
    path.join(root, 'esm/core/execution/pod-executor.js'),
  ]

  for (const filePath of podDatabaseFiles) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }
    const source = readFileSync(filePath, 'utf8')
    const patched = patchPodDatabaseExactResourceReads(source)
    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }

  for (const filePath of podExecutorFiles) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }
    const source = readFileSync(filePath, 'utf8')
    const patched = patchPodExecutorExactResourceReads(source)
    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }
}

function patchPodDatabaseExactResourceReads(source) {
  let patched = source.replaceAll('findByIriViaExactSparql', 'findByIriViaExactResource')

  patched = patched.replace(
    /if \(\s*typeof this\.dialect\.resolveTableResource !== 'function'\s*\|\|\s*typeof this\.dialect\.executeOnResource !== 'function'\s*\) \{\n\s*return undefined;\n\s*\}/g,
    `if (typeof this.dialect.executeOnResource !== 'function') {
            return undefined;
        }`,
  )
  patched = patched.replace(
    /\s+const exactResource = typeof table !== 'undefined' \? table : resource;\n\s+if \(exactResource\.getSparqlEndpoint\?\.\(\) \|\| exactResource\.config\?\.sparqlEndpoint\) \{\n\s+return undefined;\n\s+\}/g,
    '',
  )
  patched = patched.replace(
    /\s+if \(resource\.getSparqlEndpoint\?\.\(\)\) \{\n\s+return undefined;\n\s+\}/g,
    '',
  )
  patched = patched.replace(
    /\s+const descriptor = this\.dialect\.resolveTableResource\(table\);\n/g,
    '\n',
  )
  patched = patched.replace(
    /const rows = descriptor\.mode === 'sparql'\s*\?\s*await this\.dialect\.executeOnResource\(documentUrl, query, descriptor\)\s*:\s*await this\.dialect\.executeOnResource\(documentUrl, query\);/g,
    `// Exact-target reads already know the concrete Pod document. Do not route
        // through a collection sidecar SPARQL endpoint such as /.data/chat/-/sparql.
        const rows = await this.dialect.executeOnResource(documentUrl, query);`,
  )
  patched = patched.replace(
    /const rows = await this\.dialect\.executeOnResource\(documentUrl, query\);/g,
    `let rows;
        try {
            rows = await this.dialect.executeOnResource(documentUrl, query);
        }
        catch (error) {
            const status = error && typeof error === 'object' ? (error.status ?? error.statusCode) : undefined;
            const message = error && typeof error === 'object' && typeof error.message === 'string' ? error.message : '';
            if (status === 404 || /\\b(?:HTTP status )?404\\b/.test(message)) {
                return undefined;
            }
            throw error;
        }`,
  )

  return patched
}

function patchPodExecutorExactResourceReads(source) {
  return source.replace(
    /const selectResourceUrl = operation\.type === 'select' && descriptor\.mode === 'sparql'\s*\?\s*descriptor\.endpoint\s*:\s*exactSelectResourceUrl \?\? normalizedResourceUrl;/g,
    `const selectResourceUrl = exactSelectResourceUrl
            ?? (operation.type === 'select' && descriptor.mode === 'sparql'
                ? descriptor.endpoint
                : normalizedResourceUrl);`,
  )
}

function patchDrizzleSolidShortIdSubjectIndex(root) {
  const files = [
    path.join(root, 'core/pod-dialect.js'),
    path.join(root, 'esm/core/pod-dialect.js'),
    path.join(root, 'core/pod-session.js'),
    path.join(root, 'esm/core/pod-session.js'),
    path.join(root, 'core/pod-database.js'),
    path.join(root, 'esm/core/pod-database.js'),
  ]

  for (const filePath of files) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }

    const source = readFileSync(filePath, 'utf8')
    let patched = source
    if (filePath.endsWith('pod-dialect.js')) {
      patched = patchShortIdSubjectIndexPodDialectRuntime(patched, filePath.includes('/esm/'))
    } else if (filePath.endsWith('pod-session.js')) {
      patched = patchShortIdSubjectIndexPodSessionRuntime(patched, filePath.includes('/esm/'))
    } else if (filePath.endsWith('pod-database.js')) {
      patched = patchShortIdSubjectIndexPodDatabaseRuntime(patched)
    }

    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }
}

function ensureResourceReferenceImport(source, isEsm) {
  if (isEsm) {
    if (source.includes("from './resource-reference.js'")) {
      return source
    }
    return source.replace(
      /import \{ DebugLogger, setGlobalDebugLogger \} from '\.\/utils\/debug-logger\.js';\n/,
      `$&import { parsePodResourceRef } from './resource-reference.js';\n`,
    )
  }

  if (source.includes('resource_reference_1')) {
    return source
  }
  return source.replace(
    /const debug_logger_1 = require\("\.\/utils\/debug-logger"\);\n/,
    `$&const resource_reference_1 = require("./resource-reference");\n`,
  )
}

function patchShortIdSubjectIndexPodDialectRuntime(source, isEsm) {
  let patched = ensureResourceReferenceImport(source, isEsm)

  if (!patched.includes('this.shortIdSubjectIndex = new Map()')) {
    patched = patched.replace(
      /(\s+this\.preparedResources = new Set\(\);\n)/,
      `$1        this.shortIdSubjectIndex = new Map();\n`,
    )
  }

  if (patched.includes('lookupIndexedResourceSubject(table, id)')) {
    return patched
  }

  const parseRef = isEsm
    ? 'parsePodResourceRef(table, subject)?.templateValues.id'
    : '(0, resource_reference_1.parsePodResourceRef)(table, subject)?.templateValues.id'
  const methods = `
    buildShortIdSubjectIndexKey(table, id) {
        const base = table.config?.base ?? table.getResourcePath?.() ?? table.getContainerPath?.() ?? '';
        const template = table.getSubjectTemplate?.() ?? table.config?.subjectTemplate ?? '{id}';
        const type = table.getType?.() ?? table.config?.type ?? '';
        const name = table.config?.name ?? '';
        return \`\${name}|\${base}|\${template}|\${type}|\${id}\`;
    }
    registerResourceSubject(table, subject) {
        const templateId = ${parseRef};
        if (!templateId) {
            return;
        }
        const key = this.buildShortIdSubjectIndexKey(table, templateId);
        const subjects = this.shortIdSubjectIndex.get(key) ?? new Set();
        subjects.add(subject);
        this.shortIdSubjectIndex.set(key, subjects);
    }
    unregisterResourceSubject(table, subject) {
        const templateId = ${parseRef};
        if (!templateId) {
            return;
        }
        const key = this.buildShortIdSubjectIndexKey(table, templateId);
        const subjects = this.shortIdSubjectIndex.get(key);
        if (!subjects) {
            return;
        }
        subjects.delete(subject);
        if (subjects.size === 0) {
            this.shortIdSubjectIndex.delete(key);
        }
    }
    lookupIndexedResourceSubject(table, id) {
        const subjects = this.shortIdSubjectIndex.get(this.buildShortIdSubjectIndexKey(table, id));
        if (!subjects || subjects.size === 0) {
            return null;
        }
        if (subjects.size > 1) {
            throw new Error(\`Indexed short id '\${id}' for resource '\${table.config?.name ?? 'resource'}' is ambiguous. \` +
                'Use a base-relative resource id or full IRI to disambiguate.');
        }
        return Array.from(subjects)[0] ?? null;
    }
`

  return patched.replace(
    /(\s+\/\*\*\n\s+\* Get the ExecutionStrategy for a table\n\s+\*\/\n\s+getStrategy\(table\) \{)/,
    `${methods}$1`,
  )
}

function patchDrizzleSolidSparqlTargetGraphs(root) {
  const files = [
    path.join(root, 'core/execution/sparql-strategy.js'),
    path.join(root, 'esm/core/execution/sparql-strategy.js'),
  ]

  for (const filePath of files) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }
    const source = readFileSync(filePath, 'utf8')
    const patched = patchSparqlStrategyTargetGraphs(source)
    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }
}

function patchSparqlStrategyTargetGraphs(source) {
  let patched = source

  if (!patched.includes('resolvePodResourceIri(value)')) {
    patched = patched.replace(
      /(\s+setPodUrl\(podUrl\) \{\n\s+this\.podUrl = podUrl;\n\s+\}\n)/,
      `$1    resolvePodResourceIri(value) {
        if (typeof value !== 'string' || value.length === 0) {
            return value;
        }
        if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
            return value;
        }
        const podRoot = typeof this.podUrl === 'string' ? this.podUrl.trim() : '';
        if (!podRoot) {
            return value;
        }
        const normalizedPodRoot = podRoot.endsWith('/') ? podRoot : \`\${podRoot}/\`;
        if (value.startsWith('/')) {
            return \`\${normalizedPodRoot.replace(/\\/+$/, '')}\${value}\`;
        }
        try {
            return new URL(value, normalizedPodRoot).toString();
        }
        catch {
            return value;
        }
    }
`,
    )
  }

  patched = patched.replace(
    /return table\.config\?\.containerPath \?\? table\.getContainerPath\?\.\(\);/g,
    'return this.resolvePodResourceIri(table.config?.containerPath ?? table.getContainerPath?.());',
  )
  patched = patched.replace(
    /return table\.config\?\.base;/g,
    'return this.resolvePodResourceIri(table.config?.base);',
  )

  return patched
}

function ensureGenerateSubjectUriImport(source, isEsm) {
  if (isEsm) {
    if (source.includes("from './sparql/helpers.js'")) {
      return source
    }
    return source.replace(
      /import \{ entityKind \} from 'drizzle-orm';\n/,
      `$&import { generateSubjectUri } from './sparql/helpers.js';\n`,
    )
  }

  if (source.includes('helpers_1')) {
    return source
  }
  return source.replace(
    /const drizzle_orm_1 = require\("drizzle-orm"\);\n/,
    `$&const helpers_1 = require("./sparql/helpers");\n`,
  )
}

function patchShortIdSubjectIndexPodSessionRuntime(source, isEsm) {
  let patched = ensureGenerateSubjectUriImport(source, isEsm)

  if (!patched.includes('this.updateSubjectIndex(operation, result);')) {
    patched = patched.replace(
      /(\s+const result = await this\.dialect\.query\(operation\);\n\s+)return result;/,
      `$1this.updateSubjectIndex(operation, result);\n        return result;`,
    )
  }

  if (patched.includes('updateSubjectIndex(operation, result)')) {
    return patched
  }

  const generateSubject = isEsm
    ? 'generateSubjectUri(row, operation.table, this.dialect.getUriResolver?.())'
    : '(0, helpers_1.generateSubjectUri)(row, operation.table, this.dialect.getUriResolver?.())'
  const methods = `
    updateSubjectIndex(operation, result) {
        if (operation.type === 'select') {
            return;
        }
        const dialect = this.dialect;
        if (typeof dialect.registerResourceSubject !== 'function'
            && typeof dialect.unregisterResourceSubject !== 'function') {
            return;
        }
        const subjects = this.resolveOperationSubjects(operation, result);
        if (operation.type === 'delete') {
            subjects.forEach((subject) => dialect.unregisterResourceSubject?.(operation.table, subject));
            return;
        }
        subjects.forEach((subject) => dialect.registerResourceSubject?.(operation.table, subject));
    }
    resolveOperationSubjects(operation, result) {
        const subjects = new Set();
        for (const row of result) {
            const subject = this.getKnownRowIri(row);
            if (subject) {
                subjects.add(subject);
            }
        }
        if (operation.type === 'insert') {
            const plan = operation.plan;
            const rows = Array.isArray(plan?.rows) ? plan.rows : [];
            rows.forEach((row) => {
                try {
                    subjects.add(${generateSubject});
                }
                catch {
                    // Operation result rows remain the primary source when subject generation is unavailable.
                }
            });
        }
        return Array.from(subjects);
    }
    getKnownRowIri(row) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) {
            return null;
        }
        const record = row;
        for (const key of ['@id', 'subject', 'uri', 'source']) {
            const value = record[key];
            if (typeof value === 'string' && /^https?:\\/\\//.test(value)) {
                return value;
            }
        }
        return null;
    }
`

  return patched.replace(
    /(\s+\/\/ 执行 SQL（Drizzle AST）\n\s+async executeSql\(sql, table\) \{)/,
    `${methods}$1`,
  )
}

function patchShortIdSubjectIndexPodDatabaseRuntime(source) {
  let patched = source

  if (!patched.includes('lookupIndexedResourceSubject?:')) {
    // Runtime JS does not need the TypeScript type alias; this marker is only
    // present in source builds. Keep this branch intentionally empty.
  }

  if (!patched.includes('getIndexedSubject(resource, id)')) {
    patched = patched.replace(
      /(\s+subjectMatchesShortId\(resource, subject, id, suffix\) \{[\s\S]*?\n\s+\}\n)(\s+async lookupSubjectIriByShortId\(resource, id, methodName\) \{)/,
      `$1    getIndexedSubject(resource, id) {
        const dialect = this.dialect;
        if (typeof dialect.lookupIndexedResourceSubject !== 'function') {
            return null;
        }
        return dialect.lookupIndexedResourceSubject(resource, id);
    }
$2`,
    )
  }

  patched = patched.replace(
    /return subjects\[0\] \?\? null;/g,
    'return subjects[0] ?? this.getIndexedSubject(resource, id);',
  )

  return patched
}

function patchPodDatabaseResourceIdSemantics(source, isEsm) {
  let patched = source
  const parseRef = isEsm
    ? 'parsePodResourceRef(table, iri)?.resourceId'
    : '(0, resource_reference_1.parsePodResourceRef)(table, iri)?.resourceId'

  if (!patched.includes('resolveBaseRelativeResourceId(table, iri)')) {
    patched = patched.replace(
      /(\s+resolveRowId\(table, row\) \{\n\s+if \(!isRecord\(row\) \|\| Array\.isArray\(row\)\) \{\n\s+throw new Error\('resolveRowId requires a row object'\);\n\s+\}\n\s+const iri = getKnownRowIri\(row\) \?\? this\.resolveLocatorSubject\(table, row, 'resolveRowId'\);\n\s+)return this\.dialect\.getResolver\(table\)\.parseId\(table, iri\);\n(\s+\}\n)/,
      `$1return this.resolveBaseRelativeResourceId(table, iri);\n$2    resolveBaseRelativeResourceId(table, iri) {\n        return ${parseRef} ?? this.dialect.getResolver(table).parseId(table, iri);\n    }\n`,
    )
  }

  patched = patched.replace(
    /return this\.dialect\.getResolver\(table\)\.parseId\(table, iri\);/g,
    'return this.resolveBaseRelativeResourceId(table, iri);',
  )

  patched = patched.replace(
    new RegExp(`return ${escapeRegExp(parseRef)} \\?\\? this\\.dialect\\.getResolver\\(table\\)\\.parseId\\(table, iri\\);`, 'g'),
    'return this.resolveBaseRelativeResourceId(table, iri);',
  )

  patched = patched.replace(
    /(\s+resolveBaseRelativeResourceId\(table, iri\) \{\n\s+)return this\.resolveBaseRelativeResourceId\(table, iri\);\n(\s+\})/g,
    `$1return ${parseRef} ?? this.dialect.getResolver(table).parseId(table, iri);\n$2`,
  )

  if (!patched.includes('const resourceId = ')) {
    patched = patched.replace(
      /(\s+extractIdFromIri\(table, iri\) \{\n)/,
      `$1        const resourceId = ${parseRef};\n        if (resourceId) {\n            return resourceId;\n        }\n`,
    )
  }

  patched = patched.replace(
    /(\s+const hashIndex = iri\.indexOf\('#'\);\n\s+if \(hashIndex >= 0 && template\.includes\('\{id\}'\) && template\.startsWith\('#'\)\) \{\n\s+)return decodeURIComponent\(iri\.slice\(hashIndex \+ 1\)\);\n(\s+\})/g,
    `$1const parsed = ${parseRef};\n            return parsed ?? decodeURIComponent(iri.slice(hashIndex + 1));\n$2`,
  )

  if (!patched.includes('const nonIdRequiredKeys = requiredKeys.filter((key) => key !== \'id\');')) {
    patched = patched.replace(
      /(\s+if \(typeof idValue === 'string' && isBaseRelativeSubjectId\(idValue\)\) \{\n)(\s+)if \(idValue\.startsWith\('#'\) && missingKeys\.some\(\(key\) => key !== 'id'\)\) \{\n(\s+)const template = this\.getLocatorTemplate\(table\);\n(\s+)throw new Error\(`\$\{methodName\} requires a complete locator for subjectTemplate '\$\{template\}'\. ` \+\n\s+`Missing \[\$\{missingKeys\.filter\(\(key\) => key !== 'id'\)\.join\(', '\)\}\]\. ` \+\n\s+`Use a base-relative resource id that includes every storage slot\.`\);\n\s+\}/g,
      `$1$2const nonIdRequiredKeys = requiredKeys.filter((key) => key !== 'id');\n$2if (idValue.startsWith('#') && nonIdRequiredKeys.length > 0) {\n$3const template = this.getLocatorTemplate(table);\n$4throw new Error(\`\${methodName} requires a complete locator for subjectTemplate '\${template}'. \` +\n$4    \`Missing [\${nonIdRequiredKeys.join(', ')}]. \` +\n$4    \`Use a base-relative resource id that includes every storage slot.\`);\n$2}`,
    )
    patched = patched.replace(
      /(\s+if \(typeof idValue === 'string' && isBaseRelativeSubjectId\(idValue\)\) \{\n)(\s+)if \(idValue\.startsWith\('#'\) && missingKeys\.some\(\(key\) => key !== 'id'\)\) \{\n(\s+)const template = this\.getLocatorTemplate\(resource\);\n(\s+)throw new Error\(`\$\{methodName\} requires a complete locator for subjectTemplate '\$\{template\}'\. ` \+\n\s+`Missing \[\$\{missingKeys\.filter\(\(key\) => key !== 'id'\)\.join\(', '\)\}\]\. ` \+\n\s+`Use a base-relative resource id that includes every storage slot\.`\);\n\s+\}/g,
      `$1$2const nonIdRequiredKeys = requiredKeys.filter((key) => key !== 'id');\n$2if (idValue.startsWith('#') && nonIdRequiredKeys.length > 0) {\n$3const template = this.getLocatorTemplate(resource);\n$4throw new Error(\`\${methodName} requires a complete locator for subjectTemplate '\${template}'. \` +\n$4    \`Missing [\${nonIdRequiredKeys.join(', ')}]. \` +\n$4    \`Use a base-relative resource id that includes every storage slot.\`);\n$2}`,
    )
  }

  if (!patched.includes('const find = ')) {
    patched = patched.replace(
      /(\s+const createFindByResource = \(\) => \(target, options\) =>\n\s+createLazy\(async \(\) => await applyExactOptions\(await this\.findByResource\(table, target\), options\)\);\n)/,
      `$1            const find = (target, options) => createFindByResource()(target, options);\n`,
    )
    patched = patched.replace(
      /(\s+findMany,\n\s+findFirst,\n)/,
      `$1                find,\n`,
    )
  }

  return patched
}

function patchSelectBuilderResourceIdSemantics(source, isEsm) {
  let patched = source

  if (isEsm) {
    if (!patched.includes("from '../resource-reference.js'")) {
      patched = patched.replace(
        /import \{ assertPublicWhereCondition, assertPublicWhereObject, conditionTargetsReservedIdentifier \} from '\.\.\/query-where-policy\.js';\n/,
        `$&import { parsePodResourceRef } from '../resource-reference.js';\n`,
      )
    }
    if (!patched.includes('parsePodResourceRef(table, subject)?.resourceId')) {
      patched = patched.replace(
        /(\s+extractIdFromSubject\(subject, table\) \{\n\s+if \(!subject\) \{\n\s+return undefined;\n\s+\}\n)/,
        `$1        if (table) {\n            const resourceId = parsePodResourceRef(table, subject)?.resourceId;\n            if (resourceId) {\n                return resourceId;\n            }\n        }\n`,
      )
    }
    return patched
  }

  if (!patched.includes('resource_reference_1')) {
    patched = patched.replace(
      /const query_where_policy_1 = require\("\.\.\/query-where-policy"\);\n/,
      `$&const resource_reference_1 = require("../resource-reference");\n`,
    )
  }
  if (!patched.includes('(0, resource_reference_1.parsePodResourceRef)(table, subject)?.resourceId')) {
    patched = patched.replace(
      /(\s+extractIdFromSubject\(subject, table\) \{\n\s+if \(!subject\) \{\n\s+return undefined;\n\s+\}\n)/,
      `$1        if (table) {\n            const resourceId = (0, resource_reference_1.parsePodResourceRef)(table, subject)?.resourceId;\n            if (resourceId) {\n                return resourceId;\n            }\n        }\n`,
    )
  }
  return patched
}

function patchDrizzleSolidBaseRelativeIdClassifier(root) {
  const files = [
    path.join(root, 'core/pod-database.js'),
    path.join(root, 'esm/core/pod-database.js'),
    path.join(root, 'core/resource-reference.js'),
    path.join(root, 'esm/core/resource-reference.js'),
    path.join(root, 'core/resource-resolver/base-resolver.js'),
    path.join(root, 'esm/core/resource-resolver/base-resolver.js'),
    path.join(root, 'core/uri/resolver.js'),
    path.join(root, 'esm/core/uri/resolver.js'),
  ]

  for (const filePath of files) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }
    const source = readFileSync(filePath, 'utf8')
    const patched = patchBaseRelativeIdClassifier(source)
    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }
}

function patchBaseRelativeIdClassifier(source) {
  let patched = source

  patched = patched.replace(/\n\s*value\.includes\(['"]\/['"]\) \|\|/g, '')

  return patched
}

function patchDrizzleSolidResourcePreparation(root) {
  const runtimeFiles = [
    path.join(root, 'driver.js'),
    path.join(root, 'esm/driver.js'),
    path.join(root, 'core/pod-session.js'),
    path.join(root, 'esm/core/pod-session.js'),
    path.join(root, 'core/pod-dialect.js'),
    path.join(root, 'esm/core/pod-dialect.js'),
    path.join(root, 'core/execution/pod-executor.js'),
    path.join(root, 'esm/core/execution/pod-executor.js'),
    path.join(root, 'core/execution/ldp-strategy.js'),
    path.join(root, 'esm/core/execution/ldp-strategy.js'),
    path.join(root, 'core/execution/ldp-executor.js'),
    path.join(root, 'esm/core/execution/ldp-executor.js'),
  ]
  const typeFiles = [
    path.join(root, 'driver.d.ts'),
    path.join(root, 'esm/driver.d.ts'),
    path.join(root, 'core/pod-dialect.d.ts'),
    path.join(root, 'esm/core/pod-dialect.d.ts'),
    path.join(root, 'core/execution/pod-executor.d.ts'),
    path.join(root, 'esm/core/execution/pod-executor.d.ts'),
    path.join(root, 'core/execution/types.d.ts'),
    path.join(root, 'esm/core/execution/types.d.ts'),
    path.join(root, 'core/query-builders/types.d.ts'),
    path.join(root, 'esm/core/query-builders/types.d.ts'),
  ]

  for (const filePath of runtimeFiles) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }
    const source = readFileSync(filePath, 'utf8')
    let patched = source
    if (filePath.endsWith('driver.js')) {
      patched = patchResourcePreparationDriverRuntime(patched)
    } else if (filePath.endsWith('pod-session.js')) {
      patched = patchResourcePreparationPodSessionRuntime(patched)
    } else if (filePath.endsWith('pod-dialect.js')) {
      patched = patchResourcePreparationPodDialectRuntime(patched)
    } else if (filePath.endsWith('pod-executor.js')) {
      patched = patchResourcePreparationPodExecutorRuntime(patched)
    } else if (filePath.endsWith('ldp-strategy.js')) {
      patched = patchResourcePreparationLdpStrategyRuntime(patched)
    } else if (filePath.endsWith('ldp-executor.js')) {
      patched = patchResourcePreparationLdpExecutorRuntime(patched)
    }
    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }

  for (const filePath of typeFiles) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }
    const source = readFileSync(filePath, 'utf8')
    const patched = patchResourcePreparationTypes(source, filePath)
    if (patched !== source) {
      writeFileSync(filePath, patched, 'utf8')
    }
  }
}

function patchResourcePreparationDriverRuntime(source) {
  if (source.includes('resourcePreparation: config?.resourcePreparation')) {
    return source
  }

  return source.replace(
    /(\s+disableInteropDiscovery: config\?\.disableInteropDiscovery,\n)/,
    `$1        resourcePreparation: config?.resourcePreparation,\n`,
  )
}

function patchResourcePreparationPodSessionRuntime(source) {
  if (source.includes("preparationMode === 'off'")) {
    return source
  }

  const strictReplacement = `
        const preparationMode = typeof this.dialect.getResourcePreparationMode === 'function'
            ? this.dialect.getResourcePreparationMode()
            : 'strict';
        if (preparationMode === 'off') {
            if (table && typeof table.markInitialized === 'function') {
                table.markInitialized(true);
            }
            return;
        }
        if (table && typeof table.isInitialized === 'function') {
            if (!table.isInitialized()) {
                try {
                    if (typeof table.init === 'function') {
                        await table.init(this.dialect);
                    }
                    else {
                        await this.dialect.registerTable(table);
                    }
                }
                catch (error) {
                    if (preparationMode !== 'best-effort') {
                        throw error;
                    }
                    table.markInitialized?.(true);
                }
            }
            return;
        }
        if (table) {
            try {
                await this.dialect.registerTable(table);
            }
            catch (error) {
                if (preparationMode !== 'best-effort') {
                    throw error;
                }
            }
        }`
  const compactReplacement = `
        const preparationMode = typeof this.dialect.getResourcePreparationMode === 'function'
            ? this.dialect.getResourcePreparationMode()
            : 'strict';
        if (preparationMode === 'off') {
            if (table && typeof table.markInitialized === 'function') {
                table.markInitialized(true);
            }
            return;
        }
        if (table && typeof table.isInitialized === 'function') {
            if (!table.isInitialized()) {
                try {
                    if (typeof table.init === 'function') {
                        await table.init(this.dialect);
                    }
                    else {
                        await this.dialect.registerTable(table);
                    }
                }
                catch (error) {
                    if (preparationMode !== 'best-effort') {
                        throw error;
                    }
                    table.markInitialized?.(true);
                }
            }
            return;
        }
        if (table) {
            try {
                await this.dialect.registerTable(table);
            }
            catch (error) {
                if (preparationMode !== 'best-effort') {
                    throw error;
                }
            }
        }`

  return source
    .replace(
      /\s+if \(table && typeof table\.isInitialized === 'function'\) \{[\s\S]*?\n\s+if \(table\) \{\n\s+await this\.dialect\.registerTable\(table\);\n\s+\}/,
      strictReplacement,
    )
    .replace(
      /\s+if \(table && typeof table\.isInitialized === "function"\) \{[\s\S]*?\n\s+if \(table\) \{\n\s+await this\.dialect\.registerTable\(table\);\n\s+\}/,
      compactReplacement,
    )
}

function patchResourcePreparationPodDialectRuntime(source) {
  let patched = source

  if (!patched.includes('shouldSkipResourcePreparation: () => this.shouldSkipResourcePreparation()')) {
    patched = patched.replace(
      /(\s+ensureResourceExists: \(resourceUrl, options\) => this\.ensureResourceExists\(resourceUrl, options\),\n)/,
      `$1            shouldSkipResourcePreparation: () => this.shouldSkipResourcePreparation(),\n            shouldContinueAfterResourcePreparationError: () => this.shouldContinueAfterResourcePreparationError(),\n`,
    )
  }

  if (!patched.includes('getResourcePreparationMode()')) {
    patched = patched.replace(
      /(\s+\/\/ ========== TypeIndex 相关方法 ==========)/,
      `
    getResourcePreparationMode() {
        return this.config.resourcePreparation ?? 'strict';
    }
    shouldSkipResourcePreparation() {
        return this.getResourcePreparationMode() === 'off';
    }
    shouldContinueAfterResourcePreparationError() {
        return this.getResourcePreparationMode() === 'best-effort';
    }
$1`,
    )
  }

  if (!/async registerTable\(table\) \{\s+if \(this\.shouldSkipResourcePreparation\(\)\)/.test(patched)) {
    patched = patched.replace(
      /(\s+async registerTable\(table\) \{\n)/,
      `$1        if (this.shouldSkipResourcePreparation()) {\n            table.markInitialized?.(true);\n            return;\n        }\n`,
    )
  }
  patched = dedupeRegisterTableResourcePreparationSkip(patched)
  patched = patched.replace(
    /(\s+if \(table\.config\.autoRegister === false\) \{\n\s+)return;\n(\s+\})/,
    `$1table.markInitialized?.(true);\n            return;\n$2`,
  )
  patched = patched.replace(
    /(\s+if \(this\.registeredTables\.has\(tableKey\)\) \{\n\s+)return;\n(\s+\})/,
    `$1table.markInitialized?.(true);\n            return;\n$2`,
  )
  patched = patched.replace(
    /(\s+console\.warn\(`\[registerTable\] Resource preparation failed for \$\{table\.config\.name\}:`, error\);\n)(\s+\})/,
    `$1            if (this.config.resourcePreparation === 'strict') {\n                throw error;\n            }\n$2`,
  )
  patched = patched.replace(
    /(\s+await this\.discovery\.register\(table, \{\n\s+registryPath: table\.config\.saiRegistryPath,\n\s+\}\);\n)/,
    `$1        table.markInitialized?.(true);\n`,
  )

  return patched
}

function dedupeRegisterTableResourcePreparationSkip(source) {
  const skipBlock = `        if (this.shouldSkipResourcePreparation()) {
            table.markInitialized?.(true);
            return;
        }
`
  const registerTableStart = source.indexOf('    async registerTable(table) {')
  if (registerTableStart < 0) {
    return source
  }

  const afterStart = source.slice(registerTableStart)
  const nextMethod = afterStart.indexOf('\n    /**', 1)
  const registerTableSource = nextMethod >= 0 ? afterStart.slice(0, nextMethod) : afterStart
  const duplicate = skipBlock + skipBlock
  if (!registerTableSource.includes(duplicate)) {
    return source
  }

  return `${source.slice(0, registerTableStart)}${registerTableSource.replaceAll(duplicate, skipBlock)}${nextMethod >= 0 ? afterStart.slice(nextMethod) : ''}`
}

function patchResourcePreparationPodExecutorRuntime(source) {
  let patched = source

  if (!patched.includes('shouldSkipResourcePreparation()')) {
    patched = patched.replace(
      /(\s+}\n\s+\/\*\*\n\s+\* Execute SELECT operation via ExecutionStrategy\n)/,
      `
    shouldSkipResourcePreparation() {
        return this.deps.shouldSkipResourcePreparation?.() ?? false;
    }
    shouldContinueAfterResourcePreparationError() {
        return this.deps.shouldContinueAfterResourcePreparationError?.() ?? false;
    }
    async prepareResource(operationName, prepare) {
        if (this.shouldSkipResourcePreparation()) {
            return;
        }
        try {
            await prepare();
        }
        catch (error) {
            if (!this.shouldContinueAfterResourcePreparationError()) {
                throw error;
            }
            if (typeof process !== 'undefined' && process.env?.LINX_DEBUG === '1') {
                console.warn(\`[\${operationName}] Resource preparation failed; continuing in best-effort mode:\`, error);
            }
        }
    }
$1`,
    )
  }

  patched = patched.replace(
    /await this\.deps\.ensureContainerExists\(containerUrl\);/g,
    `await this.prepareResource('INSERT', () => this.deps.ensureContainerExists(containerUrl));`,
  )
  patched = patched.replace(
    /await this\.deps\.ensureResourceExists\(resourceUrl, \{ createIfMissing: true \}\);/g,
    `await this.prepareResource('INSERT', () => this.deps.ensureResourceExists(resourceUrl, { createIfMissing: true }));`,
  )
  patched = patched.replace(
    /if \(descriptor\.mode === 'ldp'\) \{\n\s+\/\/ Pre-flight check/,
    `if (descriptor.mode === 'ldp' && !this.shouldSkipResourcePreparation()) {\n            // Pre-flight check`,
  )
  patched = patched.replace(
    /ensureContainerExists: this\.deps\.ensureContainerExists,/,
    `ensureContainerExists: this.shouldSkipResourcePreparation()\n                ? undefined\n                : async (targetContainerUrl) => {\n                    await this.prepareResource('INSERT', () => this.deps.ensureContainerExists(targetContainerUrl));\n                },\n            skipResourceExistenceCheck: this.shouldSkipResourcePreparation()\n                || (this.deps.isInsertPlan(operation.plan) && operation.plan.skipResourceExistenceCheck === true),`,
  )
  patched = patched.replace(
    /await this\.prepareResource\('INSERT', \(\) => this\.deps\.ensureContainerExists\(containerUrl\)\);\n\s+}\n\s+if \(!this\.deps\.preparedResources\.has\(this\.deps\.normalizeResourceKey\(resourceUrl\)\)\) \{\n\s+await this\.deps\.ensureResourceExists\(resourceUrl, \{ createIfMissing: false \}\);/g,
    `await this.prepareResource('UPDATE', () => this.deps.ensureContainerExists(containerUrl));\n                }\n            }\n            if (!this.deps.preparedResources.has(this.deps.normalizeResourceKey(resourceUrl))) {\n                await this.prepareResource('UPDATE', () => this.deps.ensureResourceExists(resourceUrl, { createIfMissing: false }));`,
  )
  patched = patched.replace(
    /await this\.prepareResource\('INSERT', \(\) => this\.deps\.ensureContainerExists\(containerUrl\)\);\n\s+}\n\s+const hasResource = this\.deps\.preparedResources/g,
    `await this.prepareResource('DELETE', () => this.deps.ensureContainerExists(containerUrl));\n            }\n            const hasResource = this.deps.preparedResources`,
  )
  patched = patched.replace(
    /: await this\.deps\.resourceExists\(resourceUrl\);/,
    `: this.shouldSkipResourcePreparation()\n                    ? true\n                    : await this.deps.resourceExists(resourceUrl);`,
  )

  return patched
}

function patchResourcePreparationLdpStrategyRuntime(source) {
  if (source.includes('skipResourceExistenceCheck: plan.skipResourceExistenceCheck')) {
    return source
  }

  return source.replace(
    /(\s+ensureContainerExists: plan\.ensureContainerExists,\n)/,
    `$1            skipResourceExistenceCheck: plan.skipResourceExistenceCheck,\n`,
  )
}

function patchResourcePreparationLdpExecutorRuntime(source) {
  let patched = source

  patched = patched.replace(
    /(\s+\/\/ 检查资源是否已存在，如果存在则使用 PATCH 追加\n\s+)const headRes = await this\.fetchFn\(docResourceUrl, \{ method: 'HEAD' \}\);\n\s+const resourceExists = headRes\.ok \|\| headRes\.status === 405;/,
    `$1let resourceExists = false;\n                if (!options.skipResourceExistenceCheck) {\n                    const headRes = await this.fetchFn(docResourceUrl, { method: 'HEAD' });\n                    resourceExists = headRes.ok || headRes.status === 405;\n                }`,
  )
  patched = patched.replace(
    /(\s+)let response;\n\s+if \(resourceExists\) \{\n\s+\/\/ 资源已存在，使用 SPARQL UPDATE 追加三元组\n\s+const sparql = `INSERT DATA \{\\n\$\{triples\.join\('\\n'\)\}\\n\}`;\n\s+response = await this\.fetchFn\(docResourceUrl, \{\n\s+method: 'PATCH',\n\s+headers: \{ 'Content-Type': 'application\/sparql-update' \},\n\s+body: sparql\n\s+\}\);\n\s+\}\n\s+else \{\n\s+\/\/ 资源不存在，使用 PUT 创建\n\s+const body = triples\.join\('\\n'\);\n\s+response = await this\.fetchFn\(docResourceUrl, \{\n\s+method: 'PUT',\n\s+headers: \{ 'Content-Type': 'text\/turtle' \},\n\s+body\n\s+\}\);\n\s+\}/,
    `$1let response;\n                let via;\n                if (options.skipResourceExistenceCheck) {\n                    const sparql = \`INSERT DATA {\\n\${triples.join('\\n')}\\n}\`;\n                    response = await this.fetchFn(docResourceUrl, {\n                        method: 'PATCH',\n                        headers: { 'Content-Type': 'application/sparql-update' },\n                        body: sparql\n                    });\n                    via = 'patch';\n                    if (response.status === 404) {\n                        const body = triples.join('\\n');\n                        response = await this.fetchFn(docResourceUrl, {\n                            method: 'PUT',\n                            headers: { 'Content-Type': 'text/turtle' },\n                            body\n                        });\n                        via = 'put';\n                    }\n                }\n                else if (resourceExists) {\n                    const sparql = \`INSERT DATA {\\n\${triples.join('\\n')}\\n}\`;\n                    response = await this.fetchFn(docResourceUrl, {\n                        method: 'PATCH',\n                        headers: { 'Content-Type': 'application/sparql-update' },\n                        body: sparql\n                    });\n                    via = 'patch';\n                }\n                else {\n                    const body = triples.join('\\n');\n                    response = await this.fetchFn(docResourceUrl, {\n                        method: 'PUT',\n                        headers: { 'Content-Type': 'text/turtle' },\n                        body\n                    });\n                    via = 'put';\n                }`,
  )
  patched = patched.replace(
    /via: resourceExists \? 'patch' : 'put'/g,
    `via`,
  )
  patched = patched.replace(
    /(\s+\/\/ 验证资源是否真的存在\n\s+)const checkRes = await this\.fetchFn\(resourceUrl, \{ method: 'HEAD' \}\);\n\s+if \(!checkRes\.ok && checkRes\.status !== 405\) \{/,
    `$1const needsCreate = options.skipResourceExistenceCheck\n                ? true\n                : await this.fetchFn(resourceUrl, { method: 'HEAD' }).then((checkRes) => !checkRes.ok && checkRes.status !== 405);\n            if (needsCreate) {`,
  )
  return patched
}

function patchResourcePreparationTypes(source, filePath) {
  let patched = source

  if (filePath.endsWith('driver.d.ts') && !patched.includes('resourcePreparation?:')) {
    patched = patched.replace(
      /(\s+podUrl\?: string;\n)?(\s+\/\*\*\n\s+\* 启用 debug 模式)/,
      (match, podUrlBlock = '', debugBlock) => `${podUrlBlock}    /** Controls implicit LDP container/resource probes before ORM operations. */\n    resourcePreparation?: 'strict' | 'best-effort' | 'off';\n${debugBlock}`,
    )
  }

  if (filePath.endsWith('pod-dialect.d.ts')) {
    if (!patched.includes("resourcePreparation?: 'strict'")) {
      patched = patched.replace(
        /(\s+disableInteropDiscovery\?: boolean;\n)/,
        `$1    resourcePreparation?: 'strict' | 'best-effort' | 'off';\n`,
      )
    }
    if (!patched.includes('getResourcePreparationMode():')) {
      patched = patched.replace(
        /(\s+transaction<T>\(transaction: \(tx: PodDialect\) => Promise<T>\): Promise<T>;\n)/,
        `$1    getResourcePreparationMode(): NonNullable<PodDialectConfig['resourcePreparation']>;\n    shouldSkipResourcePreparation(): boolean;\n    shouldContinueAfterResourcePreparationError(): boolean;\n`,
      )
    }
  }

  if (filePath.endsWith('pod-executor.d.ts') && !patched.includes('shouldSkipResourcePreparation?:')) {
    patched = patched.replace(
      /(\s+ensureResourceExists: \(resourceUrl: string, options\?: \{\n\s+createIfMissing\?: boolean;\n\s+\}\) => Promise<void>;\n)/,
      `$1    shouldSkipResourcePreparation?: () => boolean;\n    shouldContinueAfterResourcePreparationError?: () => boolean;\n`,
    )
  }

  if ((filePath.endsWith('execution/types.d.ts') || filePath.endsWith('query-builders/types.d.ts')) && !patched.includes('skipResourceExistenceCheck?: boolean;')) {
    patched = patched.replace(
      /(\s+rows: [^;\n]+;\n)/,
      `$1    skipResourceExistenceCheck?: boolean;\n`,
    )
  }

  return patched
}

function assertPatchedDrizzleSolid(root) {
  const mustContain = [
    [
      path.join(root, 'driver.js'),
      [
        'resourcePreparation: config?.resourcePreparation',
        'podUrl: config?.podUrl',
      ],
    ],
    [
      path.join(root, 'esm/driver.js'),
      [
        'resourcePreparation: config?.resourcePreparation',
        'podUrl: config?.podUrl',
      ],
    ],
	    [
	      path.join(root, 'core/pod-database.js'),
	      [
	        'findByIriViaExactResource',
	        'collection sidecar SPARQL endpoint',
	        'CONTAINS(STR(?subject)',
	        'subjectMatchesShortId',
	        'LIMIT 50',
	        ['resolveBaseRelativeResourceId(resource, iri)', 'resolveBaseRelativeResourceId(table, iri)'],
	        ['findByLocator(resource, locator)', 'findByLocator(table, locator)'],
	        'const find = (target, options) => createFindByResource()(target, options)',
	      ],
	    ],
	    [
	      path.join(root, 'esm/core/pod-database.js'),
	      [
	        'findByIriViaExactResource',
	        'collection sidecar SPARQL endpoint',
	        'CONTAINS(STR(?subject)',
	        'subjectMatchesShortId',
	        'LIMIT 50',
	        ['resolveBaseRelativeResourceId(resource, iri)', 'resolveBaseRelativeResourceId(table, iri)'],
	        ['findByLocator(resource, locator)', 'findByLocator(table, locator)'],
	        'const find = (target, options) => createFindByResource()(target, options)',
	      ],
	    ],
    [
      path.join(root, 'core/resource-reference.js'),
      [
        '/\\.(ttl|jsonld|json)(?:#|$)/i.test(value)',
      ],
    ],
    [
      path.join(root, 'esm/core/resource-reference.js'),
      [
        '/\\.(ttl|jsonld|json)(?:#|$)/i.test(value)',
      ],
    ],
    [
      path.join(root, 'core/execution/pod-executor.js'),
      [
        'Exact resource reads already know the concrete Pod document',
        'shouldSkipResourcePreparation()',
        [
          'skipResourceExistenceCheck: this.shouldSkipResourcePreparation()',
          'skipResourceExistenceCheck: useWriteTimePreparation',
        ],
      ],
    ],
    [
      path.join(root, 'esm/core/execution/pod-executor.js'),
      [
        'Exact resource reads already know the concrete Pod document',
        'shouldSkipResourcePreparation()',
        [
          'skipResourceExistenceCheck: this.shouldSkipResourcePreparation()',
          'skipResourceExistenceCheck: useWriteTimePreparation',
        ],
      ],
    ],
    [
      path.join(root, 'core/execution/sparql-strategy.js'),
      [
        'resolvePodResourceIri(value)',
        'return this.resolvePodResourceIri(table.config?.base);',
      ],
    ],
    [
      path.join(root, 'esm/core/execution/sparql-strategy.js'),
      [
        'resolvePodResourceIri(value)',
        'return this.resolvePodResourceIri(table.config?.base);',
      ],
    ],
    [
      path.join(root, 'core/execution/ldp-executor.js'),
      [
        'options.skipResourceExistenceCheck',
        'via = \'patch\'',
      ],
    ],
    [
      path.join(root, 'esm/core/execution/ldp-executor.js'),
      [
        'options.skipResourceExistenceCheck',
        'via = \'patch\'',
      ],
    ],
  ]

  for (const [filePath, patterns] of mustContain) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      throw new Error(`Missing patched drizzle-solid file: ${filePath}`)
    }
    const source = readFileSync(filePath, 'utf8')
	    for (const pattern of patterns) {
	      const alternatives = Array.isArray(pattern) ? pattern : [pattern]
	      if (!alternatives.some((candidate) => source.includes(candidate))) {
	        throw new Error(`drizzle-solid patch missing "${alternatives.join('" or "')}" in ${filePath}`)
	      }
	    }
    if (/function isBaseRelativeSubjectId[\s\S]*?value\.includes\(['"]\/['"]\)[\s\S]*?\n\}/.test(source)) {
      throw new Error(`drizzle-solid patch still treats slash-only ids as resource ids in ${filePath}`)
    }
	  }

  const syntaxFiles = [
    path.join(root, 'driver.js'),
    path.join(root, 'esm/driver.js'),
    path.join(root, 'core/pod-database.js'),
    path.join(root, 'esm/core/pod-database.js'),
    path.join(root, 'core/pod-session.js'),
    path.join(root, 'esm/core/pod-session.js'),
    path.join(root, 'core/pod-dialect.js'),
    path.join(root, 'esm/core/pod-dialect.js'),
    path.join(root, 'core/execution/pod-executor.js'),
    path.join(root, 'esm/core/execution/pod-executor.js'),
    path.join(root, 'core/execution/sparql-strategy.js'),
    path.join(root, 'esm/core/execution/sparql-strategy.js'),
    path.join(root, 'core/execution/ldp-executor.js'),
    path.join(root, 'esm/core/execution/ldp-executor.js'),
    path.join(root, 'core/execution/ldp-strategy.js'),
    path.join(root, 'esm/core/execution/ldp-strategy.js'),
  ]

  for (const filePath of syntaxFiles) {
    if (statSync(filePath, { throwIfNoEntry: false }) == null) {
      continue
    }
    const result = spawnSync(process.execPath, ['--check', filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    if ((result.status ?? 1) !== 0) {
      throw new Error(`Patched drizzle-solid has invalid JS syntax in ${filePath}\n${result.stderr || result.stdout}`)
    }
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
