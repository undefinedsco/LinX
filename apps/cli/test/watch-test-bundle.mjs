import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const modelsRoot = fileURLToPath(new URL('../../../packages/models', import.meta.url))
const sourceRoot = join(cliRoot, 'src')
const wsRoot = fileURLToPath(new URL('../../../node_modules/ws', import.meta.url))
const cliNodeModulesRoot = fileURLToPath(new URL('../node_modules', import.meta.url))

export async function loadWatchModule(entryRelative = 'lib/watch/index.ts') {
  return buildWatchBundle(entryRelative)
}

async function buildWatchBundle(entryRelative) {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-test-'))
  const outdir = join(root, 'dist')
  const undefinedsNodeModulesDir = join(outdir, 'node_modules', '@undefineds.co')
  const genericNodeModulesDir = join(outdir, 'node_modules')
  const scopedNodeModulesDir = join(outdir, 'node_modules', '@mariozechner')
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

  mkdirSync(undefinedsNodeModulesDir, { recursive: true })
  mkdirSync(genericNodeModulesDir, { recursive: true })
  mkdirSync(scopedNodeModulesDir, { recursive: true })
  symlinkSync(modelsRoot, join(undefinedsNodeModulesDir, 'models'), 'dir')
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

  return {
    module: await import(pathToFileURL(compiledEntry).href),
    entryPath: compiledEntry,
    cleanup() {
      rmSync(root, { recursive: true, force: true })
    },
  }
}
