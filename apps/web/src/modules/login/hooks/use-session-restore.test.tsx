import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionRestore } from './use-session-restore'

const handleIncomingRedirectMock = vi.fn()
const consumePendingRedirectMock = vi.fn()
const onRedirectMock = vi.fn()
const clearStoredSolidSessionMock = vi.fn()
const hasStoredSolidSessionMock = vi.fn()
const getStoredSolidSessionMock = vi.fn()
const ensurePendingPostLoginAppletIdMock = vi.fn()
const resolvePostLoginAppletIdMock = vi.fn()

const sessionState = {
  info: {
    isLoggedIn: false,
    webId: undefined as string | undefined,
  },
  sessionRequestInProgress: false,
}

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({
    session: {
      info: sessionState.info,
      handleIncomingRedirect: handleIncomingRedirectMock,
    },
    sessionRequestInProgress: sessionState.sessionRequestInProgress,
  }),
}))

vi.mock('../login-utils', () => ({
  clearStoredSolidSession: () => clearStoredSolidSessionMock(),
  hasStoredSolidSession: () => hasStoredSolidSessionMock(),
  getStoredSolidSession: () => getStoredSolidSessionMock(),
  getPendingLoginAttempt: () => null,
  ensurePendingPostLoginAppletId: (appletId: string) => ensurePendingPostLoginAppletIdMock(appletId),
  resolvePostLoginAppletId: () => resolvePostLoginAppletIdMock(),
}))

function TestComponent() {
  const restore = useSessionRestore()
  return (
    <div>
      <div data-testid="restore-complete">{String(restore.restoreComplete)}</div>
      <div data-testid="restore-failed">{String(restore.restoreFailed)}</div>
      <div data-testid="has-stored-session">{String(restore.hasStoredSession)}</div>
    </div>
  )
}

