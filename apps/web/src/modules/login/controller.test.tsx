import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLoginStore } from '@linx/stores/login'

const navigateMock = vi.fn()
const logoutMock = vi.fn()
const connectMock = vi.fn()
const cancelMock = vi.fn()
const startLocalMock = vi.fn()
const handleIncomingRedirectMock = vi.fn()

const sessionState = {
  info: {
    isLoggedIn: false,
    webId: undefined as string | undefined,
  },
  fetch: vi.fn(),
  handleIncomingRedirect: handleIncomingRedirectMock,
  sessionRequestInProgress: false,
}

const restoreState = {
  isRestoring: false,
  restoreComplete: false,
  restoreFailed: false,
  hasStoredSession: false,
}

const embeddedAuthorizationState = {
  open: false,
  reason: 'dismissed' as 'opened' | 'completed' | 'dismissed',
  ready: false,
  close: vi.fn(),
}

const providersState = {
  providers: [] as any[],
  addProvider: vi.fn(),
  removeProvider: vi.fn(),
  localOnboarding: null as any,
  startLocal: startLocalMock,
}

vi.mock('@inrupt/solid-ui-react', () => ({
  useSession: () => ({
    session: sessionState,
    logout: logoutMock,
    sessionRequestInProgress: sessionState.sessionRequestInProgress,
  }),
}))

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('./hooks/use-session-restore', () => ({
  useSessionRestore: () => restoreState,
}))

vi.mock('./hooks/use-oidc-connect', () => ({
  useOidcConnect: () => ({
    connect: connectMock,
    cancel: cancelMock,
  }),
}))

vi.mock('./hooks/use-embedded-authorization-state', () => ({
  useEmbeddedAuthorizationState: () => embeddedAuthorizationState,
}))

vi.mock('./hooks/use-providers', () => ({
  useProviders: () => providersState,
}))

import { useLoginController } from './controller'

