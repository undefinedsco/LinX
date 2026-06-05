import test from 'node:test'
import assert from 'node:assert/strict'
import {
buildAcpPermissionResponse,
buildAutoModeThreadMetadata,
buildAutoModeTranscriptMessages,
buildCodexApprovalResponse,
buildCodexUserInputResponse,
buildAutoModeUserInputResponse,
buildAutoModeApprovalDecisionReason,
createFallbackAutoModeSecretaryRecommendation,
computeAutoModeSecretaryReactionWindowMs,
createAutoModeSessionId,
detectAutoModeAuthFailure,
encodeAutoModeApprovalOptions,
extractAutoModeSessionIdFromJsonLine,
formatAutoModeBackendAuthMessage,
getAutoModeAuthLoginCommand,
isTrustedAutoModeCommand,
normalizeAcpInteractionRequest,
normalizeAcpRequest,
normalizeAcpSessionNotification,
normalizeCodexAppServerInteractionRequest,
normalizeCodexAppServerNotification,
normalizeCodexAppServerRequest,
looksLikeAutoModeAuthFailureText,
normalizeAutoModeCredentialSource,
normalizeAutoModeUserInputQuestion,
parseAutoModeApprovalDecisionReason,
parseAutoModeApprovalOptions,
parseAutoModeSecretaryRecommendation,
parseAutoModeGrantCoverageDecision,
parseAutoModeClaudeAuthStatus,
parseAutoModeJsonProtocolLine,
resolveAutoModeAutoApprovalDecision,
autoModeApprovalDecisionForOption,
autoModeApprovalDecisionForStoredApproval,
resolveAutoModeInteractionAutoResponse,
resolveAutoModeCommandRoute,
resolveAutoModePeerCommand,
resolveAutoModeQuestionAnswer,
resolveAutoModeCredentialSourceResolution,
autoModeApprovalDecisionLabel,
autoModeUserInputAnswersSummary,
shouldAttemptCloudCredentialProbe,
autoModeApprovalActionUri,
getAutoModeArchiveRelativePaths,
AUTO_MODE_EVENTS_FILE_NAME,
AUTO_MODE_HOME_DIRNAME,
AUTO_MODE_SESSIONS_DIRNAME,
AUTO_MODE_SESSION_FILE_NAME,
autoModeApprovalRequestMessage,
autoModeApprovalRisk,
autoModeApprovalToolName,
shouldMaterializeAutoModeGrant,
} from '../src/auto-mode'
import {
  buildLinxSessionControlMetadata,
  buildLinxSessionControlState,
  mergeLinxSessionControlMetadata,
  readLinxSessionControlMetadata,
  resolveLinxSessionAutoEnabled,
  resolveLinxSessionSymphonyEnabled,
} from '../src/control-plane'

function expect<T>(actual: T) {
  return {
    toBe(expected: unknown) {
      assert.equal(actual, expected)
    },
    toEqual(expected: unknown) {
      assert.deepEqual(actual, expected)
    },
    toMatchObject(expected: unknown) {
      assert.partialDeepStrictEqual(actual, expected)
    },
  }
}

test('creates stable auto-mode session ids from timestamp and random id', () => {
  expect(
    createAutoModeSessionId({
      now: new Date('2026-03-16T00:00:00.000Z'),
      randomId: 'abcd1234efgh',
    }),
  ).toBe('auto_2026-03-16T00-00-00-000Z_abcd1234')
})

test('returns the shared archive file layout for a session id', () => {
  expect(AUTO_MODE_HOME_DIRNAME).toBe('auto-mode')
  expect(AUTO_MODE_SESSIONS_DIRNAME).toBe('sessions')
  expect(AUTO_MODE_SESSION_FILE_NAME).toBe('session.json')
  expect(AUTO_MODE_EVENTS_FILE_NAME).toBe('events.jsonl')

  expect(getAutoModeArchiveRelativePaths('auto_demo_1234')).toEqual({
    sessionDir: 'sessions/auto_demo_1234',
    sessionFile: 'sessions/auto_demo_1234/session.json',
    eventsFile: 'sessions/auto_demo_1234/events.jsonl',
  })
})

test('classifies goal as a pass-through peer command with secretary behavior mirror', () => {
  expect(resolveAutoModePeerCommand('hello')).toBe(null)
  expect(resolveAutoModePeerCommand('/goal status')).toEqual({
    kind: 'peer-command',
    targetRole: 'peer-command',
    command: 'goal',
    text: '/goal status',
  })
  expect(resolveAutoModePeerCommand('/goal ship login fix')).toEqual({
    kind: 'peer-command',
    targetRole: 'peer-command',
    command: 'goal',
    text: '/goal ship login fix',
    secretaryBehavior: { goalMode: true },
  })
  expect(resolveAutoModePeerCommand('/goal resume')).toEqual({
    kind: 'peer-command',
    targetRole: 'peer-command',
    command: 'goal',
    text: '/goal resume',
    secretaryBehavior: { goalMode: true },
  })
  for (const command of ['pause', 'close', 'cancel']) {
    expect(resolveAutoModePeerCommand(`/goal ${command}`)).toEqual({
      kind: 'peer-command',
      targetRole: 'peer-command',
      command: 'goal',
      text: `/goal ${command}`,
      secretaryBehavior: { goalMode: false },
    })
  }
})

