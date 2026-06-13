import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import {
  assertBundledPiPluginConfigPaths,
  assertBundledPiPluginsInstalled,
  copyBundledPiPlugins,
} from './bundled-pi-plugins.mjs'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const previewRoot = join(repoRoot, 'preview')
const args = parseArgs(process.argv.slice(2))
const baseCliPkg = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf-8'))
const codexAcpDependencyVersion = baseCliPkg.dependencies?.['@zed-industries/codex-acp']
const packageVersion = args.version ?? (args.release ? baseCliPkg.version : createPreviewVersion(baseCliPkg.version))
const artifactKind = args.release ? 'release' : 'preview'
const workRoot = join(tmpdir(), `linx-cli-${artifactKind}-${Date.now()}`)
const modelsSourceRoot = resolvePackageSourceRoot('@undefineds.co/models', [
  process.env.LINX_MODELS_ROOT,
  join(repoRoot, 'node_modules', '@undefineds.co', 'models'),
])
const drizzleSolidSourceRoot = resolvePackageSourceRoot('@undefineds.co/drizzle-solid', [
  process.env.LINX_DRIZZLE_SOLID_ROOT,
  join(repoRoot, 'node_modules', '@undefineds.co', 'drizzle-solid'),
])

rmSync(workRoot, { recursive: true, force: true })
mkdirSync(workRoot, { recursive: true })
cpSync(cliRoot, workRoot, {
  recursive: true,
  filter: (src) => !src.includes('/.preview-pack')
    && !src.endsWith('/.tmp-dev-emit')
    && !src.includes('/.tmp-dev-emit/')
    && !src.includes('/node_modules/'),
})

const vendorModelsRoot = join(workRoot, 'vendor', 'models')
mkdirSync(vendorModelsRoot, { recursive: true })
cpSync(join(modelsSourceRoot, 'dist'), join(vendorModelsRoot, 'dist'), { recursive: true })

const vendorAgentRuntimeRoot = join(workRoot, 'vendor', 'agent-runtime')
mkdirSync(vendorAgentRuntimeRoot, { recursive: true })
cpSync(join(repoRoot, 'packages', 'agent-runtime', 'dist'), join(vendorAgentRuntimeRoot, 'dist'), { recursive: true })

const vendorDrizzleSolidRoot = join(workRoot, 'vendor', 'drizzle-solid')
mkdirSync(vendorDrizzleSolidRoot, { recursive: true })
cpSync(join(drizzleSolidSourceRoot, 'dist'), join(vendorDrizzleSolidRoot, 'dist'), { recursive: true })

copyBundledPiPlugins({
  repoRoot,
  targetRoot: workRoot,
})
assertBundledPiPluginsInstalled(workRoot)
assertBundledPiPluginConfigPaths(workRoot)

const modelsPkg = JSON.parse(readFileSync(join(modelsSourceRoot, 'package.json'), 'utf-8'))
const drizzleSolidPkg = JSON.parse(readFileSync(join(drizzleSolidSourceRoot, 'package.json'), 'utf-8'))
assertDrizzleSolidVendorExports(drizzleSolidSourceRoot)
const slimModelsPkg = {
  name: '@undefineds.co/models',
  version: modelsPkg.version,
  type: 'module',
  exports: {
    '.': './dist/index.js',
    './ai-config': './dist/ai-config/index.js',
    './client': './dist/client/index.js',
    './discovery': './dist/discovery/index.js',
    './interop': './dist/interop/index.js',
    './namespaces': './dist/namespaces.js',
    './profile': './dist/profile.js',
    './profile.repository': './dist/profile.repository.js',
    './profile.schema': './dist/profile.schema.js',
    './vocab': './dist/vocab/index.js',
    './vocab/sidecar': './dist/vocab/sidecar.vocab.js',
  },
  dependencies: omitDependencies(modelsPkg.dependencies, ['@undefineds.co/drizzle-solid']),
}
writeFileSync(join(vendorModelsRoot, 'package.json'), `${JSON.stringify(slimModelsPkg, null, 2)}\n`)