describe('useSessionRestore', () => {
  let redirectListener: (() => void) | null = null

  beforeEach(() => {
    vi.clearAllMocks()
    sessionState.info.isLoggedIn = false
    sessionState.info.webId = undefined
    sessionState.sessionRequestInProgress = false
    handleIncomingRedirectMock.mockImplementation(async () => {
      sessionState.info.isLoggedIn = true
      sessionState.info.webId = 'https://alice.example/profile/card#me'
      return { isLoggedIn: true }
    })
    hasStoredSolidSessionMock.mockReturnValue(false)
    getStoredSolidSessionMock.mockReturnValue(null)
    ensurePendingPostLoginAppletIdMock.mockReset()
    resolvePostLoginAppletIdMock.mockReset()
    resolvePostLoginAppletIdMock.mockReturnValue('chat')
    consumePendingRedirectMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('http://127.0.0.1:43123/auth/callback?code=abc&state=xyz')
    onRedirectMock.mockImplementation((callback: () => void) => {
      redirectListener = callback
      return () => {
        redirectListener = null
      }
    })
    window.xpodDesktop = {
      auth: {
        prepareLoopbackRedirect: vi.fn(),
        consumePendingRedirect: consumePendingRedirectMock,
        onRedirect: onRedirectMock,
      },
    } as any
  })

  afterEach(() => {
    vi.useRealTimers()
    delete window.xpodDesktop
    redirectListener = null
    window.history.replaceState({}, '', '/')
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('waits for SolidSessionProvider to restore web callback redirects', async () => {
    delete window.xpodDesktop
    window.history.replaceState({}, '', '/auth/callback?code=abc&state=xyz')
    sessionState.sessionRequestInProgress = true

    const { rerender } = render(<TestComponent />)

    expect(handleIncomingRedirectMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('has-stored-session').textContent).toBe('true')
    expect(screen.getByTestId('restore-failed').textContent).toBe('false')

    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://alice.example/profile/card#me'
    sessionState.sessionRequestInProgress = false
    rerender(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByTestId('restore-complete').textContent).toBe('true')
    })
    expect(handleIncomingRedirectMock).not.toHaveBeenCalled()
    expect(clearStoredSolidSessionMock).not.toHaveBeenCalled()
  })

  it('remembers the current micro app before web stored-session restore leaves the route', async () => {
    delete window.xpodDesktop
    window.history.replaceState({}, '', '/files')
    getStoredSolidSessionMock.mockReturnValue({
      sessionId: 'linx-session',
      issuerUrl: 'http://localhost:5737',
      redirectUrl: 'http://127.0.0.1:43123/auth/callback',
      clientId: 'http://127.0.0.1:43123/client',
      tokenType: 'Bearer',
    })
    resolvePostLoginAppletIdMock.mockReturnValue('files')

    render(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByTestId('restore-failed').textContent).toBe('false')
    })
    expect(ensurePendingPostLoginAppletIdMock).toHaveBeenCalledWith('files')
  })

  it('remembers the current micro app on already-authenticated stored-session app route loads', async () => {
    delete window.xpodDesktop
    window.history.replaceState({}, '', '/favorites')
    getStoredSolidSessionMock.mockReturnValue({
      sessionId: 'linx-session',
      issuerUrl: 'http://localhost:5737',
      redirectUrl: 'http://127.0.0.1:43123/auth/callback',
      clientId: 'http://127.0.0.1:43123/client',
      tokenType: 'Bearer',
    })
    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://alice.example/profile/card#me'
    resolvePostLoginAppletIdMock.mockReturnValue('favorites')

    render(<TestComponent />)

    expect(ensurePendingPostLoginAppletIdMock).toHaveBeenCalledWith('favorites')
  })

  it('does not fail web callback restore while SolidSessionProvider is still in progress', async () => {
    delete window.xpodDesktop
    window.history.replaceState({}, '', '/auth/callback?code=slow&state=xyz')
    sessionState.sessionRequestInProgress = true

    const { rerender } = render(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByTestId('restore-failed').textContent).toBe('false')
    })
    expect(handleIncomingRedirectMock).not.toHaveBeenCalled()

    sessionState.info.isLoggedIn = true
    sessionState.info.webId = 'https://alice.example/profile/card#me'
    sessionState.sessionRequestInProgress = false
    rerender(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByTestId('restore-complete').textContent).toBe('true')
    })

    expect(screen.getByTestId('restore-failed').textContent).toBe('false')
    expect(clearStoredSolidSessionMock).not.toHaveBeenCalled()
  })

  it('fails stored web session restore only after the provider timeout', async () => {
    vi.useFakeTimers()
    delete window.xpodDesktop
    window.history.replaceState({}, '', '/chat')
    getStoredSolidSessionMock.mockReturnValue({
      sessionId: 'linx-session',
      issuerUrl: 'http://localhost:5737',
      redirectUrl: 'http://localhost:5173/auth/callback',
      clientId: 'dynamic-client',
      tokenType: null,
      webId: null,
    })

    render(<TestComponent />)

    await act(async () => {})
    expect(screen.getByTestId('restore-failed').textContent).toBe('false')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })

    expect(screen.getByTestId('restore-failed').textContent).toBe('true')
    expect(handleIncomingRedirectMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('restore-complete').textContent).toBe('false')
  })

  it('fails a web restore that remains in progress instead of loading forever', async () => {
    vi.useFakeTimers()
    delete window.xpodDesktop
    getStoredSolidSessionMock.mockReturnValue({
      sessionId: 'linx-session',
      issuerUrl: 'http://localhost:5737',
      redirectUrl: 'http://127.0.0.1:5173/auth/callback',
      clientId: 'http://127.0.0.1:5173/client',
      tokenType: 'Bearer',
    })
    sessionState.sessionRequestInProgress = true

    render(<TestComponent />)
    await act(async () => {})

    expect(screen.getByTestId('restore-failed').textContent).toBe('false')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
    })

    expect(screen.getByTestId('restore-failed').textContent).toBe('true')
    expect(screen.getByTestId('restore-complete').textContent).toBe('false')
  })

  it('keeps web callback restore pending briefly after SolidSessionProvider finishes without login', async () => {
    vi.useFakeTimers()
    delete window.xpodDesktop
    window.history.replaceState({}, '', '/auth/callback?code=slow&state=xyz')
    sessionState.sessionRequestInProgress = false

    render(<TestComponent />)
    await act(async () => {})

    expect(screen.getByTestId('restore-failed').textContent).toBe('false')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(14999)
    })
    expect(screen.getByTestId('restore-failed').textContent).toBe('false')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })

    expect(screen.getByTestId('restore-failed').textContent).toBe('true')
  })

  it('keeps the desktop loopback callback out of the renderer route after redirect event', async () => {
    window.history.replaceState({}, '', '/chat')
    render(<TestComponent />)

    await waitFor(() => {
      expect(onRedirectMock).toHaveBeenCalled()
    })
    expect(screen.getByTestId('restore-failed').textContent).toBe('false')

    redirectListener?.()

    await waitFor(() => {
      expect(window.location.pathname).toBe('/auth/callback')
    })

    expect(window.location.search).toBe('')
    expect(window.sessionStorage.getItem('linx-desktop-auth-redirect-url')).toBe(
      'http://127.0.0.1:43123/auth/callback?code=abc&state=xyz',
    )
    expect(handleIncomingRedirectMock).not.toHaveBeenCalled()
    expect(clearStoredSolidSessionMock).not.toHaveBeenCalled()
  })

  it('routes desktop loopback callbacks to a clean renderer callback URL', async () => {
    window.history.replaceState({}, '', '/settings')

    render(<TestComponent />)

    await waitFor(() => {
      expect(onRedirectMock).toHaveBeenCalled()
    })

    redirectListener?.()

    await waitFor(() => {
      expect(window.location.pathname).toBe('/auth/callback')
    })

    expect(window.location.search).toBe('')
    expect(handleIncomingRedirectMock).not.toHaveBeenCalled()
  })

  it('waits for SolidSessionProvider to restore a desktop renderer callback URL when no pending loopback redirect exists', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=current&state=xyz')
    consumePendingRedirectMock.mockReset()
    consumePendingRedirectMock.mockResolvedValue(null)

    render(<TestComponent />)

    expect(handleIncomingRedirectMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('restore-failed').textContent).toBe('false')

    await waitFor(() => {
      expect(screen.getByTestId('has-stored-session').textContent).toBe('true')
    })
  })

  it('fails fast on regular routes with no stored session or callback payload', async () => {
    delete window.xpodDesktop

    render(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByTestId('restore-failed').textContent).toBe('true')
    })

    expect(handleIncomingRedirectMock).not.toHaveBeenCalled()
  })

  it('does not auto-restore desktop sessions from stored auth storage on cold start', async () => {
    getStoredSolidSessionMock.mockReturnValue({
      sessionId: 'linx-session',
      issuerUrl: 'http://localhost:5737',
      redirectUrl: 'http://127.0.0.1:43123/auth/callback',
      clientId: 'http://127.0.0.1:43123/client',
      tokenType: 'Bearer',
    })

    render(<TestComponent />)

    await waitFor(() => {
      expect(screen.getByTestId('has-stored-session').textContent).toBe('false')
    })
    expect(handleIncomingRedirectMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('restore-failed').textContent).toBe('false')
  })
})
