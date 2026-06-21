import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = new URL('../../..', import.meta.url).pathname
const libRoot = join(repoRoot, 'apps/cli/src/lib')
const adapterSegment = `${join('pi-adapter')}/`

test('non-adapter shell/core modules do not import from pi-adapter internals', () => {
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (importsPiAdapterInternal(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})
function listSourceFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) {
      files.push(...listSourceFiles(path))
      continue
    }
    if (/\.[cm]?tsx?$/u.test(entry)) {
      files.push(path)
    }
  }
  return files
}

function importsPiAdapterInternal(source) {
  return /\bfrom\s+['"][^'"]*pi-adapter\/[^'"]*['"]/u.test(source)
    || /\bimport\s*\(\s*['"][^'"]*pi-adapter\/[^'"]*['"]\s*\)/u.test(source)
}


test('interactive submit handling is centralized in the shell submit router', () => {
  const allowed = new Set([
    'linx-interactive-submit-router.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/setupEditorSubmitHandler\s*=/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('interactive stop handling is centralized in the shell stop router', () => {
  const allowed = new Set([
    'linx-interactive-stop-router.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/\.stop\s*=/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('interactive mode state is centralized in the shell state module', () => {
  const allowed = new Set([
    'linx-interactive-shell-state.ts',
  ])
  const violations = []
  const directStatePattern = /__linx(?:SymphonyModeEnabled|SymphonyModeGeneration|OnSymphonyControlChange|GoalModeEnabled|GoalModeSupervisorLastAt|OnAutoControlChange)\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directStatePattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('projected command handlers are centralized in the shell state module', () => {
  const allowed = new Set([
    'linx-interactive-shell-state.ts',
  ])
  const violations = []
  const directProjectedHandlerPattern = /__linx(?:HandleProjectedCommand|HandleProjectedGlobalCommand|HandleProjectedBackendCommand|HandleAiConnectCommand)\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directProjectedHandlerPattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('Symphony interactive runtime config is centralized in the shell state module', () => {
  const allowed = new Set([
    'linx-interactive-shell-state.ts',
  ])
  const violations = []
  const directSymphonyConfigPattern = /__linx(?:SymphonyPodProjectionRuntime|SymphonyWorkerBackend|SymphonyWorkerCredentialSource|AgentRuntime|AgentRuntimeConfig|SymphonyWorkerModel|SymphonyWorkerSupervisorIntervalMs|SymphonyStatusPodTimeoutMs|RunSymphony|ListSymphonyIssues|ListSymphonySessions|SymphonyDispatches|SymphonyDispatchControllers)\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directSymphonyConfigPattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})
