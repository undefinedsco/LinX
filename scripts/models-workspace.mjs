import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, symlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const modelsPath = join(repoRoot, 'packages', 'models')
const defaultExternalModelsPath = resolve(repoRoot, '..', 'models')
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
    console.log('Clone the independent models repository, then rerun with LINX_MODELS_PATH if it is not at ../models:')
    console.log('  git clone https://github.com/undefinedsco/models.git ../models')
    console.log('  LINX_MODELS_PATH=../models yarn models:update')
    return
  }

  mkdirSync(dirname(modelsPath), { recursive: true })
  symlinkSync(candidate, modelsPath, 'dir')
  console.log(`Linked packages/models -> ${candidate}`)
}

function printStatus() {
  if (!existsSync(modelsPath)) {
    console.log('packages/models is missing. Run yarn models:update after cloning the independent models repository.')
    return
  }

  const kind = detectModelsKind()
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

  const status = run('git', ['status', '--short', '--branch'], modelsPath, { allowFailure: true })
  if (status.code === 0 && status.stdout.trim()) {
    console.log(status.stdout.trim())
  }
}

function assertReleaseSafe() {
  if (!existsSync(modelsPath)) {
    throw new Error('Release blocked: packages/models is missing. Clone/link the independent models repository or consume a published models package.')
  }

  if (!isModelsPackage(modelsPath)) {
    throw new Error('Release blocked: packages/models is not @undefineds.co/models.')
  }

  const kind = detectModelsKind()
  if (kind === 'legacy submodule') {
    console.warn('Warning: packages/models is a legacy submodule checkout. Prefer an external models checkout or published package version.')
  }

  if (kind !== 'workspace directory' && kind !== 'directory') {
    const status = run('git', ['status', '--porcelain'], modelsPath)
    if (status.stdout.trim()) {
      throw new Error('Release blocked: packages/models has uncommitted changes. Commit/publish models in the independent models repository first.')
    }
  }
}

function detectModelsKind() {
  if (lstatSync(modelsPath).isSymbolicLink()) {
    return 'linked external checkout'
  }

  const topLevel = run('git', ['rev-parse', '--show-toplevel'], modelsPath, { allowFailure: true })
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

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  const code = result.status ?? 1
  if (code !== 0 && !options.allowFailure) {
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new Error(`${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`)
  }

  return {
    code,
    stdout: result.stdout,
    stderr: result.stderr,
  }
}

function printUsage() {
  console.error('Usage:')
  console.error('  yarn models:update')
  console.error('  yarn models:status')
  console.error('  yarn models:assert-release-safe')
}