test('classifies auto control commands in shared core before shell handling', () => {
  expect(resolveAutoModeCommandRoute('hello')).toBe(null)
  expect(resolveAutoModeCommandRoute('/auto')).toEqual({
    kind: 'control-command',
    targetRole: 'control-command',
    command: 'auto',
    text: '/auto',
    auto: { action: 'status' },
  })
  expect(resolveAutoModeCommandRoute('/auto status')).toEqual({
    kind: 'control-command',
    targetRole: 'control-command',
    command: 'auto',
    text: '/auto status',
    auto: { action: 'status' },
  })
  expect(resolveAutoModeCommandRoute('/auto on')).toEqual({
    kind: 'control-command',
    targetRole: 'control-command',
    command: 'auto',
    text: '/auto on',
    auto: { action: 'set', enabled: true },
  })
  expect(resolveAutoModeCommandRoute('/auto off')).toEqual({
    kind: 'control-command',
    targetRole: 'control-command',
    command: 'auto',
    text: '/auto off',
    auto: { action: 'set', enabled: false },
  })
  expect(resolveAutoModeCommandRoute('/auto /goal ship login fix')).toEqual({
    kind: 'control-command',
    targetRole: 'control-command',
    command: 'auto',
    text: '/auto /goal ship login fix',
    auto: { action: 'set', enabled: true, initialInput: '/goal ship login fix' },
  })
  expect(resolveAutoModeCommandRoute('/goal ship login fix')).toEqual({
    kind: 'peer-command',
    targetRole: 'peer-command',
    command: 'goal',
    text: '/goal ship login fix',
    secretaryBehavior: { goalMode: true },
  })
})

test('maps approval request semantics from the shared auto-mode core', () => {
  const commandRequest = {
    kind: 'command-approval' as const,
    message: 'Run command',
    command: 'git status --short',
  }
  const fileChangeRequest = {
    kind: 'file-change-approval' as const,
    message: 'Change file',
    reason: 'update config',
  }
  const permissionRequest = {
    kind: 'permissions-approval' as const,
    message: 'Need permission',
    permissions: { network: true },
  }

  expect(autoModeApprovalActionUri(commandRequest)).toBe('https://undefineds.co/ns#commandExecution')
  expect(autoModeApprovalToolName(commandRequest)).toBe('commandExecution')
  expect(autoModeApprovalRisk(commandRequest)).toBe('medium')
  expect(autoModeApprovalRequestMessage(commandRequest)).toBe('git status --short')

  expect(autoModeApprovalActionUri(fileChangeRequest)).toBe('https://undefineds.co/ns#fileChange')
  expect(autoModeApprovalToolName(fileChangeRequest)).toBe('fileChange')
  expect(autoModeApprovalRisk(fileChangeRequest)).toBe('high')
  expect(autoModeApprovalRequestMessage(fileChangeRequest)).toBe('update config')

  expect(autoModeApprovalActionUri(permissionRequest)).toBe('https://undefineds.co/ns#permissionRequest')
  expect(autoModeApprovalToolName(permissionRequest)).toBe('permissionRequest')
  expect(autoModeApprovalRisk(permissionRequest)).toBe('high')
  expect(autoModeApprovalRequestMessage(permissionRequest)).toBe('Need permission')
})

test('shares stored approval decision semantics across UI surfaces', () => {
  const encodedOptions = encodeAutoModeApprovalOptions([
    { optionId: '0', label: 'Allow', kind: 'allow_once' },
    { optionId: '1', label: 'Allow always', kind: 'allow_always' },
    { optionId: '2', label: 'Block', kind: 'reject_once' },
  ])

  expect(parseAutoModeApprovalOptions(encodedOptions)).toEqual([
    { optionId: '0', label: 'Allow', kind: 'allow_once' },
    { optionId: '1', label: 'Allow always', kind: 'allow_always' },
    { optionId: '2', label: 'Block', kind: 'reject_once' },
  ])

  const reason = buildAutoModeApprovalDecisionReason({
    source: 'linx-inbox',
    selectedOption: { optionId: '1', label: 'Allow always', kind: 'allow_always' },
    note: 'delegate in this session',
  })

  expect(parseAutoModeApprovalDecisionReason(reason)).toEqual({
    source: 'linx-inbox',
    note: 'delegate in this session',
    selectedOptionId: '1',
    selectedLabel: 'Allow always',
  })
  expect(autoModeApprovalDecisionForOption({ optionId: '1', label: 'Allow always', kind: 'allow_always' })).toBe('accept_always')
  expect(autoModeApprovalDecisionForStoredApproval({
    status: 'approved',
    reason,
    approvalOptions: encodedOptions,
  })).toBe('accept_always')
  expect(autoModeApprovalDecisionForStoredApproval({
    status: 'rejected',
    reason: buildAutoModeApprovalDecisionReason('cancel'),
    approvalOptions: encodedOptions,
  })).toBe('cancel')
  expect(shouldMaterializeAutoModeGrant('accept_for_session')).toBe(true)
  expect(shouldMaterializeAutoModeGrant('accept_always')).toBe(true)
  expect(shouldMaterializeAutoModeGrant('accept')).toBe(false)
})

