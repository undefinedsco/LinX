import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumePendingPostLoginAppletId,
  ensurePendingPostLoginAppletId,
  getPendingLoginAttempt,
  getPendingLoginTransaction,
} from '../login-utils'
import * as loginUtils from '../login-utils'
import { useOidcConnect } from './use-oidc-connect'

const loginMock = vi.fn()
const fetchMock = vi.fn()
const openAuthorizationWindowMock = vi.fn()
const openEmbeddedAuthorizationMock = vi.fn()
const openExternalMock = vi.fn()
const prepareLoopbackRedirectMock = vi.fn()
const resolveDesktopOidcIssuerMock = vi.fn()
const sessionInfoMock: { current: { isLoggedIn: boolean } } = {
  current: { isLoggedIn: false },
}

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({
    login: loginMock,
    session: {
      login: loginMock,
      info: sessionInfoMock.current,
    },
  }),
}))

function TestComponent() {
  const { connect } = useOidcConnect()

  return (
    <button onClick={() => void connect('http://localhost:5737/')}>
      connect
    </button>
  )
}

function CloudTestComponent() {
  const { connect } = useOidcConnect()

  return (
    <button onClick={() => void connect('https://id.undefineds.co/')}>
      connect cloud
    </button>
  )
}

function SilentWebTestComponent() {
  const { connect } = useOidcConnect()

  return (
    <button onClick={() => void connect('https://id.undefineds.co/', { prompt: 'none' })}>
      restore cloud
    </button>
  )
}

function EmbeddedTestComponent() {
  const { connect } = useOidcConnect()

  return (
    <button onClick={() => void connect('http://localhost:5737/', {
      authorizationSurface: 'embedded',
      issuerLabel: 'Cloud',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
    })}>
      connect embedded
    </button>
  )
}

function StrictStandaloneTestComponent() {
  const { connect } = useOidcConnect()

  return (
    <button onClick={() => { void connect('https://node-0000.undefineds.co/', {
      authorizationSurface: 'embedded',
      route: 'standalone',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Standalone',
      issuerLabel: 'Standalone',
      strictDiscovery: true,
    }).catch(() => undefined) }}>
      connect standalone
    </button>
  )
}

function LegacyLocalSpEntryWithCloudAuthorityTestComponent() {
  const { connect } = useOidcConnect()

  return (
    <button onClick={() => { void connect('https://node-0000.undefineds.co/', {
      authorizationSurface: 'embedded',
      route: 'local',
      accountIssuerUrl: 'https://id.undefineds.co/',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Local',
      issuerLabel: 'Cloud',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      strictDiscovery: true,
    }).catch(() => undefined) }}>
      connect legacy split local
    </button>
  )
}

function ManagedLocalWithCloudAccountAuthorityTestComponent() {
  const { connect } = useOidcConnect()

  return (
    <button onClick={() => { void connect('https://id.undefineds.co/', {
      authorizationSurface: 'embedded',
      route: 'local',
      accountIssuerUrl: 'https://id.undefineds.co/',
      accountIssuerLabel: 'Cloud',
      storageProviderUrl: 'https://node-0000.undefineds.co/',
      storageProviderLabel: 'Local',
      issuerLabel: 'Cloud',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      nodeId: 'node-0000',
    }) }}>
      connect split local
    </button>
  )
}

function ErrorHandledTestComponent() {
  const { connect } = useOidcConnect()

  return (
    <button onClick={() => { void connect('http://localhost:5737/').catch(() => undefined) }}>
      connect safely
    </button>
  )
}

function CancelableTestComponent() {
  const { connect, cancel } = useOidcConnect()

  return (
    <>
      <button onClick={() => { void connect('http://localhost:5737/').catch(() => undefined) }}>
        connect
      </button>
      <button onClick={cancel}>
        cancel
      </button>
    </>
  )
}

