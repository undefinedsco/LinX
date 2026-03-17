import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
const distIndex = fileURLToPath(new URL('../dist/index.js', import.meta.url))
const distWatchCli = fileURLToPath(new URL('../dist/watch-cli.js', import.meta.url))
const args = process.argv.slice(2)
const watchMode = args[0] === 'watch'
const targetEntry = watchMode ? distWatchCli : distIndex
const compileArgs = watchMode
  ? [
      '--outDir',
      'dist',
      '--rootDir',
      'src',
      '--module',
      'nodenext',
      '--moduleResolution',
      'nodenext',
      '--target',
      'ES2022',
      '--lib',
      'ES2022',
      '--types',
      'node',
      '--skipLibCheck',
      'true',
      '--noEmitOnError',
      'false',
      'src/watch-cli.ts',
    ]
  : [
      '-p',
      'tsconfig.json',
      '--outDir',
      'dist',
      '--noEmitOnError',
      'false',
    ]

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true })

const compile = spawnSync('tsc', compileArgs, {
  cwd: workspaceRoot,
  stdio: 'inherit',
})

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
