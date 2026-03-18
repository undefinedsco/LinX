import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const modelsRoot = fileURLToPath(new URL('../../../packages/models', import.meta.url))
const sourceRoot = join(cliRoot, 'src')

export async function loadWatchModule(entryRelative = 'lib/watch/index.ts') {
  return buildWatchBundle(entryRelative)
}

async function buildWatchBundle(entryRelative) {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-test-'))
  const outdir = join(root, 'dist')
  const nodeModulesDir = join(outdir, 'node_modules', '@linx')
  const entryPath = join(sourceRoot, entryRelative)
  const compiledEntry = join(outdir, entryRelative.replace(/\.ts$/, '.js'))

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
    entryPath,
  ], {
    cwd: cliRoot,
    stdio: 'pipe',
  })

  mkdirSync(nodeModulesDir, { recursive: true })
  symlinkSync(modelsRoot, join(nodeModulesDir, 'models'), 'dir')

  return {
    module: await import(pathToFileURL(compiledEntry).href),
    entryPath: compiledEntry,
    cleanup() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}