describe('useOidcConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionInfoMock.current = { isLoggedIn: false }
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ issuer: 'http://127.0.0.1:5737/' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    prepareLoopbackRedirectMock.mockResolvedValue('http://127.0.0.1:43123/auth/callback')
    openAuthorizationWindowMock.mockResolvedValue(undefined)
    openEmbeddedAuthorizationMock.mockResolvedValue(undefined)
    openExternalMock.mockResolvedValue(undefined)
    resolveDesktopOidcIssuerMock.mockReset()
    window.xpodDesktop = {
      auth: {
        prepareLoopbackRedirect: prepareLoopbackRedirectMock,
        openAuthorizationWindow: openAuthorizationWindowMock,
        openEmbeddedAuthorization: openEmbeddedAuthorizationMock,
        closeEmbeddedAuthorization: vi.fn(),
        consumePendingRedirect: vi.fn(),
        onEmbeddedAuthorizationState: vi.fn(() => () => {}),
        onRedirect: vi.fn(() => () => {}),
      },
      app: {
        openExternal: openExternalMock,
      },
    } as any
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete window.xpodDesktop
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('falls back to the browser callback URL when desktop auth is unavailable', async () => {
    delete window.xpodDesktop
    window.history.replaceState({}, '', '/files')
    render(<TestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })

    const options = loginMock.mock.calls[0][0]
    expect(options).toMatchObject({
      oidcIssuer: 'http://127.0.0.1:5737',
      redirectUrl: `${window.location.origin}/auth/callback`,
      clientName: 'LinX',
    })
    expect(options.handleRedirect).toBeUndefined()
  })

  it('uses desktop loopback redirect and in-app auth window flow', async () => {
    window.history.replaceState({}, '', '/files')
    render(<TestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })

    const options = loginMock.mock.calls[0][0]
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5737/.well-known/openid-configuration',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(prepareLoopbackRedirectMock).toHaveBeenCalledTimes(1)
    expect(options).toMatchObject({
      oidcIssuer: 'http://127.0.0.1:5737',
      redirectUrl: 'http://127.0.0.1:43123/auth/callback',
      clientName: 'LinX',
      tokenType: 'DPoP',
    })
    expect(consumePendingPostLoginAppletId()).toBe('files')

    await options.handleRedirect('https://idp.example.com/authorize')
    expect(openAuthorizationWindowMock).toHaveBeenCalledWith('https://idp.example.com/authorize', {
      providerLabel: undefined,
    })
  })

  it('passes a non-strict HTTPS issuer to Inrupt without a browser discovery preflight', async () => {
    window.history.replaceState({}, '', '/files')
    render(<CloudTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect cloud' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(loginMock.mock.calls[0][0]).toMatchObject({
      oidcIssuer: 'https://id.undefineds.co',
      redirectUrl: 'http://127.0.0.1:43123/auth/callback',
    })
  })

  it('keeps loopback Local discovery strict when the local provider is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    render(<ErrorHandledTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect safely' }))

    await waitFor(() => {
      expect(window.sessionStorage.getItem('linx-post-login-applet')).toBeNull()
      expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
    })
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('keeps Standalone canonical discovery strict when the public SP is unreachable', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    render(<StrictStandaloneTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect standalone' }))

    await waitFor(() => {
      expect(window.sessionStorage.getItem('linx-post-login-applet')).toBeNull()
      expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://node-0000.undefineds.co/.well-known/openid-configuration',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('uses the desktop route for strict Standalone discovery before falling back to public reachability', async () => {
    resolveDesktopOidcIssuerMock.mockResolvedValueOnce('https://node-0000.undefineds.co/')
    window.xpodDesktop = {
      auth: {
        prepareLoopbackRedirect: prepareLoopbackRedirectMock,
        resolveOidcIssuer: resolveDesktopOidcIssuerMock,
        openAuthorizationWindow: openAuthorizationWindowMock,
        openEmbeddedAuthorization: openEmbeddedAuthorizationMock,
        closeEmbeddedAuthorization: vi.fn(),
        consumePendingRedirect: vi.fn(),
        onEmbeddedAuthorizationState: vi.fn(() => () => {}),
        onRedirect: vi.fn(() => () => {}),
      },
    } as any

    render(<StrictStandaloneTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect standalone' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })

    expect(resolveDesktopOidcIssuerMock).toHaveBeenCalledWith('https://node-0000.undefineds.co')
    expect(fetchMock).not.toHaveBeenCalledWith(
      'https://node-0000.undefineds.co/.well-known/openid-configuration',
      expect.anything(),
    )
    expect(loginMock.mock.calls[0][0]).toMatchObject({
      oidcIssuer: 'https://node-0000.undefineds.co',
    })
  })

  it('corrects legacy Local SP entry calls to Cloud OIDC before discovery', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ issuer: 'https://id.undefineds.co/' }),
    })
    render(<LegacyLocalSpEntryWithCloudAuthorityTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect legacy split local' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://id.undefineds.co/.well-known/openid-configuration',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(fetchMock).not.toHaveBeenCalledWith(
      'https://node-0000.undefineds.co/.well-known/openid-configuration',
      expect.anything(),
    )
    expect(loginMock.mock.calls[0][0]).toMatchObject({
      oidcIssuer: 'https://id.undefineds.co',
    })
    expect(getPendingLoginTransaction()).toEqual(expect.objectContaining({
      route: 'local',
      oidcEntryUrl: 'https://id.undefineds.co',
      oidcIssuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'https://node-0000.undefineds.co',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
    }))
  })

  it('resolves after opening the desktop authorization surface even though Inrupt login stays pending', async () => {
    loginMock.mockImplementationOnce(async (options) => {
      await options.handleRedirect('https://idp.example.com/authorize')
      return new Promise(() => {})
    })
    window.history.replaceState({}, '', '/files')
    render(<TestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(openAuthorizationWindowMock).toHaveBeenCalledWith('https://idp.example.com/authorize', {
        providerLabel: undefined,
      })
    })

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(2)
    })
  })

  it('rejects if opening the desktop authorization surface fails', async () => {
    openAuthorizationWindowMock.mockRejectedValueOnce(new Error('window failed'))
    loginMock.mockImplementationOnce(async (options) => {
      await options.handleRedirect('https://idp.example.com/authorize')
      return new Promise(() => {})
    })
    render(<ErrorHandledTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect safely' }))

    await waitFor(() => {
      expect(openAuthorizationWindowMock).toHaveBeenCalledWith('https://idp.example.com/authorize', {
        providerLabel: undefined,
      })
    })
    await waitFor(() => {
      expect(window.sessionStorage.getItem('linx-post-login-applet')).toBeNull()
      expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
    })
  })

  it('rejects when desktop login setup never opens an authorization surface', async () => {
    vi.useFakeTimers()
    try {
      loginMock.mockImplementationOnce(() => new Promise(() => {}))
      render(<ErrorHandledTestComponent />)

      fireEvent.click(screen.getByRole('button', { name: 'connect safely' }))

      await vi.runAllTimersAsync()

      expect(loginMock).toHaveBeenCalledTimes(1)
      expect(openAuthorizationWindowMock).not.toHaveBeenCalled()
      expect(window.sessionStorage.getItem('linx-post-login-applet')).toBeNull()
      expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('allows retrying after a pending login setup is cancelled', async () => {
    loginMock.mockImplementation(() => new Promise(() => {}))
    render(<CancelableTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByRole('button', { name: 'cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(2)
    })
  })

  it('uses embedded desktop authorization when requested', async () => {
    ensurePendingPostLoginAppletId('contacts')
    window.history.replaceState({}, '', '/chat')
    render(<EmbeddedTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect embedded' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })

    const options = loginMock.mock.calls[0][0]
    expect(consumePendingPostLoginAppletId()).toBe('contacts')
    expect(getPendingLoginAttempt()).toEqual({
      issuerUrl: 'http://localhost:5737',
      authorizationSurface: 'embedded',
      returnToAppletId: 'contacts',
      storageProviderUrl: 'http://localhost:5737',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
    })
    await options.handleRedirect('https://idp.example.com/authorize')
    expect(openEmbeddedAuthorizationMock).toHaveBeenCalledWith('https://idp.example.com/authorize?provisionCode=pc-123', {
      providerLabel: 'Local',
    })
  })

  it('persists Local storage separately while Cloud remains the OIDC issuer', async () => {
    render(<ManagedLocalWithCloudAccountAuthorityTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect split local' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })

    expect(loginMock.mock.calls[0][0]).toMatchObject({
      oidcIssuer: 'https://id.undefineds.co',
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getPendingLoginTransaction()).toEqual(expect.objectContaining({
      route: 'local',
      oidcEntryUrl: 'https://id.undefineds.co',
      oidcIssuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'https://node-0000.undefineds.co',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      nodeId: 'node-0000',
    }))
  })

  it('uses Cloud OIDC setup for managed Local while keeping the Local storage target', async () => {
    loginMock.mockImplementationOnce(async (options) => {
      await options.handleRedirect('https://id.undefineds.co/.oidc/auth?client_id=abc')
      return new Promise(() => {})
    })
    render(<ManagedLocalWithCloudAccountAuthorityTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect split local' }))

    await waitFor(() => {
      expect(openEmbeddedAuthorizationMock).toHaveBeenCalledTimes(1)
    })
    const openedUrl = new URL(openEmbeddedAuthorizationMock.mock.calls[0][0])
    expect(openedUrl.origin).toBe('https://id.undefineds.co')
    expect(openedUrl.pathname).toBe('/.oidc/auth')
    expect(openedUrl.searchParams.get('client_id')).toBe('abc')
    expect(openedUrl.searchParams.get('provisionCode')).toBe('pc-123')
    expect(loginMock.mock.calls[0][0]).toMatchObject({
      oidcIssuer: 'https://id.undefineds.co',
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getPendingLoginTransaction()).toEqual(expect.objectContaining({
      route: 'local',
      oidcEntryUrl: 'https://id.undefineds.co',
      oidcIssuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'https://node-0000.undefineds.co',
    }))
  })

  it('clears the pending target and attempt when login setup fails', async () => {
    loginMock.mockRejectedValueOnce(new Error('open failed'))
    window.history.replaceState({}, '', '/favorites')
    render(<ErrorHandledTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect safely' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })

    expect(window.sessionStorage.getItem('linx-post-login-applet')).toBeNull()
    expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
  })

  it('preserves the registered client when starting a fresh login', async () => {
    window.localStorage.setItem('solidClientAuthn:currentSession', 'pending-session')
    window.localStorage.setItem(
      'solidClientAuthenticationUser:pending-session',
      JSON.stringify({
        issuer: 'http://localhost:5737/',
        redirectUrl: 'http://127.0.0.1:43123/auth/callback',
        clientId: 'dynamic-client',
      }),
    )

    render(<TestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })
    // Keeping the client registration lets the provider honor
    // "Remember this client" across logins.
    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBe('pending-session')
    expect(window.localStorage.getItem('solidClientAuthenticationUser:pending-session')).not.toBeNull()
  })

  it('preserves restorable Solid client metadata when starting a fresh login', async () => {
    window.localStorage.setItem('solidClientAuthn:currentSession', 'stale-session')
    window.localStorage.setItem(
      'solidClientAuthenticationUser:stale-session',
      JSON.stringify({
        issuer: 'http://localhost:5737/',
        redirectUrl: 'http://localhost:5173/auth/callback',
        clientId: 'stale-client-id',
        isLoggedIn: true,
        webId: 'http://localhost:5737/alice/profile/card#me',
      }),
    )

    render(<TestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })
    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBe('stale-session')
    expect(window.localStorage.getItem('solidClientAuthenticationUser:stale-session')).not.toBeNull()
  })

  it('preserves the registered client while attempting a silent Web restore', async () => {
    delete window.xpodDesktop
    window.localStorage.setItem('solidClientAuthn:currentSession', 'remembered-session')
    window.localStorage.setItem(
      'solidClientAuthenticationUser:remembered-session',
      JSON.stringify({
        issuer: 'https://id.undefineds.co/',
        redirectUrl: 'http://127.0.0.1:5173/auth/callback',
        clientId: 'remembered-client-id',
        isLoggedIn: true,
        webId: 'https://id.undefineds.co/gcloud/profile/card#me',
      }),
    )

    render(<SilentWebTestComponent />)
    fireEvent.click(screen.getByRole('button', { name: 'restore cloud' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })
    expect(loginMock.mock.calls[0][0]).toMatchObject({ prompt: 'none' })
    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBe('remembered-session')
    expect(window.localStorage.getItem('solidClientAuthenticationUser:remembered-session')).not.toBeNull()
  })

  it('preserves Solid client metadata on fresh login even when the Inrupt session reports logged in', async () => {
    sessionInfoMock.current = { isLoggedIn: true }
    window.localStorage.setItem('solidClientAuthn:currentSession', 'active-session')
    window.localStorage.setItem(
      'solidClientAuthenticationUser:active-session',
      JSON.stringify({
        issuer: 'http://localhost:5737/',
        redirectUrl: 'http://127.0.0.1:43123/auth/callback',
        clientId: 'active-client-id',
        isLoggedIn: true,
        webId: 'http://localhost:5737/alice/profile/card#me',
      }),
    )

    render(<TestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })
    // A session reported as logged in may still be backed by a stale,
    // server-side deleted client; that case self-heals via the
    // invalid_client retry instead of an upfront purge, so remembered
    // consent survives whenever the client is still valid.
    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBe('active-session')
    expect(window.localStorage.getItem('solidClientAuthenticationUser:active-session')).not.toBeNull()
  })

  it('registers a fresh client and retries once when the provider rejects the stored client', async () => {
    const clearStoredSolidSessionSpy = vi.spyOn(loginUtils, 'clearStoredSolidSession')
    loginMock.mockRejectedValueOnce(new Error('Authenticating with unknown client'))
    window.localStorage.setItem('solidClientAuthn:currentSession', 'rejected-session')
    window.localStorage.setItem(
      'solidClientAuthenticationUser:rejected-session',
      JSON.stringify({
        issuer: 'http://localhost:5737/',
        redirectUrl: 'http://localhost:5173/auth/callback',
        clientId: 'deleted-client-id',
      }),
    )

    render(<TestComponent />)
    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(2)
    })
    // The rejected client state was purged before the retry.
    expect(window.localStorage.getItem('solidClientAuthenticationUser:rejected-session')).toBeNull()
    clearStoredSolidSessionSpy.mockRestore()
  })

  it('purges the cached Solid session when the provider keeps rejecting the client', async () => {
    const clearStoredSolidSessionSpy = vi.spyOn(loginUtils, 'clearStoredSolidSession')
    loginMock.mockRejectedValue(new Error('Authenticating with unknown client'))

    function LocalComponent() {
      const { connect } = useOidcConnect()
      return (
        <button onClick={() => { void connect('http://localhost:5737/').catch(() => undefined) }}>
          connect-catch
        </button>
      )
    }

    render(<LocalComponent />)
    fireEvent.click(screen.getByRole('button', { name: 'connect-catch' }))

    await waitFor(() => {
      expect(clearStoredSolidSessionSpy).toHaveBeenCalled()
    })
    expect(loginMock).toHaveBeenCalledTimes(2)
    clearStoredSolidSessionSpy.mockRestore()
  })

  it('falls back to the system browser when embedded authorization fails', async () => {
    openEmbeddedAuthorizationMock.mockRejectedValueOnce(new Error('embedded failed'))
    loginMock.mockImplementationOnce(async (options) => {
      await options.handleRedirect('https://idp.example.com/authorize')
      return new Promise(() => {})
    })
    render(<EmbeddedTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect embedded' }))

    await waitFor(() => {
      expect(openExternalMock).toHaveBeenCalledWith(
        'https://idp.example.com/authorize?provisionCode=pc-123',
      )
    })
  })

  it('rejects browser login setup when Inrupt resolves but the page does not leave the app', async () => {
    vi.useFakeTimers()
    try {
      delete window.xpodDesktop
      loginMock.mockResolvedValueOnce(undefined)
      render(<ErrorHandledTestComponent />)

      fireEvent.click(screen.getByRole('button', { name: 'connect safely' }))

      await Promise.resolve()
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(10_000)

      expect(loginMock).toHaveBeenCalledTimes(1)
      expect(window.sessionStorage.getItem('linx-post-login-applet')).toBeNull()
      expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not silently accept a duplicate login while the first setup is pending', async () => {
    loginMock.mockImplementationOnce(() => new Promise<void>(() => {}))
    render(<TestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect' }))
    fireEvent.click(screen.getByRole('button', { name: 'connect' }))

    await waitFor(() => expect(loginMock).toHaveBeenCalledTimes(1))
  })
})
