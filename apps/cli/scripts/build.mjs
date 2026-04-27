import { spawnSync } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const require = createRequire(import.meta.url)
const tscBin = require.resolve('typescript/bin/tsc')
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

process.exit(compile.status ?? 1)
