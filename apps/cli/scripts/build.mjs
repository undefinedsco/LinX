import { spawnSync } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
const distDir = fileURLToPath(new URL('../dist', import.meta.url))
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

const compile = spawnSync('tsc', compileArgs, {
  cwd: workspaceRoot,
  stdio: 'inherit',
})

process.exit(compile.status ?? 1)
