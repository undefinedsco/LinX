import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import {
  assertBundledPiPluginConfigPaths,
  assertBundledPiPluginsInstalled,
  copyBundledPiPlugins,
} from './bundled-pi-plugins.mjs'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const modelsRoot = join(repoRoot, 'packages', 'models')
const outRoot = join(repoRoot, 'preview')
const args = parseArgs(process.argv.slice(2))

const cliPkg = JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf-8'))
const modelsPkg = JSON.parse(readFileSync(join(modelsRoot, 'package.json'), 'utf-8'))
const agentRuntimeRoot = join(repoRoot, 'packages', 'agent-runtime')
const agentRuntimePkg = JSON.parse(readFileSync(join(agentRuntimeRoot, 'package.json'), 'utf-8'))
const codexAcpDependencyVersion = cliPkg.dependencies?.['@zed-industries/codex-acp']
const version = args.version ?? cliPkg.version
if (modelsPkg.version !== cliPkg.version && !args.version) {
  throw new Error(`CLI and models versions must match for release: cli=${cliPkg.version}, models=${modelsPkg.version}`)
}

const workRoot = join(tmpdir(), `linx-cli-release-${Date.now()}`)
const cliWorkRoot = join(workRoot, 'cli')

rmSync(workRoot, { recursive: true, force: true })
mkdirSync(outRoot, { recursive: true })
mkdirSync(cliWorkRoot, { recursive: true })

copyPackage(cliRoot, cliWorkRoot)
copyAgentRuntimePackage(cliWorkRoot)
copyBundledPiPlugins({
  repoRoot,
  targetRoot: cliWorkRoot,
})
assertBundledPiPluginsInstalled(cliWorkRoot)
assertBundledPiPluginConfigPaths(cliWorkRoot)
rewriteAgentRuntimeImports(join(cliWorkRoot, 'dist'), cliWorkRoot)

writeJson(join(cliWorkRoot, 'package.json'), createPublishableCliPackage(cliPkg, version, modelsPkg.version))

const cliTarball = npmPack(cliWorkRoot, workRoot)

const cliOut = join(outRoot, `undefineds-co-linx-${version}.tgz`)
cpSync(cliTarball, cliOut)

console.log(cliOut)

function copyPackage(from, to) {
  cpSync(from, to, {
    recursive: true,
    filter: (src) => shouldCopyPackagePath(from, src),
  })
}

function shouldCopyPackagePath(root, path) {
  const relativePath = relative(root, path)
  if (!relativePath) return true

  const segments = relativePath.split(sep)
  return !segments.includes('node_modules')
    && !segments.includes('.tmp-dev-emit')
    && !segments.includes('test')
    && !segments.includes('tests')
    && !segments.includes('src')
}

function createPublishableCliPackage(pkg, packageVersion, modelsVersion) {
  if (!codexAcpDependencyVersion) {
    throw new Error('Missing @zed-industries/codex-acp dependency version in apps/cli/package.json')
  }

  const dependencies = {
    ...(pkg.dependencies ?? {}),
    '@undefineds.co/models': modelsVersion,
    '@zed-industries/codex-acp': codexAcpDependencyVersion,
  }
  delete dependencies['@linx/agent-runtime']

  return {
    ...pkg,
    version: packageVersion,
    private: false,
    files: [
      'dist',
      'vendor',
      'README.md',
      'package.json',
    ],
    dependencies,
    publishConfig: {
      access: 'public',
    },
  }
}

function copyAgentRuntimePackage(cliWorkRoot) {
  const vendorRoot = join(cliWorkRoot, 'vendor', 'agent-runtime')
  mkdirSync(vendorRoot, { recursive: true })
  cpSync(join(agentRuntimeRoot, 'dist'), join(vendorRoot, 'dist'), { recursive: true })
  writeJson(join(vendorRoot, 'package.json'), {
    name: '@linx/agent-runtime',
    version: agentRuntimePkg.version,
    type: 'module',
    exports: {
      '.': './dist/index.js',
      './acp': './dist/acp.js',
      './auto-mode': './dist/auto-mode.js',
      './companion-model': './dist/companion-model.js',
      './control-plane': './dist/control-plane.js',
      './file-sync': './dist/file-sync.js',
      './reconciler': './dist/reconciler.js',
      './runtime': './dist/runtime.js',
      './symphony': './dist/symphony.js',
      './sync': './dist/sync.js',
      './thread-reconciler-controller': './dist/thread-reconciler-controller.js',
      './turn-controller': './dist/turn-controller.js',
      './wake-scheduler': './dist/wake-scheduler.js',
    },
  })
  fixExtensionlessRelativeImports(join(vendorRoot, 'dist'))
}

