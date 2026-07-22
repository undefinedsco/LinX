import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppRuntime } from './AppRuntime'

const solidSessionProviderMock = vi.fn(({ children }) => <div>{children}</div>)

vi.mock('./providers/solid-session-provider', () => ({
  SolidSessionProvider: (props: unknown) => solidSessionProviderMock(props),
}))

vi.mock('./providers/solid-database-provider', () => ({
  SolidDatabaseProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('./providers/pod-collections-bootstrap', () => ({
  PodCollectionsBootstrap: () => null,
}))

vi.mock('./lib/telemetry/telemetry-context', () => ({
  TelemetryProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@tanstack/react-router', () => ({
  RouterProvider: () => null,
}))

vi.mock('./router', () => ({
  router: {},
}))

describe('AppRuntime', () => {
  afterEach(() => {
    vi.clearAllMocks()
    delete window.xpodDesktop
    delete (window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__
    window.localStorage.clear()
    window.history.replaceState({}, '', '/')
  })

  it('drops a stale dynamic loopback client before the service provider can restore it', () => {
    ;(window as Window & { __LINX_SERVICE__?: boolean }).__LINX_SERVICE__ = true
    window.localStorage.setItem('solidClientAuthn:currentSession', 'stale-session')
    window.localStorage.setItem('solidClientAuthenticationUser:stale-session', JSON.stringify({
      issuer: 'http://localhost:5737',
      redirectUrl: `${window.location.origin}/auth/callback`,
      clientId: 'stale-dynamic-client',
      dpop: 'true',
      keepAlive: 'true',
    }))

    render(<AppRuntime />)

    expect(solidSessionProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ restorePreviousSession: false }),
    )
    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBeNull()
    expect(window.localStorage.getItem('solidClientAuthenticationUser:stale-session')).toBeNull()
  })

  it('enables Inrupt session restore on normal web routes', () => {
    render(<AppRuntime />)

    expect(solidSessionProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ restorePreviousSession: true }),
    )
  })


  it('disables restore when a desktop auth bridge is present', () => {
    window.xpodDesktop = { auth: { openEmbeddedAuthorization: vi.fn() } } as any

    render(<AppRuntime />)

    expect(solidSessionProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ restorePreviousSession: false }),
    )
  })

  it('keeps web callback processing owned by AuthCallback', () => {
    window.history.replaceState({}, '', '/auth/callback?code=abc&state=xyz')
    window.localStorage.setItem('oidc.xyz', 'pkce-state')

    render(<AppRuntime />)

    expect(solidSessionProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ restorePreviousSession: false }),
    )
    expect(window.localStorage.getItem('oidc.xyz')).toBe('pkce-state')
    window.localStorage.removeItem('oidc.xyz')
  })

  it('disables Inrupt silent restore in Electron desktop runtime', () => {
    window.xpodDesktop = { auth: { prepareLoopbackRedirect: vi.fn(), consumePendingRedirect: vi.fn() } } as any

    render(<AppRuntime />)

    expect(solidSessionProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ restorePreviousSession: false }),
    )
  })

  it('keeps Electron callback restore owned by the callback page', () => {
    window.xpodDesktop = { auth: { prepareLoopbackRedirect: vi.fn(), consumePendingRedirect: vi.fn() } } as any
    window.history.replaceState({}, '', '/auth/callback?code=abc&state=xyz')

    render(<AppRuntime />)

    expect(solidSessionProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ restorePreviousSession: false }),
    )
  })
})
