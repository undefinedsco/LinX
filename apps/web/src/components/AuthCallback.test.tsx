import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPendingLoginAttempt,
  clearPendingPostLoginMicroAppId,
  ensurePendingPostLoginMicroAppId,
  setPendingLoginAttempt,
} from '@/modules/login/login-utils'

const connectMock = vi.fn()
const onSuccessMock = vi.fn()
const onErrorMock = vi.fn()

const sessionState = {
  info: {
    isLoggedIn: false,
    sessionId: 'session-1',
  },
  sessionRequestInProgress: false,
}

vi.mock('@inrupt/solid-ui-react', () => ({
  useSession: () => ({
    session: {
      info: sessionState.info,
    },
    sessionRequestInProgress: sessionState.sessionRequestInProgress,
  }),
}))

vi.mock('@/modules/login/hooks/use-oidc-connect', () => ({
  useOidcConnect: () => ({
    connect: connectMock,
  }),
}))

import SolidAuthCallback from './AuthCallback'

describe('AuthCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionState.info.isLoggedIn = false
    sessionState.info.sessionId = 'session-1'
    sessionState.sessionRequestInProgress = false
    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    window.localStorage.removeItem('solidClientAuthn:currentSession')
    window.history.replaceState({}, '', '/auth/callback')
  })

  it('calls onSuccess when the session resolves', async () => {
    sessionState.info.isLoggedIn = true
    window.localStorage.setItem('solidClientAuthn:currentSession', 'session-1')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    await waitFor(() => {
      expect(onSuccessMock).toHaveBeenCalledTimes(1)
    })
  })

  it('calls onSuccess once login is established even if the provider is still finishing background work', async () => {
    sessionState.info.isLoggedIn = true
    sessionState.sessionRequestInProgress = true
    window.localStorage.setItem('solidClientAuthn:currentSession', 'session-1')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    await waitFor(() => {
      expect(onSuccessMock).toHaveBeenCalledTimes(1)
    })
  })

  it('waits for the current session key before calling onSuccess', async () => {
    sessionState.info.isLoggedIn = true

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    expect(onSuccessMock).not.toHaveBeenCalled()

    window.localStorage.setItem('solidClientAuthn:currentSession', 'session-1')

    await waitFor(() => {
      expect(onSuccessMock).toHaveBeenCalledTimes(1)
    })
  })

  it('renders a retry action for the last Cloud attempt', async () => {
    setPendingLoginAttempt({
      issuerUrl: 'https://cloud.example.com',
      authorizationSurface: 'window',
      returnToMicroAppId: 'files',
    })
    window.history.replaceState({}, '', '/auth/callback?error=access_denied&error_description=Denied')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    expect(screen.getByText('Denied')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试 Cloud' }))

    await waitFor(() => {
      expect(connectMock).toHaveBeenCalledWith('https://cloud.example.com', {
        authorizationSurface: 'window',
        returnToMicroAppId: 'files',
        providerUrl: undefined,
        providerLabel: undefined,
        authorizationQuery: undefined,
      })
    })
  })

  it('preserves Local provisioning context when retrying a Cloud IDP + Local SP attempt', async () => {
    setPendingLoginAttempt({
      issuerUrl: 'https://id.undefineds.co',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
      providerUrl: 'https://node-0000.undefineds.co',
      providerLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
    })
    window.history.replaceState({}, '', '/auth/callback?error=access_denied')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    fireEvent.click(screen.getByRole('button', { name: '重试 Local' }))

    await waitFor(() => {
      expect(connectMock).toHaveBeenCalledWith('https://id.undefineds.co', {
        authorizationSurface: 'embedded',
        returnToMicroAppId: 'chat',
        providerUrl: 'https://node-0000.undefineds.co',
        providerLabel: 'Local',
        authorizationQuery: {
          provisionCode: 'pc-123',
        },
      })
    })
  })

  it('renders a retry action for the last Local attempt', async () => {
    setPendingLoginAttempt({
      issuerUrl: 'http://localhost:5737',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    })
    window.history.replaceState({}, '', '/auth/callback?error=server_error')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    expect(screen.getByRole('button', { name: '重试 Local' })).toBeTruthy()
  })

  it('falls back to return-only when there is no retry context', async () => {
    window.history.replaceState({}, '', '/auth/callback?error=server_error')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    expect(screen.queryByRole('button', { name: '重试 Cloud' })).toBeNull()
    expect(screen.queryByRole('button', { name: '重试 Local' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '返回登录' }))
    expect(onErrorMock).toHaveBeenCalledTimes(1)
  })

  it('clears pending login context when returning to login', async () => {
    setPendingLoginAttempt({
      issuerUrl: 'https://cloud.example.com',
      authorizationSurface: 'window',
      returnToMicroAppId: 'files',
    })
    ensurePendingPostLoginMicroAppId('files')
    window.history.replaceState({}, '', '/auth/callback?error=server_error')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    fireEvent.click(screen.getByRole('button', { name: '返回登录' }))

    expect(window.sessionStorage.getItem('linx-pending-login-attempt')).toBeNull()
    expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBeNull()
  })

  it('keeps the original post-login target available while showing a callback error', async () => {
    setPendingLoginAttempt({
      issuerUrl: 'http://localhost:5737',
      authorizationSurface: 'window',
      returnToMicroAppId: 'files',
    })
    ensurePendingPostLoginMicroAppId('files')
    window.history.replaceState({}, '', '/auth/callback?error=access_denied')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    expect(screen.getByRole('button', { name: '重试 Local' })).toBeTruthy()
    expect(window.sessionStorage.getItem('linx-post-login-micro-app')).toBe('files')
    expect(window.sessionStorage.getItem('linx-pending-login-attempt')).not.toBeNull()
  })

  it('shows a retry failure if reconnecting cannot be started', async () => {
    connectMock.mockRejectedValueOnce(new Error('retry failed'))
    setPendingLoginAttempt({
      issuerUrl: 'https://cloud.example.com',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    })
    window.history.replaceState({}, '', '/auth/callback?error=access_denied')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    fireEvent.click(screen.getByRole('button', { name: '重试 Cloud' }))

    await waitFor(() => {
      expect(screen.getByText('retry failed')).toBeTruthy()
    })
  })
})