test('maps auto-mode runtime context into generic thread metadata instead of a parallel session type', () => {
  expect(buildAutoModeThreadMetadata({
    id: 'auto_demo_1234',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
autoEnabled: true,
mode: 'auto',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    prompt: 'fix failing tests',
    passthroughArgs: ['--dangerously-bypass-approvals-and-sandbox'],
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
    approvalSource: 'hybrid',
    command: 'codex-acp',
    args: [],
    status: 'completed',
    startedAt: '2026-03-18T00:00:00.000Z',
    endedAt: '2026-03-18T00:01:00.000Z',
    archiveDir: '/tmp/.linx/auto-mode/sessions/auto_demo_1234',
    eventsFile: '/tmp/.linx/auto-mode/sessions/auto_demo_1234/events.jsonl',
    backendSessionId: 'sess_codex_123',
  })).toEqual({
    kind: 'auto-mode',
    delegatedTo: 'secretary',
    sessionId: 'auto_demo_1234',
    backend: 'codex',
    runtime: 'local',
    transport: 'acp',
autoEnabled: true,
mode: 'auto',
    cwd: '/tmp/demo',
    model: 'gpt-5-codex',
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
    approvalSource: 'hybrid',
    status: 'completed',
    backendSessionId: 'sess_codex_123',
  })
})

test('builds reusable LinX session control-plane metadata', () => {
  const state = buildLinxSessionControlState({
    autoEnabled: true,
    symphonyEnabled: true,
    updatedAt: '2026-04-01T00:00:00.000Z',
    updatedBy: 'cli',
  })

  expect(state).toEqual({
    autoEnabled: true,
    symphonyEnabled: true,
    updatedAt: '2026-04-01T00:00:00.000Z',
    updatedBy: 'cli',
  })
  expect(buildLinxSessionControlMetadata({
    autoEnabled: false,
    symphonyEnabled: true,
    updatedAt: '2026-04-01T00:00:01.000Z',
    updatedBy: 'app',
  })).toEqual({
    controlPlane: {
      linxSession: {
        autoEnabled: false,
        symphonyEnabled: true,
        updatedAt: '2026-04-01T00:00:01.000Z',
        updatedBy: 'app',
      },
    },
  })
  expect(mergeLinxSessionControlMetadata({
    runtime: 'pi',
    controlPlane: {
      other: { keep: true },
      linxSession: {
        autoEnabled: false,
        updatedAt: '2026-03-01T00:00:00.000Z',
      },
    },
  }, state)).toEqual({
    runtime: 'pi',
    controlPlane: {
      other: { keep: true },
      linxSession: {
        autoEnabled: true,
        symphonyEnabled: true,
        updatedAt: '2026-04-01T00:00:00.000Z',
        updatedBy: 'cli',
      },
    },
  })
  expect(readLinxSessionControlMetadata({
    controlPlane: {
      linxSession: {
        autoEnabled: false,
        symphonyEnabled: true,
        updatedAt: '2026-05-21T00:00:00.000Z',
        updatedBy: 'app',
      },
    },
  })).toEqual({
    autoEnabled: false,
    symphonyEnabled: true,
    updatedAt: '2026-05-21T00:00:00.000Z',
    updatedBy: 'app',
  })
  expect(resolveLinxSessionAutoEnabled({
    controlPlane: {
      linxSession: {
        autoEnabled: true,
        symphonyEnabled: true,
        updatedAt: '2026-05-21T00:00:00.000Z',
      },
    },
  })).toBe(true)
  expect(resolveLinxSessionSymphonyEnabled({
    controlPlane: {
      linxSession: {
        symphonyEnabled: true,
        updatedAt: '2026-05-21T00:00:00.000Z',
      },
    },
  })).toBe(true)
  expect(resolveLinxSessionAutoEnabled({})).toBe(null)
  expect(resolveLinxSessionSymphonyEnabled({})).toBe(null)
})

test('builds structured transcript messages from archived auto-mode events', () => {
  expect(buildAutoModeTranscriptMessages([
    {
      timestamp: '2026-03-18T00:00:00.000Z',
      stream: 'system',
      line: JSON.stringify({ type: 'user.turn', text: 'inspect workspace' }),
      events: [],
    },
    {
      timestamp: '2026-03-18T00:00:01.000Z',
      stream: 'stdout',
      line: JSON.stringify({ type: 'session/update' }),
      events: [{ type: 'assistant.delta', text: 'I found ' }],
    },
    {
      timestamp: '2026-03-18T00:00:02.000Z',
      stream: 'stdout',
      line: JSON.stringify({ type: 'session/update' }),
      events: [{ type: 'assistant.delta', text: 'two issues.' }],
    },
    {
      timestamp: '2026-03-18T00:00:03.000Z',
      stream: 'stdout',
      line: JSON.stringify({ type: 'session/update' }),
      events: [{ type: 'assistant.done' }],
    },
    {
      timestamp: '2026-03-18T00:00:04.000Z',
      stream: 'stdout',
      line: JSON.stringify({ type: 'tool' }),
      events: [{ type: 'tool.call', name: 'bash', arguments: { command: 'pwd' } }],
    },
    {
      timestamp: '2026-03-18T00:00:05.000Z',
      stream: 'stderr',
      line: 'permission denied',
      events: [],
    },
  ])).toEqual([
    {
      role: 'user',
      source: 'user',
      content: 'inspect workspace',
      createdAt: '2026-03-18T00:00:00.000Z',
    },
    {
      role: 'assistant',
      source: 'primary-agent',
      content: 'I found two issues.',
      createdAt: '2026-03-18T00:00:01.000Z',
    },
    {
      role: 'system',
      source: 'tool',
      content: '[tool] bash {"command":"pwd"}',
      createdAt: '2026-03-18T00:00:04.000Z',
    },
    {
      role: 'system',
      source: 'system',
      content: 'stderr> permission denied',
      createdAt: '2026-03-18T00:00:05.000Z',
    },
  ])
})

