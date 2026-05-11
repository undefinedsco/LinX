import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLoginStore } from '@linx/stores/login'

const navigateMock = vi.fn()
const logoutMock = vi.fn()
const connectMock = vi.fn()
const startLocalMock = vi.fn()
const handleIncomingRedirectMock = vi.fn()

const sessionState = {
  info: {
    isLoggedIn: false,
    webId: undefined as string | undefined,
  },
  handleIncomingRedirect: handleIncomingRedirectMock,
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
      mode: 'device-only',
      localUrl: 'http://localhost:5737/',
      baseUrl: 'http://localhost:5737/',
      publicUrl: null,
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
      await result.current.connect('http://localhost:5737')
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
      providerUrl: 'https://cloud.example.com',
      providerLabel: 'Cloud',
      webId: 'https://alice.example/profile/card#me',
    }))

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(useLoginStore.getState().storedAccount).toEqual({
        displayName: 'Ganlu',
        issuerUrl: 'https://cloud.example.com',
        issuerLabel: 'Cloud',
        providerUrl: 'https://cloud.example.com',
        providerLabel: 'Cloud',
        webId: 'https://alice.example/profile/card#me',
      })
    })
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
      providerUrl: 'https://cloud.example.com',
    }))
    expect(useLoginStore.getState().state).toBe('idle')
    expect(useLoginStore.getState().error).toBe('OIDC unavailable')
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
      providerUrl: 'https://cloud.example.com',
    }))
    expect(useLoginStore.getState().state).toBe('connecting')
    expect(useLoginStore.getState().error).toBeNull()
    expect(startLocalMock).not.toHaveBeenCalled()
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
    expect(useLoginStore.getState().error).toBe('登录已取消。')
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
        providerUrl: 'http://localhost:5737',
        providerLabel: 'Local',
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
        issuerLabel: 'Local',
        providerUrl: 'http://localhost:5737',
        providerLabel: 'Local',
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

  it('starts remembered Local in Desktop without silent-redirecting the main window', async () => {
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
        issuerLabel: 'Local',
        providerUrl: 'http://localhost:5737',
        providerLabel: 'Local',
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
        issuerLabel: 'Local',
        providerUrl: 'http://localhost:5737',
        providerLabel: 'Local',
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

  it('continues a remembered Desktop Local session when the Inrupt session is already active', async () => {
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
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'http://localhost:5737/profile/card#me'
    window.history.replaceState({}, '', '/files')
    useLoginStore.setState({
      state: 'idle',
      error: null,
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'http://localhost:5737',
        issuerLabel: 'Local',
        providerUrl: 'http://localhost:5737',
        providerLabel: 'Local',
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
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/$microAppId',
      params: { microAppId: 'files' },
      replace: true,
    })
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

  it('treats a remembered local webId without issuer metadata as Local and starts Local login', async () => {
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

  it('uses Cloud issuer with provision code when continuing a remote-ready Local login', async () => {
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
      mode: 'remote-ready',
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
    connectMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useLoginController())

    await act(async () => {
      await result.current.continueLocalLogin()
    })

    expect(startLocalMock).not.toHaveBeenCalled()
    expect(connectMock).toHaveBeenCalledWith('https://id.undefineds.co', expect.objectContaining({
      authorizationSurface: 'embedded',
      providerUrl: 'https://pod.example.com/',
      providerLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
    }))
    expect(connectMock).not.toHaveBeenCalledWith('http://localhost:5737', expect.anything())
  })

  it('uses the local issuer when continuing a device-only Local login', async () => {
    providersState.localOnboarding = {
      state: 'ready',
      mode: 'device-only',
      localUrl: 'http://localhost:5737',
      baseUrl: 'http://localhost:5737/',
      publicUrl: null,
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

    expect(startLocalMock).not.toHaveBeenCalled()
    expect(connectMock).toHaveBeenCalledWith('http://localhost:5737', expect.objectContaining({
      authorizationSurface: 'embedded',
      providerUrl: 'http://localhost:5737',
      providerLabel: 'Local',
      authorizationQuery: undefined,
    }))
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
    expect(useLoginStore.getState().storedAccount?.providerUrl).toBe('https://cloud.example.com')
    expect(useLoginStore.getState().storedAccount?.providerLabel).toBe('Cloud')
    expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBeNull()
    expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
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
        issuerLabel: 'Local',
        webId: 'http://localhost:5737/profile/card#me',
      },
      customProviders: [],
    })
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://alice.example/profile/card#me'

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('authenticated')
    })

    expect(useLoginStore.getState().storedAccount?.issuerUrl).toBe('https://cloud.example.com')
    expect(useLoginStore.getState().storedAccount?.issuerLabel).toBe('Cloud')
    expect(useLoginStore.getState().storedAccount?.providerUrl).toBe('https://cloud.example.com')
    expect(useLoginStore.getState().storedAccount?.providerLabel).toBe('Cloud')
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
      providerUrl: 'http://localhost:5737',
      providerLabel: 'Local',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://alice.example/profile/card#me'

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('authenticated')
    })

    expect(useLoginStore.getState().storedAccount?.issuerUrl).toBe('https://cloud.example.com')
    expect(useLoginStore.getState().storedAccount?.issuerLabel).toBe('Cloud')
    expect(useLoginStore.getState().storedAccount?.providerUrl).toBe('http://localhost:5737')
    expect(useLoginStore.getState().storedAccount?.providerLabel).toBe('Local')
  })

  it('does not block device-only Local login on profile storage conflict checks', async () => {
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
      mode: 'device-only',
      localUrl: 'http://localhost:5737',
      baseUrl: 'http://localhost:5737/',
      publicUrl: null,
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
      issuerUrl: 'http://127.0.0.1:5737',
      providerUrl: 'http://localhost:5737',
      providerLabel: 'Local',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
    }))
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'http://127.0.0.1:5737/alice/profile/card#me'

    renderHook(() => useLoginController())

    await waitFor(() => {
      expect(useLoginStore.getState().state).toBe('authenticated')
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(useLoginStore.getState().storedAccount?.providerUrl).toBe('http://localhost:5737')
    expect(useLoginStore.getState().storedAccount?.providerLabel).toBe('Local')
  })

  it('blocks access when the current Local space does not match the profile storage pointer', async () => {
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
      mode: 'device-only',
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
      providerUrl: 'http://localhost:5737',
      providerLabel: 'Local',
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
        'solid:storage': { '@id': 'https://node-old999.undefineds.co/alice/' },
      }),
    }))

    const { result } = renderHook(() => useLoginController())

    await waitFor(() => {
      expect(result.current.storageConflict).toEqual({
        expectedStorageUrl: 'https://node-abc123.undefineds.co/alice/',
        actualStorageUrl: 'https://node-old999.undefineds.co/alice/',
        providerUrl: 'http://localhost:5737',
        managementUrl: 'http://localhost:5737/.account/account/',
      })
    })

    expect(useLoginStore.getState().state).toBe('idle')
    expect(useLoginStore.getState().storedAccount?.providerUrl).toBe('http://localhost:5737')
    expect(navigateMock).not.toHaveBeenCalled()
    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
  })

  it('dismissing a storage conflict returns to provider choice flow', async () => {
    useLoginStore.setState({
      state: 'idle',
      error: '空间不匹配',
      storedAccount: {
        displayName: 'Ganlu',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
        providerUrl: 'http://localhost:5737',
        providerLabel: 'Local',
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
    const { result } = renderHook(() => useLoginController())

    act(() => {
      result.current.backFromLocal()
    })

    expect(result.current.view).toBe('default')
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
