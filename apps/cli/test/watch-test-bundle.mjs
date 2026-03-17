import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const modelsRoot = fileURLToPath(new URL('../../../packages/models', import.meta.url))
const sourceRoot = join(cliRoot, 'src')
const watchEntry = join(sourceRoot, 'lib/watch/index.ts')

export async function loadWatchModule() {
  return buildWatchBundle()
}

async function buildWatchBundle() {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-test-'))
  const outdir = join(root, 'dist')
  const nodeModulesDir = join(outdir, 'node_modules', '@linx')

  execFileSync('tsc', [
    '--outDir',
    outdir,
    '--rootDir',
    sourceRoot,
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
    watchEntry,
  ], {
    cwd: cliRoot,
    stdio: 'pipe',
  })

  mkdirSync(nodeModulesDir, { recursive: true })
  symlinkSync(modelsRoot, join(nodeModulesDir, 'models'), 'dir')

  return {
    module: await import(pathToFileURL(join(outdir, 'lib/watch/index.js')).href),
    entryPath: join(outdir, 'lib/watch/index.js'),
    cleanup() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}