test('normalizes requested credential source and decides when cloud fallback should be probed', () => {
  expect(normalizeAutoModeCredentialSource()).toBe('cloud')
  expect(normalizeAutoModeCredentialSource('local')).toBe('local')
  expect(shouldAttemptCloudCredentialProbe('local', { state: 'unauthenticated' })).toBe(false)
  expect(shouldAttemptCloudCredentialProbe('auto', { state: 'authenticated' })).toBe(true)
  expect(shouldAttemptCloudCredentialProbe('auto', { state: 'unauthenticated' })).toBe(true)
  expect(shouldAttemptCloudCredentialProbe('cloud', { state: 'unknown' })).toBe(true)
})

test('resolves explicit local credential source from local backend auth status', () => {
  expect(
    resolveAutoModeCredentialSourceResolution({
      requestedSource: 'local',
      localAuthStatus: { state: 'authenticated' },
    }),
  ).toEqual({
    requestedSource: 'local',
    resolvedSource: 'local',
    authStatus: { state: 'authenticated' },
  })
})

test('resolves legacy credential source names to cloud when Pod credential exists', () => {
  expect(
    resolveAutoModeCredentialSourceResolution({
      requestedSource: 'auto',
      localAuthStatus: {
        state: 'unauthenticated',
        message: 'Claude Code is not authenticated. Run `claude auth login` and try again.',
      },
      cloudCredentialProbe: { status: 'available' },
    }),
  ).toEqual({
    requestedSource: 'cloud',
    resolvedSource: 'cloud',
    authStatus: { state: 'authenticated' },
  })
})

test('fails credential resolution when Pod credential is unavailable', () => {
  expect(
    resolveAutoModeCredentialSourceResolution({
      requestedSource: 'auto',
      localAuthStatus: {
        state: 'unauthenticated',
        message: 'Claude Code is not authenticated. Run `claude auth login` and try again.',
      },
      cloudCredentialProbe: {
        status: 'error',
        message: 'LinX cloud credential source is not connected yet. Run `linx login` first.',
      },
    }),
  ).toEqual({
    requestedSource: 'cloud',
    authStatus: {
      state: 'unauthenticated',
      message: 'LinX cloud credential source is not connected yet. Run `linx login` first.',
    },
    error: 'LinX cloud credential source is not connected yet. Run `linx login` first.',
  })
})

test('normalizes backend auth messages and login commands', () => {
  expect(getAutoModeAuthLoginCommand('claude')).toBe('claude auth login')
  expect(getAutoModeAuthLoginCommand('codex')).toBe('codex login')
  expect(getAutoModeAuthLoginCommand('codebuddy')).toBe(null)
  expect(formatAutoModeBackendAuthMessage('codebuddy')).toBe(
    'CodeBuddy Code is not authenticated. Open `codebuddy` and complete login first.',
  )
})

test('parses claude auth status json and detects auth failure lines', () => {
  expect(
    parseAutoModeClaudeAuthStatus(JSON.stringify({ loggedIn: false, authMethod: 'none' })),
  ).toEqual({
    state: 'unauthenticated',
    message: 'Claude Code is not authenticated. Run `claude auth login` and try again.',
  })

  expect(looksLikeAutoModeAuthFailureText('Not logged in · Please sign in first')).toBe(true)

  expect(
    detectAutoModeAuthFailure('claude', JSON.stringify({
      error: 'authentication_failed',
      message: {
        content: [{ type: 'text', text: 'Not logged in · Please run /login' }],
      },
    })),
  ).toEqual({
    message:
      'Claude Code is not authenticated. Run `claude auth login` and try again. Native message: Not logged in · Please run /login',
  })

  expect(
    detectAutoModeAuthFailure('codebuddy', JSON.stringify({
      type: 'result',
      is_error: true,
      result: 'Not logged in · Please sign in first',
    })),
  ).toEqual({
    message:
      'CodeBuddy Code is not authenticated. Open `codebuddy` and complete login first. Native message: Not logged in · Please sign in first',
  })
})

