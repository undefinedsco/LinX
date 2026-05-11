import { existsSync, lstatSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const modelsPath = join(repoRoot, 'packages', 'models')
const action = process.argv[2]

switch (action) {
  case 'update':
    updateSubmodule()
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

function updateSubmodule() {
  const status = run('git', ['submodule', 'status', 'packages/models'], repoRoot, { allowFailure: true })
  if (status.code !== 0 || !status.stdout.trim()) {
    console.log('packages/models is not registered as a git submodule in this checkout.')
    console.log('Using the workspace package at packages/models.')
    return
  }

  run('git', ['submodule', 'update', '--init', '--recursive', 'packages/models'], repoRoot)
}

function printStatus() {
  if (!existsSync(modelsPath)) {
    console.log('packages/models is missing. Run yarn models:update.')
    return
  }

  const kind = detectModelsKind()
  console.log(`packages/models: ${kind}`)

  if (kind === 'symlink') {
    console.log(`target: ${resolve(modelsPath)}`)
    return
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
    throw new Error('Release blocked: packages/models is missing. Run yarn models:update.')
  }

  const kind = detectModelsKind()
  if (kind === 'symlink') {
    throw new Error('Release blocked: packages/models is a symlink. Use the repository workspace/submodule checkout.')
  }

  if (kind === 'submodule') {
    const status = run('git', ['status', '--porcelain'], modelsPath)
    if (status.stdout.trim()) {
      throw new Error('Release blocked: packages/models has uncommitted changes. Commit models first, then update the host submodule pointer.')
    }
  }
}

function detectModelsKind() {
  if (lstatSync(modelsPath).isSymbolicLink()) {
    return 'symlink'
  }

  const topLevel = run('git', ['rev-parse', '--show-toplevel'], modelsPath, { allowFailure: true })
  if (topLevel.code !== 0) {
    return 'directory'
  }

  return resolve(topLevel.stdout.trim()) === resolve(repoRoot) ? 'workspace directory' : 'submodule'
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
