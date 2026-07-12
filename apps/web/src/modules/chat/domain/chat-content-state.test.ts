import { describe, expect, it } from 'vitest'
import { projectChatContentState } from './chat-content-state'

const activeChat = { id: 'chat-1' }

describe('chat content state', () => {
  it.each([
    {
      name: 'welcome',
      input: {
        isAuthenticated: true,
        isLoading: true,
        error: null,
        activeChat: null,
        isSecretary: true,
        hasThread: false,
      },
      expected: { kind: 'welcome', recoverable: false },
    },
    {
      name: 'loading',
      input: {
        isAuthenticated: true,
        isLoading: true,
        error: null,
        activeChat: null,
        isSecretary: false,
      },
      expected: { kind: 'loading', recoverable: false },
    },
    {
      name: 'ready',
      input: {
        isAuthenticated: true,
        isLoading: false,
        error: null,
        activeChat,
        isSecretary: false,
        hasThread: true,
      },
      expected: { kind: 'ready', recoverable: false },
    },
    {
      name: 'forbidden',
      input: {
        isAuthenticated: true,
        isLoading: false,
        error: Object.assign(new Error('Pod read failed'), { status: 403 }),
        activeChat: null,
        isSecretary: true,
      },
      expected: { kind: 'forbidden', recoverable: true },
    },
    {
      name: 'timeout',
      input: {
        isAuthenticated: true,
        isLoading: false,
        error: Object.assign(new Error('request timed out'), { name: 'TimeoutError' }),
        activeChat,
        isSecretary: false,
      },
      expected: { kind: 'timeout', recoverable: true },
    },
    {
      name: 'not-found',
      input: {
        isAuthenticated: true,
        isLoading: false,
        error: Object.assign(new Error('HTTP 404'), { statusCode: 404 }),
        activeChat: null,
        isSecretary: false,
      },
      expected: { kind: 'not-found', recoverable: true },
    },
    {
      name: 'login-required',
      input: {
        isAuthenticated: false,
        isLoading: false,
        error: null,
        activeChat: null,
        isSecretary: false,
      },
      expected: { kind: 'login-required', recoverable: false },
    },
    {
      name: 'unavailable',
      input: {
        isAuthenticated: true,
        isLoading: false,
        error: new Error('connection reset'),
        activeChat,
        isSecretary: false,
      },
      expected: { kind: 'unavailable', recoverable: true },
    },
  ])('projects $name', ({ input, expected }) => {
    expect(projectChatContentState(input)).toMatchObject(expected)
  })

  it('projects a completed chat query with no matching row as not-found', () => {
    expect(projectChatContentState({
      isAuthenticated: true,
      isLoading: false,
      error: null,
      activeChat: null,
      isSecretary: false,
    })).toMatchObject({ kind: 'not-found' })
  })

  it('does not let thread preparation hide a completed chat miss', () => {
    const input = {
      isAuthenticated: true,
      isLoading: true,
      isChatLoading: false,
      error: null,
      activeChat: null,
      isSecretary: false,
      hasThread: false,
    } as Parameters<typeof projectChatContentState>[0] & { isChatLoading: boolean }

    expect(projectChatContentState(input)).toMatchObject({ kind: 'not-found' })
  })

  it('keeps cached chat and thread content ready during a background query error', () => {
    expect(projectChatContentState({
      isAuthenticated: true,
      isLoading: false,
      error: Object.assign(new Error('HTTP 403'), { status: 403 }),
      activeChat,
      isSecretary: false,
      hasThread: true,
    })).toMatchObject({ kind: 'ready', recoverable: false })
  })

  it('recognizes nested response status and abort timeout errors', () => {
    expect(projectChatContentState({
      isAuthenticated: true,
      isLoading: false,
      error: { response: { status: 401 } },
      activeChat,
      isSecretary: false,
    })).toMatchObject({ kind: 'login-required' })

    expect(projectChatContentState({
      isAuthenticated: true,
      isLoading: false,
      error: Object.assign(new Error('aborted'), { name: 'AbortError' }),
      activeChat,
      isSecretary: false,
    })).toMatchObject({ kind: 'timeout' })
  })
})