test('extracts session ids and normalizes generic json protocol lines', () => {
  expect(
    extractAutoModeSessionIdFromJsonLine('{"type":"system","subtype":"init","session_id":"sess_123"}'),
  ).toBe('sess_123')

  expect(
    parseAutoModeJsonProtocolLine(JSON.stringify({
      type: 'tool_permission',
      message: 'Run yarn test?',
      toolName: 'Bash',
      arguments: { command: 'yarn test' },
    })),
  ).toEqual([
    {
      type: 'approval.required',
      message: 'Run yarn test?',
      raw: {
        type: 'tool_permission',
        message: 'Run yarn test?',
        toolName: 'Bash',
        arguments: { command: 'yarn test' },
      },
    },
    {
      type: 'tool.call',
      name: 'Bash',
      arguments: { command: 'yarn test' },
      raw: {
        type: 'tool_permission',
        message: 'Run yarn test?',
        toolName: 'Bash',
        arguments: { command: 'yarn test' },
      },
    },
  ])

  expect(
    parseAutoModeJsonProtocolLine(JSON.stringify({
      type: 'request_user_input',
      questions: [
        {
          header: 'Runtime',
          question: 'Choose runtime',
          options: [{ label: 'Local' }, { label: 'Cloud', description: 'Use Pod credential' }],
        },
      ],
    })),
  ).toEqual([
    {
      type: 'input.required',
      message: 'Input required',
      request: {
        kind: 'user-input',
        message: 'Input required',
        questions: [
          {
            id: 'question-1',
            header: 'Runtime',
            question: 'Choose runtime',
            options: [{ label: 'Local' }, { label: 'Cloud', description: 'Use Pod credential' }],
          },
        ],
        raw: {
          type: 'request_user_input',
          questions: [
            {
              header: 'Runtime',
              question: 'Choose runtime',
              options: [{ label: 'Local' }, { label: 'Cloud', description: 'Use Pod credential' }],
            },
          ],
        },
      },
      raw: {
        type: 'request_user_input',
        questions: [
          {
            header: 'Runtime',
            question: 'Choose runtime',
            options: [{ label: 'Local' }, { label: 'Cloud', description: 'Use Pod credential' }],
          },
        ],
      },
    },
  ])
})

test('normalizes auto-mode interaction requests and response mapping', () => {
  expect(isTrustedAutoModeCommand('rg --files')).toBe(true)
  expect(isTrustedAutoModeCommand('rm -rf .')).toBe(false)

  expect(
    normalizeAutoModeUserInputQuestion({
      header: 'Mode',
      question: 'Choose mode',
      options: [{ label: 'Manual' }, { label: 'Smart', description: 'Auto-resolve low-risk actions' }],
    }, 'fallback-question'),
  ).toEqual({
    id: 'fallback-question',
    header: 'Mode',
    question: 'Choose mode',
    options: [{ label: 'Manual' }, { label: 'Smart', description: 'Auto-resolve low-risk actions' }],
  })

  expect(resolveAutoModeQuestionAnswer({
    id: 'mode',
    header: 'Mode',
    question: 'Choose mode',
    options: [{ label: 'Manual' }, { label: 'Smart' }],
  }, '2')).toEqual(['Smart'])

  const commandRequest = normalizeCodexAppServerInteractionRequest({
    method: 'item/commandExecution/requestApproval',
    params: {
      command: 'pwd',
      cwd: '/tmp/demo',
    },
  })

  if (!commandRequest || commandRequest.kind !== 'command-approval') {
    throw new Error('Expected command approval request')
  }

  expect(commandRequest).toEqual({
    kind: 'command-approval',
    message: 'pwd',
    command: 'pwd',
    cwd: '/tmp/demo',
    raw: {
      method: 'item/commandExecution/requestApproval',
      params: {
        command: 'pwd',
        cwd: '/tmp/demo',
      },
    },
  })

  expect(resolveAutoModeInteractionAutoResponse({
    mode: 'off',
    request: commandRequest,
  })).toBe(null)
  expect(resolveAutoModeAutoApprovalDecision({
    mode: 'off',
    request: commandRequest,
  })).toBe(null)
  expect(resolveAutoModeInteractionAutoResponse({
    mode: 'auto',
    autoEnabled: true,
    request: commandRequest,
  })).toEqual({ decision: 'acceptForSession' })

  expect(resolveAutoModeInteractionAutoResponse({
    mode: 'auto',
    autoEnabled: false,
    request: commandRequest,
  })).toBe(null)

  expect(resolveAutoModeInteractionAutoResponse({
    mode: 'off',
    autoEnabled: true,
    request: commandRequest,
  })).toEqual({ decision: 'acceptForSession' })

  expect(buildCodexApprovalResponse(commandRequest, 'accept_for_session')).toEqual({
    decision: 'acceptForSession',
  })

  const permissionsRequest = normalizeCodexAppServerInteractionRequest({
    method: 'item/permissions/requestApproval',
    params: {
      reason: 'Need network',
      permissions: { network: true },
    },
  })

  if (!permissionsRequest || permissionsRequest.kind !== 'permissions-approval') {
    throw new Error('Expected permissions approval request')
  }

  expect(resolveAutoModeInteractionAutoResponse({
    mode: 'auto',
    autoEnabled: true,
    request: permissionsRequest,
  })).toEqual({
    permissions: { network: true },
    scope: 'session',
  })
  expect(resolveAutoModeAutoApprovalDecision({
    mode: 'auto',
    autoEnabled: true,
    request: permissionsRequest,
  })).toBe('accept_for_session')

  expect(buildCodexApprovalResponse(permissionsRequest, 'decline')).toEqual({
    permissions: {},
    scope: 'turn',
  })

  const codexApproval = normalizeCodexAppServerInteractionRequest({
    method: 'applyPatchApproval',
    params: {},
  })

  if (!codexApproval || codexApproval.kind !== 'codex-approval') {
    throw new Error('Expected codex approval request')
  }

  expect(buildCodexApprovalResponse(codexApproval, 'cancel')).toEqual({
    decision: 'abort',
  })

  const userInput = normalizeCodexAppServerInteractionRequest({
    method: 'item/tool/requestUserInput',
    params: {
      questions: [
        {
          id: 'runtime',
          header: 'Runtime',
          question: 'Choose runtime',
          options: [{ label: 'local' }, { label: 'cloud' }],
        },
      ],
    },
  })

  if (!userInput || userInput.kind !== 'user-input') {
    throw new Error('Expected user input request')
  }

  expect(userInput).toEqual({
    kind: 'user-input',
    message: 'Codex requests structured user input',
    questions: [
      {
        id: 'runtime',
        header: 'Runtime',
        question: 'Choose runtime',
        options: [{ label: 'local' }, { label: 'cloud' }],
      },
    ],
    raw: {
      method: 'item/tool/requestUserInput',
      params: {
        questions: [
          {
            id: 'runtime',
            header: 'Runtime',
            question: 'Choose runtime',
            options: [{ label: 'local' }, { label: 'cloud' }],
          },
        ],
      },
    },
  })

  expect(buildCodexUserInputResponse({
    runtime: { answers: ['cloud'] },
  })).toEqual({
    answers: {
      runtime: { answers: ['cloud'] },
    },
  })

  expect(buildAutoModeUserInputResponse({
    runtime: { answers: ['cloud'] },
  })).toEqual({
    answers: {
      runtime: { answers: ['cloud'] },
    },
  })
})