const slimDrizzleSolidPkg = {
  name: '@undefineds.co/drizzle-solid',
  version: drizzleSolidPkg.version,
  type: 'module',
  exports: {
    '.': './dist/esm/index.js',
  },
}
writeFileSync(join(vendorDrizzleSolidRoot, 'package.json'), `${JSON.stringify(slimDrizzleSolidPkg, null, 2)}\n`)

const agentRuntimePkg = JSON.parse(readFileSync(join(repoRoot, 'packages', 'agent-runtime', 'package.json'), 'utf-8'))
const slimAgentRuntimePkg = {
  name: '@linx/agent-runtime',
  version: agentRuntimePkg.version,
  type: 'module',
  exports: {
    '.': './dist/index.js',
    './acp': './dist/acp.js',
    './companion-model': './dist/companion-model.js',
    './control-plane': './dist/control-plane.js',
    './file-sync': './dist/file-sync.js',
    './pod-resource-identity': './dist/pod-resource-identity.js',
    './reconciler': './dist/reconciler.js',
    './runtime': './dist/runtime.js',
    './symphony': './dist/symphony.js',
    './auto-mode': './dist/auto-mode.js',
    './sync': './dist/sync.js',
    './thread-reconciler-controller': './dist/thread-reconciler-controller.js',
    './turn-controller': './dist/turn-controller.js',
    './wake-scheduler': './dist/wake-scheduler.js',
    './workspace': './dist/workspace.js',
  },
}
writeFileSync(join(vendorAgentRuntimeRoot, 'package.json'), `${JSON.stringify(slimAgentRuntimePkg, null, 2)}\n`)

const cliPkgPath = join(workRoot, 'package.json')
const cliPkg = JSON.parse(readFileSync(cliPkgPath, 'utf-8'))
cliPkg.private = false
cliPkg.version = packageVersion
cliPkg.files = [
  'dist',
  'vendor',
  'README.md',
  'package.json',
]
cliPkg.publishConfig = {
  access: 'public',
}
if (cliPkg.dependencies) {
  delete cliPkg.dependencies['@undefineds.co/models']
  delete cliPkg.dependencies['@linx/agent-runtime']
  delete cliPkg.dependencies['@undefineds.co/drizzle-solid']
  Object.assign(cliPkg.dependencies, modelsPkg.dependencies)
  delete cliPkg.dependencies['@undefineds.co/drizzle-solid']
  Object.assign(cliPkg.dependencies, drizzleSolidPkg.dependencies ?? {})
  if (!codexAcpDependencyVersion) {
    throw new Error('Missing @zed-industries/codex-acp dependency version in apps/cli/package.json')
  }
  cliPkg.dependencies['@zed-industries/codex-acp'] = codexAcpDependencyVersion
}
writeFileSync(cliPkgPath, `${JSON.stringify(cliPkg, null, 2)}\n`)

function walkJs(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name)
    if (entry.isDirectory()) walkJs(next, files)
    else if (entry.isFile() && next.endsWith('.js')) files.push(next)
  }
  return files
}

