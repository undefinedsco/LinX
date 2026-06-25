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



test('interactive bootstrap delegates command surface installation', () => {
  const bootstrapSource = readFileSync(join(libRoot, 'linx-interactive-bootstrap.ts'), 'utf8')

  assert.match(
    bootstrapSource,
    /from ['"]\.\/linx-interactive-command-surface\.js['"]/,
    'interactive bootstrap should import one command-surface composition module',
  )
  const forbiddenDirectCommandInstallers = [
    'installLinxShellCommands',
    'installSymphonyCommand',
    'installBackendCommandRouter',
    'installLinxSessionCommandRouter',
    'installLinxSessionCommandRouterAfterRebind',
    'setSessionControl',
  ]
  const violations = forbiddenDirectCommandInstallers.filter((name) => bootstrapSource.includes(name))

  assert.deepEqual(violations, [])
})

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

test('interactive run handling is centralized in the shell run router', () => {
  const allowed = new Set([
    'linx-interactive-run-router.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/interactive\.run\s*=/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('interactive update version methods are centralized in the shell update router', () => {
  const allowed = new Set([
    'linx-interactive-update-router.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/interactive\.(?:checkForNewVersion|showNewVersionNotification)\s*=/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('interactive login UI methods are centralized in the shell login UI router', () => {
  const allowed = new Set([
    'linx-interactive-login-ui-router.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/interactive\.(?:showOAuthSelector|showLoginDialog)\s*=/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})


test('feature modules display interactive errors through the shell error seam', () => {
  const allowed = new Set([
    'linx-interactive-error-display.ts',
    'linx-interactive-event-router.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/(?:interactive|target)\?*\.showError\b/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})



test('interactive event and error methods are centralized in the shell event router', () => {
  const allowed = new Set([
    'linx-interactive-event-router.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/interactive\.(?:handleEvent|showError)\s*=(?!=)/.test(source)) {
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

test('interactive runtime Pod session mutation is centralized in the runtime host', () => {
  const allowed = new Set([
    'linx-interactive-runtime-host.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/interactive\.runtime\.podSession\s*=/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})


test('session-control runtime state does not use interactive hidden fields', () => {
  const violations = []
  const directSessionControlStatePattern = /__sessionControl(?:Manager|RuntimeEventBridgeInstalled|RuntimeEventBridgeUnsubscribe)\b/

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (directSessionControlStatePattern.test(source)) {
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


test('workspace startup notice does not patch interactive init directly', () => {
  const source = readFileSync(join(libRoot, 'linx-workspace-command.ts'), 'utf8')

  assert.doesNotMatch(source, /interactive\.init\s*=/)
})

test('restored auto startup does not patch interactive init directly', () => {
  const source = readFileSync(join(libRoot, 'linx-restored-auto-startup.ts'), 'utf8')

  assert.doesNotMatch(source, /interactive\.init\s*=/)
})

test('resume output does not patch interactive init directly', () => {
  const source = readFileSync(join(libRoot, 'linx-resume-output.ts'), 'utf8')

  assert.doesNotMatch(source, /interactive\.init\s*=/)
})

test('welcome header does not patch interactive init directly', () => {
  const source = readFileSync(join(libRoot, 'linx-welcome-header.ts'), 'utf8')

  assert.doesNotMatch(source, /interactive\.init\s*=/)
})

test('update notification does not patch interactive init directly', () => {
  const source = readFileSync(join(libRoot, 'linx-update-notification.ts'), 'utf8')

  assert.doesNotMatch(source, /interactive\.init\s*=/)
})

test('update notification keeps interactive update state behind the shell update state seam', () => {
  const source = readFileSync(join(libRoot, 'linx-update-notification.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-update-state-host\.js['"]/)
  assert.match(source, /\bgetLinxInteractiveUpdateState\b/)
  assert.doesNotMatch(source, /Symbol\.for\(['"]linx\.tui\.(?:update|deferredUpdate|suppressUpstreamPiUpdate)/)
  assert.doesNotMatch(source, /(?:interactive|target|runInteractive)\s*\[\s*LINX_(?:UPDATE|DEFERRED_UPDATE|SUPPRESS_UPSTREAM_PI_UPDATE)/)
})

test('login flow does not patch interactive init directly', () => {
  const source = readFileSync(join(libRoot, 'linx-login-flow.ts'), 'utf8')

  assert.doesNotMatch(source, /interactive\.init\s*=/)
})

test('login flow keeps interactive auth state behind the shell auth state seam', () => {
  const source = readFileSync(join(libRoot, 'linx-login-flow.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-auth-state-host\.js['"]/)
  assert.match(source, /\bgetLinxInteractiveAuthState\b/)
  assert.doesNotMatch(source, /Symbol\.for\(['"]linx\.tui\.auth/)
  assert.doesNotMatch(source, /(?:interactive|target)\s*\[\s*LINX_AUTH_/)
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


test('session command routing patches live in a dedicated shell session module', () => {
  const commandRoutingSource = readFileSync(join(libRoot, 'linx-interactive-command-routing.ts'), 'utf8')

  assert.match(
    commandRoutingSource,
    /from ['"]\.\/linx-session-command-routing\.js['"]/,
    'interactive command routing should import session command routing from its owning module',
  )
  const forbiddenSessionPatchSnippets = [
    'session.prompt =',
    'session.sendUserMessage =',
    'interactive.rebindCurrentSession =',
    'maybeHandleLinxSessionCommand',
  ]
  const violations = forbiddenSessionPatchSnippets.filter((snippet) => commandRoutingSource.includes(snippet))

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


test('input and final-submit command routing patches live in a dedicated input module', () => {
  const commandRoutingSource = readFileSync(join(libRoot, 'linx-interactive-command-routing.ts'), 'utf8')

  assert.match(
    commandRoutingSource,
    /from ['"]\.\/linx-input-command-routing\.js['"]/,
    'interactive command routing should import input/final-submit routing from its owning module',
  )
  const forbiddenInputPatchSnippets = [
    'interactive.getUserInput =',
    'editor.onSubmit =',
    'interactive.setCustomEditorComponent =',
    'patchedLinxGetUserInput',
    'patchedLinxFinalSubmitSetCustomEditorComponent',
  ]
  const violations = forbiddenInputPatchSnippets.filter((snippet) => commandRoutingSource.includes(snippet))

  assert.deepEqual(violations, [])
})


test('feature credential dialogs delegate editor container swaps to the shell editor component seam', () => {
  const featureFiles = [
    'linx-login-flow.ts',
    'linx-ai-connect-command.ts',
  ]

  for (const target of featureFiles) {
    const source = readFileSync(join(libRoot, target), 'utf8')
    assert.match(source, /from ['"]\.\/linx-editor-component-router\.js['"]/, target)
    assert.doesNotMatch(source, /editorContainer(?:\?\.)?\.clear\s*\(/, target)
    assert.doesNotMatch(source, /editorContainer(?:\?\.)?\.addChild\s*\(/, target)
  }
})

test('feature credential dialogs construct Pi login dialogs through the shell editor component seam', () => {
  const featureFiles = [
    'linx-login-flow.ts',
    'linx-ai-connect-command.ts',
  ]

  for (const target of featureFiles) {
    const source = readFileSync(join(libRoot, target), 'utf8')
    assert.match(source, /from ['"]\.\/linx-editor-component-router\.js['"]/, target)
    assert.match(source, /\bcreateLinxLoginDialogComponent\b/, target)
    assert.doesNotMatch(source, /new\s+LoginDialogComponent\s*\(/, target)
    assert.doesNotMatch(source, /interactive(?:\?\.)?\.ui\b/, target)
  }
})

test('external URL opening delegates interactive openExternal through the shell host', () => {
  const source = readFileSync(join(libRoot, 'linx-external-url.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-external-open-host\.js['"]/, 'external URL helper should import the shell external-open host')
  assert.match(source, /\bopenLinxInteractiveExternalUrl\b/)
  assert.doesNotMatch(source, /interactive(?:\?\.)?\.openExternal\b/)
})

test('feature fallback notices append chat text through the shell rendering seam', () => {
  const featureFiles = [
    'linx-login-flow.ts',
    'linx-update-notification.ts',
  ]

  for (const target of featureFiles) {
    const source = readFileSync(join(libRoot, target), 'utf8')
    assert.match(source, /from ['"]\.\/linx-interactive-chat-text-host\.js['"]/, target)
    assert.doesNotMatch(source, /chatContainer(?:\?\.)?\.addChild\s*\(/, target)
  }
})

test('login flow editor text mutations go through the shell editor text seam', () => {
  const source = readFileSync(join(libRoot, 'linx-login-flow.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-editor-text-host\.js['"]/)
  assert.doesNotMatch(source, /\.editor(?:\?\.)?\.setText\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.setFocus\s*\(/)
})

test('backend command router clears consumed input through the shell editor text seam', () => {
  const source = readFileSync(join(libRoot, 'linx-backend-command-router.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-editor-text-host\.js['"]/)
  assert.doesNotMatch(source, /\.editor(?:\?\.)?\.setText\s*\(/)
})

test('global shell command router clears consumed input through the shell editor text seam', () => {
  const source = readFileSync(join(libRoot, 'linx-interactive-command-routing.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-editor-text-host\.js['"]/)
  assert.doesNotMatch(source, /\.editor(?:\?\.)?\.setText\s*\(/)
})

test('session command router clears consumed input through the shell editor text seam', () => {
  const source = readFileSync(join(libRoot, 'linx-session-command-routing.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-editor-text-host\.js['"]/)
  assert.doesNotMatch(source, /\.editor(?:\?\.)?\.setText\s*\(/)
})

test('input command routers clear consumed input through the shell editor text seam', () => {
  const source = readFileSync(join(libRoot, 'linx-input-command-routing.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-editor-text-host\.js['"]/)
  assert.doesNotMatch(source, /(?:this|interactive)\.editor(?:\?\.)?\.setText(?:\?\.)?\s*\(/)
})

test('input final-submit router enumerates editors through the shell editor component seam', () => {
  const source = readFileSync(join(libRoot, 'linx-input-command-routing.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-editor-component-router\.js['"]/)
  assert.match(source, /\bforEachLinxInteractiveEditorComponent\b/)
  assert.doesNotMatch(source, /\.defaultEditor\b/)
  assert.doesNotMatch(source, /\.editor\b/)
})

test('Symphony command clears consumed input through the shell editor text seam', () => {
  const source = readFileSync(join(libRoot, 'linx-symphony-interactive-command.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-editor-text-host\.js['"]/)
  assert.doesNotMatch(source, /\.editor(?:\?\.)?\.setText(?:\?\.)?\s*\(/)
})

test('auto command status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-auto-command-routing.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('backend command status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-backend-command-router.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('workspace command status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-workspace-command.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('peer command status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-peer-command-routing.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('ai connect command status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-ai-connect-command.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('restored auto startup status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-restored-auto-startup.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('statusline command status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-status-line-command.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('rewind command status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-rewind-command.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('rewind transcript refresh goes through the shell chat rendering seam', () => {
  const source = readFileSync(join(libRoot, 'linx-rewind-command.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-chat-text-host\.js['"]/)
  assert.match(source, /\brefreshLinxInteractiveChatTranscript\b/)
  assert.doesNotMatch(source, /chatContainer(?:\?\.)?\.clear(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.renderInitialMessages(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.rebuildChatFromMessages(?:\?\.)?\s*\(/)
})

test('feature modules display interactive warnings through the shell warning seam', () => {
  const featureFiles = [
    'linx-pod-backed-extension-ui.ts',
    'linx-rewind-command.ts',
    'linx-submitted-user-message-recording.ts',
  ]

  for (const target of featureFiles) {
    const source = readFileSync(join(libRoot, target), 'utf8')
    assert.match(source, /from ['"]\.\/linx-interactive-warning-display\.js['"]/, target)
    assert.match(source, /\bshowLinxInteractiveWarning\b/, target)
    assert.doesNotMatch(source, /\.showWarning(?:\?\.)?\s*\(/, target)
  }
})

test('feature modules access interactive model registry through the shell model-registry host', () => {
  const featureFiles = [
    'linx-ai-connect-command.ts',
    'linx-login-flow.ts',
  ]

  for (const target of featureFiles) {
    const source = readFileSync(join(libRoot, target), 'utf8')
    assert.match(source, /from ['"]\.\/linx-interactive-model-registry-host\.js['"]/, target)
    assert.doesNotMatch(source, /\.session\?\.modelRegistry|\.session\.modelRegistry/, target)
  }
})

test('Symphony runtime projection queues custom context through the shell session seam', () => {
  const source = readFileSync(join(libRoot, 'linx-symphony-interactive-command.ts'), 'utf8')
  assert.match(source, /from ['"]\.\/linx-session-work-control\.js['"]/, 'Symphony command should use the session work-control seam')
  assert.match(source, /\bqueueLinxInteractiveSessionRuntimeProjection\b/, 'Symphony command should queue hidden projection through a named seam')
  assert.doesNotMatch(source, /\.session\?\.sendCustomMessage|\.session\.sendCustomMessage|sendCustomMessage\.call/, 'feature code must not call Pi sendCustomMessage directly')
})

test('feature modules read active model identity through the session metadata seam', () => {
  const featureFiles = [
    'linx-symphony-interactive-command.ts',
    'linx-welcome-header.ts',
    'secretary-auto-input-controller.ts',
  ]

  for (const target of featureFiles) {
    const source = readFileSync(join(libRoot, target), 'utf8')
    assert.match(source, /from ['"].*linx-session-metadata\.js['"]/, target)
    assert.match(source, /\bresolveLinxSessionModelId\b/, target)
    assert.doesNotMatch(source, /\.session\?\.model|\.session\.model/, target)
  }
})

test('feature modules read active cwd through the session metadata seam', () => {
  const featureFiles = [
    'linx-pod-backed-extension-ui.ts',
    'linx-workspace-command.ts',
    'secretary-auto-input-controller.ts',
  ]

  for (const target of featureFiles) {
    const source = readFileSync(join(libRoot, target), 'utf8')
    assert.match(source, /from ['"].*linx-session-metadata\.js['"]/, target)
    assert.match(source, /\bresolveLinxSessionCwd\b/, target)
    assert.doesNotMatch(source, /\.session\?\.cwd|\.session\.cwd/, target)
  }
})

test('Symphony source WebID resolution stays behind the interactive runtime host', () => {
  const source = readFileSync(join(libRoot, 'linx-symphony-interactive-command.ts'), 'utf8')
  assert.match(source, /from ['"]\.\/linx-interactive-runtime-host\.js['"]/)
  assert.match(source, /\bresolveLinxInteractivePodWebId\b/)
  assert.doesNotMatch(source, /\.podSession\?\.webId|\.session\?\.podSession|\.session\?\.runtime\?\.podSession|\.session\?\.state\?\.webId|\.state\?\.webId/)
})

test('feature modules refresh interactive provider count through the shell provider count seam', () => {
  const featureFiles = [
    'linx-ai-connect-command.ts',
    'linx-login-flow.ts',
  ]

  for (const target of featureFiles) {
    const source = readFileSync(join(libRoot, target), 'utf8')
    assert.match(source, /from ['"]\.\/linx-interactive-provider-count-host\.js['"]/, target)
    assert.match(source, /\brefreshLinxInteractiveProviderCount\b/, target)
    assert.doesNotMatch(source, /\.updateAvailableProviderCount(?:\?\.)?\s*\(/, target)
  }
})

test('feature modules collect extension input through the shell extension input seam', () => {
  const featureFiles = [
    'linx-ai-connect-command.ts',
    'linx-login-flow.ts',
  ]

  for (const target of featureFiles) {
    const source = readFileSync(join(libRoot, target), 'utf8')
    assert.match(source, /from ['"]\.\/linx-interactive-extension-input-host\.js['"]/, target)
    assert.match(source, /\bcollectLinxInteractiveExtensionInput\b/, target)
    assert.match(source, /\bcanCollectLinxInteractiveExtensionInput\b/, target)
    assert.doesNotMatch(source, /\.showExtensionInput(?:\?\.)?\s*\(/, target)
  }
})

test('feature modules choose extension selector options through the shell extension selector seam', () => {
  const featureFiles = [
    'linx-login-flow.ts',
    'linx-status-line-command.ts',
    'linx-update-notification.ts',
  ]

  for (const target of featureFiles) {
    const source = readFileSync(join(libRoot, target), 'utf8')
    assert.match(source, /from ['"]\.\/linx-interactive-extension-selector-host\.js['"]/, target)
    assert.match(source, /\bchooseLinxInteractiveExtensionSelectorOption\b/, target)
    assert.match(source, /\bcanChooseLinxInteractiveExtensionSelectorOption\b/, target)
    assert.doesNotMatch(source, /\.showExtensionSelector(?:\?\.)?\s*\(/, target)
  }
})

test('feature modules mount custom selectors through the shell selector seam', () => {
  const featureFiles = [
    'linx-rewind-command.ts',
    'linx-status-line-command.ts',
  ]

  for (const target of featureFiles) {
    const source = readFileSync(join(libRoot, target), 'utf8')
    assert.match(source, /from ['"]\.\/linx-interactive-selector-host\.js['"]/, target)
    assert.match(source, /\bshowLinxInteractiveSelector\b/, target)
    assert.match(source, /\bcanShowLinxInteractiveSelector\b/, target)
    assert.doesNotMatch(source, /\.showSelector(?:\?\.)?\s*\(/, target)
  }
})

test('command autocomplete installs through the shell autocomplete seam', () => {
  const source = readFileSync(join(libRoot, 'linx-command-autocomplete.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-autocomplete-host\.js['"]/)
  assert.match(source, /\binstallLinxInteractiveAutocompleteCommands\b/)
  assert.doesNotMatch(source, /\.setupAutocompleteProvider(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.setupAutocomplete(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.autocompleteProvider\b/)
})

test('interrupt control status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-interrupt-control.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('interrupt control reads editor text through the shell editor text seam', () => {
  const source = readFileSync(join(libRoot, 'linx-interrupt-control.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-editor-text-host\.js['"]/)
  assert.match(source, /\bgetLinxInteractiveEditorText\b/)
  assert.doesNotMatch(source, /\.editor(?:\?\.)?\.getText(?:\?\.)?\s*\(/)
})

test('self-update status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-self-update.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('update notification status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-update-notification.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('Secretary auto input status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'secretary-auto-input-controller.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('Symphony command status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-symphony-interactive-command.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('welcome header render invalidation goes through the shell header host', () => {
  const source = readFileSync(join(libRoot, 'linx-welcome-header.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-header-host\.js['"]/)
  assert.match(source, /\binvalidateLinxInteractiveHeader\b/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('welcome header terminal title rendering goes through the shell title router', () => {
  const source = readFileSync(join(libRoot, 'linx-welcome-header.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-terminal-title-router\.js['"]/)
  assert.match(source, /\bsetLinxTerminalTitle\b/)
  assert.match(source, /\brequestLinxTerminalTitleRefresh\b/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.terminal(?:\?\.)?\.setTitle(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.updateTerminalTitle(?:\?\.)?\s*\(/)
})

test('login flow status rendering goes through the shell status seam', () => {
  const source = readFileSync(join(libRoot, 'linx-login-flow.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-interactive-status-display\.js['"]/)
  assert.doesNotMatch(source, /\.showStatus(?:\?\.)?\s*\(/)
  assert.doesNotMatch(source, /\.ui(?:\?\.)?\.requestRender(?:\?\.)?\s*\(/)
})

test('custom editor component rebinding is centralized in the shell editor component router', () => {
  const allowed = new Set([
    'linx-editor-component-router.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/interactive\.setCustomEditorComponent\s*=/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('extension UI context patching is centralized in the shell extension UI router', () => {
  const allowed = new Set([
    'linx-extension-ui-context-router.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/interactive\.createExtensionUIContext\s*=/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('session thinking capability patching is centralized in the shell session thinking router', () => {
  const allowed = new Set([
    'linx-session-thinking-capability-router.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/session\.(?:supportsXhighThinking|getAvailableThinkingLevels)\s*=/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('interactive session cwd mutation is centralized in the shell session cwd router', () => {
  const allowed = new Set([
    'linx-session-cwd-router.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/interactive\.session\.cwd\s*=/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('workspace command reads session cwd through the shell session metadata seam', () => {
  const source = readFileSync(join(libRoot, 'linx-workspace-command.ts'), 'utf8')

  assert.doesNotMatch(source, /sessionManager(?:\?\.)?\.getCwd\b/)
  assert.doesNotMatch(source, /sessionManager\b/)
})

test('welcome header reads session metadata through the shell session metadata seam', () => {
  const source = readFileSync(join(libRoot, 'linx-welcome-header.ts'), 'utf8')

  assert.doesNotMatch(source, /sessionManager(?:\?\.)?\.(?:getCwd|getSessionId|getSessionName)\b/)
  assert.doesNotMatch(source, /sessionManager\b/)
})



test('resume output reads session id through the shell session metadata seam', () => {
  const source = readFileSync(join(libRoot, 'linx-resume-output.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-session-metadata\.js['"]/)
  assert.doesNotMatch(source, /sessionManager(?:\?\.)?\.getSessionId\b/)
  assert.doesNotMatch(source, /sessionManager\b/)
  assert.doesNotMatch(source, /resolveLinxSessionId\(\{\s*interactive,\s*session:/)
})



test('Pod-backed extension UI reads session id through the shell session metadata seam', () => {
  const source = readFileSync(join(libRoot, 'linx-pod-backed-extension-ui.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-session-metadata\.js['"]/)
  assert.doesNotMatch(source, /sessionManager(?:\?\.)?\.getSessionId\b/)
  assert.doesNotMatch(source, /sessionManager\b/)
  assert.doesNotMatch(source, /contextInteractive\?\.session/)
})



test('Symphony command reads source session id through the shell session metadata seam', () => {
  const source = readFileSync(join(libRoot, 'linx-symphony-interactive-command.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-session-metadata\.js['"]/)
  assert.doesNotMatch(source, /sessionManager(?:\?\.)?\.getSessionId\b/)
  assert.doesNotMatch(source, /resolveLinxSessionId\(\{[^}]*session:\s*interactive\?\.session/)
})



test('status line reads session name and cwd through the shell session metadata seam', () => {
  const source = readFileSync(join(libRoot, 'linx-status-line.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-session-metadata\.js['"]/)
  assert.doesNotMatch(source, /sessionManager(?:\?\.)?\.(?:getSessionName|getCwd)\b/)
})



test('status line reads session usage entries through the shell session-history seam', () => {
  const source = readFileSync(join(libRoot, 'linx-status-line.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-session-history\.js['"]/)
  assert.doesNotMatch(source, /sessionManager(?:\?\.)?\.getEntries\b/)
})


test('Secretary auto input reads recent history through the shell session-history seam', () => {
  const source = readFileSync(join(libRoot, 'secretary-auto-input-controller.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-session-history\.js['"]/)
  assert.match(source, /\bgetLinxActiveSessionAgentMessages\b/)
  assert.doesNotMatch(source, /sessionManager(?:\?\.)?\.getEntries\b/)
  assert.doesNotMatch(source, /interactive\?\.session/)
  assert.doesNotMatch(source, /agent\?\.state\?\.messages|agent\.state\.messages/)
})




test('Pod mirror mapping consumes archive DTOs instead of Pi SessionManager', () => {
  const source = readFileSync(join(libRoot, 'pod-mirror-mapping.ts'), 'utf8')

  assert.doesNotMatch(source, /SessionManager/)
  assert.doesNotMatch(source, /sessionManager/)
})


test('Pod mirror projection reads Pi archive state only through archive snapshot helpers', () => {
  const source = readFileSync(join(libRoot, 'linx-pod-mirror.ts'), 'utf8')
  const allowedRanges = findFunctionRanges(source, [
    'getPodMirrorArchiveSnapshot',
    'getActivePiSessionEntries',
    'getSessionCreatedAt',
  ])
  const violations = [...source.matchAll(/\b(?:options\.)?sessionManager\.(?:getSessionId|getSessionFile|getSessionName|getEntries|getLeafId|getBranch)\b/g)]
    .filter((match) => !isOffsetInAnyRange(match.index ?? 0, allowedRanges))
    .map((match) => `${lineNumberAt(source, match.index ?? 0)}:${match[0]}`)

  assert.deepEqual(violations, [])
})


test('startup control hydration consumes archive identity instead of Pi SessionManager', () => {
  const source = readFileSync(join(libRoot, 'linx-pi-startup-control.ts'), 'utf8')

  assert.doesNotMatch(source, /\bSessionManager\b/)
  assert.doesNotMatch(source, /\bsessionManager\b/)
  assert.doesNotMatch(source, /\.getSessionId\b/)
  assert.doesNotMatch(source, /\.getEntries\b/)
})


test('Pod mirror runtime host receives checkpoint archive id as data', () => {
  const source = readFileSync(join(libRoot, 'linx-pod-mirror-runtime-host.ts'), 'utf8')

  assert.doesNotMatch(source, /sessionManager\.getSessionId\b/)
})


test('runtime execution receives archive identity as startup data', () => {
  const source = readFileSync(join(libRoot, 'linx-pi-runtime-execution.ts'), 'utf8')

  assert.doesNotMatch(source, /sessionManager\.getSessionId\b/)
})


test('session-control reads Pi archive identity only through archive ref helpers', () => {
  const source = readFileSync(join(libRoot, 'session-control.ts'), 'utf8')
  const allowedRanges = findFunctionRanges(source, [
    'resolveBusinessSessionArchiveRef',
    'resolveControlSessionArchiveRef',
  ])
  const violations = [...source.matchAll(/\b(?:manager|sessionManager)(?:\?\.)?\.?(?:getSessionId|getSessionFile|getSessionDir|getCwd)(?:\?\.)?\s*\(/g)]
    .filter((match) => !isOffsetInAnyRange(match.index ?? 0, allowedRanges))
    .map((match) => `${lineNumberAt(source, match.index ?? 0)}:${match[0]}`)

  assert.deepEqual(violations, [])
})


test('session metadata reads Pi archive fields only through a metadata snapshot helper', () => {
  const source = readFileSync(join(libRoot, 'linx-session-metadata.ts'), 'utf8')
  const allowedRanges = findFunctionRanges(source, [
    'resolveLinxSessionMetadataArchiveSnapshot',
  ])
  const violations = [...source.matchAll(/\bsessionManager(?:\?\.)?\.(?:getCwd|getSessionName|getSessionId)(?:\?\.)?\s*\(/g)]
    .filter((match) => !isOffsetInAnyRange(match.index ?? 0, allowedRanges))
    .map((match) => `${lineNumberAt(source, match.index ?? 0)}:${match[0]}`)

  assert.deepEqual(violations, [])
})


test('session manager builds session info from archive snapshots', () => {
  const source = readFileSync(join(libRoot, 'linx-session-manager.ts'), 'utf8')
  const allowedRanges = findFunctionRanges(source, [
    'getLinxPiSessionArchiveSnapshot',
    'buildSessionInfoFromArchiveSnapshot',
  ])
  const violations = [...source.matchAll(/\bmanager\.(?:getSessionId|getCwd|getSessionName|getEntries)\s*\(/g)]
    .filter((match) => !isOffsetInAnyRange(match.index ?? 0, allowedRanges))
    .map((match) => `${lineNumberAt(source, match.index ?? 0)}:${match[0]}`)

  assert.deepEqual(violations, [])
})


test('direct sessionManager access stays in documented shell archive bridge modules', () => {
  const allowed = new Set([
    'linx-pi-runtime-execution.ts',
    'linx-pi-startup-control.ts',
    'linx-pi-startup-plan.ts',
    'linx-pod-mirror-runtime-host.ts',
    'linx-pod-mirror-sync-recovery.ts',
    'linx-pod-mirror.ts',
    'linx-runtime-adapter-contract.ts',
    'linx-runtime-agent-session.ts',
    'linx-session-history.ts',
    'linx-session-metadata.ts',
    'session-control.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/\bsessionManager\b/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

function findFunctionRanges(source, functionNames) {
  return functionNames.map((name) => {
    const declaration = new RegExp(`function\\s+${name}\\s*\\(`, 'u')
    const match = declaration.exec(source)
    assert.ok(match, `expected function ${name} to exist`)
    const bodyStart = source.indexOf('{', match.index)
    assert.notEqual(bodyStart, -1, `expected function ${name} to have a body`)
    return {
      start: match.index,
      end: findMatchingBrace(source, bodyStart) + 1,
    }
  })
}

function findMatchingBrace(source, openingBraceIndex) {
  let depth = 0
  for (let index = openingBraceIndex; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }
  assert.fail('expected matching closing brace')
}

function isOffsetInAnyRange(offset, ranges) {
  return ranges.some((range) => offset >= range.start && offset < range.end)
}

function lineNumberAt(source, offset) {
  return source.slice(0, offset).split('\n').length
}



test('concrete shell command execution lives in a dedicated executor module', () => {
  const commandRoutingSource = readFileSync(join(libRoot, 'linx-interactive-command-routing.ts'), 'utf8')

  assert.match(
    commandRoutingSource,
    /from ['"]\.\/linx-shell-command-executor\.js['"]/,
    'interactive command routing should import concrete shell command execution from its owning module',
  )
  const forbiddenCommandExecutionSnippets = [
    'checkAndShowLinxUpdate',
    'handleInteractiveAiConnectCommand',
    'handleInteractiveStatusLineCommand',
    'handleInteractiveRewindSelector',
    'handleInteractiveRewindTurnsCommand',
    'changeInteractiveCwd',
    'routeLinxPeerCommand',
    'routeLinxAutoCommand',
    'getLinxInteractiveAiConnectCommand',
    'handleLinxShellCommand',
  ]
  const violations = forbiddenCommandExecutionSnippets.filter((snippet) => commandRoutingSource.includes(snippet))

  assert.deepEqual(violations, [])
})

test('submitted user message recording lives in a dedicated session-control module', () => {
  const commandRoutingSource = readFileSync(join(libRoot, 'linx-interactive-command-routing.ts'), 'utf8')

  assert.match(
    commandRoutingSource,
    /from ['"]\.\/linx-submitted-user-message-recording\.js['"]/,
    'interactive command routing should import submitted user message recording from its owning module',
  )
  const forbiddenRecordingSnippets = [
    'getSessionControlManager',
    'recordSubmittedUserMessage',
    'Thread reconciliation unavailable',
    'recordUserMessage',
  ]
  const violations = forbiddenRecordingSnippets.filter((snippet) => commandRoutingSource.includes(snippet))

  assert.deepEqual(violations, [])
})

test('auto command execution lives in a dedicated auto command module', () => {
  const executorSource = readFileSync(join(libRoot, 'linx-shell-command-executor.ts'), 'utf8')

  assert.match(
    executorSource,
    /from ['"]\.\/linx-auto-command-routing\.js['"]/,
    'shell command executor should import auto command execution from its owning module',
  )
  const forbiddenAutoCommandSnippets = [
    'getSecretaryAutoInputController',
    'isLinxInteractiveAutoModeEnabled',
    'notifyLinxInteractiveAutoControlChange',
    'setLinxInteractiveAutoModeEnabled',
    'formatAutoModeChangeStatus',
    'Auto on: Secretary drives',
    'Auto off: you drive',
  ]
  const violations = forbiddenAutoCommandSnippets.filter((snippet) => executorSource.includes(snippet))

  assert.deepEqual(violations, [])
})

test('peer command routing lives in a dedicated peer command module', () => {
  const executorSource = readFileSync(join(libRoot, 'linx-shell-command-executor.ts'), 'utf8')

  assert.match(
    executorSource,
    /from ['"]\.\/linx-peer-command-routing\.js['"]/,
    'shell command executor should import peer command routing from its owning module',
  )
  const forbiddenPeerRoutingSnippets = [
    'AutoModePeerCommandRoute',
    'getSessionCommandRouterOriginalPrompt',
    'getSessionCommandRouterOriginalSendUserMessage',
    'submitProjectedBackendInput',
    'handleInteractivePeerCommand',
    'Active LinX session cannot accept peer goal input',
  ]
  const violations = forbiddenPeerRoutingSnippets.filter((snippet) => executorSource.includes(snippet))

  assert.deepEqual(violations, [])
})

test('rewind command delegates active session work control to the shell session seam', () => {
  const source = readFileSync(join(libRoot, 'linx-rewind-command.ts'), 'utf8')

  assert.doesNotMatch(source, /\bisStreaming\b/)
  assert.doesNotMatch(source, /\bisBashRunning\b/)
  assert.doesNotMatch(source, /\babortBash\b/)
  assert.doesNotMatch(source, /\babort\s*\(/)
})

test('rewind command delegates session history access to the shell session-history seam', () => {
  const source = readFileSync(join(libRoot, 'linx-rewind-command.ts'), 'utf8')
  const forbiddenSessionManagerCalls = /sessionManager(?:\?\.)?\.(?:getLeafId|getEntry|getBranch|getEntries|getHeader|getSessionId|getSessionFile|branch|resetLeaf|createBranchedSession|newSession|buildSessionContext)\b/
  const forbiddenLocalHelpers = [
    'rewindSessionManagerBeforeUserEntry',
    'rewindSessionManagerByTurns',
    'resolveSessionManagerLeafId',
    'getActiveSessionBranch',
    'moveSessionManagerLeaf',
    'materializeCleanRewindSession',
    'syncAgentStateFromSessionManager',
  ]

  assert.doesNotMatch(source, forbiddenSessionManagerCalls)
  assert.deepEqual(forbiddenLocalHelpers.filter((helper) => source.includes(helper)), [])
})

test('interrupt control delegates active session work control to the shell session seam', () => {
  const source = readFileSync(join(libRoot, 'linx-interrupt-control.ts'), 'utf8')

  assert.doesNotMatch(source, /\bisStreaming\b/)
  assert.doesNotMatch(source, /\bisBashRunning\b/)
  assert.doesNotMatch(source, /\babortBash\b/)
  assert.doesNotMatch(source, /\babort\s*\(/)
})

test('peer and Secretary input delivery delegate streaming state to the shell session seam', () => {
  const targets = [
    'linx-peer-command-routing.ts',
    'secretary-auto-input-controller.ts',
  ]

  for (const target of targets) {
    const source = readFileSync(join(libRoot, target), 'utf8')
    assert.doesNotMatch(source, /\bisStreaming\b/, target)
    assert.doesNotMatch(source, /\bdeliverAs:\s*['"]followUp['"]/, target)
    assert.doesNotMatch(source, /\bstreamingBehavior:\s*['"]followUp['"]/, target)
  }
})

test('Secretary auto input subscribes to session events through the shell session seam', () => {
  const source = readFileSync(join(libRoot, 'secretary-auto-input-controller.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-session-work-control\.js['"]/)
  assert.match(source, /\bsubscribeLinxInteractiveSessionEvents\b/)
  assert.doesNotMatch(source, /\.session\?\.subscribe|\.session\.subscribe/)
})

test('Secretary auto input delivers active-session input through the shell session seam', () => {
  const source = readFileSync(join(libRoot, 'secretary-auto-input-controller.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-session-work-control\.js['"]/)
  assert.match(source, /\bcanSubmitLinxInteractiveSessionUserInputNow\b/)
  assert.match(source, /\bsubmitLinxInteractiveSessionUserInput\b/)
  assert.doesNotMatch(source, /\bcanSubmitLinxSessionUserInputNow\(this\.interactive\?\.session\)/)
  assert.doesNotMatch(source, /\bconst session = this\.interactive\?\.session\b/)
})


test('auth retry session history access lives behind a shell session-history seam', () => {
  const source = readFileSync(join(libRoot, 'linx-login-flow.ts'), 'utf8')
  const forbiddenSessionManagerCalls = /sessionManager(?:\?\.)?\.(?:getLeafId|getEntry|getBranch|getEntries|branch|resetLeaf|buildSessionContext)\b/

  assert.doesNotMatch(source, forbiddenSessionManagerCalls)
  assert.doesNotMatch(source, /captureLinxSessionRetryTurn\(interactive\.session\)/)
  assert.doesNotMatch(source, /restoreLinxSessionHistoryBranch\(interactive\.session/)
  assert.doesNotMatch(source, /restoreLinxSessionHistoryBranch\(session,/)
  assert.doesNotMatch(source, /\bfindLastUserMessageEntry\b/)
  assert.doesNotMatch(source, /\brestoreLinxRetryBranch\b/)
})

test('session-history retry exports delegate Pi history operations to internal helpers', () => {
  const source = readFileSync(join(libRoot, 'linx-session-history.ts'), 'utf8')
  const allowedRanges = findFunctionRanges(source, [
    'captureLinxRetryTurnFromSessionManager',
    'restoreSessionHistoryBranchWithManager',
  ])
  const exportedRanges = findFunctionRanges(source, [
    'captureLinxSessionRetryTurn',
    'restoreLinxSessionHistoryBranch',
  ])
  const forbiddenCalls = /sessionManager(?:\?\.)?\.(?:getLeafId|getEntry|getBranch|getEntries|branch|resetLeaf|buildSessionContext)\b/g
  const violations = [...source.matchAll(forbiddenCalls)]
    .filter((match) => isOffsetInAnyRange(match.index ?? 0, exportedRanges))
    .filter((match) => !isOffsetInAnyRange(match.index ?? 0, allowedRanges))
    .map((match) => `${lineNumberAt(source, match.index ?? 0)}:${match[0]}`)

  assert.deepEqual(violations, [])
})

test('session-history rewind exports delegate Pi history operations to internal helpers', () => {
  const source = readFileSync(join(libRoot, 'linx-session-history.ts'), 'utf8')
  const allowedRanges = findFunctionRanges(source, [
    'rewindSessionHistoryByTurnsWithManager',
    'rewindSessionHistoryBeforeUserEntryWithManager',
  ])
  const exportedRanges = findFunctionRanges(source, [
    'rewindLinxSessionHistoryByTurns',
    'rewindLinxSessionHistoryBeforeUserEntry',
  ])
  const forbiddenCalls = /\b(?:resolveRewindUserEntry|captureLinxRewindSessionState|getActiveSessionBranch|rewindSessionHistoryByTurns|moveSessionManagerLeaf|materializeCleanRewindSession|syncAgentStateFromSessionManager|collectAbandonedRewindEntries)\b/g
  const violations = [...source.matchAll(forbiddenCalls)]
    .filter((match) => isOffsetInAnyRange(match.index ?? 0, exportedRanges))
    .filter((match) => !isOffsetInAnyRange(match.index ?? 0, allowedRanges))
    .map((match) => `${lineNumberAt(source, match.index ?? 0)}:${match[0]}`)

  assert.deepEqual(violations, [])
})

test('session-history query exports delegate Pi branch operations to internal helpers', () => {
  const source = readFileSync(join(libRoot, 'linx-session-history.ts'), 'utf8')
  const allowedRanges = findFunctionRanges(source, [
    'getActiveSessionHistoryEntriesWithManager',
    'collectRewindUserMessagesWithManager',
    'assertRewindUserEntryTargetWithManager',
  ])
  const exportedRanges = findFunctionRanges(source, [
    'getLinxActiveSessionHistoryEntries',
    'collectLinxRewindUserMessages',
    'assertLinxRewindUserEntryTarget',
  ])
  const forbiddenCalls = /\b(?:getActiveSessionBranch|resolveRewindUserEntry|extractRewindMessageText)\b/g
  const violations = [...source.matchAll(forbiddenCalls)]
    .filter((match) => isOffsetInAnyRange(match.index ?? 0, exportedRanges))
    .filter((match) => !isOffsetInAnyRange(match.index ?? 0, allowedRanges))
    .map((match) => `${lineNumberAt(source, match.index ?? 0)}:${match[0]}`)

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

test('auto editor indicator enumerates editors through the shell editor component seam', () => {
  const source = readFileSync(join(libRoot, 'linx-auto-editor-indicator.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-editor-component-router\.js['"]/)
  assert.match(source, /\bforEachLinxInteractiveEditorComponent\b/)
  assert.doesNotMatch(source, /\.defaultEditor\b/)
  assert.doesNotMatch(source, /\.editor\b/)
})

test('terminal title patching is centralized in the shell rendering router', () => {
  const allowed = new Set([
    'linx-terminal-title-router.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/interactive\.updateTerminalTitle\s*=/.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('interactive custom header mutation is centralized in the shell header host', () => {
  const allowed = new Set([
    'linx-interactive-header-host.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/interactive\.customHeader\s*=/.test(source)) {
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

test('interrupt control reads default editor through the shell editor component seam', () => {
  const source = readFileSync(join(libRoot, 'linx-interrupt-control.ts'), 'utf8')

  assert.match(source, /from ['"]\.\/linx-editor-component-router\.js['"]/, 'interrupt control should import the editor component seam')
  assert.match(source, /\bgetLinxInteractiveDefaultEditorComponent\b/, 'interrupt control should request the default editor through the seam')
  assert.doesNotMatch(source, /\.defaultEditor\b/)
})

test('interactive streaming message cleanup is centralized in the shell streaming host', () => {
  const allowed = new Set([
    'linx-interactive-streaming-message-host.ts',
  ])
  const violations = []

  for (const file of listSourceFiles(libRoot)) {
    const relativePath = relative(libRoot, file)
    if (relativePath.startsWith(adapterSegment) || allowed.has(relativePath)) {
      continue
    }

    const source = readFileSync(file, 'utf8')
    if (/interactive\.(?:streamingComponent|streamingMessage)\b/.test(source)) {
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
  const violations = []
  const adapterRoot = join(libRoot, 'pi-adapter')
  for (const file of listSourceFiles(adapterRoot)) {
    const relativePath = relative(adapterRoot, file)
    const source = readFileSync(file, 'utf8')
    if (isPureReexportModule(source) && /from\s+['"]\.\.\//u.test(source)) {
      violations.push(relativePath)
    }
  }

  assert.deepEqual(violations, [])
})

test('pi adapter does not expose an aggregate index barrel', () => {
  assert.equal(
    existsSync(join(libRoot, 'pi-adapter/index.ts')),
    false,
    'Pi adapter consumers should import the owning runtime or stream bridge modules directly',
  )
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
    if (allowedBridgeEntries.has(relativePath)) {
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

test('native runtime proxy contract is kept outside the Pi runtime adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/runtime.ts'), 'utf8')
  const forbidden = [
    'createNativeProxy?: (options?: {',
    'sendTurn(input: string): Promise<void>',
    'executeCommand?(input: string): Promise<BackendCommandResult>',
    'setAutoEnabled?(enabled: boolean): Promise<void> | void',
    'setCwd?(cwd: string): Promise<void> | void',
    'subscribe(listener:',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('cloud runtime dependency contract is kept outside the Pi runtime adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/runtime.ts'), 'utf8')
  const forbidden = [
    'RemoteChatMessage',
    'RemoteChatTool',
    'createRemoteCompletion?: (options: {',
    'messages: RemoteChatMessage[]',
    'tools?: RemoteChatTool[]',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('runtime adapter cwd default is kept outside the Pi runtime adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/runtime.ts'), 'utf8')
  const forbidden = [
    'process.cwd()',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('runtime adapter product defaults are kept outside the Pi runtime adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/runtime.ts'), 'utf8')
  const forbidden = [
    "options.backend ?? 'cloud'",
    "backendMode === 'native' ? 'codex' : undefined",
    "'https://api.undefineds.co/v1'",
    "'undefineds_pi_frontend'",
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})


test('runtime backend composition is kept outside the Pi runtime adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/runtime.ts'), 'utf8')
  const forbidden = [
    'createLinxCloudRuntimeCoordinator',
    'createNativeBackendCommandRouter',
    'createNativeBackendStreamBackend',
    'createLinxRuntimeCompletionBackend',
    'resolveLinxRuntimeBackendMode',
    'resolveLinxRuntimeWorkerBackend',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('runtime backend option schema is kept outside the Pi runtime adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/runtime.ts'), 'utf8')
  const forbidden = [
    'port?: number',
    'codexApprovalPolicy?: NativeBackendApprovalPolicy',
    'passthroughArgs?: string[]',
    'backendEnv?: Record<string, string>',
    'resolveBackendEnv?: () => Promise<Record<string, string> | undefined>',
    'providerConfig?: {',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('runtime adapter public contract is kept outside the Pi runtime adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/runtime.ts'), 'utf8')
  const forbidden = [
    'export interface LinxRuntimeFactoryContext',
    'export type LinxCreateRuntimeFactory',
    'export type LinxRuntimeAdapterOptions',
    'export interface LinxRuntimeAdapter',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('runtime auth bridge contracts are not re-exported from the Pi runtime adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/runtime.ts'), 'utf8')
  const forbidden = [
    'export type { LinxCloudPiAuthBridge }',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('runtime resource lookup does not depend on legacy pi-adapter bundle layouts', () => {
  const source = readFileSync(join(libRoot, 'linx-runtime-resources.ts'), 'utf8')
  const forbidden = [
    'Legacy adapter layout',
    'dist/lib/pi-adapter',
    "'..', '..', '..', 'vendor'",
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})


test('latest user prompt extraction is kept outside the Pi stream adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/stream.ts'), 'utf8')
  const forbidden = [
    "find((entry) => entry.role === 'user')",
    "typeof lastUserText?.content === 'string'",
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

test('stream backend contracts are kept outside the Pi stream adapter', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/stream.ts'), 'utf8')
  const forbidden = [
    'sendTurn(input: string): Promise<void>',
    'subscribe(listener:',
    'complete(input: {',
    'messages: RemoteChatMessage[]',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('Pi stream adapter does not import backend-specific contract modules', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/stream.ts'), 'utf8')
  const forbidden = [
    '../linx-runtime-completion-backend.js',
    '../native-backend-stream-backend.js',
  ]
  const violations = forbidden.filter((snippet) => source.includes(snippet))

  assert.deepEqual(violations, [])
})

test('Pi stream adapter does not re-export backend completion result contracts', () => {
  const source = readFileSync(join(libRoot, 'pi-adapter/stream.ts'), 'utf8')
  const forbidden = [
    "export type { LinxCompletionBackendResult } from '../linx-completion-backend.js'",
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