test('normalizes codex app-server notifications and server requests', () => {
  expect(
    normalizeCodexAppServerNotification({
      method: 'thread/started',
      params: {
        thread: {
          id: 'thread_1',
        },
      },
    }),
  ).toEqual([
    {
      type: 'session.note',
      message: 'Thread started',
      raw: {
        method: 'thread/started',
        params: {
          thread: {
            id: 'thread_1',
          },
        },
      },
    },
  ])

  expect(
    normalizeCodexAppServerNotification({
      method: 'thread/status/changed',
      params: {
        threadId: 'thread_1',
        status: {
          type: 'active',
        },
      },
    }),
  ).toEqual([
    {
      type: 'session.note',
      message: 'Thread status · active',
      raw: {
        method: 'thread/status/changed',
        params: {
          threadId: 'thread_1',
          status: {
            type: 'active',
          },
        },
      },
    },
  ])

  expect(
    normalizeCodexAppServerNotification({
      method: 'turn/started',
      params: {
        threadId: 'thread_1',
        turn: {
          id: 'turn_1',
        },
      },
    }),
  ).toEqual([
    {
      type: 'session.note',
      message: 'Turn started',
      raw: {
        method: 'turn/started',
        params: {
          threadId: 'thread_1',
          turn: {
            id: 'turn_1',
          },
        },
      },
    },
  ])

  expect(
    normalizeCodexAppServerNotification({
      method: 'item/agentMessage/delta',
      params: { delta: 'hello' },
    }),
  ).toEqual([
    {
      type: 'assistant.delta',
      text: 'hello',
      raw: {
        method: 'item/agentMessage/delta',
        params: { delta: 'hello' },
      },
    },
  ])

  expect(
    normalizeCodexAppServerNotification({
      method: 'item/started',
      params: {
        item: {
          type: 'userMessage',
          id: 'user_1',
          content: [
            { type: 'text', text: 'reply with exactly hi' },
          ],
        },
      },
    }),
  ).toEqual([
    {
      type: 'session.note',
      message: 'userMessage · reply with exactly hi',
      raw: {
        method: 'item/started',
        params: {
          item: {
            type: 'userMessage',
            id: 'user_1',
            content: [
              { type: 'text', text: 'reply with exactly hi' },
            ],
          },
        },
      },
    },
  ])

  expect(
    normalizeCodexAppServerNotification({
      method: 'item/started',
      params: {
        item: {
          type: 'commandExecution',
          command: 'pwd',
          cwd: '/tmp/demo',
          status: 'running',
        },
      },
    }),
  ).toEqual([
    {
      type: 'tool.call',
      name: 'commandExecution',
      arguments: {
        command: 'pwd',
        cwd: '/tmp/demo',
        status: 'running',
      },
      raw: {
        method: 'item/started',
        params: {
          item: {
            type: 'commandExecution',
            command: 'pwd',
            cwd: '/tmp/demo',
            status: 'running',
          },
        },
      },
    },
  ])

  expect(
    normalizeCodexAppServerRequest({
      method: 'item/commandExecution/requestApproval',
      params: {
        command: 'yarn test',
        cwd: '/tmp/demo',
      },
    }),
  ).toEqual([
    {
      type: 'approval.required',
      message: 'yarn test',
      request: {
        kind: 'command-approval',
        message: 'yarn test',
        command: 'yarn test',
        cwd: '/tmp/demo',
        raw: {
          method: 'item/commandExecution/requestApproval',
          params: {
            command: 'yarn test',
            cwd: '/tmp/demo',
          },
        },
      },
      raw: {
        method: 'item/commandExecution/requestApproval',
        params: {
          command: 'yarn test',
          cwd: '/tmp/demo',
        },
      },
    },
    {
      type: 'tool.call',
      name: 'commandExecution',
      arguments: {
        command: 'yarn test',
        cwd: '/tmp/demo',
      },
      raw: {
        method: 'item/commandExecution/requestApproval',
        params: {
          command: 'yarn test',
          cwd: '/tmp/demo',
        },
      },
    },
  ])

  expect(
    normalizeCodexAppServerRequest({
      method: 'item/tool/requestUserInput',
      params: {
        questions: [
          {
            header: 'Runtime',
            question: 'Choose runtime',
            options: [{ label: 'local' }, { label: 'cloud' }],
          },
        ],
      },
    }),
  ).toEqual([
    {
      type: 'input.required',
      message: 'Codex requests structured user input',
      request: {
        kind: 'user-input',
        message: 'Codex requests structured user input',
        questions: [
          {
            id: 'question-1',
            header: 'Runtime',
            question: 'Choose runtime',
            options: [{ label: 'local' }, { label: 'cloud' }],
          },
        ],
        raw: {
          method: 'item/tool/requestUserInput',
          params: {
            questions: [
              {
                header: 'Runtime',
                question: 'Choose runtime',
                options: [{ label: 'local' }, { label: 'cloud' }],
              },
            ],
          },
        },
      },
      raw: {
        method: 'item/tool/requestUserInput',
        params: {
          questions: [
            {
              header: 'Runtime',
              question: 'Choose runtime',
              options: [{ label: 'local' }, { label: 'cloud' }],
            },
          ],
        },
      },
    },
  ])
})