describe('useLoginController', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    delete window.xpodDesktop
    logoutMock.mockImplementation(async () => {
      sessionState.info.isLoggedIn = false
      sessionState.info.webId = undefined
    })
    handleIncomingRedirectMock.mockReset()
    handleIncomingRedirectMock.mockResolvedValue({ isLoggedIn: false })
    startLocalMock.mockReset()
    startLocalMock.mockResolvedValue({
      state: 'ready',
      spaceKind: 'standalone',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'http://localhost:5737/',
      publicUrl: null,
      tunnel: null,
      connectivity: null,
      capabilities: null,
      cloudIdentityUrl: null,
      provisionCode: null,
      provisionUrl: null,
      nodeId: null,
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    })
    sessionState.info.isLoggedIn = false
    sessionState.info.webId = undefined
    sessionState.fetch.mockReset()
    sessionState.sessionRequestInProgress = false
    restoreState.isRestoring = false
    restoreState.restoreComplete = false
    restoreState.restoreFailed = false
    restoreState.hasStoredSession = false
    embeddedAuthorizationState.open = false
    embeddedAuthorizationState.reason = 'dismissed'
    embeddedAuthorizationState.ready = false
    embeddedAuthorizationState.close.mockReset()
    providersState.providers = []
    providersState.localOnboarding = null
    window.sessionStorage.clear()
    window.localStorage.removeItem('linx-remembered-account')
    window.history.replaceState({}, '', '/')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.example.com/alice/profile/card#me',
        'solid:storage': { '@id': 'https://id.example.com/alice/' },
      }),
    }))
    sessionState.fetch.mockImplementation((...args: Parameters<typeof fetch>) => fetch(...args))
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: null,
      customProviders: [],
    })
  })

  it('stores the current micro app before entering Local onboarding', async () => {
    providersState.providers = [
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'missing',
          canStart: true,
          canCreate: true,
        },
      },
    ]
    window.history.replaceState({}, '', '/files')

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.connect('local')
    })

    expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBe('files')
    expect(result.current.view).toBe('local')
    expect(result.current.localLoginStatus.active).toBe(true)
    expect(startLocalMock).toHaveBeenCalledTimes(1)
    expect(navigateMock).not.toHaveBeenCalled()
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('hydrates the account card from remembered account storage when the login store is empty', async () => {
    window.localStorage.setItem('linx-remembered-account', JSON.stringify({
      displayName: 'Ganlu',
      issuerUrl: 'https://cloud.example.com',
      issuerLabel: 'Cloud',
      storageProviderUrl: 'https://cloud.example.com',
      storageProviderLabel: 'Cloud',
      webId: 'https://alice.example/profile/card#me',
    }))

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(useLoginStore.getState().storedAccount).toEqual({
        displayName: 'Ganlu',
        issuerUrl: 'https://cloud.example.com',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://cloud.example.com',
        storageProviderLabel: 'Cloud',
        webId: 'https://alice.example/profile/card#me',
      })
    })
  })

  it('only marks a remembered account restorable when the stored Solid session matches its WebID', () => {
    window.localStorage.setItem('solidClientAuthn:currentSession', 'session-1')
    window.localStorage.setItem('solidClientAuthenticationUser:session-1', JSON.stringify({
      issuer: 'https://id.undefineds.co',
      isLoggedIn: 'true',
      webId: 'https://id.undefineds.co/other/profile/card#me',
    }))
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu05',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-0000.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu05/profile/card#me',
      },
      customProviders: [],
    })

    const { result, rerender } = renderHook(() => useLoginController())

    expect(result.current.hasRestorableSession).toBe(false)

    window.localStorage.setItem('solidClientAuthenticationUser:session-1', JSON.stringify({
      issuer: 'https://id.undefineds.co',
      isLoggedIn: 'true',
      webId: 'https://id.undefineds.co/ganlu05/profile/card#me',
    }))
    rerender()

    expect(result.current.hasRestorableSession).toBe(true)
  })

  it('enters connecting state for Cloud providers and reports connection errors', async () => {
    connectMock.mockRejectedValueOnce(new Error('OIDC unavailable'))
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://cloud.example.com',
        label: 'Cloud',
        source: 'cloud',
      },
    ]

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.connect('https://cloud.example.com')
    })

    expect(connectMock).toHaveBeenCalledWith('https://cloud.example.com', expect.objectContaining({
      authorizationSurface: 'window',
      storageProviderUrl: 'https://cloud.example.com',
    }))
    expect(useLoginStore.getState().state).toBe('idle')
    expect(useLoginStore.getState().error).toBe('登录页面暂时打不开。请检查网络，或回到“选择空间”重试。')
    expect(result.current.connectingProvider).toBeNull()
  })

  it('keeps Desktop Cloud connect active after the authorization surface opens', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    connectMock.mockResolvedValueOnce(undefined)
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://cloud.example.com',
        label: 'Cloud',
        source: 'cloud',
      },
    ]

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.connect('https://cloud.example.com')
    })

    expect(connectMock).toHaveBeenCalledWith('https://cloud.example.com', expect.objectContaining({
      authorizationSurface: 'embedded',
      storageProviderUrl: 'https://cloud.example.com',
    }))
    expect(useLoginStore.getState().state).toBe('connecting')
    expect(useLoginStore.getState().error).toBeNull()
    expect(result.current.connectingProvider).toEqual({
      issuerLabel: 'Cloud',
      issuerUrl: 'https://cloud.example.com',
      storageProviderLabel: 'Cloud',
      storageProviderUrl: 'https://cloud.example.com',
    })
    expect(startLocalMock).not.toHaveBeenCalled()
  })

  it('can cancel an active Desktop authorization and return to provider selection', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    connectMock.mockResolvedValueOnce(undefined)
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://cloud.example.com',
        label: 'Cloud',
        source: 'cloud',
      },
    ]

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.connect('https://cloud.example.com')
    })

    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://cloud.example.com',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))
    window.sessionStorage.setItem('linx-post-login-micro-app', 'chat')
    window.sessionStorage.setItem('linx-pending-callback-error', JSON.stringify({
      error: 'access_denied',
      description: null,
    }))

    act(() => {
      result.current.cancelConnecting()
    })

    expect(useLoginStore.getState().state).toBe('idle')
    expect(result.current.view).toBe('default')
    expect(result.current.connectingProvider).toBeNull()
    expect(embeddedAuthorizationState.close).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
    expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBeNull()
    expect(window.sessionStorage.getItem('linx-pending-callback-error')).toBeNull()
  })

  it('clears a remembered account when cancelling Local auth so provider selection can be used again', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    providersState.providers = [
      {
        id: 'local',
        url: 'https://node-abc123.undefineds.co/',
        label: 'Local',
        source: 'local',
        oidcProvider: {
          kind: 'cloud',
          url: 'https://id.undefineds.co',
          label: 'Cloud',
        },
        storageProvider: {
          kind: 'local',
          url: 'https://node-abc123.undefineds.co/',
          label: 'Local',
        },
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737',
      baseUrl: 'https://node-abc123.undefineds.co/',
      publicUrl: 'https://node-abc123.undefineds.co/',
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc123',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: false,
    }
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu/profile/card#me',
      },
      customProviders: [],
    })
    connectMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.connect('local')
    })
    await act(async () => {
      await result.current.continueLocalLogin()
    })

    expect(useLoginStore.getState().state).toBe('connecting')

    act(() => {
      result.current.cancelConnecting()
    })

    expect(useLoginStore.getState().state).toBe('idle')
    expect(useLoginStore.getState().storedAccount).toBeNull()
    expect(window.localStorage.getItem('linx-remembered-account')).toBeNull()
    expect(result.current.view).toBe('default')
    expect(result.current.connectingProvider).toBeNull()

    await act(async () => {
      await result.current.connect('local')
    })

    expect(result.current.view).toBe('local')
    expect(startLocalMock).toHaveBeenCalledTimes(2)
  })

  it('returns Desktop Cloud connect to idle when the embedded authorization is dismissed', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    connectMock.mockResolvedValueOnce(undefined)
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://cloud.example.com',
        label: 'Cloud',
        source: 'cloud',
      },
    ]

    const { result, rerender } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.connect('https://cloud.example.com')
    })

    expect(useLoginStore.getState().state).toBe('connecting')

    embeddedAuthorizationState.open = true
    embeddedAuthorizationState.reason = 'opened'
    embeddedAuthorizationState.ready = true
    rerender()

    expect(useLoginStore.getState().state).toBe('connecting')

    embeddedAuthorizationState.open = false
    embeddedAuthorizationState.reason = 'dismissed'
    embeddedAuthorizationState.ready = false
    rerender()

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('idle')
    })
    expect(useLoginStore.getState().error).toBeNull()
    expect(result.current.view).toBe('default')
    expect(result.current.connectingProvider).toBeNull()
    expect(cancelMock).toHaveBeenCalledTimes(1)
    expect(startLocalMock).not.toHaveBeenCalled()
    expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBeNull()
    expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
  })

  it('moves Desktop Cloud connect to restoring when embedded authorization completes', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    connectMock.mockResolvedValueOnce(undefined)
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://cloud.example.com',
        label: 'Cloud',
        source: 'cloud',
      },
    ]

    const { result, rerender } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.connect('https://cloud.example.com')
    })

    embeddedAuthorizationState.open = true
    embeddedAuthorizationState.reason = 'opened'
    embeddedAuthorizationState.ready = true
    rerender()

    embeddedAuthorizationState.open = false
    embeddedAuthorizationState.reason = 'completed'
    embeddedAuthorizationState.ready = false
    rerender()

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('restoring')
    })
    expect(useLoginStore.getState().error).toBeNull()
    expect(startLocalMock).not.toHaveBeenCalled()
  })

  it('continues a remembered Local space through the Local onboarding flow', async () => {
    providersState.providers = [
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'stopped',
          canStart: true,
          canCreate: false,
        },
      },
    ]
    window.history.replaceState({}, '', '/contacts')
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://cloud.example.com',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'http://localhost:5737',
        storageProviderLabel: 'Local',
        webId: 'https://cloud.example.com/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      result.current.continueStoredAccount()
    })

    expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBe('contacts')
    expect(result.current.view).toBe('local')
    expect(result.current.localLoginStatus.active).toBe(true)
    expect(startLocalMock).toHaveBeenCalledTimes(1)
    expect(navigateMock).not.toHaveBeenCalled()
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('does not reuse an active Cloud session when the user selects Local from provider selection', async () => {
    providersState.providers = [
      {
        id: 'local',
        url: 'https://node-abc123.undefineds.co/',
        label: 'Local',
        source: 'local',
        oidcProvider: {
          kind: 'cloud',
          url: 'https://id.undefineds.co',
          label: 'Cloud',
        },
        storageProvider: {
          kind: 'local',
          url: 'https://node-abc123.undefineds.co/',
          label: 'Local',
        },
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://id.undefineds.co/ganbb/profile/card#me'
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganbb',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://id.undefineds.co',
        storageProviderLabel: 'Cloud',
        webId: 'https://id.undefineds.co/ganbb/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.connect('local')
    })

    expect(startLocalMock).toHaveBeenCalledTimes(1)
    expect(result.current.view).toBe('local')
    expect(result.current.localLoginStatus.active).toBe(true)
    expect(navigateMock).not.toHaveBeenCalled()
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('blocks a remembered Local space when the active session is still bound to Cloud storage', async () => {
    providersState.providers = [
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://id.undefineds.co/ganlu05/profile/card#me'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/ganlu05/profile/card#me',
        'solid:storage': { '@id': 'https://id.undefineds.co/ganbb/' },
      }),
    }))
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu05',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu05/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      result.current.continueStoredAccount()
    })

    await waitFor(() => {
      expect(result.current.storageConflict).toEqual({
        expectedStorageUrl: 'https://node-abc123.undefineds.co/ganlu05/',
        actualStorageUrl: 'https://id.undefineds.co/ganbb/',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        managementUrl: 'https://node-abc123.undefineds.co/.account/account/',
        setupUrl: 'https://node-abc123.undefineds.co/.account/account/',
        setupKind: 'account-management',
      })
    })

    expect(startLocalMock).toHaveBeenCalledTimes(1)
    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(navigateMock).not.toHaveBeenCalled()
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('starts Local before restoring a remembered Local session outside Desktop', async () => {
    providersState.providers = [
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'stopped',
          canStart: true,
          canCreate: false,
        },
      },
    ]
    window.localStorage.setItem('solidClientAuthn:currentSession', 'session-1')
    window.localStorage.setItem('solidClientAuthenticationUser:session-1', JSON.stringify({
      issuer: 'http://localhost:5737',
      redirectUrl: 'http://localhost:3000/auth/callback',
      isLoggedIn: 'true',
      webId: 'http://localhost:5737/profile/card#me',
    }))
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'http://localhost:5737',
        issuerLabel: 'Standalone',
        storageProviderUrl: 'http://localhost:5737',
        storageProviderLabel: 'Standalone',
        webId: 'http://localhost:5737/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      result.current.continueStoredAccount()
    })

    expect(startLocalMock).toHaveBeenCalledTimes(1)
    expect(handleIncomingRedirectMock).toHaveBeenCalledWith({
      url: window.location.href,
      restorePreviousSession: true,
    })
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('starts remembered Local in Desktop but does not reuse stored auth without an active matching session', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    providersState.providers = [
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'stopped',
          canStart: true,
          canCreate: false,
        },
      },
    ]
    window.localStorage.setItem('solidClientAuthn:currentSession', 'session-1')
    window.localStorage.setItem('solidClientAuthenticationUser:session-1', JSON.stringify({
      issuer: 'http://localhost:5737',
      redirectUrl: 'http://127.0.0.1:43123/auth/callback',
      isLoggedIn: 'true',
      webId: 'http://localhost:5737/profile/card#me',
    }))
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'http://localhost:5737',
        issuerLabel: 'Standalone',
        storageProviderUrl: 'http://localhost:5737',
        storageProviderLabel: 'Standalone',
        webId: 'http://localhost:5737/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      result.current.continueStoredAccount()
    })

    await waitFor(() => {
      expect(result.current.localLoginStatus.active).toBe(true)
    })
    expect(startLocalMock).toHaveBeenCalledTimes(1)
    expect(handleIncomingRedirectMock).not.toHaveBeenCalled()
    expect(connectMock).not.toHaveBeenCalled()
    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBe('session-1')
  })

  it('does not use silent Local auth when the stored Solid session belongs to another Cloud account', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    window.localStorage.setItem('solidClientAuthn:currentSession', 'session-1')
    window.localStorage.setItem('solidClientAuthenticationUser:session-1', JSON.stringify({
      issuer: 'https://id.undefineds.co',
      redirectUrl: 'http://127.0.0.1:43123/auth/callback',
      isLoggedIn: 'true',
      webId: 'https://id.undefineds.co/ganbb/profile/card#me',
    }))
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737',
      baseUrl: 'https://pod.example.com/',
      publicUrl: 'https://pod.example.com/',
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    }
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu05',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://pod.example.com/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu05/profile/card#me',
      },
      customProviders: [],
    })
    connectMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.continueLocalLogin()
    })

    expect(connectMock).toHaveBeenCalledWith('https://pod.example.com/', expect.objectContaining({
      authorizationSurface: 'embedded',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://pod.example.com/',
      storageProviderLabel: 'Local',
      issuerLabel: 'Cloud',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
    }))
    expect(connectMock).not.toHaveBeenCalledWith('https://id.undefineds.co', expect.anything())
    expect(connectMock.mock.calls[0]?.[1]).not.toHaveProperty('prompt')
  })

  it('blocks Local login when the Local storage address is not ready', async () => {
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737',
      baseUrl: 'http://localhost:5737/',
      publicUrl: null,
      tunnel: null,
      connectivity: null,
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    }

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.continueLocalLogin()
    })

    expect(connectMock).not.toHaveBeenCalled()
    expect(result.current.error).toContain('本地空间还没有完成准备')
    expect(useLoginStore.getState().state).toBe('idle')
  })

  it('does not treat a LAN Local access route as the Local storage address', async () => {
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737',
      baseUrl: 'http://192.168.1.23:5737/',
      publicUrl: null,
      tunnel: null,
      connectivity: null,
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    }
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'http://192.168.1.23:5737/',
      storageProviderLabel: 'Local',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://id.undefineds.co/alice/profile/card#me'

    const { result } = renderHook(() => useLoginController())

    await waitFor(() => {
      expect(result.current.error).toContain('本地空间还没有完成准备')
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(useLoginStore.getState().state).toBe('idle')
    expect(useLoginStore.getState().storedAccount).toBeNull()
    expect(logoutMock).toHaveBeenCalledTimes(1)
  })

  it('enters interactive Local login for a remembered Desktop Local session when no session is active', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    providersState.providers = [
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'stopped',
          canStart: true,
          canCreate: false,
        },
      },
    ]
    window.localStorage.setItem('solidClientAuthn:currentSession', 'session-1')
    window.localStorage.setItem('solidClientAuthenticationUser:session-1', JSON.stringify({
      issuer: 'http://localhost:5737',
      redirectUrl: 'http://127.0.0.1:43123/auth/callback',
      isLoggedIn: 'true',
      webId: 'http://localhost:5737/profile/card#me',
    }))
    handleIncomingRedirectMock.mockResolvedValueOnce({ isLoggedIn: false })
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'http://localhost:5737',
        issuerLabel: 'Standalone',
        storageProviderUrl: 'http://localhost:5737',
        storageProviderLabel: 'Standalone',
        webId: 'http://localhost:5737/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      result.current.continueStoredAccount()
    })

    await waitFor(() => {
      expect(result.current.localLoginStatus.active).toBe(true)
    })
    expect(startLocalMock).toHaveBeenCalledTimes(1)
    expect(handleIncomingRedirectMock).not.toHaveBeenCalled()
  })

  it('revalidates a remembered Desktop Standalone session before entering LinX when the Inrupt session is already active', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    providersState.providers = [
      {
        id: 'standalone',
        url: 'http://localhost:5737',
        label: 'Standalone',
        source: 'standalone',
        oidcProvider: {
          kind: 'local',
          url: 'http://localhost:5737',
          label: 'Standalone',
        },
        storageProvider: {
          kind: 'local',
          url: 'http://localhost:5737',
          label: 'Standalone',
        },
        runtime: {
          kind: 'local-pod',
          status: 'stopped',
          canStart: true,
          canCreate: false,
        },
      },
    ]
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'http://localhost:5737/profile/card#me'
    window.history.replaceState({}, '', '/files')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'http://localhost:5737/profile/card#me',
        'solid:storage': { '@id': 'http://localhost:5737/profile/' },
      }),
    }))
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'http://localhost:5737',
        issuerLabel: 'Standalone',
        storageProviderUrl: 'http://localhost:5737',
        storageProviderLabel: 'Standalone',
        webId: 'http://localhost:5737/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      result.current.continueStoredAccount()
    })

    expect(startLocalMock).toHaveBeenCalledTimes(1)
    expect(handleIncomingRedirectMock).not.toHaveBeenCalled()
    expect(connectMock).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('authenticated')
    })
    expect(useLoginStore.getState().state).toBe('authenticated')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('blocks a remembered active Standalone session when its profile storage points at another SP', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    providersState.providers = [
      {
        id: 'standalone',
        url: 'http://localhost:5737',
        label: 'Standalone',
        source: 'standalone',
        oidcProvider: {
          kind: 'local',
          url: 'http://localhost:5737',
          label: 'Standalone',
        },
        storageProvider: {
          kind: 'local',
          url: 'http://localhost:5737',
          label: 'Standalone',
        },
        runtime: {
          kind: 'local-pod',
          status: 'stopped',
          canStart: true,
          canCreate: false,
        },
      },
    ]
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'http://localhost:5737/profile/card#me'
    window.history.replaceState({}, '', '/files')
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'http://localhost:5737/profile/card#me',
        'solid:storage': { '@id': 'http://old-local.example/profile/' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'http://localhost:5737',
        issuerLabel: 'Standalone',
        storageProviderUrl: 'http://localhost:5737',
        storageProviderLabel: 'Standalone',
        webId: 'http://localhost:5737/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      result.current.continueStoredAccount()
    })

    await waitFor(() => {
      expect(result.current.storageConflict).toEqual({
        expectedStorageUrl: 'http://localhost:5737/profile/',
        actualStorageUrl: 'http://old-local.example/profile/',
        storageProviderUrl: 'http://localhost:5737',
        managementUrl: 'http://localhost:5737/.account/account/',
        setupUrl: 'http://localhost:5737/.account/account/',
        setupKind: 'account-management',
      })
    })

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5737/profile/card#me', expect.anything())
    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('keeps Solid auth storage before continuing a remembered Local account', async () => {
    providersState.providers = [
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    window.localStorage.setItem('solidClientAuthn:currentSession', 'session-1')
    window.localStorage.setItem('solidClientAuthenticationUser:session-1', JSON.stringify({
      issuer: 'http://localhost:5737',
      redirectUrl: 'http://localhost:3000/auth/callback',
      clientId: 'stale-client',
    }))
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'LinX 用户',
        issuerUrl: '',
        webId: 'http://localhost:5737/test3/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      result.current.continueStoredAccount()
    })

    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBe('session-1')
    expect(startLocalMock).toHaveBeenCalledTimes(1)
  })

  it('treats a remembered localhost webId without issuer metadata as Standalone and starts Standalone login', async () => {
    providersState.providers = [
      {
        id: 'standalone',
        url: 'http://localhost:5737',
        label: 'Standalone',
        source: 'standalone',
        oidcProvider: {
          kind: 'local',
          url: 'http://localhost:5737',
          label: 'Standalone',
        },
        storageProvider: {
          kind: 'local',
          url: 'http://localhost:5737',
          label: 'Standalone',
        },
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'LinX 用户',
        issuerUrl: '',
        webId: 'http://localhost:5737/test3/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      result.current.continueStoredAccount()
    })

    expect(startLocalMock).toHaveBeenCalledTimes(1)
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('uses Cloud issuer with provision code when continuing a Local login', async () => {
    providersState.providers = [
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737',
      baseUrl: 'https://pod.example.com/',
      publicUrl: 'https://pod.example.com/',
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    }
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://pod.example.com/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu/profile/card#me',
      },
      customProviders: [],
    })
    connectMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.continueLocalLogin()
    })

    expect(startLocalMock).not.toHaveBeenCalled()
    expect(connectMock).toHaveBeenCalledWith('https://pod.example.com/', expect.objectContaining({
      authorizationSurface: 'embedded',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://pod.example.com/',
      storageProviderLabel: 'Local',
      issuerLabel: 'Cloud',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
    }))
    expect(connectMock).not.toHaveBeenCalledWith('https://id.undefineds.co', expect.anything())
    expect(result.current.connectingProvider).toEqual({
      issuerLabel: 'Cloud',
      issuerUrl: 'https://id.undefineds.co',
      storageProviderLabel: 'Local',
      storageProviderUrl: 'https://pod.example.com/',
    })
    expect(connectMock).not.toHaveBeenCalledWith('http://localhost:5737', expect.anything())
  })

  it('can restart Local login after the embedded authorization sheet is dismissed', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    providersState.providers = [
      {
        id: 'local',
        url: 'https://node-abc123.undefineds.co/',
        label: 'Local',
        source: 'local',
        oidcProvider: {
          kind: 'cloud',
          url: 'https://id.undefineds.co',
          label: 'Cloud',
        },
        storageProvider: {
          kind: 'local',
          url: 'https://node-abc123.undefineds.co/',
          label: 'Local',
        },
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737',
      baseUrl: 'https://node-abc123.undefineds.co/',
      publicUrl: 'https://node-abc123.undefineds.co/',
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc123',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: false,
    }
    connectMock.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.connect('local')
    })
    await act(async () => {
      await result.current.continueLocalLogin()
    })

    expect(connectMock).toHaveBeenCalledTimes(1)
    expect(useLoginStore.getState().state).toBe('connecting')

    embeddedAuthorizationState.open = true
    embeddedAuthorizationState.reason = 'opened'
    embeddedAuthorizationState.ready = true
    rerender()

    embeddedAuthorizationState.open = false
    embeddedAuthorizationState.reason = 'dismissed'
    embeddedAuthorizationState.ready = false
    rerender()

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('idle')
    })
    expect(result.current.view).toBe('default')
    expect(result.current.connectingProvider).toBeNull()
    expect(useLoginStore.getState().error).toBeNull()
    expect(cancelMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.connect('local')
    })
    await act(async () => {
      await result.current.continueLocalLogin()
    })

    expect(connectMock).toHaveBeenCalledTimes(2)
    expect(connectMock.mock.calls[1]).toEqual([
      'https://node-abc123.undefineds.co/',
      expect.objectContaining({
        authorizationSurface: 'embedded',
        accountIssuerUrl: 'https://id.undefineds.co',
        accountIssuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        storageProviderLabel: 'Local',
        issuerLabel: 'Cloud',
        authorizationQuery: {
          provisionCode: 'pc-123',
        },
      }),
    ])
  })

  it('returns to provider selection when a Local embedded auth sheet is dismissed after OIDC setup falls back to idle', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    providersState.providers = [
      {
        id: 'local',
        url: 'https://node-abc123.undefineds.co/',
        label: 'Local',
        source: 'local',
        oidcProvider: {
          kind: 'cloud',
          url: 'https://id.undefineds.co',
          label: 'Cloud',
        },
        storageProvider: {
          kind: 'local',
          url: 'https://node-abc123.undefineds.co/',
          label: 'Local',
        },
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737',
      baseUrl: 'https://node-abc123.undefineds.co/',
      publicUrl: 'https://node-abc123.undefineds.co/',
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc123',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: false,
    }
    connectMock.mockResolvedValue(undefined)

    const { result, rerender } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.connect('local')
    })
    await act(async () => {
      await result.current.continueLocalLogin()
    })

    embeddedAuthorizationState.open = true
    embeddedAuthorizationState.reason = 'opened'
    embeddedAuthorizationState.ready = true
    rerender()

    act(() => {
      useLoginStore.setState({ state: 'idle' })
    })

    expect(result.current.view).toBe('local')

    embeddedAuthorizationState.open = false
    embeddedAuthorizationState.reason = 'dismissed'
    embeddedAuthorizationState.ready = false
    rerender()

    await waitFor(() => {
      expect(result.current.view).toBe('default')
    })
    expect(useLoginStore.getState().state).toBe('idle')
    expect(result.current.connectingProvider).toBeNull()
    expect(useLoginStore.getState().error).toBeNull()
    expect(cancelMock).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBeNull()
    expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
  })

  it('opens interactive auth for a remembered Desktop Local account without a restorable Solid session', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737',
      baseUrl: 'https://pod.example.com/',
      publicUrl: 'https://pod.example.com/',
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    }
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://pod.example.com/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu/profile/card#me',
      },
      customProviders: [],
    })
    connectMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.continueLocalLogin()
    })

    expect(connectMock).toHaveBeenCalledWith('https://pod.example.com/', expect.objectContaining({
      authorizationSurface: 'embedded',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://pod.example.com/',
      storageProviderLabel: 'Local',
      issuerLabel: 'Cloud',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
    }))
    expect(connectMock).not.toHaveBeenCalledWith('https://id.undefineds.co', expect.anything())
    expect(connectMock.mock.calls[0]?.[1]).not.toHaveProperty('prompt')
  })

  it('tries silent desktop auth for Local only when a restorable Solid session exists', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    window.localStorage.setItem('solidClientAuthn:currentSession', 'session-1')
    window.localStorage.setItem('solidClientAuthenticationUser:session-1', JSON.stringify({
      issuer: 'https://id.undefineds.co',
      redirectUrl: 'http://127.0.0.1:43123/auth/callback',
      isLoggedIn: 'true',
      webId: 'https://id.undefineds.co/ganlu/profile/card#me',
    }))
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737',
      baseUrl: 'https://pod.example.com/',
      publicUrl: 'https://pod.example.com/',
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    }
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://pod.example.com/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu/profile/card#me',
      },
      customProviders: [],
    })
    connectMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.continueLocalLogin()
    })

    expect(connectMock).toHaveBeenCalledWith('https://pod.example.com/', expect.objectContaining({
      authorizationSurface: 'embedded',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://pod.example.com/',
      storageProviderLabel: 'Local',
      issuerLabel: 'Cloud',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      prompt: 'none',
      strictDiscovery: true,
    }))
    expect(connectMock).not.toHaveBeenCalledWith('https://id.undefineds.co', expect.anything())
  })

  it('falls back to interactive auth when a desktop silent Local attempt returns login_required', async () => {
    window.xpodDesktop = {
      auth: {},
    } as any
    restoreState.restoreFailed = true
    window.sessionStorage.setItem('linx-post-login-micro-app', 'chat')
    window.sessionStorage.setItem('linx-pending-callback-error', JSON.stringify({
      error: 'login_required',
      description: null,
    }))
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://node-0000.undefineds.co/',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Local',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      prompt: 'none',
    }))

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(connectMock).toHaveBeenCalledWith('https://node-0000.undefineds.co', expect.objectContaining({
        authorizationSurface: 'embedded',
        returnToMicroAppId: 'chat',
        route: 'local',
        accountIssuerUrl: 'https://id.undefineds.co',
        accountIssuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-0000.undefineds.co',
        storageProviderLabel: 'Local',
        authorizationQuery: {
          provisionCode: 'pc-123',
        },
        strictDiscovery: true,
      }))
    })
    expect(useLoginStore.getState().error).toBeNull()
  })

  it('does not treat Standalone as Local when continuing a Local login', async () => {
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'standalone',
      localUrl: 'http://localhost:5737',
      baseUrl: 'http://localhost:5737/',
      publicUrl: null,
      tunnel: null,
      connectivity: null,
      capabilities: null,
      cloudIdentityUrl: null,
      provisionCode: null,
      provisionUrl: null,
      nodeId: null,
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: true,
    }
    connectMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.continueLocalLogin()
    })

    expect(startLocalMock).toHaveBeenCalledWith('local')
    expect(connectMock).not.toHaveBeenCalled()
  })

  it('returns to the pending micro app after callback login succeeds', async () => {
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://cloud.example.com',
        label: 'Cloud',
        source: 'cloud',
      },
    ]
    window.sessionStorage.setItem('linx-post-login-micro-app', 'favorites')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://cloud.example.com',
      authorizationSurface: 'window',
      returnToMicroAppId: 'favorites',
    }))
    window.history.replaceState({}, '', '/auth/callback?code=abc&state=xyz')
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://alice.example/profile/card#me'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://alice.example/profile/card#me',
        'solid:storage': { '@id': 'https://cloud.example.com/profile/' },
      }),
    }))

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/$microAppId',
        params: { microAppId: 'favorites' },
        replace: true,
      })
    })

    expect(useLoginStore.getState().state).toBe('authenticated')
    expect(useLoginStore.getState().storedAccount?.webId).toBe('https://alice.example/profile/card#me')
    expect(useLoginStore.getState().storedAccount?.issuerUrl).toBe('https://cloud.example.com')
    expect(useLoginStore.getState().storedAccount?.issuerLabel).toBe('Cloud')
    expect(useLoginStore.getState().storedAccount?.storageProviderUrl).toBe('https://cloud.example.com')
    expect(useLoginStore.getState().storedAccount?.storageProviderLabel).toBe('Cloud')
    expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBeNull()
    expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
  })

  it('uses the authenticated session fetch for callback profile storage checks', async () => {
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://id.undefineds.co',
        label: 'Cloud',
        source: 'cloud',
      },
    ]
    const anonymousFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => 'unauthorized',
    })
    vi.stubGlobal('fetch', anonymousFetch)
    sessionState.fetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/ganbb/profile/card#me',
        'solid:storage': { '@id': 'https://id.undefineds.co/ganbb/' },
      }),
    })
    window.sessionStorage.setItem('linx-post-login-micro-app', 'chat')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    }))
    window.history.replaceState({}, '', '/auth/callback?code=abc&state=xyz')
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://id.undefineds.co/ganbb/profile/card#me'

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('authenticated')
    })

    expect(sessionState.fetch).toHaveBeenCalledWith(
      'https://id.undefineds.co/ganbb/profile/card#me',
      expect.anything(),
    )
    expect(anonymousFetch).not.toHaveBeenCalled()
    expect(useLoginStore.getState().error).toBeNull()
    expect(useLoginStore.getState().storedAccount?.webId).toBe('https://id.undefineds.co/ganbb/profile/card#me')
  })

  it('waits for SolidSessionProvider to finish before checking callback profile storage', async () => {
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://id.undefineds.co',
        label: 'Cloud',
        source: 'cloud',
      },
    ]
    const anonymousFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => 'unauthorized',
    })
    vi.stubGlobal('fetch', anonymousFetch)
    sessionState.fetch.mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/ganbb/profile/card#me',
        'solid:storage': { '@id': 'https://id.undefineds.co/ganbb/' },
      }),
    })
    window.sessionStorage.setItem('linx-post-login-micro-app', 'chat')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    }))
    window.history.replaceState({}, '', '/auth/callback?code=abc&state=xyz')
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://id.undefineds.co/ganbb/profile/card#me'
    sessionState.sessionRequestInProgress = true

    const { rerender } = renderHook(() => useLoginController())

    expect(sessionState.fetch).not.toHaveBeenCalled()
    expect(useLoginStore.getState().state).toBe('idle')

    sessionState.sessionRequestInProgress = false
    rerender()

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('authenticated')
    })

    expect(sessionState.fetch).toHaveBeenCalledWith(
      'https://id.undefineds.co/ganbb/profile/card#me',
      expect.anything(),
    )
    expect(anonymousFetch).not.toHaveBeenCalled()
  })

  it('prefers the current pending provider over the remembered account when login completes', async () => {
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://cloud.example.com',
        label: 'Cloud',
        source: 'cloud',
      },
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    window.sessionStorage.setItem('linx-post-login-micro-app', 'chat')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://cloud.example.com',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    }))
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'http://localhost:5737',
        issuerLabel: 'Standalone',
        webId: 'http://localhost:5737/profile/card#me',
      },
      customProviders: [],
    })
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://alice.example/profile/card#me'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://alice.example/profile/card#me',
        'solid:storage': { '@id': 'https://cloud.example.com/profile/' },
      }),
    }))

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('authenticated')
    })

    expect(useLoginStore.getState().storedAccount?.issuerUrl).toBe('https://cloud.example.com')
    expect(useLoginStore.getState().storedAccount?.issuerLabel).toBe('Cloud')
    expect(useLoginStore.getState().storedAccount?.storageProviderUrl).toBe('https://cloud.example.com')
    expect(useLoginStore.getState().storedAccount?.storageProviderLabel).toBe('Cloud')
  })

  it('keeps Local as the remembered space while using Cloud as the canonical issuer', async () => {
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://cloud.example.com',
        label: 'Cloud',
        source: 'cloud',
      },
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    window.sessionStorage.setItem('linx-post-login-micro-app', 'chat')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://cloud.example.com',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Local',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://alice.example/profile/card#me'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://alice.example/profile/card#me',
        'solid:storage': { '@id': 'https://node-0000.undefineds.co/profile/' },
      }),
    }))

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('authenticated')
    })

    expect(useLoginStore.getState().storedAccount?.issuerUrl).toBe('https://cloud.example.com')
    expect(useLoginStore.getState().storedAccount?.issuerLabel).toBe('Cloud')
    expect(useLoginStore.getState().storedAccount?.storageProviderUrl).toBe('https://node-0000.undefineds.co')
    expect(useLoginStore.getState().storedAccount?.storageProviderLabel).toBe('Local')
  })

  it('completes Standalone login when profile storage points at the local SP', async () => {
    providersState.providers = [
      {
        id: 'standalone',
        url: 'http://localhost:5737',
        label: 'Standalone',
        source: 'standalone',
        oidcProvider: {
          kind: 'local',
          url: 'http://localhost:5737',
          label: 'Standalone',
        },
        storageProvider: {
          kind: 'local',
          url: 'http://localhost:5737',
          label: 'Standalone',
        },
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'standalone',
      localUrl: 'http://localhost:5737',
      baseUrl: 'http://localhost:5737/',
      publicUrl: null,
      tunnel: null,
      connectivity: null,
      capabilities: null,
      cloudIdentityUrl: null,
      provisionCode: null,
      provisionUrl: null,
      nodeId: null,
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: false,
    }
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'http://localhost:5737',
      storageProviderUrl: 'http://localhost:5737',
      storageProviderLabel: 'Standalone',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'http://localhost:5737/alice/profile/card#me',
        'solid:storage': { '@id': 'http://localhost:5737/alice/' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'http://localhost:5737/alice/profile/card#me'

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('authenticated')
    })

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:5737/alice/profile/card#me', expect.anything())
    expect(useLoginStore.getState().storedAccount?.storageProviderUrl).toBe('http://localhost:5737')
    expect(useLoginStore.getState().storedAccount?.storageProviderLabel).toBe('Standalone')
  })

  it('blocks Cloud IDP + Local SP login when the profile storage points at another SP', async () => {
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://id.undefineds.co',
        label: 'Cloud',
        source: 'cloud',
      },
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'standalone',
      localUrl: 'http://localhost:5737',
      baseUrl: 'http://localhost:5737/',
      publicUrl: 'https://node-abc123.undefineds.co/',
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc123',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: false,
    }
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'http://localhost:5737',
      storageProviderLabel: 'Local',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://id.undefineds.co/alice/profile/card#me'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/alice/profile/card#me',
        'solid:storage': { '@id': 'https://node-old999.undefineds.co/alice/' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useLoginController())

    await waitFor(() => {
      expect(result.current.storageConflict).toEqual({
        expectedStorageUrl: 'https://node-abc123.undefineds.co/alice/',
        actualStorageUrl: 'https://node-old999.undefineds.co/alice/',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        managementUrl: 'https://node-abc123.undefineds.co/.account/account/',
        setupUrl: 'https://node-abc123.undefineds.co/.account/create-pod/?provisionCode=pc-123',
        setupKind: 'create-pod',
      })
    })

    expect(fetchMock).toHaveBeenCalledWith('https://id.undefineds.co/alice/profile/card#me', expect.anything())
    expect(useLoginStore.getState().state).toBe('idle')
    expect(useLoginStore.getState().storedAccount?.storageProviderUrl).toBe('https://node-abc123.undefineds.co/')
    expect(useLoginStore.getState().storedAccount?.storageProviderLabel).toBe('Local')
    expect(logoutMock).toHaveBeenCalledTimes(1)
  })

  it('blocks Cloud IDP + Local SP login when the profile still points at Cloud storage', async () => {
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://id.undefineds.co',
        label: 'Cloud',
        source: 'cloud',
      },
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737',
      baseUrl: 'http://localhost:5737/',
      publicUrl: 'https://node-abc123.undefineds.co/',
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc123',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: false,
    }
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'https://node-abc123.undefineds.co/',
      storageProviderLabel: 'Local',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://id.undefineds.co/alice/profile/card#me'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/alice/profile/card#me',
        'solid:storage': { '@id': 'https://id.undefineds.co/alice/' },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useLoginController())

    await waitFor(() => {
      expect(result.current.storageConflict).toEqual({
        expectedStorageUrl: 'https://node-abc123.undefineds.co/alice/',
        actualStorageUrl: 'https://id.undefineds.co/alice/',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        managementUrl: 'https://node-abc123.undefineds.co/.account/account/',
        setupUrl: 'https://node-abc123.undefineds.co/.account/create-pod/?provisionCode=pc-123',
        setupKind: 'create-pod',
      })
    })

    expect(fetchMock).toHaveBeenCalledWith('https://id.undefineds.co/alice/profile/card#me', expect.anything())
    expect(useLoginStore.getState().state).toBe('idle')
    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(useLoginStore.getState().storedAccount?.storageProviderLabel).toBe('Local')
    expect(useLoginStore.getState().storedAccount?.storageProviderUrl).toBe('https://node-abc123.undefineds.co/')
  })

  it('opens the Local create-pod page with provisionCode for Local first-Pod setup', async () => {
    const openEmbeddedAuthorization = vi.fn().mockResolvedValue(undefined)
    window.xpodDesktop = {
      auth: {
        openEmbeddedAuthorization,
      },
    } as any
    providersState.providers = [
      {
        id: 'cloud',
        url: 'https://id.undefineds.co',
        label: 'Cloud',
        source: 'cloud',
      },
      {
        id: 'local',
        url: 'http://localhost:5737',
        label: 'Local',
        source: 'local',
        runtime: {
          kind: 'local-pod',
          status: 'running',
          canStart: false,
          canCreate: false,
        },
      },
    ]
    providersState.localOnboarding = {
      state: 'ready',
      spaceKind: 'local',
      localUrl: 'http://localhost:5737',
      baseUrl: 'http://localhost:5737/',
      publicUrl: 'https://node-abc123.undefineds.co/',
      capabilities: null,
      cloudIdentityUrl: 'https://id.undefineds.co',
      provisionCode: 'pc-123',
      provisionUrl: 'https://id.undefineds.co/.account/?provisionCode=pc-123',
      nodeId: 'abc123',
      message: null,
      errorCode: null,
      canRetry: true,
      canOpenSettings: false,
    }
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'https://node-abc123.undefineds.co/',
      storageProviderLabel: 'Local',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://id.undefineds.co/alice/profile/card#me'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/ld+json' }),
      text: async () => JSON.stringify({
        '@id': 'https://id.undefineds.co/alice/profile/card#me',
        'solid:storage': { '@id': 'https://id.undefineds.co/alice/' },
      }),
    }))

    const { result } = renderHook(() => useLoginController())

    await waitFor(() => {
      expect(result.current.storageConflict?.setupKind).toBe('create-pod')
    })

    act(() => {
      result.current.openCurrentSpacePodSetup()
    })

    expect(openEmbeddedAuthorization).toHaveBeenCalledWith(
      'https://node-abc123.undefineds.co/.account/create-pod/?provisionCode=pc-123',
      { providerLabel: 'Local' },
    )
  })

  it('completes a custom provider login only when storage stays inside that provider', async () => {
    providersState.providers = [
      {
        id: 'custom-solid',
        url: 'https://solid.example.net',
        label: 'Example Solid',
        source: 'custom',
      },
    ]
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://solid.example.net',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    }))
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://solid.example.net/bob/profile/card#me'
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'text/turtle' }),
      text: async () => `
        @prefix solid: <http://www.w3.org/ns/solid/terms#>.
        <https://solid.example.net/bob/profile/card#me>
          solid:storage <https://solid.example.net/users/bob/> .
      `,
    }))

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('authenticated')
    })

    expect(logoutMock).not.toHaveBeenCalled()
    expect(useLoginStore.getState().storedAccount?.issuerUrl).toBe('https://solid.example.net')
    expect(useLoginStore.getState().storedAccount?.storageProviderUrl).toBe('https://solid.example.net')
    expect(useLoginStore.getState().storedAccount?.storageProviderLabel).toBe('Example Solid')
  })

  it('dismissing a storage conflict returns to provider choice flow', async () => {
    useLoginStore.setState({
      state: 'idle',
      error: '空间不匹配',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    act(() => {
      result.current.dismissStorageConflict()
    })

    expect(result.current.storageConflict).toBeNull()
    expect(useLoginStore.getState().storedAccount).toBeNull()
    expect(useLoginStore.getState().state).toBe('idle')
    expect(useLoginStore.getState().error).toBeNull()
  })

  it('returns to chat with an error when callback restore fails without an explicit provider error', async () => {
    restoreState.restoreFailed = true
    window.sessionStorage.setItem('linx-post-login-micro-app', 'contacts')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://cloud.example.com',
      authorizationSurface: 'window',
      returnToMicroAppId: 'contacts',
    }))
    window.history.replaceState({}, '', '/auth/callback?code=abc&state=xyz')

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith({
        to: '/$microAppId',
        params: { microAppId: 'chat' },
        replace: true,
      })
    })

    expect(useLoginStore.getState().state).toBe('idle')
    expect(useLoginStore.getState().error).toBe('登录未完成，请重试。')
    expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBeNull()
    expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
  })

  it('returns connecting flows to idle without error when restore fails on a non-callback path', async () => {
    restoreState.restoreFailed = true
    window.sessionStorage.setItem('linx-post-login-micro-app', 'files')
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://cloud.example.com',
      authorizationSurface: 'window',
      returnToMicroAppId: 'files',
    }))
    window.history.replaceState({}, '', '/chat')
    useLoginStore.setState({
      state: 'connecting',
      error: null,
      storedAccount: null,
      customProviders: [],
    })

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('idle')
    })

    // Non-callback path: no error shown, user can retry manually
    expect(useLoginStore.getState().error).toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('does not auto-redirect away from callback when the provider returned an explicit error', async () => {
    restoreState.restoreFailed = true
    window.history.replaceState({}, '', '/auth/callback?error=access_denied')

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('idle')
    })

    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('clears the remembered account when switching accounts', async () => {
    useLoginStore.setState({
      state: 'idle',
      error: '连接失败',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://cloud.example.com',
        webId: 'https://cloud.example.com/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.switchAccount()
    })

    expect(useLoginStore.getState().state).toBe('idle')
    expect(useLoginStore.getState().error).toBeNull()
    expect(useLoginStore.getState().storedAccount).toBeNull()
  })

  it('returns from the Local sub-view without changing routes', () => {
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        storageProviderUrl: 'https://node-abc123.undefineds.co/',
        storageProviderLabel: 'Local',
        webId: 'https://id.undefineds.co/ganlu/profile/card#me',
      },
      customProviders: [],
    })

    const { result } = renderHook(() => useLoginController())

    act(() => {
      result.current.backFromLocal()
    })

    expect(result.current.view).toBe('default')
    expect(useLoginStore.getState().storedAccount).toBeNull()
    expect(window.localStorage.getItem('linx-remembered-account')).toBeNull()
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('continues Local login by starting Local when the Local ready view has no snapshot yet', async () => {
    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      result.current.continueLocalLogin()
    })

    expect(startLocalMock).toHaveBeenCalledTimes(1)
    expect(result.current.view).toBe('local')
    expect(result.current.localLoginStatus.active).toBe(true)
    expect(connectMock).not.toHaveBeenCalled()
  })
})
