import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { copyProductSkills } from '../scripts/product-skills.mjs'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const cliDistRoot = join(cliRoot, 'dist')
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const modelsRoot = resolvePackageSourceRoot('@undefineds.co/models', [
  process.env.LINX_MODELS_ROOT,
  join(repoRoot, 'node_modules', '@undefineds.co', 'models'),
])
const modelsDistRoot = join(modelsRoot, 'dist')
const drizzleSolidRoot = resolvePackageSourceRoot('@undefineds.co/drizzle-solid', [
  process.env.LINX_DRIZZLE_SOLID_ROOT,
  join(repoRoot, 'node_modules', '@undefineds.co', 'drizzle-solid'),
])
const drizzleSolidDistRoot = join(drizzleSolidRoot, 'dist')
const agentRuntimeRoot = fileURLToPath(new URL('../../../packages/agent-runtime', import.meta.url))
const agentRuntimeDistRoot = join(agentRuntimeRoot, 'dist')
const sourceRoot = join(cliRoot, 'src')
const skillsRoot = fileURLToPath(new URL('../../../skills', import.meta.url))
const requireFromCli = createRequire(join(cliRoot, 'package.json'))
const bundleCache = new Map()
const cachedBundleRoots = new Set()
let cleanupRegistered = false

function resolvePackageSourceRoot(packageName, candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    const packageJsonPath = join(candidate, 'package.json')
    const distIndexPath = join(candidate, 'dist', 'index.js')
    if (!existsSync(packageJsonPath) || !existsSync(distIndexPath)) {
      continue
    }

    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    if (pkg.name === packageName) {
      return candidate
    }
  }

  throw new Error(`Cannot find built ${packageName}. Run yarn install, or set LINX_MODELS_ROOT to an explicit built checkout.`)
}

export async function loadAutoModeModule(entryRelative = 'lib/auto-mode/index.ts') {
  if (!bundleCache.has(entryRelative)) {
    bundleCache.set(entryRelative, loadBuiltAutoModeBundle(entryRelative) ?? buildAutoModeBundle(entryRelative))
  }

  const loaded = await bundleCache.get(entryRelative)
  return {
    ...loaded,
    cleanup() {
      // Keep the compiled bundle available for later tests in this process.
      // Per-test recompilation dominates these suites and can turn one file into
      // a multi-minute run; process-exit cleanup removes the shared temp dirs.
    },
  }
}

function loadBuiltAutoModeBundle(entryRelative) {
  const compiledEntry = join(cliDistRoot, entryRelative.replace(/\.ts$/, '.js'))
  if (!isBuiltEntryFresh(compiledEntry)) {
    return null
  }
  if (
    !runtimePackageMatches('@undefineds.co/models', modelsRoot)
    || !runtimePackageMatches('@undefineds.co/drizzle-solid', drizzleSolidRoot)
  ) {
    return null
  }

  return Promise.resolve({
    module: import(pathToFileURL(compiledEntry).href),
    entryPath: compiledEntry,
    cleanup() {},
  }).then(async (loaded) => ({
    ...loaded,
    module: await loaded.module,
  }))
}

function runtimePackageMatches(packageName, expectedRoot) {
  try {
    return realpathSync(resolveNodeModule(packageName)) === realpathSync(expectedRoot)
  } catch {
    return false
  }
}

function isBuiltEntryFresh(compiledEntry) {
  if (!existsSync(compiledEntry)) {
    return false
  }

  const outputTime = statSync(compiledEntry).mtimeMs
  return [
    [sourceRoot, outputTime],
    [join(agentRuntimeRoot, 'src'), statMtime(join(agentRuntimeDistRoot, 'index.js')) ?? outputTime],
    [join(modelsRoot, 'src'), statMtime(join(modelsDistRoot, 'index.js')) ?? outputTime],
  ].every(([root, builtTime]) => builtTime != null && !hasNewerSource(root, builtTime))
}

function statMtime(path) {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

function hasNewerSource(root, outputTime) {
  if (!existsSync(root)) {
    return false
  }

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name)
    if (entry.isDirectory()) {
      if (hasNewerSource(path, outputTime)) {
        return true
      }
      continue
    }

    if (entry.isFile() && path.endsWith('.ts') && statSync(path).mtimeMs > outputTime) {
      return true
    }
  }
  return false
}

function resolveNodeModule(packageName) {
  const segments = packageName.split('/')
  for (const nodeModulesPath of requireFromCli.resolve.paths(packageName) ?? []) {
    const packageRoot = join(nodeModulesPath, ...segments)
    if (existsSync(join(packageRoot, 'package.json'))) {
      return packageRoot
    }
  }
  throw new Error(`Unable to resolve package root for ${packageName}`)
}

function symlinkNodePackage(outdir, packageName) {
  const segments = packageName.split('/')
  const targetParent = join(outdir, 'node_modules', ...segments.slice(0, -1))
  mkdirSync(targetParent, { recursive: true })
  symlinkSync(resolveNodeModule(packageName), join(targetParent, segments.at(-1)), 'dir')
}