function rewriteVendorImports(root) {
  const jsFiles = walkJs(root)
  for (const file of jsFiles) {
    let source = readFileSync(file, 'utf8')
    const modelsRel = relative(dirname(file), join(workRoot, 'vendor', 'models', 'dist')).replaceAll('\\', '/')
    const modelsBase = modelsRel.startsWith('.') ? modelsRel : `./${modelsRel}`
    const agentRuntimeRel = relative(dirname(file), join(workRoot, 'vendor', 'agent-runtime', 'dist')).replaceAll('\\', '/')
    const agentRuntimeBase = agentRuntimeRel.startsWith('.') ? agentRuntimeRel : `./${agentRuntimeRel}`
    const drizzleSolidRel = relative(dirname(file), join(workRoot, 'vendor', 'drizzle-solid', 'dist', 'esm')).replaceAll('\\', '/')
    const drizzleSolidBase = drizzleSolidRel.startsWith('.') ? drizzleSolidRel : `./${drizzleSolidRel}`
    const replacements = [
      ["'@undefineds.co/models'", `'${modelsBase}/index.js'`],
      ["'@undefineds.co/models/client'", `'${modelsBase}/client/index.js'`],
      ["'@undefineds.co/models/ai-config'", `'${modelsBase}/ai-config/index.js'`],
      ["'@undefineds.co/models/discovery'", `'${modelsBase}/discovery/index.js'`],
      ["'@undefineds.co/models/interop'", `'${modelsBase}/interop/index.js'`],
      ["'@undefineds.co/models/namespaces'", `'${modelsBase}/namespaces.js'`],
      ["'@undefineds.co/models/profile'", `'${modelsBase}/profile.js'`],
      ["'@undefineds.co/models/profile.repository'", `'${modelsBase}/profile.repository.js'`],
      ["'@undefineds.co/models/profile.schema'", `'${modelsBase}/profile.schema.js'`],
      ["'@undefineds.co/models/vocab'", `'${modelsBase}/vocab/index.js'`],
      ["'@undefineds.co/models/vocab/sidecar'", `'${modelsBase}/vocab/sidecar.vocab.js'`],
      ["'@linx/agent-runtime'", `'${agentRuntimeBase}/index.js'`],
      ["'@linx/agent-runtime/acp'", `'${agentRuntimeBase}/acp.js'`],
      ["'@linx/agent-runtime/companion-model'", `'${agentRuntimeBase}/companion-model.js'`],
      ["'@linx/agent-runtime/control-plane'", `'${agentRuntimeBase}/control-plane.js'`],
      ["'@linx/agent-runtime/file-sync'", `'${agentRuntimeBase}/file-sync.js'`],
      ["'@linx/agent-runtime/pod-resource-identity'", `'${agentRuntimeBase}/pod-resource-identity.js'`],
      ["'@linx/agent-runtime/reconciler'", `'${agentRuntimeBase}/reconciler.js'`],
      ["'@linx/agent-runtime/runtime'", `'${agentRuntimeBase}/runtime.js'`],
      ["'@linx/agent-runtime/symphony'", `'${agentRuntimeBase}/symphony.js'`],
      ["'@linx/agent-runtime/auto-mode'", `'${agentRuntimeBase}/auto-mode.js'`],
      ["'@linx/agent-runtime/sync'", `'${agentRuntimeBase}/sync.js'`],
      ["'@linx/agent-runtime/thread-reconciler-controller'", `'${agentRuntimeBase}/thread-reconciler-controller.js'`],
      ["'@linx/agent-runtime/turn-controller'", `'${agentRuntimeBase}/turn-controller.js'`],
      ["'@linx/agent-runtime/wake-scheduler'", `'${agentRuntimeBase}/wake-scheduler.js'`],
      ["'@linx/agent-runtime/workspace'", `'${agentRuntimeBase}/workspace.js'`],
      ["'@undefineds.co/drizzle-solid'", `'${drizzleSolidBase}/index.js'`],
      ['"@undefineds.co/models"', `"${modelsBase}/index.js"`],
      ['"@undefineds.co/models/client"', `"${modelsBase}/client/index.js"`],
      ['"@undefineds.co/models/ai-config"', `"${modelsBase}/ai-config/index.js"`],
      ['"@undefineds.co/models/discovery"', `"${modelsBase}/discovery/index.js"`],
      ['"@undefineds.co/models/interop"', `"${modelsBase}/interop/index.js"`],
      ['"@undefineds.co/models/namespaces"', `"${modelsBase}/namespaces.js"`],
      ['"@undefineds.co/models/profile"', `"${modelsBase}/profile.js"`],
      ['"@undefineds.co/models/profile.repository"', `"${modelsBase}/profile.repository.js"`],
      ['"@undefineds.co/models/profile.schema"', `"${modelsBase}/profile.schema.js"`],
      ['"@undefineds.co/models/vocab"', `"${modelsBase}/vocab/index.js"`],
      ['"@undefineds.co/models/vocab/sidecar"', `"${modelsBase}/vocab/sidecar.vocab.js"`],
      ['"@linx/agent-runtime"', `"${agentRuntimeBase}/index.js"`],
      ['"@linx/agent-runtime/acp"', `"${agentRuntimeBase}/acp.js"`],
      ['"@linx/agent-runtime/companion-model"', `"${agentRuntimeBase}/companion-model.js"`],
      ['"@linx/agent-runtime/control-plane"', `"${agentRuntimeBase}/control-plane.js"`],
      ['"@linx/agent-runtime/file-sync"', `"${agentRuntimeBase}/file-sync.js"`],
      ['"@linx/agent-runtime/pod-resource-identity"', `"${agentRuntimeBase}/pod-resource-identity.js"`],
      ['"@linx/agent-runtime/reconciler"', `"${agentRuntimeBase}/reconciler.js"`],
      ['"@linx/agent-runtime/runtime"', `"${agentRuntimeBase}/runtime.js"`],
      ['"@linx/agent-runtime/symphony"', `"${agentRuntimeBase}/symphony.js"`],
      ['"@linx/agent-runtime/auto-mode"', `"${agentRuntimeBase}/auto-mode.js"`],
      ['"@linx/agent-runtime/sync"', `"${agentRuntimeBase}/sync.js"`],
      ['"@linx/agent-runtime/thread-reconciler-controller"', `"${agentRuntimeBase}/thread-reconciler-controller.js"`],
      ['"@linx/agent-runtime/turn-controller"', `"${agentRuntimeBase}/turn-controller.js"`],
      ['"@linx/agent-runtime/wake-scheduler"', `"${agentRuntimeBase}/wake-scheduler.js"`],
      ['"@linx/agent-runtime/workspace"', `"${agentRuntimeBase}/workspace.js"`],
      ['"@undefineds.co/drizzle-solid"', `"${drizzleSolidBase}/index.js"`],
    ]
    for (const [from, to] of replacements) {
      source = source.split(from).join(to)
    }
    writeFileSync(file, source)
  }
}

