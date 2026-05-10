import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionRestore } from './use-session-restore'

const handleIncomingRedirectMock = vi.fn()
const consumePendingRedirectMock = vi.fn()
const onRedirectMock = vi.fn()
const clearStoredSolidSessionMock = vi.fn()
const hasStoredSolidSessionMock = vi.fn()
const getStoredSolidSessionMock = vi.fn()

const sessionState = {
  info: {
    isLoggedIn: false,
    webId: undefined as string | undefined,
  },
  sessionRequestInProgress: false,
}

vi.mock('@inrupt/solid-ui-react', () => ({
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

  it('normalizes desktop loopback callback and restores after redirect event', async () => {
    window.history.replaceState({}, '', '/chat')
    render(<TestComponent />)

    await waitFor(() => {
      expect(onRedirectMock).toHaveBeenCalled()
    })
    expect(screen.getByTestId('restore-failed').textContent).toBe('false')

    redirectListener?.()

    await waitFor(() => {
      expect(handleIncomingRedirectMock).toHaveBeenCalledTimes(1)
    })

    expect(handleIncomingRedirectMock).toHaveBeenCalledWith({
      url: `${window.location.origin}/auth/callback?code=abc&state=xyz`,
      restorePreviousSession: true,
    })

    await waitFor(() => {
      expect(screen.getByTestId('restore-complete').textContent).toBe('true')
    })
    expect(clearStoredSolidSessionMock).not.toHaveBeenCalled()
  })

  it('maps desktop loopback callback onto the current HTTP renderer origin', async () => {
    window.history.replaceState({}, '', '/settings')

    render(<TestComponent />)

    await waitFor(() => {
      expect(onRedirectMock).toHaveBeenCalled()
    })

    redirectListener?.()

    await waitFor(() => {
      expect(handleIncomingRedirectMock).toHaveBeenCalledTimes(1)
    })

    expect(handleIncomingRedirectMock).toHaveBeenCalledWith({
      url: `${window.location.origin}/auth/callback?code=abc&state=xyz`,
      restorePreviousSession: true,
    })
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

  it('maps desktop loopback callback onto the file renderer URL in file mode', async () => {
    const originalLocation = window.location
    const fileLocation = new URL('file:///Applications/LinX.app/Contents/Resources/web/index.html#/chat')
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: fileLocation,
    })

    render(<TestComponent />)

    await waitFor(() => {
      expect(onRedirectMock).toHaveBeenCalled()
    })
    expect(screen.getByTestId('restore-failed').textContent).toBe('false')

    redirectListener?.()

    await waitFor(() => {
      expect(handleIncomingRedirectMock).toHaveBeenCalledTimes(1)
    })

    expect(handleIncomingRedirectMock).toHaveBeenCalledWith({
      url: 'file:///Applications/LinX.app/Contents/Resources/web/index.html?code=abc&state=xyz#/chat',
      restorePreviousSession: true,
    })

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
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