async function buildAutoModeBundle(entryRelative) {
  registerProcessCleanup()
  const root = mkdtempSync(join(tmpdir(), 'linx-auto-mode-test-'))
  cachedBundleRoots.add(root)
  const outdir = join(root, 'dist')
  const undefinedsNodeModulesDir = join(outdir, 'node_modules', '@undefineds.co')
  const linxNodeModulesDir = join(outdir, 'node_modules', '@linx')
  const modelsPackageDir = join(undefinedsNodeModulesDir, 'models')
  const drizzleSolidPackageDir = join(undefinedsNodeModulesDir, 'drizzle-solid')
  const agentRuntimePackageDir = join(linxNodeModulesDir, 'agent-runtime')
  const entryPath = join(sourceRoot, entryRelative)
  const compiledEntry = join(outdir, entryRelative.replace(/\.ts$/, '.js'))
  const tsconfigPath = join(root, 'tsconfig.json')

  execFileSync('tsc', ['-p', join(agentRuntimeRoot, 'tsconfig.json')], {
    cwd: cliRoot,
    stdio: 'pipe',
  })

  writeFileSync(tsconfigPath, JSON.stringify({
    compilerOptions: {
      outDir: outdir,
      rootDir: sourceRoot,
      module: 'ESNext',
      moduleResolution: 'Bundler',
      target: 'ES2022',
      lib: ['ES2022'],
      types: ['node'],
      typeRoots: [
        join(cliRoot, 'node_modules', '@types'),
        join(repoRoot, 'node_modules', '@types'),
      ],
      skipLibCheck: true,
      verbatimModuleSyntax: false,
      baseUrl: sourceRoot,
      paths: {
        '@undefineds.co/models': [join(modelsDistRoot, 'index.d.ts')],
        '@undefineds.co/models/vocab/sidecar': [join(modelsDistRoot, 'vocab', 'sidecar.vocab.d.ts')],
        '@undefineds.co/models/*': [
          join(modelsDistRoot, '*'),
          join(modelsDistRoot, '*', 'index.d.ts'),
        ],
        '@undefineds.co/drizzle-solid': [join(drizzleSolidDistRoot, 'index.d.ts')],
      },
    },
    files: [entryPath],
  }, null, 2))

  execFileSync('tsc', ['-p', tsconfigPath], {
    cwd: cliRoot,
    stdio: 'pipe',
  })
  copyProductSkills(skillsRoot, join(outdir, 'skills'))

  mkdirSync(undefinedsNodeModulesDir, { recursive: true })
  mkdirSync(linxNodeModulesDir, { recursive: true })
  mkdirSync(modelsPackageDir, { recursive: true })
  mkdirSync(drizzleSolidPackageDir, { recursive: true })
  mkdirSync(agentRuntimePackageDir, { recursive: true })
  symlinkSync(modelsDistRoot, join(modelsPackageDir, 'dist'), 'dir')
  writeFileSync(join(modelsPackageDir, 'package.json'), JSON.stringify({
    name: '@undefineds.co/models',
    type: 'module',
    exports: {
      '.': './dist/index.js',
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
  }, null, 2))
  symlinkSync(drizzleSolidDistRoot, join(drizzleSolidPackageDir, 'dist'), 'dir')
  writeFileSync(join(drizzleSolidPackageDir, 'package.json'), JSON.stringify({
    name: '@undefineds.co/drizzle-solid',
    type: 'module',
    exports: {
      '.': './dist/esm/index.js',
    },
  }, null, 2))
  symlinkSync(agentRuntimeDistRoot, join(agentRuntimePackageDir, 'dist'), 'dir')
  writeFileSync(join(agentRuntimePackageDir, 'package.json'), JSON.stringify({
    name: '@linx/agent-runtime',
    type: 'module',
    exports: {
      '.': './dist/index.js',
      './acp': './dist/acp.js',
      './companion-model': './dist/companion-model.js',
      './control-plane': './dist/control-plane.js',
      './file-sync': './dist/file-sync.js',
      './reconciler': './dist/reconciler.js',
      './runtime': './dist/runtime.js',
      './auto-mode': './dist/auto-mode.js',
      './symphony': './dist/symphony.js',
      './sync': './dist/sync.js',
      './thread-reconciler-controller': './dist/thread-reconciler-controller.js',
      './turn-controller': './dist/turn-controller.js',
      './wake-scheduler': './dist/wake-scheduler.js',
    },
  }, null, 2))
  for (const packageName of [
    'ws',
    'n3',
    'pi-web-access',
    'typebox',
    'dotenv',
    'drizzle-orm',
    'node-fetch',
    'sparqljs',
    'zod',
    '@comunica/query-sparql-solid',
    '@inrupt/solid-client',
    '@inrupt/solid-client-authn-node',
    '@inrupt/universal-fetch',
    '@inrupt/vocab-common-rdf',
    '@sinclair/typebox',
    '@earendil-works/pi-ai',
    '@earendil-works/pi-agent-core',
    '@earendil-works/pi-coding-agent',
    '@earendil-works/pi-tui',
  ]) {
    symlinkNodePackage(outdir, packageName)
  }

  return {
    module: await import(pathToFileURL(compiledEntry).href),
    entryPath: compiledEntry,
    cleanup() {
      cachedBundleRoots.delete(root)
      rmSync(root, { recursive: true, force: true })
    },
  }
}

function registerProcessCleanup() {
  if (cleanupRegistered) {
    return
  }
  cleanupRegistered = true
  process.once('exit', () => {
    for (const root of cachedBundleRoots) {
      rmSync(root, { recursive: true, force: true })
    }
    cachedBundleRoots.clear()
  })
}