rewriteVendorImports(join(workRoot, 'dist'))
rewriteVendorImports(join(workRoot, 'vendor', 'models', 'dist'))
rewriteVendorImports(join(workRoot, 'vendor', 'agent-runtime', 'dist'))
assertVendoredModelsImportsResolve(workRoot)
assertNoBareAgentRuntimeImports(join(workRoot, 'dist'))
assertNoBareDrizzleSolidImports(join(workRoot, 'dist'))
assertNoBareDrizzleSolidImports(join(workRoot, 'vendor', 'models', 'dist'))
fixExtensionlessRelativeImports(join(workRoot, 'vendor', 'models', 'dist'))
fixExtensionlessRelativeImports(join(workRoot, 'vendor', 'agent-runtime', 'dist'))
fixJsonImportAttributes(join(workRoot, 'vendor', 'models', 'dist'))

function assertNoBareAgentRuntimeImports(root) {
  const leftovers = []
  for (const file of walkJs(root)) {
    const source = readFileSync(file, 'utf8')
    if (source.includes('@linx/agent-runtime')) {
      leftovers.push(relative(workRoot, file))
    }
  }
  if (leftovers.length > 0) {
    throw new Error(`Unrewritten @linx/agent-runtime imports remain:\n${leftovers.join('\n')}`)
  }
}

function assertNoBareDrizzleSolidImports(root) {
  const leftovers = []
  for (const file of walkJs(root)) {
    const source = readFileSync(file, 'utf8')
    if (source.includes('@undefineds.co/drizzle-solid')) {
      leftovers.push(relative(workRoot, file))
    }
  }
  if (leftovers.length > 0) {
    throw new Error(`Unrewritten @undefineds.co/drizzle-solid imports remain:\n${leftovers.join('\n')}`)
  }
}

