import { spawnSync } from 'node:child_process'
import { existsSync, renameSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  copyMarketplaceProductSkills,
  copyProductSkills,
} from './product-skills.mjs'
import { packSymphonyCodexPlugin } from './pack-symphony-codex-plugin.mjs'

const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
const agentRuntimeTsconfig = fileURLToPath(new URL('../../../packages/agent-runtime/tsconfig.json', import.meta.url))
const storesTsconfig = fileURLToPath(new URL('../../../packages/stores/tsconfig.json', import.meta.url))
const distDir = fileURLToPath(new URL('../dist', import.meta.url))
const skillsSourceDir = fileURLToPath(new URL('../../../skills', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const skillsDistDir = fileURLToPath(new URL('../dist/skills', import.meta.url))
const compileArgs = [
  '-p',
  'tsconfig.json',
  '--outDir',
  'dist',
  '--noEmitOnError',
  'false',
]

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function removeDirRobust(path) {
  if (!existsSync(path)) return

  const tombstone = `${path}.trash-${Date.now()}`
  try {
    renameSync(path, tombstone)
    rmSync(tombstone, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    return
  } catch {
    // Fall through to direct retry. Rename can fail if another process already touched dist.
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
      return
    } catch (error) {
      if (attempt === 4) throw error
      sleep(100)
    }
  }
}

removeDirRobust(distDir)

const compileAgentRuntime = spawnSync('tsc', ['-p', agentRuntimeTsconfig], {
  cwd: workspaceRoot,
  stdio: 'inherit',
})
if ((compileAgentRuntime.status ?? 1) !== 0) {
  process.exit(compileAgentRuntime.status ?? 1)
}

const compileStores = spawnSync('tsc', ['-p', storesTsconfig], {
  cwd: workspaceRoot,
  stdio: 'inherit',
})
if ((compileStores.status ?? 1) !== 0) {
  process.exit(compileStores.status ?? 1)
}

const compile = spawnSync('tsc', compileArgs, {
  cwd: workspaceRoot,
  stdio: 'inherit',
})

if ((compile.status ?? 1) !== 0) {
  process.exit(compile.status ?? 1)
}

if (existsSync(skillsSourceDir)) {
  copyProductSkills(skillsSourceDir, skillsDistDir, { skillNames: ['xpod-cli'] })
}
copyMarketplaceProductSkills(repoRoot, skillsDistDir)

packSymphonyCodexPlugin()
