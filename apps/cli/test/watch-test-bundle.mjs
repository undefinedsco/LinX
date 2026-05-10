import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const linxClientRoot = fileURLToPath(new URL('../../../packages/client', import.meta.url))
const sharedModelsRoot = dirname(dirname(require.resolve('@undefineds.co/models')))
const sourceRoot = join(cliRoot, 'src')

export async function loadWatchModule(entryRelative = 'lib/watch/index.ts') {
  return buildWatchBundle(entryRelative)
}

async function buildWatchBundle(entryRelative) {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-test-'))
  const outdir = join(root, 'dist')
  const nodeModulesDir = join(outdir, 'node_modules', '@linx')
  const sharedNodeModulesDir = join(outdir, 'node_modules', '@undefineds.co')
  const entryPath = join(sourceRoot, entryRelative)

  execFileSync('tsc', [
    '--outDir',
    outdir,
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
  mkdirSync(sharedNodeModulesDir, { recursive: true })
  symlinkSync(linxClientRoot, join(nodeModulesDir, 'client'), 'dir')
  symlinkSync(sharedModelsRoot, join(sharedNodeModulesDir, 'models'), 'dir')

  const compiledEntry = findCompiledEntry(outdir, entryRelative.replace(/\.ts$/, '.js'))

  return {
    module: await import(pathToFileURL(compiledEntry).href),
    entryPath: compiledEntry,
    cleanup() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}

function findCompiledEntry(rootDir, entrySuffix) {
  const stack = [rootDir]
  const normalizedSuffix = entrySuffix.split('\\').join('/')
  const suffixCandidates = []
  const segments = normalizedSuffix.split('/').filter(Boolean)

  for (let index = 0; index < segments.length; index += 1) {
    suffixCandidates.push(segments.slice(index).join('/'))
  }

  while (stack.length > 0) {
    const current = stack.pop()
    for (const name of readdirSync(current)) {
      const fullPath = join(current, name)
      if (statSync(fullPath).isDirectory()) {
        stack.push(fullPath)
        continue
      }

      const normalizedPath = fullPath.split('\\').join('/')
      if (suffixCandidates.some((candidate) => normalizedPath.endsWith(candidate))) {
        return fullPath
      }
    }
  }

  throw new Error(`Unable to locate compiled entry for ${entrySuffix}`)
}
