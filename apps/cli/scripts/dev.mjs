import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
const requireFromCli = createRequire(new URL('../package.json', import.meta.url))
const localTscBin = requireFromCli.resolve('typescript/bin/tsc')
const agentRuntimeTsconfig = fileURLToPath(new URL('../../../packages/agent-runtime/tsconfig.json', import.meta.url))
const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const distIndex = fileURLToPath(new URL('../dist/index.js', import.meta.url))
const args = process.argv.slice(2)
const compileArgs = [
  '-p',
  'tsconfig.json',
  '--outDir',
  'dist',
  '--noEmitOnError',
  'false',
]

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function removeDirRobust(path) {
  if (!existsSync(path)) return

  const tombstone = `${path}.trash-${Date.now()}`
  try {
    renameSync(path, tombstone)
    rmSync(tombstone, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    return
  } catch {
    // Fall through to direct retry. Rename can fail if another process already touched dist.
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      return
    } catch (error) {
      if (attempt === 4) throw error
      sleep(100)
    }
  }
}

removeDirRobust(distDir)

const compileAgentRuntime = spawnSync(process.execPath, [localTscBin, '-p', agentRuntimeTsconfig], {
  cwd: workspaceRoot,
  stdio: 'inherit',
})
if ((compileAgentRuntime.status ?? 1) !== 0) {
  process.exit(compileAgentRuntime.status ?? 1)
}

const compile = spawnSync(process.execPath, [localTscBin, ...compileArgs], {
  cwd: workspaceRoot,
  stdio: 'inherit',
})

if ((compile.status ?? 1) !== 0 && !existsSync(distIndex)) {
  process.exit(compile.status ?? 1)
}

if ((compile.status ?? 1) !== 0) {
  process.stderr.write('[linx-cli] TypeScript emitted with errors; continuing with generated dist output.\n')
}

const runArgs = [distIndex, ...args]
const run = spawnSync(process.execPath, runArgs, {
  cwd: workspaceRoot,
  stdio: 'inherit',
})

process.exit(run.status ?? 1)
