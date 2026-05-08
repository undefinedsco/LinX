import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const modelsRoot = fileURLToPath(new URL('../../../packages/models', import.meta.url))
const modelsDistRoot = join(modelsRoot, 'dist')
const sourceRoot = join(cliRoot, 'src')
const wsRoot = fileURLToPath(new URL('../../../node_modules/ws', import.meta.url))
const n3Root = fileURLToPath(new URL('../../../node_modules/n3', import.meta.url))
const mariozechnerRoot = fileURLToPath(new URL('../../../node_modules/@mariozechner', import.meta.url))

export async function loadWatchModule(entryRelative = 'lib/watch/index.ts') {
  return buildWatchBundle(entryRelative)
}

async function buildWatchBundle(entryRelative) {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-test-'))
  const outdir = join(root, 'dist')
  const undefinedsNodeModulesDir = join(outdir, 'node_modules', '@undefineds.co')
  const modelsPackageDir = join(undefinedsNodeModulesDir, 'models')
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
    'ESNext',
    '--moduleResolution',
    'Bundler',
    '--target',
    'ES2022',
    '--lib',
    'ES2022',
    '--types',
    'node',
    '--skipLibCheck',
    'true',
    '--verbatimModuleSyntax',
    'false',
    entryPath,
  ], {
    cwd: cliRoot,
    stdio: 'pipe',
  })

  mkdirSync(undefinedsNodeModulesDir, { recursive: true })
  mkdirSync(genericNodeModulesDir, { recursive: true })
  mkdirSync(scopedNodeModulesDir, { recursive: true })
  mkdirSync(modelsPackageDir, { recursive: true })
  symlinkSync(modelsDistRoot, join(modelsPackageDir, 'dist'), 'dir')
  writeFileSync(join(modelsPackageDir, 'package.json'), JSON.stringify({
    name: '@undefineds.co/models',
    type: 'module',
    exports: {
      '.': './dist/index.js',
      './client': './dist/client/index.js',
      './discovery': './dist/discovery/index.js',
      './namespaces': './dist/namespaces.js',
      './profile': './dist/profile.js',
      './profile.repository': './dist/profile.repository.js',
      './profile.schema': './dist/profile.schema.js',
      './vocab': './dist/vocab/index.js',
      './vocab/sidecar': './dist/vocab/sidecar.vocab.js',
      './watch': './dist/watch/index.js',
    },
  }, null, 2))
  symlinkSync(wsRoot, join(genericNodeModulesDir, 'ws'), 'dir')
  symlinkSync(n3Root, join(genericNodeModulesDir, 'n3'), 'dir')
  symlinkSync(fileURLToPath(new URL('../../../node_modules/@mariozechner/pi-ai', import.meta.url)), join(scopedNodeModulesDir, 'pi-ai'), 'dir')
  symlinkSync(fileURLToPath(new URL('../../../node_modules/@mariozechner/pi-agent-core', import.meta.url)), join(scopedNodeModulesDir, 'pi-agent-core'), 'dir')
  symlinkSync(fileURLToPath(new URL('../../../node_modules/@mariozechner/pi-coding-agent', import.meta.url)), join(scopedNodeModulesDir, 'pi-coding-agent'), 'dir')
  symlinkSync(fileURLToPath(new URL('../../../node_modules/@mariozechner/pi-tui', import.meta.url)), join(scopedNodeModulesDir, 'pi-tui'), 'dir')
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