test('normalizes ACP permission requests, updates, and permission responses', () => {
  const acpRequest = normalizeAcpInteractionRequest({
    method: 'session/request_permission',
    params: {
      sessionId: 'sess_123',
      toolCall: {
        toolCallId: 'tool_1',
        title: 'Run shell command',
        kind: 'execute',
        rawInput: {
          command: 'pwd',
          cwd: '/tmp/demo',
        },
      },
      timeoutSeconds: 45,
      expiresAt: '2026-03-18T00:00:45.000Z',
      options: [
        { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'allow_always', name: 'Allow always', kind: 'allow_always', description: 'Trust for this session' },
        { optionId: 'reject_once', name: 'Reject once', kind: 'reject_once' },
      ],
    },
  })

  if (!acpRequest || acpRequest.kind !== 'command-approval') {
    throw new Error('Expected ACP command approval request')
  }

  expect(acpRequest).toEqual({
    kind: 'command-approval',
    message: 'pwd',
    command: 'pwd',
    cwd: '/tmp/demo',
    approvalOptions: [
      { optionId: 'allow_once', label: 'Allow once', kind: 'allow_once' },
      { optionId: 'allow_always', label: 'Allow always', kind: 'allow_always', description: 'Trust for this session' },
      { optionId: 'reject_once', label: 'Reject once', kind: 'reject_once' },
    ],
    timeoutMs: 45000,
    expiresAt: '2026-03-18T00:00:45.000Z',
    raw: {
      method: 'session/request_permission',
      params: {
        sessionId: 'sess_123',
        toolCall: {
          toolCallId: 'tool_1',
          title: 'Run shell command',
          kind: 'execute',
          rawInput: {
            command: 'pwd',
            cwd: '/tmp/demo',
          },
        },
        timeoutSeconds: 45,
        expiresAt: '2026-03-18T00:00:45.000Z',
        options: [
          { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'allow_always', name: 'Allow always', kind: 'allow_always', description: 'Trust for this session' },
          { optionId: 'reject_once', name: 'Reject once', kind: 'reject_once' },
        ],
      },
    },
  })

  const singleOptionPermissionMessage = {
    method: 'session/request_permission',
    params: {
      sessionId: 'sess_123',
      toolCall: {
        toolCallId: 'tool_1',
        title: 'Run shell command',
        kind: 'execute',
        rawInput: {
          command: 'pwd',
          cwd: '/tmp/demo',
        },
      },
      options: [
        { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
      ],
    },
  }

  expect(normalizeAcpRequest(singleOptionPermissionMessage)).toEqual([
    {
      type: 'approval.required',
      message: 'pwd',
      request: {
        kind: 'command-approval',
        message: 'pwd',
        command: 'pwd',
        cwd: '/tmp/demo',
        approvalOptions: [
          { optionId: 'allow_once', label: 'Allow once', kind: 'allow_once' },
        ],
        raw: singleOptionPermissionMessage,
      },
      raw: singleOptionPermissionMessage,
    },
    {
      type: 'tool.call',
      name: 'commandExecution',
      arguments: {
        command: 'pwd',
        cwd: '/tmp/demo',
      },
      raw: singleOptionPermissionMessage,
    },
  ])

  expect(buildAcpPermissionResponse(acpRequest, 'accept_for_session')).toEqual({
    outcome: {
      outcome: 'selected',
      optionId: 'allow_always',
    },
  })

  expect(buildAcpPermissionResponse(acpRequest, 'cancel')).toEqual({
    outcome: {
      outcome: 'cancelled',
    },
  })

  expect(normalizeAcpSessionNotification({
    method: 'session/update',
    params: {
      sessionId: 'sess_123',
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text: 'hello from acp',
        },
      },
    },
  })).toEqual([
    {
      type: 'assistant.delta',
      text: 'hello from acp',
      raw: {
        method: 'session/update',
        params: {
          sessionId: 'sess_123',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: {
              type: 'text',
              text: 'hello from acp',
            },
          },
        },
      },
    },
  ])

  expect(normalizeAcpSessionNotification({
    method: 'session/update',
    params: {
      sessionId: 'sess_123',
      update: {
        sessionUpdate: 'available_commands_update',
        availableCommands: [
          {
            name: 'review',
            description: 'Review current changes',
          },
        ],
      },
    },
  })).toEqual([])

  expect(normalizeAcpSessionNotification({
    method: 'session/update',
    params: {
      sessionId: 'sess_123',
      update: {
        sessionUpdate: 'usage_update',
        used: 12857,
        size: 950000,
      },
    },
  })).toEqual([])

  expect(normalizeAcpSessionNotification({
    method: 'session/update',
    params: {
      sessionId: 'sess_123',
      update: {
        sessionUpdate: 'agent_thought_chunk',
        content: {
          type: 'text',
          text: 'internal reasoning',
        },
      },
    },
  })).toEqual([])

  expect(normalizeAcpSessionNotification({
    method: 'session/update',
    params: {
      sessionId: 'sess_123',
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: 'tool_1',
        title: 'Read package.json',
        kind: 'read',
        rawInput: {
          path: 'package.json',
        },
      },
    },
  })).toEqual([
    {
      type: 'tool.call',
      name: 'Read package.json',
      arguments: {
        path: 'package.json',
      },
      raw: {
        method: 'session/update',
        params: {
          sessionId: 'sess_123',
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: 'tool_1',
            title: 'Read package.json',
            kind: 'read',
            rawInput: {
              path: 'package.json',
            },
          },
        },
      },
    },
  ])

  expect(normalizeAcpSessionNotification({
    method: 'session/update',
    params: {
      sessionId: 'sess_123',
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool_1',
        status: 'completed',
        title: 'Read package.json',
      },
    },
  })).toEqual([
    {
      type: 'tool.call',
      name: 'Read package.json',
      raw: {
        method: 'session/update',
        params: {
          sessionId: 'sess_123',
          update: {
            sessionUpdate: 'tool_call_update',
            toolCallId: 'tool_1',
            status: 'completed',
            title: 'Read package.json',
          },
        },
      },
    },
  ])
})