function assertVendoredModelsImportsResolve(root) {
  const modelsEntry = resolve(root, 'vendor', 'models', 'dist', 'index.js')
  const exportNames = collectNamedExports(modelsEntry)
  const missing = []

  for (const file of walkJs(join(root, 'dist'))) {
    const source = readFileSync(file, 'utf8')
    const importPattern = /import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g
    let match
    while ((match = importPattern.exec(source)) !== null) {
      const [, specifierList, specifier] = match
      if (resolveStaticImport(file, specifier) !== modelsEntry) {
        continue
      }

      for (const name of parseImportedNames(specifierList)) {
        if (!exportNames.has(name)) {
          missing.push(`${relative(root, file)} imports missing ${name} from vendor/models/dist/index.js`)
        }
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(`Self-contained package has unresolved vendored models imports:\n${missing.join('\n')}`)
  }
}

function collectNamedExports(file) {
  const source = readFileSync(file, 'utf8')
  const names = new Set()
  const exportBlockPattern = /export\s*\{([\s\S]*?)\}/g
  let blockMatch
  while ((blockMatch = exportBlockPattern.exec(source)) !== null) {
    for (const entry of blockMatch[1].split(',')) {
      const parsed = parseExportedName(entry)
      if (parsed) {
        names.add(parsed)
      }
    }
  }

  const declarationPattern = /export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g
  let declarationMatch
  while ((declarationMatch = declarationPattern.exec(source)) !== null) {
    names.add(declarationMatch[1])
  }

  return names
}

function parseExportedName(entry) {
  const cleaned = entry.trim()
  if (!cleaned) {
    return null
  }
  const aliasMatch = cleaned.match(/\s+as\s+([A-Za-z_$][\w$]*)$/)
  if (aliasMatch) {
    return aliasMatch[1]
  }
  const nameMatch = cleaned.match(/^([A-Za-z_$][\w$]*)$/)
  return nameMatch?.[1] ?? null
}

function parseImportedNames(specifierList) {
  return specifierList
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const match = entry.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+[A-Za-z_$][\w$]*)?$/)
      return match?.[1]
    })
    .filter(Boolean)
}

function resolveStaticImport(fromFile, specifier) {
  if (!specifier.startsWith('.')) {
    return null
  }
  return resolve(dirname(fromFile), specifier)
}

function fixExtensionlessRelativeImports(root) {
  const jsFiles = walkJs(root)
  const specifierPattern = /(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g
  const sideEffectPattern = /(import\s+['"])(\.{1,2}\/[^'"]+)(['"])/g
  for (const file of jsFiles) {
    let source = readFileSync(file, 'utf8')
    source = source.replace(specifierPattern, (_match, before, specifier, after) => {
      return `${before}${resolveRelativeSpecifier(file, specifier)}${after}`
    })
    source = source.replace(sideEffectPattern, (_match, before, specifier, after) => {
      return `${before}${resolveRelativeSpecifier(file, specifier)}${after}`
    })
    writeFileSync(file, source)
  }
}

function resolveRelativeSpecifier(fromFile, specifier) {
  if (
    specifier.endsWith('.js')
    || specifier.endsWith('.json')
    || specifier.includes('?')
    || specifier.includes('#')
  ) {
    return specifier
  }

  const targetBase = join(dirname(fromFile), specifier)
  if (existsFile(`${targetBase}.js`)) {
    return `${specifier}.js`
  }

  if (existsFile(join(targetBase, 'index.js'))) {
    return `${specifier}/index.js`
  }

  return specifier
}

function existsFile(path) {
  return existsSync(path)
}

function fixJsonImportAttributes(root) {
  const jsFiles = walkJs(root)
  const jsonImportPattern = /(import\s+[^;]*?from\s+['"][^'"]+\.json['"])(\s*;)/g
  for (const file of jsFiles) {
    let source = readFileSync(file, 'utf8')
    source = source.replace(jsonImportPattern, (_match, statement, suffix) => {
      if (statement.includes(' with { type: \'json\' }') || statement.includes(' with { type: "json" }')) {
        return `${statement}${suffix}`
      }
      return `${statement} with { type: 'json' }${suffix}`
    })
    writeFileSync(file, source)
  }
}

function resolvePackageSourceRoot(packageName, candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    const packageJsonPath = join(candidate, 'package.json')
    const distIndexPath = join(candidate, 'dist', 'index.js')
    if (!existsSync(packageJsonPath) || !existsSync(distIndexPath)) {
      continue
    }

    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
    if (pkg.name === packageName) {
      return candidate
    }
  }

  throw new Error(`Cannot find built ${packageName}. Run yarn install, or set LINX_MODELS_ROOT / LINX_DRIZZLE_SOLID_ROOT to an explicit built checkout.`)
}

