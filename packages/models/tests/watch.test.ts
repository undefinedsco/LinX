import { describe, expect, it } from 'vitest'
import {
  buildAcpPermissionResponse,
  buildWatchThreadMetadata,
  buildWatchTranscriptMessages,
  buildCodexApprovalResponse,
  buildCodexUserInputResponse,
  buildWatchUserInputResponse,
  createWatchSessionId,
  detectWatchAuthFailure,
  extractWatchSessionIdFromJsonLine,
  formatWatchBackendAuthMessage,
  getWatchAuthLoginCommand,
  isTrustedWatchCommand,
  normalizeAcpInteractionRequest,
  normalizeAcpRequest,
  normalizeAcpSessionNotification,
  normalizeCodexAppServerInteractionRequest,
  normalizeCodexAppServerNotification,
  normalizeCodexAppServerRequest,
  looksLikeWatchAuthFailureText,
  normalizeWatchCredentialSource,
  normalizeWatchUserInputQuestion,
  parseWatchClaudeAuthStatus,
  parseWatchJsonProtocolLine,
  resolveWatchAutoApprovalDecision,
  resolveWatchInteractionAutoResponse,
  resolveWatchQuestionAnswer,
  resolveWatchCredentialSourceResolution,
  shouldAttemptCloudCredentialProbe,
  getWatchArchiveRelativePaths,
  WATCH_EVENTS_FILE_NAME,
  WATCH_HOME_DIRNAME,
  WATCH_SESSIONS_DIRNAME,
  WATCH_SESSION_FILE_NAME,
} from '../src/watch'