test('parses AI secretary approval and user-input recommendations conservatively', () => {
  const approvalRequest = normalizeAcpInteractionRequest({
    method: 'session/request_permission',
    params: {
      toolCall: {
        toolCallId: 'tool_1',
        title: 'Run shell command',
        kind: 'execute',
        rawInput: {
          command: 'pwd',
          cwd: '/tmp/demo',
        },
      },
      options: [
        { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'allow_always', name: 'Allow always', kind: 'allow_always' },
      ],
    },
  })

  if (!approvalRequest || approvalRequest.kind !== 'command-approval') {
    throw new Error('Expected ACP command approval request')
  }

  expect(parseAutoModeSecretaryRecommendation(JSON.stringify({
    can_auto_decide: true,
    decision: 'allow_always',
    confidence: 92,
    reason: 'safe read-only command',
    reaction_window_ms: 1200,
  }), {
    autoEnabled: true,
    mode: 'off',
    request: approvalRequest,
  })).toMatchObject({
    kind: 'command-approval',
    canAutoDecide: true,
    decision: 'accept',
    confidence: 0.92,
    reason: 'safe read-only command',
    reactionWindowMs: computeAutoModeSecretaryReactionWindowMs(0.92),
    source: 'model',
  })
  expect(computeAutoModeSecretaryReactionWindowMs(0)).toBe(60000)
  expect(computeAutoModeSecretaryReactionWindowMs(1)).toBe(5000)
  expect(createFallbackAutoModeSecretaryRecommendation({
    mode: 'off',
    autoEnabled: true,
    request: approvalRequest,
  })).toMatchObject({
    kind: 'command-approval',
    decision: 'accept',
    source: 'fallback',
  })
  expect(autoModeApprovalDecisionLabel('accept_for_session')).toBe('Grant')

  const inputRequest = normalizeAcpInteractionRequest({
    method: 'session/request_user_input',
    params: {
      questions: [{
        id: 'runtime',
        header: 'Runtime',
        question: 'Choose runtime',
        options: [{ label: 'local' }, { label: 'cloud' }],
      }],
    },
  })

  if (!inputRequest || inputRequest.kind !== 'user-input') {
    throw new Error('Expected ACP user input request')
  }

  const recommendation = parseAutoModeSecretaryRecommendation('```json\n{"canAnswer":true,"answers":{"runtime":{"answers":["cloud"]}},"confidence":0.8,"reason":"Pod credentials are available"}\n```', {
    autoEnabled: true,
    mode: 'off',
    request: inputRequest,
  })

  expect(recommendation).toMatchObject({
    kind: 'user-input',
    canAutoDecide: true,
    answers: {
      runtime: { answers: ['cloud'] },
    },
    source: 'model',
  })
  if (recommendation?.kind !== 'user-input' || !recommendation.answers) {
    throw new Error('Expected user input answers')
  }
  expect(autoModeUserInputAnswersSummary(recommendation.answers)).toBe('runtime: cloud')

  expect(parseAutoModeGrantCoverageDecision(JSON.stringify({
    applies: true,
    confidence_score: 0.86,
    rationale: 'The request stays inside the maintained read-only session grant.',
  }))).toEqual({
    covers: true,
    confidence: 0.86,
    reason: 'The request stays inside the maintained read-only session grant.',
    source: 'model',
  })
})