function rewriteAgentRuntimeImports(root, cliWorkRoot) {
  const jsFiles = walkJs(root)
  for (const file of jsFiles) {
    let source = readFileSync(file, 'utf8')
    const rel = relative(dirname(file), join(cliWorkRoot, 'vendor', 'agent-runtime', 'dist')).replaceAll('\\', '/')
    const base = rel.startsWith('.') ? rel : `./${rel}`
    const replacements = [
      ["'@linx/agent-runtime'", `'${base}/index.js'`],
      ["'@linx/agent-runtime/acp'", `'${base}/acp.js'`],
      ["'@linx/agent-runtime/auto-mode'", `'${base}/auto-mode.js'`],
      ["'@linx/agent-runtime/companion-model'", `'${base}/companion-model.js'`],
      ["'@linx/agent-runtime/control-plane'", `'${base}/control-plane.js'`],
      ["'@linx/agent-runtime/file-sync'", `'${base}/file-sync.js'`],
      ["'@linx/agent-runtime/reconciler'", `'${base}/reconciler.js'`],
      ["'@linx/agent-runtime/runtime'", `'${base}/runtime.js'`],
      ["'@linx/agent-runtime/symphony'", `'${base}/symphony.js'`],
      ["'@linx/agent-runtime/sync'", `'${base}/sync.js'`],
      ["'@linx/agent-runtime/thread-reconciler-controller'", `'${base}/thread-reconciler-controller.js'`],
      ["'@linx/agent-runtime/turn-controller'", `'${base}/turn-controller.js'`],
      ["'@linx/agent-runtime/wake-scheduler'", `'${base}/wake-scheduler.js'`],
      ['"@linx/agent-runtime"', `"${base}/index.js"`],
      ['"@linx/agent-runtime/acp"', `"${base}/acp.js"`],
      ['"@linx/agent-runtime/auto-mode"', `"${base}/auto-mode.js"`],
      ['"@linx/agent-runtime/companion-model"', `"${base}/companion-model.js"`],
      ['"@linx/agent-runtime/control-plane"', `"${base}/control-plane.js"`],
      ['"@linx/agent-runtime/file-sync"', `"${base}/file-sync.js"`],
      ['"@linx/agent-runtime/reconciler"', `"${base}/reconciler.js"`],
      ['"@linx/agent-runtime/runtime"', `"${base}/runtime.js"`],
      ['"@linx/agent-runtime/symphony"', `"${base}/symphony.js"`],
      ['"@linx/agent-runtime/sync"', `"${base}/sync.js"`],
      ['"@linx/agent-runtime/thread-reconciler-controller"', `"${base}/thread-reconciler-controller.js"`],
      ['"@linx/agent-runtime/turn-controller"', `"${base}/turn-controller.js"`],
      ['"@linx/agent-runtime/wake-scheduler"', `"${base}/wake-scheduler.js"`],
    ]
    for (const [from, to] of replacements) {
      source = source.split(from).join(to)
    }
    writeFileSync(file, source)
  }
  assertNoBareAgentRuntimeImports(root)
}

function assertNoBareAgentRuntimeImports(root) {
  const leftovers = []
  for (const file of walkJs(root)) {
    const source = readFileSync(file, 'utf8')
    if (source.includes('@linx/agent-runtime')) {
      leftovers.push(relative(root, file))
    }
  }
  if (leftovers.length > 0) {
    throw new Error(`Unrewritten @linx/agent-runtime imports remain:\n${leftovers.join('\n')}`)
  }
}

function walkJs(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name)
    if (entry.isDirectory()) walkJs(next, files)
    else if (entry.isFile() && next.endsWith('.js')) files.push(next)
  }
  return files
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
  if (existsSync(`${targetBase}.js`)) {
    return `${specifier}.js`
  }

  if (existsSync(join(targetBase, 'index.js'))) {
    return `${specifier}/index.js`
  }

  return specifier
}

function npmPack(cwd, cacheRoot) {
  const packCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const pack = spawnSync(packCommand, ['pack'], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      npm_config_cache: join(cacheRoot, '.npm-cache'),
    },
  })
  if ((pack.status ?? 1) !== 0) {
    process.exit(pack.status ?? 1)
  }

  const filename = pack.stdout.trim().split('\n').at(-1)
  if (!filename) {
    throw new Error(`npm pack did not print a tarball name for ${cwd}`)
  }
  const tarball = join(cwd, filename)
  if (!existsSync(tarball)) {
    throw new Error(`npm pack output was not found: ${tarball}`)
  }
  return tarball
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function parseArgs(argv) {
  const parsed = {
    version: undefined,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
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
