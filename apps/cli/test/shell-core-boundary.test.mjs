import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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
    if (/\.(?:[cm]?tsx?|mjs)$/u.test(entry)) {
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

test('auto interactive runtime state is centralized in the shell state module', () => {
  const allowed = new Set([
    'linx-interactive-shell-state.ts',
  ])
  const violations = []
  const directAutoStatePattern = /__(?:autoEnabled|linxAutoInputController|linxGoalModeSupervisorIntervalMs)\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directAutoStatePattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('Pod mirror runtime handle is centralized in the Pod mirror host module', () => {
  const allowed = new Set([
    'linx-pod-mirror-runtime-host.ts',
  ])
  const violations = []
  const directPodMirrorHandlePattern = /__linxPodMirror\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directPodMirrorHandlePattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('runtime host hooks do not use runtime hidden fields', () => {
  const violations = []
  const directRuntimeHostHookPattern = /__linx(?:BeforeSessionInvalidate|RebindSession)\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directRuntimeHostHookPattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('credential dependency injection does not use interactive hidden fields', () => {
  const violations = []
  const directCredentialInjectionPattern = /__linx(?:PersistSolidClientCredentialsLogin|PersistSolidSecretLogin|ConnectAiProviderCredential)\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directCredentialInjectionPattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('interactive lifecycle completion state is kept out of interactive hidden fields', () => {
  const violations = []
  const directLifecycleStatePattern = /__linxInteractiveInitCompleted\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directLifecycleStatePattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('session original methods are kept behind shell-owned accessors', () => {
  const violations = []
  const directSessionOriginalMethodPattern = /__linx(?:PromptWithoutCommandRouting|SendUserMessageWithoutCommandRouting)\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directSessionOriginalMethodPattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('session command router install state is kept behind the shell session host', () => {
  const allowed = new Set([
    'linx-session-command-routing-host.ts',
  ])
  const violations = []
  const directSessionInstallStatePattern = /__linxSessionCommandRouterInstalled\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directSessionInstallStatePattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('runtime provider OAuth patch state is kept out of registry hidden fields', () => {
  const violations = []
  const directRegistryPatchPattern = /__linxCloudOAuthDetectionPatched\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directRegistryPatchPattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('interactive command routing patch state is kept behind the shell command routing host', () => {
  const allowed = new Set([
    'linx-interactive-command-routing-host.ts',
  ])
  const violations = []
  const directInteractiveCommandRoutingPatchPattern = /__linx(?:GlobalCommandHandlerInstalled|InputCommandRouterInstalled|FinalSubmitCommandRouterWrapped|FinalSubmitSetCustomEditorComponentPatched|FinalSubmitCommandRouterInstalled|SessionCommandRouterAfterRebindInstalled)\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directInteractiveCommandRoutingPatchPattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('auto editor indicator patch state is kept behind the shell rendering host', () => {
  const allowed = new Set([
    'linx-auto-editor-indicator-host.ts',
  ])
  const violations = []
  const directAutoIndicatorPatchPattern = /__linx(?:AutoEditorIndicatorInstalled|AutoEditorIndicatorRenderInstalled)\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directAutoIndicatorPatchPattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('interrupt control patch state is kept behind the shell interrupt host', () => {
  const allowed = new Set([
    'linx-interrupt-control-host.ts',
  ])
  const violations = []
  const directInterruptPatchPattern = /__linx(?:EscapeInterruptInstalled|EscapeInterruptWrapper|ClearInterruptInstalled)\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directInterruptPatchPattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('remaining interactive install sentinels stay out of hidden fields', () => {
  const violations = []
  const directRemainingInstallSentinelPattern = /__linx(?:CommandAutocompleteInstalled|SymphonyAutocompleteInstalled|PodBackedExtensionUiInstalled|InteractivePostInitHooksInstalled|SymphonyCommandInstalled|RestoredAutoStartupInstalled)\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directRemainingInstallSentinelPattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})



test('pi adapter bridge entries are not cross-shell aggregate re-export barrels', () => {
  const allowedPureReexportEntries = new Set([
    // Package adapter entry point: intentionally re-exports the public Pi bridge surface.
    'index.ts',
  ])
  const violations = []
  const adapterRoot = join(libRoot, 'pi-adapter')
  for (const file of listSourceFiles(adapterRoot)) {
    const relativePath = relative(adapterRoot, file)
    if (allowedPureReexportEntries.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (isPureReexportModule(source) && /from\s+['"]\.\.\//u.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

function isPureReexportModule(source) {
  const withoutReexports = source
    .replace(/export\s+(?:type\s+)?\{[\s\S]*?\}\s+from\s+['"][^'"]+['"];?/gu, '')
    .replace(/export\s+\*\s+from\s+['"][^'"]+['"];?/gu, '')
    .trim()
  return withoutReexports.length === 0
}

test('pi adapter compatibility wrappers are not kept only for tests', () => {
  const allowedBridgeEntries = new Set([
    // Runtime bridge entry points are imported by the package adapter factory or loaded by Pi/package resources.
    'index.ts',
    'runtime.ts',
    'stream.ts',
  ])
  const violations = []
  const adapterRoot = join(libRoot, 'pi-adapter')
  const sourceFiles = listSourceFiles(libRoot)
  const adapterFiles = listSourceFiles(adapterRoot)
  const runtimeFiles = sourceFiles.filter((file) => !relative(libRoot, file).startsWith(adapterSegment))
  const adapterRelativeFiles = new Set(adapterFiles.map((file) => relative(adapterRoot, file)))
  const staleAllowedEntries = [...allowedBridgeEntries].filter((entry) => !adapterRelativeFiles.has(entry))
  assert.deepEqual(staleAllowedEntries, [])

  for (const file of adapterFiles) {
    const relativePath = relative(adapterRoot, file)
    if (relativePath === 'index.ts' || allowedBridgeEntries.has(relativePath)) {
      continue
    }

    const moduleName = relativePath.replace(/\.ts$/u, '')
    const importPattern = new RegExp(`pi-adapter/${escapeRegExp(moduleName)}(?:\\.js|\\.ts)?['\"]`, 'u')
    const hasRuntimeConsumer = runtimeFiles.some((candidate) => importPattern.test(readFileSync(candidate, 'utf8')))

    if (!hasRuntimeConsumer) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}




test('pi adapter public surface uses LinX names instead of deprecated Pi aliases', () => {
  const violations = []
  const adapterRoot = join(libRoot, 'pi-adapter')
  const forbiddenAliasPattern = /\bexport\s+(?:const|type|interface|function)\s+(?:create)?Pi[A-Z][A-Za-z0-9_]*\b/u

  for (const file of listSourceFiles(adapterRoot)) {
    const relativePath = relative(adapterRoot, file)
    const source = readFileSync(file, 'utf8')
    if (forbiddenAliasPattern.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations.sort(), [])
})

test('pi runtime adapter does not re-export shell or core helper modules', () => {
  const runtimeSource = readFileSync(join(libRoot, 'pi-adapter/runtime.ts'), 'utf8')
  const forbiddenReexports = [
    /from\s+['"]\.\.\/linx-startup-login-policy\.js['"]/u,
    /from\s+['"]\.\.\/linx-runtime-coding-tools\.js['"]/u,
  ]

  assert.equal(
    forbiddenReexports.some((pattern) => pattern.test(runtimeSource)),
    false,
    'Pi runtime adapter should expose only the runtime bridge surface; import shell/core helpers from their owning modules',
  )
})

test('native backend command router mapping is kept outside the Pi runtime adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/runtime.ts'), 'utf8')
  const forbidden = [
    'const backendCommandRouter',
    'proxy.executeCommand',
    'proxy.setCwd',
    'proxy.setSessionControl',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('native backend stream mapping is kept outside the Pi runtime adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/runtime.ts'), 'utf8')
  const forbidden = [
    'sendTurn(input) {',
    'return proxy.sendTurn(input)',
    'return proxy.subscribe(listener)',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('completion result to Pi stream event mapping is kept outside the Pi adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/stream.ts'), 'utf8')
  const forbidden = [
    'function createBaseMessage',
    'function resolveModelId',
    'function emitCompletionResult',
    'function parseToolArguments',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('backend event source queueing is kept outside the Pi adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/stream.ts'), 'utf8')
  const forbidden = [
    'function* createBackendEventSource',
    'const queue: AutoModeNormalizedEvent[]',
    'backend.subscribe',
    'backend.sendTurn',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('normalized backend event to Pi text stream mapping is kept outside the Pi adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/stream.ts'), 'utf8')
  const forbidden = [
    "event.type === 'assistant.delta'",
    "event.type === 'assistant.done'",
    "type: 'text_start'",
    "type: 'text_delta'",
    "type: 'text_end'",
    "type: 'done'",
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('Pi stream error event mapping is kept outside the Pi adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/stream.ts'), 'utf8')
  const forbidden = [
    'formatLinxStreamErrorMessage',
    'isLinxStreamAbortError',
    "type: 'error'",
    'errorMessage.stopReason',
    'errorMessage.errorMessage',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('stream abort guard is kept outside the Pi adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/stream.ts'), 'utf8')
  const forbidden = [
    'function throwIfAborted',
    'function createAbortError',
    "'AbortError'",
    'Request was aborted.',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('repository scripts do not import shell/core modules through stale pi-adapter paths', () => {
  const stalePatterns = [
    /dist\/lib\/pi-adapter\/pod-mirror(?:\.js)?/u,
    /dist\/lib\/pi-adapter\/pod-mirror-mapping(?:\.js)?/u,
    /dist\/lib\/pi-adapter\/session(?:\.js)?/u,
    /dist\/lib\/pi-adapter\/pod-native(?:\.js)?/u,
  ]
  const violations = []
  for (const root of [join(repoRoot, 'scripts'), join(repoRoot, 'docs')]) {
    for (const file of listTextFiles(root)) {
      const source = readFileSync(file, 'utf8')
      if (stalePatterns.some((pattern) => pattern.test(source))) {
        violations.push(relative(repoRoot, file))
      }
    }
  }

  assert.deepEqual(violations.sort(), [])
})

function listTextFiles(root) {
  if (!existsSync(root)) {
    return []
  }
  const files = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const next = join(root, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') {
        continue
      }
      files.push(...listTextFiles(next))
      continue
    }
    if (entry.isFile() && /\.(?:md|mjs|js|ts)$/u.test(entry.name)) {
      files.push(next)
    }
  }
  return files
}