describe('watch shared core', () => {
  it('creates stable watch session ids from timestamp and random id', () => {
    expect(
      createWatchSessionId({
        now: new Date('2026-03-16T00:00:00.000Z'),
        randomId: 'abcd1234efgh',
      }),
    ).toBe('watch_2026-03-16T00-00-00-000Z_abcd1234')
  })

  it('returns the shared archive file layout for a session id', () => {
    expect(WATCH_HOME_DIRNAME).toBe('watch')
    expect(WATCH_SESSIONS_DIRNAME).toBe('sessions')
    expect(WATCH_SESSION_FILE_NAME).toBe('session.json')
    expect(WATCH_EVENTS_FILE_NAME).toBe('events.jsonl')

    expect(getWatchArchiveRelativePaths('watch_demo_1234')).toEqual({
      sessionDir: 'sessions/watch_demo_1234',
      sessionFile: 'sessions/watch_demo_1234/session.json',
      eventsFile: 'sessions/watch_demo_1234/events.jsonl',
    })
  })

  it('maps watch runtime context into generic thread metadata instead of a parallel session type', () => {
    expect(buildWatchThreadMetadata({
      id: 'watch_demo_1234',
      backend: 'codex',
      runtime: 'local',
      transport: 'acp',
      mode: 'smart',
      cwd: '/tmp/demo',
      model: 'gpt-5-codex',
      prompt: 'fix failing tests',
      passthroughArgs: ['--dangerously-bypass-approvals-and-sandbox'],
      credentialSource: 'cloud',
      resolvedCredentialSource: 'cloud',
      approvalSource: 'remote',
      command: 'codex-acp',
      args: [],
      status: 'completed',
      startedAt: '2026-03-18T00:00:00.000Z',
      endedAt: '2026-03-18T00:01:00.000Z',
      archiveDir: '/tmp/.linx/watch/sessions/watch_demo_1234',
      eventsFile: '/tmp/.linx/watch/sessions/watch_demo_1234/events.jsonl',
      backendSessionId: 'sess_codex_123',
    })).toEqual({
      kind: 'watch',
      delegatedTo: 'secretary',
      sessionId: 'watch_demo_1234',
      backend: 'codex',
      runtime: 'local',
      transport: 'acp',
      mode: 'smart',
      cwd: '/tmp/demo',
      model: 'gpt-5-codex',
      credentialSource: 'cloud',
      resolvedCredentialSource: 'cloud',
      approvalSource: 'remote',
      status: 'completed',
      backendSessionId: 'sess_codex_123',
    })
  })

  it('builds structured transcript messages from archived watch events', () => {
    expect(buildWatchTranscriptMessages([
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
        content: 'inspect workspace',
        createdAt: '2026-03-18T00:00:00.000Z',
      },
      {
        role: 'assistant',
        content: 'I found two issues.',
        createdAt: '2026-03-18T00:00:01.000Z',
      },
      {
        role: 'system',
        content: '[tool] bash {"command":"pwd"}',
        createdAt: '2026-03-18T00:00:04.000Z',
      },
      {
        role: 'system',
        content: 'stderr> permission denied',
        createdAt: '2026-03-18T00:00:05.000Z',
      },
    ])
  })

  it('normalizes requested credential source and decides when cloud fallback should be probed', () => {
    expect(normalizeWatchCredentialSource()).toBe('auto')
    expect(normalizeWatchCredentialSource('local')).toBe('local')
    expect(shouldAttemptCloudCredentialProbe('local', { state: 'unauthenticated' })).toBe(false)
    expect(shouldAttemptCloudCredentialProbe('auto', { state: 'authenticated' })).toBe(false)
    expect(shouldAttemptCloudCredentialProbe('auto', { state: 'unauthenticated' })).toBe(true)
    expect(shouldAttemptCloudCredentialProbe('cloud', { state: 'unknown' })).toBe(true)
  })

  it('resolves auto credential source to cloud when local auth is unavailable but cloud credential exists', () => {
    expect(
      resolveWatchCredentialSourceResolution({
        requestedSource: 'auto',
        localAuthStatus: {
          state: 'unauthenticated',
          message: 'Claude Code is not authenticated. Run `claude auth login` and try again.',
        },
        cloudCredentialProbe: { status: 'available' },
      }),
    ).toEqual({
      requestedSource: 'auto',
      resolvedSource: 'cloud',
      authStatus: { state: 'authenticated' },
    })
  })

  it('preserves local execution for auto source when cloud fallback is unavailable', () => {
    expect(
      resolveWatchCredentialSourceResolution({
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
      requestedSource: 'auto',
      resolvedSource: 'local',
      authStatus: {
        state: 'unauthenticated',
        message:
          'Claude Code is not authenticated. Run `claude auth login` and try again. Cloud credential fallback unavailable: LinX cloud credential source is not connected yet. Run `linx login` first.',
      },
    })
  })

  it('normalizes backend auth messages and login commands', () => {
    expect(getWatchAuthLoginCommand('claude')).toBe('claude auth login')
    expect(getWatchAuthLoginCommand('codex')).toBe('codex login')
    expect(getWatchAuthLoginCommand('codebuddy')).toBe(null)
    expect(formatWatchBackendAuthMessage('codebuddy')).toBe(
      'CodeBuddy Code is not authenticated. Open `codebuddy` and complete login first.',
    )
  })

  it('parses claude auth status json and detects auth failure lines', () => {
    expect(
      parseWatchClaudeAuthStatus(JSON.stringify({ loggedIn: false, authMethod: 'none' })),
    ).toEqual({
      state: 'unauthenticated',
      message: 'Claude Code is not authenticated. Run `claude auth login` and try again.',
    })

    expect(looksLikeWatchAuthFailureText('Not logged in · Please sign in first')).toBe(true)

    expect(
      detectWatchAuthFailure('claude', JSON.stringify({
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
      detectWatchAuthFailure('codebuddy', JSON.stringify({
        type: 'result',
        is_error: true,
        result: 'Not logged in · Please sign in first',
      })),
    ).toEqual({
      message:
        'CodeBuddy Code is not authenticated. Open `codebuddy` and complete login first. Native message: Not logged in · Please sign in first',
    })
  })

  it('extracts session ids and normalizes generic json protocol lines', () => {
    expect(
      extractWatchSessionIdFromJsonLine('{"type":"system","subtype":"init","session_id":"sess_123"}'),
    ).toBe('sess_123')

    expect(
      parseWatchJsonProtocolLine(JSON.stringify({
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
      parseWatchJsonProtocolLine(JSON.stringify({
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

  it('normalizes watch interaction requests and response mapping', () => {
    expect(isTrustedWatchCommand('rg --files')).toBe(true)
    expect(isTrustedWatchCommand('rm -rf .')).toBe(false)

    expect(
      normalizeWatchUserInputQuestion({
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

    expect(resolveWatchQuestionAnswer({
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

    expect(resolveWatchInteractionAutoResponse({
      mode: 'smart',
      request: commandRequest,
    })).toEqual({ decision: 'accept' })
    expect(resolveWatchAutoApprovalDecision({
      mode: 'smart',
      request: commandRequest,
    })).toBe('accept')

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

    expect(resolveWatchInteractionAutoResponse({
      mode: 'auto',
      request: permissionsRequest,
    })).toEqual({
      permissions: { network: true },
      scope: 'session',
    })
    expect(resolveWatchAutoApprovalDecision({
      mode: 'auto',
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

    expect(buildWatchUserInputResponse({
      runtime: { answers: ['cloud'] },
    })).toEqual({
      answers: {
        runtime: { answers: ['cloud'] },
      },
    })
  })

  it('normalizes codex app-server notifications and server requests', () => {
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

  it('normalizes ACP permission requests, updates, and permission responses', () => {
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
        options: [
          { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
          { optionId: 'allow_always', name: 'Allow always', kind: 'allow_always' },
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
          options: [
            { optionId: 'allow_once', name: 'Allow once', kind: 'allow_once' },
            { optionId: 'allow_always', name: 'Allow always', kind: 'allow_always' },
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
          type: 'tool_call',
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
              type: 'tool_call',
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
  })
})
