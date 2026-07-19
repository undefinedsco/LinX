import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPendingLoginAttempt,
  clearPendingPostLoginMicroAppId,
  ensurePendingPostLoginMicroAppId,
  setPendingLoginAttempt,
} from '@/modules/login/login-utils'

const connectMock = vi.fn()
const handleIncomingRedirectMock = vi.fn()
const consumePendingRedirectMock = vi.fn()
const onRedirectMock = vi.fn()
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
      handleIncomingRedirect: handleIncomingRedirectMock,
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
    handleIncomingRedirectMock.mockResolvedValue({ isLoggedIn: false })
    consumePendingRedirectMock.mockResolvedValue(null)
    onRedirectMock.mockReturnValue(() => {})
    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    window.localStorage.removeItem('solidClientAuthn:currentSession')
    window.localStorage.removeItem('solidClientAuthenticationUser:session-1')
    window.history.replaceState({}, '', '/auth/callback')
    delete window.xpodDesktop
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('repairs the current session key from persisted Inrupt session metadata', async () => {
    sessionState.info.isLoggedIn = true
    window.localStorage.setItem(
      'solidClientAuthenticationUser:session-1',
      JSON.stringify({
        isLoggedIn: 'true',
        webId: 'https://id.undefineds.co/alice/profile/card#me',
      }),
    )

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    await waitFor(() => {
      expect(onSuccessMock).toHaveBeenCalledTimes(1)
    })
    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBe('session-1')
  })

  it('restores a normal web callback redirect on the callback page', async () => {
    window.history.replaceState({}, '', '/auth/callback?code=abc&state=xyz')
    handleIncomingRedirectMock.mockImplementationOnce(async () => {
      window.localStorage.setItem(
        'solidClientAuthenticationUser:session-1',
        JSON.stringify({
          isLoggedIn: 'true',
          webId: 'http://localhost:5737/cuilinsu/profile/card#me',
        }),
      )
      return {
        isLoggedIn: true,
        sessionId: 'session-1',
        webId: 'http://localhost:5737/cuilinsu/profile/card#me',
      }
    })

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    await waitFor(() => {
      expect(handleIncomingRedirectMock).toHaveBeenCalledWith({
        url: 'http://localhost:3000/auth/callback?code=abc&state=xyz',
        restorePreviousSession: false,
      })
    })
    await waitFor(() => {
      expect(onSuccessMock).toHaveBeenCalledTimes(1)
    })
    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBe('session-1')
  })

  it('restores a Desktop loopback redirect from the pending main-process callback', async () => {
    consumePendingRedirectMock.mockResolvedValueOnce('http://127.0.0.1:43123/auth/callback?code=abc&state=xyz')
    handleIncomingRedirectMock.mockImplementationOnce(async () => {
      window.localStorage.setItem(
        'solidClientAuthenticationUser:session-1',
        JSON.stringify({
          isLoggedIn: 'true',
          webId: 'https://id.undefineds.co/alice/profile/card#me',
        }),
      )
      return {
        isLoggedIn: true,
        sessionId: 'session-1',
        webId: 'https://id.undefineds.co/alice/profile/card#me',
      }
    })
    window.xpodDesktop = {
      auth: {
        consumePendingRedirect: consumePendingRedirectMock,
        onRedirect: onRedirectMock,
      },
    } as any

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    await waitFor(() => {
      expect(handleIncomingRedirectMock).toHaveBeenCalledWith({
        url: 'http://127.0.0.1:43123/auth/callback?code=abc&state=xyz',
        restorePreviousSession: false,
      })
    })
    await waitFor(() => {
      expect(onSuccessMock).toHaveBeenCalledTimes(1)
    })
    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBe('session-1')
  })


  it('retries transient Desktop callback restore fetch failures', async () => {
    consumePendingRedirectMock.mockResolvedValueOnce('http://127.0.0.1:43123/auth/callback?code=abc&state=xyz')
    handleIncomingRedirectMock
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockImplementationOnce(async () => {
        sessionState.info.isLoggedIn = true
        window.localStorage.setItem('solidClientAuthn:currentSession', 'session-1')
        window.localStorage.setItem(
          'solidClientAuthenticationUser:session-1',
          JSON.stringify({
            isLoggedIn: 'true',
            webId: 'https://id.undefineds.co/alice/profile/card#me',
          }),
        )
        return {
          isLoggedIn: true,
          sessionId: 'session-1',
          webId: 'https://id.undefineds.co/alice/profile/card#me',
        }
      })
    window.xpodDesktop = {
      auth: {
        consumePendingRedirect: consumePendingRedirectMock,
        onRedirect: onRedirectMock,
      },
    } as any

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    await waitFor(() => {
      expect(handleIncomingRedirectMock).toHaveBeenCalledTimes(2)
      expect(onSuccessMock).toHaveBeenCalledTimes(1)
    })
  })

  it('does not stay on the callback spinner forever when no session is restored', async () => {
    vi.useFakeTimers()

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    expect(screen.getByText('正在验证身份')).toBeTruthy()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })

    expect(screen.getByText('登录未完成')).toBeTruthy()
    expect(screen.getByText('登录未完成，请重试。')).toBeTruthy()
    expect(onSuccessMock).not.toHaveBeenCalled()
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
    fireEvent.click(screen.getByRole('button', { name: '重试云端登录' }))

    await waitFor(() => {
      expect(connectMock).toHaveBeenCalledWith('https://cloud.example.com', expect.objectContaining({
        authorizationSurface: 'window',
        returnToMicroAppId: 'files',
        accountIssuerUrl: 'https://cloud.example.com',
        storageProviderUrl: 'https://cloud.example.com',
        authorizationQuery: undefined,
      }))
    })
  })

  it('preserves Local provisioning context when retrying a Local SP attempt', async () => {
    setPendingLoginAttempt({
      issuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
      storageProviderUrl: 'https://node-0000.undefineds.co',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
    })
    window.history.replaceState({}, '', '/auth/callback?error=access_denied')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    fireEvent.click(screen.getByRole('button', { name: '重试本地空间' }))

    await waitFor(() => {
      expect(connectMock).toHaveBeenCalledWith('https://id.undefineds.co', expect.objectContaining({
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
      }))
    })
  })

  it('falls back to interactive Local auth after a silent Local attempt returns login_required', async () => {
    setPendingLoginAttempt({
      issuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      accountIssuerLabel: 'Cloud',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
      storageProviderUrl: 'https://node-0000.undefineds.co',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      prompt: 'none',
    })
    window.history.replaceState({}, '', '/auth/callback?error=login_required')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    await waitFor(() => {
      expect(connectMock).toHaveBeenCalledWith('https://id.undefineds.co', expect.objectContaining({
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
      }))
    })
    expect(screen.queryByText('认证服务器拒绝了请求')).toBeNull()
  })

  it('renders a retry action for the last Local attempt', async () => {
    setPendingLoginAttempt({
      issuerUrl: 'http://localhost:5737',
      authorizationSurface: 'window',
      returnToMicroAppId: 'chat',
    })
    window.history.replaceState({}, '', '/auth/callback?error=server_error')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    expect(screen.getByRole('button', { name: '重试本地空间' })).toBeTruthy()
  })

  it('falls back to return-only when there is no retry context', async () => {
    window.history.replaceState({}, '', '/auth/callback?error=server_error')

    render(<SolidAuthCallback onSuccess={onSuccessMock} onError={onErrorMock} />)

    expect(screen.queryByRole('button', { name: '重试云端登录' })).toBeNull()
    expect(screen.queryByRole('button', { name: '重试本地空间' })).toBeNull()
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

    expect(screen.getByRole('button', { name: '重试本地空间' })).toBeTruthy()
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

    fireEvent.click(screen.getByRole('button', { name: '重试云端登录' }))

    await waitFor(() => {
      expect(screen.getByText('登录没有重新打开。请返回空间选择页后再试。')).toBeTruthy()
    })
  })
})
