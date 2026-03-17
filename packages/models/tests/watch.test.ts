import { describe, expect, it } from 'vitest'
import {
  buildCodexApprovalResponse,
  buildCodexUserInputResponse,
  createWatchSessionId,
  detectWatchAuthFailure,
  extractWatchSessionIdFromJsonLine,
  formatWatchBackendAuthMessage,
  getWatchAuthLoginCommand,
  isTrustedWatchCommand,
  normalizeCodexAppServerInteractionRequest,
  normalizeCodexAppServerNotification,
  normalizeCodexAppServerRequest,
  looksLikeWatchAuthFailureText,
  normalizeWatchCredentialSource,
  normalizeWatchUserInputQuestion,
  parseWatchClaudeAuthStatus,
  parseWatchJsonProtocolLine,
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
})
