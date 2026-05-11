import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumePendingPostLoginMicroAppId,
  ensurePendingPostLoginMicroAppId,
  getPendingLoginAttempt,
} from '../login-utils'
import { useOidcConnect } from './use-oidc-connect'

const loginMock = vi.fn()
const fetchMock = vi.fn()
const openAuthorizationWindowMock = vi.fn()
const openEmbeddedAuthorizationMock = vi.fn()
const prepareLoopbackRedirectMock = vi.fn()

vi.mock('@inrupt/solid-ui-react', () => ({
  useSession: () => ({
    login: loginMock,
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

function EmbeddedTestComponent() {
  const { connect } = useOidcConnect()

  return (
    <button onClick={() => void connect('http://localhost:5737/', {
      authorizationSurface: 'embedded',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
    })}>
      connect embedded
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

describe('useOidcConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ issuer: 'http://127.0.0.1:5737/' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    prepareLoopbackRedirectMock.mockResolvedValue('http://127.0.0.1:43123/auth/callback')
    openAuthorizationWindowMock.mockResolvedValue(undefined)
    openEmbeddedAuthorizationMock.mockResolvedValue(undefined)
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
    } as any
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    delete window.xpodDesktop
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
    expect(consumePendingPostLoginMicroAppId()).toBe('files')

    await options.handleRedirect('https://idp.example.com/authorize')
    expect(openAuthorizationWindowMock).toHaveBeenCalledWith('https://idp.example.com/authorize')
  })

  it('falls back to the configured HTTPS issuer when discovery times out', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    window.history.replaceState({}, '', '/files')
    render(<CloudTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect cloud' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://id.undefineds.co/.well-known/openid-configuration',
      expect.objectContaining({ method: 'GET' }),
    )
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
      expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBeNull()
      expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
    })
    expect(loginMock).not.toHaveBeenCalled()
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
      expect(openAuthorizationWindowMock).toHaveBeenCalledWith('https://idp.example.com/authorize')
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
      expect(openAuthorizationWindowMock).toHaveBeenCalledWith('https://idp.example.com/authorize')
    })
    await waitFor(() => {
      expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBeNull()
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
      expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBeNull()
      expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('uses embedded desktop authorization when requested', async () => {
    ensurePendingPostLoginMicroAppId('contacts')
    window.history.replaceState({}, '', '/chat')
    render(<EmbeddedTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect embedded' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })

    const options = loginMock.mock.calls[0][0]
    expect(consumePendingPostLoginMicroAppId()).toBe('contacts')
    expect(getPendingLoginAttempt()).toEqual({
      issuerUrl: 'http://127.0.0.1:5737',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'contacts',
      providerUrl: 'http://localhost:5737',
    })
    await options.handleRedirect('https://idp.example.com/authorize')
    expect(openEmbeddedAuthorizationMock).toHaveBeenCalledWith('https://idp.example.com/authorize?provisionCode=pc-123')
  })

  it('clears the pending target and attempt when login setup fails', async () => {
    loginMock.mockRejectedValueOnce(new Error('open failed'))
    window.history.replaceState({}, '', '/favorites')
    render(<ErrorHandledTestComponent />)

    fireEvent.click(screen.getByRole('button', { name: 'connect safely' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledTimes(1)
    })

    expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBeNull()
    expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
  })

  it('clears unrestorable Solid auth storage before starting a fresh login', async () => {
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
    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBeNull()
    expect(window.localStorage.getItem('solidClientAuthenticationUser:pending-session')).toBeNull()
  })
})