function assertDrizzleSolidVendorExports(packageRoot) {
  const esmIndex = readFileSync(join(packageRoot, 'dist', 'esm', 'index.js'), 'utf8')
  const cjsIndex = readFileSync(join(packageRoot, 'dist', 'index.js'), 'utf8')
  const requiredExports = [
    'normalizePodDataResourceId',
    'buildPodResourceIri',
    'buildPodResourceIriForResource',
    'resolvePodResourceTemplateValue',
    'findExactRecord',
    'updateExactRecord',
    'upsertExactRecord',
    'insertExactRecordOnce',
    'deleteExactRecord',
  ]
  const missing = requiredExports.filter((name) => !esmIndex.includes(name) || !cjsIndex.includes(name))
  if (missing.length > 0) {
    throw new Error(`Built @undefineds.co/drizzle-solid is missing required exports: ${missing.join(', ')}`)
  }
}

function omitDependencies(dependencies, names) {
  const next = { ...(dependencies ?? {}) }
  for (const name of names) {
    delete next[name]
  }
  return next
}

for (const name of ['src', 'test', '.tmp-dev-emit', '.omx']) {
  rmSync(join(workRoot, name), { recursive: true, force: true })
}

mkdirSync(previewRoot, { recursive: true })
const pack = spawnSync('npm', ['pack', '--json'], {
  cwd: workRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
  env: {
    ...process.env,
    npm_config_cache: join(workRoot, '.npm-cache'),
  },
})
if ((pack.status ?? 1) !== 0) process.exit(pack.status ?? 1)
const packed = JSON.parse(pack.stdout)[0]
assertPackedFileList(packed.files?.map((file) => file.path) ?? [])
const tgz = join(workRoot, packed.filename)
const out = join(previewRoot, `linx-cli-${artifactKind}-selfcontained-${packageVersion}.tgz`)
cpSync(tgz, out)
console.log(out)

function assertPackedFileList(files) {
  const included = new Set(files)
  const requiredFiles = [
    'dist/index.js',
    'vendor/models/package.json',
    'vendor/models/dist/index.js',
    'vendor/agent-runtime/package.json',
    'vendor/agent-runtime/dist/index.js',
    'vendor/drizzle-solid/package.json',
    'vendor/drizzle-solid/dist/esm/index.js',
  ]
  const missing = requiredFiles.filter((file) => !included.has(file))
  if (missing.length > 0) {
    throw new Error(`Self-contained package is missing required files:\n${missing.join('\n')}`)
  }
}

function parseArgs(argv) {
  const parsed = {
    release: false,
    version: undefined,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--release') {
      parsed.release = true
      continue
    }
    if (arg === '--preview') {
      parsed.release = false
      continue
    }
    if (arg === '--version') {
      parsed.version = argv[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('--version=')) {
      parsed.version = arg.slice('--version='.length)
      continue
    }
    throw new Error(`Unknown option: ${arg}`)
  }

  return parsed
}

function createPreviewVersion(baseVersion) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/.exec(baseVersion)
  if (!match) {
    throw new Error(`Cannot derive preview version from package version: ${baseVersion}`)
  }

  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])
  return `${major}.${minor}.${patch + 1}-preview.${Date.now()}`
}
