import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const linxClientRoot = fileURLToPath(new URL('../../../packages/client', import.meta.url))
const sharedModelsRoot = dirname(dirname(require.resolve('@undefineds.co/models')))
const sourceRoot = join(cliRoot, 'src')
const wsRoot = fileURLToPath(new URL('../../../node_modules/ws', import.meta.url))
const cliNodeModulesRoot = fileURLToPath(new URL('../node_modules', import.meta.url))
const tscBin = require.resolve('typescript/bin/tsc')

export async function loadWatchModule(entryRelative = 'lib/watch/index.ts') {
  return buildWatchBundle(entryRelative)
}

async function buildWatchBundle(entryRelative) {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-test-'))
  const outdir = join(root, 'dist')
  const linxNodeModulesDir = join(outdir, 'node_modules', '@linx')
  const undefinedsNodeModulesDir = join(outdir, 'node_modules', '@undefineds.co')
  const genericNodeModulesDir = join(outdir, 'node_modules')
  const scopedNodeModulesDir = join(outdir, 'node_modules', '@mariozechner')
  const entryPath = join(sourceRoot, entryRelative)

  execFileSync(process.execPath, [
    tscBin,
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

  mkdirSync(linxNodeModulesDir, { recursive: true })
  mkdirSync(undefinedsNodeModulesDir, { recursive: true })
  mkdirSync(genericNodeModulesDir, { recursive: true })
  mkdirSync(scopedNodeModulesDir, { recursive: true })
  symlinkSync(linxClientRoot, join(linxNodeModulesDir, 'client'), 'dir')
  symlinkSync(sharedModelsRoot, join(undefinedsNodeModulesDir, 'models'), 'dir')
  symlinkSync(wsRoot, join(genericNodeModulesDir, 'ws'), 'dir')
  symlinkSync(join(cliNodeModulesRoot, '@mariozechner', 'pi-ai'), join(scopedNodeModulesDir, 'pi-ai'), 'dir')
  symlinkSync(join(cliNodeModulesRoot, '@mariozechner', 'pi-agent-core'), join(scopedNodeModulesDir, 'pi-agent-core'), 'dir')
  symlinkSync(join(cliNodeModulesRoot, '@mariozechner', 'pi-coding-agent'), join(scopedNodeModulesDir, 'pi-coding-agent'), 'dir')
  symlinkSync(join(cliNodeModulesRoot, '@mariozechner', 'pi-tui'), join(scopedNodeModulesDir, 'pi-tui'), 'dir')
  mkdirSync(join(outdir, 'node_modules', '@inrupt'), { recursive: true })
  symlinkSync(
    fileURLToPath(new URL('../../../node_modules/@inrupt/solid-client-authn-node', import.meta.url)),
    join(outdir, 'node_modules', '@inrupt', 'solid-client-authn-node'),
    'dir',
  )

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
  const normalizedSuffix = entrySuffix.split('\\').join('/')
  const preferredEntry = normalizedSuffix.replace(/^lib\//, '')
  const directCandidates = [
    join(rootDir, preferredEntry),
    join(rootDir, normalizedSuffix),
  ]

  for (const candidate of directCandidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  const stack = [rootDir]
  const suffixCandidates = [preferredEntry, normalizedSuffix, basename(preferredEntry)]

  while (stack.length > 0) {
    const current = stack.pop()
    if (current.split('\\').join('/').includes('/node_modules/')) {
      continue
    }

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
