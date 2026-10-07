import { act, renderHook } from '@testing-library/react'
import { EventEmitter } from 'events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EVENTS } from '@inrupt/solid-client-authn-browser'
import { useLoginStore } from '@linx/stores/login'

import { requestSessionRecovery, setPendingLoginAttempt } from '../login-utils'
import { useSessionTokenMaintenance } from './use-session-token-maintenance'

const connectMock = vi.fn()
const sessionEvents = new EventEmitter()
const sessionFetchMock = vi.fn()

const sessionInfo = {
  isLoggedIn: true,
  webId: 'https://id.undefineds.co/gcloud/profile/card#me',
  sessionId: 'session-1',
  expirationDate: Date.now() + 3600_000,
}

vi.mock('@/providers/solid-session-context', () => ({
  useSession: () => ({
    session: {
      info: sessionInfo,
      events: sessionEvents,
      fetch: sessionFetchMock,
    },
    sessionRequestInProgress: false,
  }),
}))

vi.mock('./use-oidc-connect', () => ({
  useOidcConnect: () => ({ connect: connectMock }),
}))

vi.mock('./use-embedded-authorization-state', () => ({
  useEmbeddedAuthorizationState: () => ({ open: false, reason: 'dismissed', ready: false }),
}))

describe('useSessionTokenMaintenance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    sessionEvents.removeAllListeners()
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/files')
    sessionInfo.isLoggedIn = true
    sessionInfo.expirationDate = Date.now() + 3600_000
    useLoginStore.setState({
      storedAccount: {
        displayName: 'gcloud',
        issuerUrl: 'https://id.undefineds.co',
        issuerLabel: 'Cloud',
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('re-authenticates interactively when the SDK reports the session expired', async () => {
    renderHook(() => useSessionTokenMaintenance())

    await act(async () => {
      sessionEvents.emit(EVENTS.SESSION_EXPIRED)
      await Promise.resolve()
    })

    expect(connectMock).toHaveBeenCalledTimes(1)
    expect(connectMock).toHaveBeenCalledWith('https://id.undefineds.co', expect.objectContaining({
      authorizationSurface: 'window',
    }))
  })

  it('re-authenticates immediately when an authenticated request reports a stale session', async () => {
    renderHook(() => useSessionTokenMaintenance())

    await act(async () => {
      requestSessionRecovery()
      await Promise.resolve()
    })

    expect(connectMock).toHaveBeenCalledTimes(1)
    expect(connectMock).toHaveBeenCalledWith('https://id.undefineds.co', expect.objectContaining({
      authorizationSurface: 'window',
    }))
  })

  it('prefers the pending login attempt context for recovery', async () => {
    setPendingLoginAttempt({
      issuerUrl: 'https://id.undefineds.co',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'files',
    })
    renderHook(() => useSessionTokenMaintenance())

    await act(async () => {
      sessionEvents.emit(EVENTS.SESSION_EXPIRED)
      await Promise.resolve()
    })

    expect(connectMock).toHaveBeenCalledWith('https://id.undefineds.co', expect.objectContaining({
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'files',
    }))
  })

  it('runs at most one recovery until the session settles', async () => {
    renderHook(() => useSessionTokenMaintenance())

    await act(async () => {
      sessionEvents.emit(EVENTS.SESSION_EXPIRED)
      sessionEvents.emit(EVENTS.SESSION_EXPIRED)
      await Promise.resolve()
    })
    expect(connectMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      sessionEvents.emit(EVENTS.LOGIN)
      sessionEvents.emit(EVENTS.SESSION_EXPIRED)
      await Promise.resolve()
    })
    expect(connectMock).toHaveBeenCalledTimes(2)
  })

  it('does not recover while on the auth callback route', async () => {
    window.history.replaceState({}, '', '/auth/callback?error=login_required')
    renderHook(() => useSessionTokenMaintenance())

    await act(async () => {
      sessionEvents.emit(EVENTS.SESSION_EXPIRED)
      await Promise.resolve()
    })

    expect(connectMock).not.toHaveBeenCalled()
  })

  it('recovers when an expiry probe sees persistent 401 responses', async () => {
    sessionInfo.expirationDate = Date.now() - 1000
    sessionFetchMock.mockResolvedValue(new Response('', { status: 401 }))
    renderHook(() => useSessionTokenMaintenance())

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })
    expect(sessionFetchMock).toHaveBeenCalledTimes(1)
    expect(connectMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(connectMock).toHaveBeenCalledTimes(1)
  })

  it('does not recover when the probe succeeds', async () => {
    sessionInfo.expirationDate = Date.now() - 1000
    sessionFetchMock.mockImplementation(async () => {
      sessionInfo.expirationDate = Date.now() + 3600_000
      return new Response('', { status: 200 })
    })
    renderHook(() => useSessionTokenMaintenance())

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
    })

    expect(connectMock).not.toHaveBeenCalled()
  })

  it('recovers when a public profile accepts an expired token without refreshing it', async () => {
    sessionInfo.expirationDate = Date.now() - 1000
    sessionFetchMock.mockResolvedValue(new Response(null, { status: 304 }))
    renderHook(() => useSessionTokenMaintenance())

    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(5000)
    })

    expect(sessionFetchMock).toHaveBeenCalledTimes(2)
    expect(connectMock).toHaveBeenCalledTimes(1)
  })

  it('ignores expiry signals when logged out', async () => {
    sessionInfo.isLoggedIn = false
    renderHook(() => useSessionTokenMaintenance())

    await act(async () => {
      sessionEvents.emit(EVENTS.SESSION_EXPIRED)
      await Promise.resolve()
    })

    expect(connectMock).not.toHaveBeenCalled()
  })
})
