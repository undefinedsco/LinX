import { existsSync, lstatSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const npmModelsPath = join(repoRoot, 'node_modules', '@undefineds.co', 'models')
const action = process.argv[2]

try {
  switch (action) {
    case 'update':
    case 'status':
      printStatus()
      break
    case 'assert-release-safe':
      assertReleaseSafe()
      break
    case 'build':
      buildOrVerifyModels()
      break
    case 'clean':
      cleanExplicitModelsRoot()
      break
    case 'pack-release':
      throw new Error('LinX no longer packs @undefineds.co/models. Publish models from the models repository, then bump the npm dependency here.')
    default:
      printUsage()
      process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

function printStatus() {
  const deps = readConsumerDependencySpecs()
  console.log(`@undefineds.co/models dependency: ${deps.expected}`)
  if (deps.mismatches.length > 0) {
    console.log(`dependency mismatches:\n${deps.mismatches.join('\n')}`)
  }

  const root = resolveModelsRoot()
  if (!root) {
    console.log('resolved models: missing. Run yarn install, or set LINX_MODELS_ROOT to an explicit external checkout.')
    return
  }

  const pkg = readPackage(root)
  console.log(`resolved models: ${root}`)
  console.log(`resolved version: ${pkg.version ?? 'unknown'}`)
  console.log(`source: ${process.env.LINX_MODELS_ROOT ? 'LINX_MODELS_ROOT' : 'npm package'}`)
  printGitStatusIfExternal(root)
}

function assertReleaseSafe() {
  const deps = readConsumerDependencySpecs()
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(deps.expected)) {
    throw new Error(`Release blocked: @undefineds.co/models must be pinned to an exact npm version, got ${deps.expected}.`)
  }
  if (deps.mismatches.length > 0) {
    throw new Error(`Release blocked: @undefineds.co/models dependency versions differ:\n${deps.mismatches.join('\n')}`)
  }

  const root = requireModelsRoot()
  const pkg = readPackage(root)
  if (pkg.version !== deps.expected) {
    throw new Error(`Release blocked: installed @undefineds.co/models version ${pkg.version ?? 'unknown'} does not match dependency ${deps.expected}. Run yarn install.`)
  }

  const realRoot = realpathSync(root)
  const legacyPath = join(repoRoot, 'packages', 'models')
  if (isInside(realRoot, legacyPath)) {
    throw new Error('Release blocked: @undefineds.co/models resolves to packages/models. LinX must consume the npm package or an explicit external LINX_MODELS_ROOT.')
  }
}

function buildOrVerifyModels() {
  const root = requireModelsRoot()
  if (process.env.LINX_MODELS_ROOT) {
    run('yarn', ['build'], root, { stdio: 'inherit' })
    return
  }
  if (!existsSync(join(root, 'dist', 'index.js'))) {
    throw new Error('Installed @undefineds.co/models does not contain dist/index.js. Run yarn install or set LINX_MODELS_ROOT to a built external checkout.')
  }
  console.log(`@undefineds.co/models already installed: ${readPackage(root).version}`)
}

function cleanExplicitModelsRoot() {
  if (!process.env.LINX_MODELS_ROOT) {
    console.log('No LINX_MODELS_ROOT set; skipping @undefineds.co/models clean.')
    return
  }
  const root = requireModelsRoot()
  rmSync(join(root, 'dist'), { recursive: true, force: true })
}

function resolveModelsRoot() {
  if (process.env.LINX_MODELS_PATH) {
    throw new Error('LINX_MODELS_PATH is no longer supported. Use LINX_MODELS_ROOT for an explicit external models checkout.')
  }

  const candidates = [
    process.env.LINX_MODELS_ROOT,
    npmModelsPath,
  ].filter(Boolean)

  for (const candidate of candidates) {
    const resolved = resolve(candidate)
    if (isModelsPackage(resolved)) {
      return resolved
    }
  }
  return null
}

function requireModelsRoot() {
  const root = resolveModelsRoot()
  if (!root) {
    throw new Error('Cannot find @undefineds.co/models. Run yarn install, or set LINX_MODELS_ROOT to an explicit external checkout.')
  }
  return root
}

function readConsumerDependencySpecs() {
  const manifests = [
    'apps/cli/package.json',
    'apps/web/package.json',
    'packages/stores/package.json',
    'examples/solid-login-example/package.json',
  ]
  const specs = manifests.map((manifest) => {
    const pkg = readPackage(join(repoRoot, manifest, '..'))
    return {
      manifest,
      spec: pkg.dependencies?.['@undefineds.co/models'],
    }
  })
  const expected = specs[0]?.spec
  const mismatches = specs
    .filter((item) => item.spec !== expected)
    .map((item) => `${item.manifest}: ${item.spec ?? '<missing>'}`)
  return {
    expected: expected ?? '<missing>',
    mismatches,
  }
}

function isModelsPackage(path) {
  try {
    return readPackage(path).name === '@undefineds.co/models'
  } catch {
    return false
  }
}

function readPackage(root) {
  return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
}

function printGitStatusIfExternal(root) {
  const realRoot = realpathSync(root)
  const nodeModulesRoot = join(repoRoot, 'node_modules')
  if (isInside(realRoot, nodeModulesRoot) && !lstatSync(root).isSymbolicLink()) {
    return
  }

  const status = run('git', ['status', '--short', '--branch'], root, { allowFailure: true })
  if (status.code === 0 && status.stdout.trim()) {
    console.log(status.stdout.trim())
  }
}

function isInside(path, parent) {
  const rel = relative(resolve(parent), resolve(path))
  return rel === '' || Boolean(rel && !rel.startsWith('..') && !rel.startsWith('/'))
}

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  })

  const code = result.status ?? 1
  if (code !== 0 && !options.allowFailure) {
    const detail = result.stderr?.trim() || result.stdout?.trim()
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`)
  }

  return {
    code,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function printUsage() {
  console.error('Usage:')
  console.error('  yarn models:update')
  console.error('  yarn models:status')
  console.error('  yarn models:assert-release-safe')
  console.error('  yarn build:models')
}
