import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const modelsPath = join(repoRoot, 'packages', 'models')
const defaultExternalModelsPath = resolve(repoRoot, '..', 'models')
const previewPath = join(repoRoot, 'preview')
const action = process.argv[2]

try {
  switch (action) {
    case 'update':
      ensureModelsWorkspace()
      break
    case 'status':
      printStatus()
      break
    case 'assert-release-safe':
      assertReleaseSafe()
      break
    case 'build':
      runModelsScript('build')
      break
    case 'clean':
      cleanModels()
      break
    case 'pack-release':
      packModelsRelease()
      break
    default:
      printUsage()
      process.exit(1)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

function ensureModelsWorkspace() {
  if (existsSync(modelsPath)) {
    printStatus()
    return
  }

  const candidate = resolve(process.env.LINX_MODELS_PATH || defaultExternalModelsPath)
  if (!isModelsPackage(candidate)) {
    console.log('packages/models is missing.')
    console.log('Provide a local models checkout, then rerun with LINX_MODELS_PATH if it is not at packages/models:')
    console.log('  git clone https://github.com/undefinedsco/models.git ../models')
    console.log('  LINX_MODELS_PATH=../models yarn models:update')
    return
  }

  mkdirSync(dirname(modelsPath), { recursive: true })
  symlinkSync(candidate, modelsPath, 'dir')
  console.log(`Linked packages/models -> ${candidate}`)
}

function printStatus() {
  const authoritative = resolveAuthoritativeModelsPath({ allowLegacy: true })
  if (authoritative) {
    console.log(`authoritative models: ${authoritative}`)
    printGitStatus(authoritative)
  } else {
    console.log('authoritative models: missing. Provide packages/models or set LINX_MODELS_PATH.')
  }

  if (!existsSync(modelsPath)) {
    console.log('packages/models: missing')
    return
  }

  const kind = detectModelsKind(modelsPath)
  console.log(`packages/models: ${kind}`)

  if (kind === 'linked external checkout') {
    console.log(`target: ${readlinkSync(modelsPath)}`)
  }

  if (kind === 'legacy submodule') {
    console.log('mode: legacy migration path; do not use LinX submodule pointers as the shared models upgrade mechanism.')
  }

  if (kind === 'workspace directory') {
    console.log('mode: tracked by the host repository')
    return
  }

  if (resolve(authoritative ?? '') !== resolve(modelsPath)) {
    printGitStatus(modelsPath)
  }
}

function assertReleaseSafe() {
  const root = resolveAuthoritativeModelsPath({ allowLegacy: true })
  if (!root) {
    throw new Error('Release blocked: no @undefineds.co/models checkout found. Provide packages/models or set LINX_MODELS_PATH.')
  }

  const kind = root === modelsPath ? detectModelsKind(modelsPath) : 'independent checkout'
  if (kind === 'legacy submodule') {
    console.warn('Warning: using packages/models legacy submodule checkout. Ensure it is committed and published before publishing LinX.')
  }

  if (kind !== 'workspace directory' && kind !== 'directory') {
    const status = run('git', ['status', '--porcelain'], root)
    if (status.stdout.trim()) {
      throw new Error(`Release blocked: ${root} has uncommitted changes. Commit/publish models in the independent models repository first.`)
    }
  }
}

function runModelsScript(scriptName) {
  const root = requireAuthoritativeModelsPath()
  run('yarn', [scriptName], root, { stdio: 'inherit' })
}

function cleanModels() {
  const root = requireAuthoritativeModelsPath()
  rmSync(join(root, 'dist'), { recursive: true, force: true })
}

function packModelsRelease() {
  const root = requireAuthoritativeModelsPath()
  run('yarn', ['build'], root, { stdio: 'inherit' })
  run('yarn', ['pack:release'], root, { stdio: 'inherit' })

  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const tarball = join(root, 'preview', `undefineds-co-models-${pkg.version}.tgz`)
  if (!existsSync(tarball)) {
    throw new Error(`Models pack:release did not produce expected tarball: ${tarball}`)
  }

  mkdirSync(previewPath, { recursive: true })
  cpSync(tarball, join(previewPath, `undefineds-co-models-${pkg.version}.tgz`))
}

function requireAuthoritativeModelsPath() {
  const root = resolveAuthoritativeModelsPath({ allowLegacy: true })
  if (!root) {
    throw new Error('Cannot find @undefineds.co/models. Provide packages/models or set LINX_MODELS_PATH.')
  }
  return root
}

function resolveAuthoritativeModelsPath({ allowLegacy }) {
  const candidates = [
    process.env.LINX_MODELS_ROOT,
    process.env.LINX_MODELS_PATH,
    allowLegacy ? modelsPath : undefined,
    defaultExternalModelsPath,
  ].filter(Boolean)

  for (const candidate of candidates) {
    const resolved = resolve(candidate)
    if (isModelsPackage(resolved)) {
      return resolved
    }
  }
  return null
}

function detectModelsKind(path) {
  if (lstatSync(path).isSymbolicLink()) {
    return 'linked external checkout'
  }

  const topLevel = run('git', ['rev-parse', '--show-toplevel'], path, { allowFailure: true })
  if (topLevel.code !== 0) {
    return 'directory'
  }

  if (resolve(topLevel.stdout.trim()) === resolve(repoRoot)) {
    return 'workspace directory'
  }

  return isRegisteredSubmodule() ? 'legacy submodule' : 'external checkout'
}

function isRegisteredSubmodule() {
  const status = run('git', ['submodule', 'status', 'packages/models'], repoRoot, { allowFailure: true })
  return status.code === 0 && status.stdout.trim().length > 0
}

function isModelsPackage(path) {
  try {
    const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))
    return pkg.name === '@undefineds.co/models'
  } catch {
    return false
  }
}

function printGitStatus(path) {
  const status = run('git', ['status', '--short', '--branch'], path, { allowFailure: true })
  if (status.code === 0 && status.stdout.trim()) {
    console.log(status.stdout.trim())
  }
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
  console.error('  yarn pack:models:release')
}
