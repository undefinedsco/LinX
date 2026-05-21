import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const cliDistRoot = join(cliRoot, 'dist')
const modelsRoot = fileURLToPath(new URL('../../../packages/models', import.meta.url))
const modelsDistRoot = join(modelsRoot, 'dist')
const agentRuntimeRoot = fileURLToPath(new URL('../../../packages/agent-runtime', import.meta.url))
const agentRuntimeDistRoot = join(agentRuntimeRoot, 'dist')
const sourceRoot = join(cliRoot, 'src')
const skillsRoot = fileURLToPath(new URL('../../../skills', import.meta.url))
const requireFromCli = createRequire(join(cliRoot, 'package.json'))
const localTscBin = requireFromCli.resolve('typescript/bin/tsc')
const bundleCache = new Map()
const cachedBundleRoots = new Set()
let cleanupRegistered = false

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

  return Promise.resolve({
    module: import(pathToFileURL(compiledEntry).href),
    entryPath: compiledEntry,
    cleanup() {},
  }).then(async (loaded) => ({
    ...loaded,
    module: await loaded.module,
  }))
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

async function buildAutoModeBundle(entryRelative) {
  registerProcessCleanup()
  const root = mkdtempSync(join(tmpdir(), 'linx-auto-mode-test-'))
  cachedBundleRoots.add(root)
  const outdir = join(root, 'dist')
  const undefinedsNodeModulesDir = join(outdir, 'node_modules', '@undefineds.co')
  const linxNodeModulesDir = join(outdir, 'node_modules', '@linx')
  const modelsPackageDir = join(undefinedsNodeModulesDir, 'models')
  const agentRuntimePackageDir = join(linxNodeModulesDir, 'agent-runtime')
  const genericNodeModulesDir = join(outdir, 'node_modules')
  const scopedNodeModulesDir = join(outdir, 'node_modules', '@mariozechner')
  const sinclairNodeModulesDir = join(outdir, 'node_modules', '@sinclair')
  const entryPath = join(sourceRoot, entryRelative)
  const compiledEntry = join(outdir, entryRelative.replace(/\.ts$/, '.js'))

  execFileSync(process.execPath, [localTscBin, '-p', join(agentRuntimeRoot, 'tsconfig.json')], {
    cwd: cliRoot,
    stdio: 'pipe',
  })

  execFileSync(process.execPath, [
    localTscBin,
    '--outDir',
    outdir,
    '--rootDir',
    sourceRoot,
    '--module',
    'ESNext',
    '--moduleResolution',
    'Bundler',
    '--target',
    'ES2022',
    '--lib',
    'ES2022',
    '--types',
    'node',
    '--ignoreConfig',
    '--skipLibCheck',
    'true',
    '--verbatimModuleSyntax',
    'false',
    entryPath,
  ], {
    cwd: cliRoot,
    stdio: 'pipe',
  })
  cpSync(skillsRoot, join(outdir, 'skills'), {
    recursive: true,
    filter: (src) => !src.includes('/node_modules/') && !src.includes('/.git/'),
  })

  mkdirSync(undefinedsNodeModulesDir, { recursive: true })
  mkdirSync(linxNodeModulesDir, { recursive: true })
  mkdirSync(genericNodeModulesDir, { recursive: true })
  mkdirSync(scopedNodeModulesDir, { recursive: true })
  mkdirSync(sinclairNodeModulesDir, { recursive: true })
  mkdirSync(modelsPackageDir, { recursive: true })
  mkdirSync(agentRuntimePackageDir, { recursive: true })
  symlinkSync(modelsDistRoot, join(modelsPackageDir, 'dist'), 'dir')
  writeFileSync(join(modelsPackageDir, 'package.json'), JSON.stringify({
    name: '@undefineds.co/models',
    type: 'module',
    exports: {
      '.': './dist/index.js',
      './client': './dist/client/index.js',
      './discovery': './dist/discovery/index.js',
      './namespaces': './dist/namespaces.js',
      './profile': './dist/profile.js',
      './profile.repository': './dist/profile.repository.js',
      './profile.schema': './dist/profile.schema.js',
      './vocab': './dist/vocab/index.js',
      './vocab/sidecar': './dist/vocab/sidecar.vocab.js',
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
      './runtime': './dist/runtime.js',
      './auto-mode': './dist/auto-mode.js',
      './symphony': './dist/symphony.js',
      './turn-controller': './dist/turn-controller.js',
    },
  }, null, 2))
  symlinkSync(resolveNodeModule('ws'), join(genericNodeModulesDir, 'ws'), 'dir')
  symlinkSync(resolveNodeModule('n3'), join(genericNodeModulesDir, 'n3'), 'dir')
  symlinkSync(resolveNodeModule('@sinclair/typebox'), join(sinclairNodeModulesDir, 'typebox'), 'dir')
  symlinkSync(resolveNodeModule('@mariozechner/pi-ai'), join(scopedNodeModulesDir, 'pi-ai'), 'dir')
  symlinkSync(resolveNodeModule('@mariozechner/pi-agent-core'), join(scopedNodeModulesDir, 'pi-agent-core'), 'dir')
  symlinkSync(resolveNodeModule('@mariozechner/pi-coding-agent'), join(scopedNodeModulesDir, 'pi-coding-agent'), 'dir')
  symlinkSync(resolveNodeModule('@mariozechner/pi-tui'), join(scopedNodeModulesDir, 'pi-tui'), 'dir')
  mkdirSync(join(outdir, 'node_modules', '@inrupt'), { recursive: true })
  symlinkSync(
    resolveNodeModule('@inrupt/solid-client-authn-node'),
    join(outdir, 'node_modules', '@inrupt', 'solid-client-authn-node'),
    'dir',
  )

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
