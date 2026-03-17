import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true })

const result = spawnSync('tsc', [
  '-p',
  'tsconfig.json',
  '--outDir',
  'dist',
  '--noEmitOnError',
  'false',
], {
  cwd: workspaceRoot,
  stdio: 'inherit',
})

process.exit(result.status ?? 1)
