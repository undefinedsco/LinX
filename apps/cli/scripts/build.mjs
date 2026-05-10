import { spawnSync } from 'node:child_process'
import { existsSync, rmSync, symlinkSync } from 'node:fs'
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

if ((result.status ?? 1) !== 0) {
  process.exit(result.status ?? 1)
}

const emittedRoot = fileURLToPath(new URL('../dist/apps/cli/src/', import.meta.url))

if (existsSync(emittedRoot)) {
  for (const [targetName, sourceName] of [
    ['index.js', 'apps/cli/src/index.js'],
    ['index.js.map', 'apps/cli/src/index.js.map'],
    ['watch-cli.js', 'apps/cli/src/watch-cli.js'],
    ['watch-cli.js.map', 'apps/cli/src/watch-cli.js.map'],
    ['lib', 'apps/cli/src/lib'],
  ]) {
    const targetPath = fileURLToPath(new URL(`../dist/${targetName}`, import.meta.url))
    rmSync(targetPath, { recursive: true, force: true })
    symlinkSync(sourceName, targetPath)
  }
}

process.exit(0)
