import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const previewRoot = join(repoRoot, 'preview')
const args = parseArgs(process.argv.slice(2))
const baseCliPkg = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf-8'))
const packageVersion = args.version ?? (args.release ? baseCliPkg.version : createPreviewVersion(baseCliPkg.version))
const artifactKind = args.release ? 'release' : 'preview'
const workRoot = join(tmpdir(), `linx-cli-${artifactKind}-${Date.now()}`)

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
cpSync(join(repoRoot, 'packages', 'models', 'dist'), join(vendorModelsRoot, 'dist'), { recursive: true })

const vendorAgentRuntimeRoot = join(workRoot, 'vendor', 'agent-runtime')
mkdirSync(vendorAgentRuntimeRoot, { recursive: true })
cpSync(join(repoRoot, 'packages', 'agent-runtime', 'dist'), join(vendorAgentRuntimeRoot, 'dist'), { recursive: true })

const modelsPkg = JSON.parse(readFileSync(join(repoRoot, 'packages', 'models', 'package.json'), 'utf-8'))
const slimModelsPkg = {
  name: '@undefineds.co/models',
  version: modelsPkg.version,
  type: 'module',
  exports: {
    '.': './dist/index.js',
    './ai-config': './dist/ai-config/index.js',
    './client': './dist/client/index.js',
    './discovery': './dist/discovery/index.js',
    './namespaces': './dist/namespaces.js',
    './profile': './dist/profile.js',
    './profile.schema': './dist/profile.schema.js',
    './vocab': './dist/vocab/index.js',
    './vocab/sidecar': './dist/vocab/sidecar.vocab.js',
    './watch': './dist/watch/index.js',
  },
  dependencies: modelsPkg.dependencies,
}
writeFileSync(join(vendorModelsRoot, 'package.json'), `${JSON.stringify(slimModelsPkg, null, 2)}\n`)

const agentRuntimePkg = JSON.parse(readFileSync(join(repoRoot, 'packages', 'agent-runtime', 'package.json'), 'utf-8'))
const slimAgentRuntimePkg = {
  name: '@linx/agent-runtime',
  version: agentRuntimePkg.version,
  type: 'module',
  exports: {
    '.': './dist/index.js',
    './acp': './dist/acp.js',
    './companion-model': './dist/companion-model.js',
    './turn-controller': './dist/turn-controller.js',
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
  Object.assign(cliPkg.dependencies, modelsPkg.dependencies)
  cliPkg.dependencies['@zed-industries/codex-acp'] = '^0.9.5'
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
    const replacements = [
      ["'@undefineds.co/models'", `'${modelsBase}/index.js'`],
      ["'@undefineds.co/models/client'", `'${modelsBase}/client/index.js'`],
      ["'@undefineds.co/models/ai-config'", `'${modelsBase}/ai-config/index.js'`],
      ["'@undefineds.co/models/discovery'", `'${modelsBase}/discovery/index.js'`],
      ["'@undefineds.co/models/namespaces'", `'${modelsBase}/namespaces.js'`],
      ["'@undefineds.co/models/profile'", `'${modelsBase}/profile.js'`],
      ["'@undefineds.co/models/profile.schema'", `'${modelsBase}/profile.schema.js'`],
      ["'@undefineds.co/models/vocab'", `'${modelsBase}/vocab/index.js'`],
      ["'@undefineds.co/models/vocab/sidecar'", `'${modelsBase}/vocab/sidecar.vocab.js'`],
      ["'@undefineds.co/models/watch'", `'${modelsBase}/watch/index.js'`],
      ["'@linx/agent-runtime'", `'${agentRuntimeBase}/index.js'`],
      ["'@linx/agent-runtime/acp'", `'${agentRuntimeBase}/acp.js'`],
      ["'@linx/agent-runtime/companion-model'", `'${agentRuntimeBase}/companion-model.js'`],
      ["'@linx/agent-runtime/turn-controller'", `'${agentRuntimeBase}/turn-controller.js'`],
      ['"@undefineds.co/models"', `"${modelsBase}/index.js"`],
      ['"@undefineds.co/models/client"', `"${modelsBase}/client/index.js"`],
      ['"@undefineds.co/models/ai-config"', `"${modelsBase}/ai-config/index.js"`],
      ['"@undefineds.co/models/discovery"', `"${modelsBase}/discovery/index.js"`],
      ['"@undefineds.co/models/namespaces"', `"${modelsBase}/namespaces.js"`],
      ['"@undefineds.co/models/profile"', `"${modelsBase}/profile.js"`],
      ['"@undefineds.co/models/profile.schema"', `"${modelsBase}/profile.schema.js"`],
      ['"@undefineds.co/models/vocab"', `"${modelsBase}/vocab/index.js"`],
      ['"@undefineds.co/models/vocab/sidecar"', `"${modelsBase}/vocab/sidecar.vocab.js"`],
      ['"@undefineds.co/models/watch"', `"${modelsBase}/watch/index.js"`],
      ['"@linx/agent-runtime"', `"${agentRuntimeBase}/index.js"`],
      ['"@linx/agent-runtime/acp"', `"${agentRuntimeBase}/acp.js"`],
      ['"@linx/agent-runtime/companion-model"', `"${agentRuntimeBase}/companion-model.js"`],
      ['"@linx/agent-runtime/turn-controller"', `"${agentRuntimeBase}/turn-controller.js"`],
    ]
    for (const [from, to] of replacements) {
      source = source.split(from).join(to)
    }
    writeFileSync(file, source)
  }
}

rewriteVendorImports(join(workRoot, 'dist'))
rewriteVendorImports(join(workRoot, 'vendor', 'agent-runtime', 'dist'))
fixExtensionlessRelativeImports(join(workRoot, 'vendor', 'models', 'dist'))
fixExtensionlessRelativeImports(join(workRoot, 'vendor', 'agent-runtime', 'dist'))
fixJsonImportAttributes(join(workRoot, 'vendor', 'models', 'dist'))

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
const tgz = join(workRoot, packed.filename)
const out = join(previewRoot, `linx-cli-${artifactKind}-selfcontained-${packageVersion}.tgz`)
cpSync(tgz, out)
console.log(out)

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
