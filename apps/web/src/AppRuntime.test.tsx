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
    window.history.replaceState({}, '', '/')
  })

  it('lets the Inrupt provider restore sessions in normal web runtime', () => {
    render(<AppRuntime />)

    expect(solidSessionProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ restorePreviousSession: true }),
    )
  })


  it('keeps web-style desktop test stubs on normal web callback restore', () => {
    window.xpodDesktop = { auth: { openEmbeddedAuthorization: vi.fn() } } as any

    render(<AppRuntime />)

    expect(solidSessionProviderMock).toHaveBeenCalledWith(
      expect.objectContaining({ restorePreviousSession: true }),
    )
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
