import { spawnSync } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const distIndex = fileURLToPath(new URL('../dist/index.js', import.meta.url))
const distWatchCli = fileURLToPath(new URL('../dist/watch-cli.js', import.meta.url))
const require = createRequire(import.meta.url)
const tscBin = require.resolve('typescript/bin/tsc')
const args = process.argv.slice(2)
const watchMode = args[0] === 'watch'
const targetEntry = watchMode ? distWatchCli : distIndex
const compileArgs = [
  tscBin,
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

const compile = spawnSync(process.execPath, compileArgs, {
  cwd: workspaceRoot,
  stdio: 'inherit',
})

if (compile.error) {
  process.stderr.write(`[linx-cli] Failed to run TypeScript compiler: ${compile.error.message}\n`)
}

if ((compile.status ?? 1) !== 0 && !existsSync(targetEntry)) {
  process.exit(compile.status ?? 1)
}

if ((compile.status ?? 1) !== 0) {
  process.stderr.write('[linx-cli] TypeScript emitted with errors; continuing with generated dist output.\n')
}

const runArgs = watchMode ? [targetEntry, ...args.slice(1)] : [targetEntry, ...args]
const run = spawnSync(process.execPath, runArgs, {
  cwd: workspaceRoot,
  stdio: 'inherit',
})

process.exit(run.status ?? 1)
