import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const cliRoot = fileURLToPath(new URL('..', import.meta.url))
const modelsRoot = fileURLToPath(new URL('../../../packages/models', import.meta.url))
const modelsDistRoot = join(modelsRoot, 'dist')
const agentRuntimeRoot = fileURLToPath(new URL('../../../packages/agent-runtime', import.meta.url))
const agentRuntimeDistRoot = join(agentRuntimeRoot, 'dist')
const sourceRoot = join(cliRoot, 'src')
const skillsRoot = fileURLToPath(new URL('../../../skills', import.meta.url))
const wsRoot = fileURLToPath(new URL('../../../node_modules/ws', import.meta.url))
const n3Root = fileURLToPath(new URL('../../../node_modules/n3', import.meta.url))
const mariozechnerRoot = fileURLToPath(new URL('../../../node_modules/@mariozechner', import.meta.url))
const typeboxRoot = fileURLToPath(new URL('../../../node_modules/@sinclair/typebox', import.meta.url))

export async function loadWatchModule(entryRelative = 'lib/watch/index.ts') {
  return buildWatchBundle(entryRelative)
}

async function buildWatchBundle(entryRelative) {
  const root = mkdtempSync(join(tmpdir(), 'linx-watch-test-'))
  const outdir = join(root, 'dist')
  const undefinedsNodeModulesDir = join(outdir, 'node_modules', '@undefineds.co')
  const linxNodeModulesDir = join(outdir, 'node_modules', '@linx')
  const modelsPackageDir = join(undefinedsNodeModulesDir, 'models')
  const agentRuntimePackageDir = join(linxNodeModulesDir, 'agent-runtime')
  const genericNodeModulesDir = join(outdir, 'node_modules')
  const scopedNodeModulesDir = join(outdir, 'node_modules', '@mariozechner')
  const sinclairNodeModulesDir = join(outdir, 'node_modules', '@sinclair')
  const entryPath = join(sourceRoot, entryRelative)
  const compiledEntry = join(outdir, entryRelative.replace(/\.ts$/, '.js'))

  execFileSync('tsc', ['-p', join(agentRuntimeRoot, 'tsconfig.json')], {
    cwd: cliRoot,
    stdio: 'pipe',
  })

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
  cpSync(skillsRoot, join(outdir, 'skills'), {
    recursive: true,
    filter: (src) => !src.includes('/node_modules/') && !src.includes('/.git/'),
  })

  mkdirSync(undefinedsNodeModulesDir, { recursive: true })
  mkdirSync(linxNodeModulesDir, { recursive: true })
  mkdirSync(genericNodeModulesDir, { recursive: true })
  mkdirSync(scopedNodeModulesDir, { recursive: true })
  mkdirSync(sinclairNodeModulesDir, { recursive: true })
  mkdirSync(modelsPackageDir, { recursive: true })
  mkdirSync(agentRuntimePackageDir, { recursive: true })
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
  symlinkSync(agentRuntimeDistRoot, join(agentRuntimePackageDir, 'dist'), 'dir')
  writeFileSync(join(agentRuntimePackageDir, 'package.json'), JSON.stringify({
    name: '@linx/agent-runtime',
    type: 'module',
    exports: {
      '.': './dist/index.js',
      './acp': './dist/acp.js',
      './companion-model': './dist/companion-model.js',
      './turn-controller': './dist/turn-controller.js',
    },
  }, null, 2))
  symlinkSync(wsRoot, join(genericNodeModulesDir, 'ws'), 'dir')
  symlinkSync(n3Root, join(genericNodeModulesDir, 'n3'), 'dir')
  symlinkSync(typeboxRoot, join(sinclairNodeModulesDir, 'typebox'), 'dir')
  symlinkSync(join(mariozechnerRoot, 'pi-ai'), join(scopedNodeModulesDir, 'pi-ai'), 'dir')
  symlinkSync(join(mariozechnerRoot, 'pi-agent-core'), join(scopedNodeModulesDir, 'pi-agent-core'), 'dir')
  symlinkSync(join(mariozechnerRoot, 'pi-coding-agent'), join(scopedNodeModulesDir, 'pi-coding-agent'), 'dir')
  symlinkSync(join(mariozechnerRoot, 'pi-tui'), join(scopedNodeModulesDir, 'pi-tui'), 'dir')
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
