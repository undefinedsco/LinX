import { afterEach, describe, expect, it } from 'vitest'
import {
  capturePendingCallbackError,
  clearUnrestorableSolidAuthState,
  clearPendingCallbackError,
  clearPendingLoginAttempt,
  clearPendingPostLoginMicroAppId,
  clearStoredSolidSession,
  getStoredSolidSession,
  getPendingCallbackError,
  consumePendingLoginAttempt,
  consumePendingPostLoginMicroAppId,
  ensurePendingPostLoginMicroAppId,
  getPendingLoginAttempt,
  getPendingLoginTransaction,
  hasStoredSolidSession,
  resolvePostLoginMicroAppId,
  setPendingLoginAttempt,
} from './login-utils'
import { getRememberedAccount } from '@linx/stores/login'

describe('login-utils post-login target helpers', () => {
  afterEach(() => {
    clearPendingCallbackError()
    clearPendingLoginAttempt()
    clearPendingPostLoginMicroAppId()
    clearStoredSolidSession()
    window.localStorage.removeItem('linx-remembered-account')
    window.history.replaceState({}, '', '/')
  })

  it('resolves current micro app from pathname', () => {
    window.history.replaceState({}, '', '/files')
    expect(resolvePostLoginMicroAppId()).toBe('files')
  })

  it('falls back to chat for non-micro-app routes', () => {
    window.history.replaceState({}, '', '/auth/callback')
    expect(resolvePostLoginMicroAppId()).toBe('chat')

    window.history.replaceState({}, '', '/setup')
    expect(resolvePostLoginMicroAppId()).toBe('chat')
  })

  it('stores and consumes the pending post-login micro app', () => {
    ensurePendingPostLoginMicroAppId('contacts')
    expect(consumePendingPostLoginMicroAppId()).toBe('contacts')
    expect(consumePendingPostLoginMicroAppId()).toBe('chat')
  })

  it('does not overwrite an existing pending target', () => {
    ensurePendingPostLoginMicroAppId('favorites')
    ensurePendingPostLoginMicroAppId('files')

    expect(consumePendingPostLoginMicroAppId()).toBe('favorites')
  })

  it('stores and consumes the pending login attempt', () => {
    setPendingLoginAttempt({
      issuerUrl: 'https://cloud.example.com',
      authorizationSurface: 'window',
      returnToMicroAppId: 'contacts',
      storageProviderUrl: 'https://node.example.com',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
        ignored: '',
      },
      strictDiscovery: true,
    })

    expect(getPendingLoginAttempt()).toEqual({
      issuerUrl: 'https://cloud.example.com',
      authorizationSurface: 'window',
      returnToMicroAppId: 'contacts',
      storageProviderUrl: 'https://node.example.com',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      strictDiscovery: true,
    })
    expect(consumePendingLoginAttempt()).toEqual({
      issuerUrl: 'https://cloud.example.com',
      authorizationSurface: 'window',
      returnToMicroAppId: 'contacts',
      storageProviderUrl: 'https://node.example.com',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      strictDiscovery: true,
    })
    expect(getPendingLoginAttempt()).toBeNull()
  })

  it('derives a Local transaction entry from legacy split issuer/storage attempts', () => {
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
      strictDiscovery: true,
    })

    expect(getPendingLoginTransaction()).toEqual(expect.objectContaining({
      route: 'local',
      oidcEntryUrl: 'https://node-0000.undefineds.co',
      oidcIssuerUrl: 'https://id.undefineds.co',
      accountIssuerUrl: 'https://id.undefineds.co',
      storageProviderUrl: 'https://node-0000.undefineds.co',
      authorizationQuery: {
        provisionCode: 'pc-123',
      },
      strictDiscovery: true,
    }))
  })

  it('migrates legacy pending login attempts that used providerUrl/providerLabel', () => {
    window.sessionStorage.setItem('linx-pending-login-attempt', JSON.stringify({
      issuerUrl: 'https://id.undefineds.co',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
      providerUrl: 'https://node-0000.undefineds.co',
      providerLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-legacy',
      },
    }))

    expect(getPendingLoginAttempt()).toEqual({
      issuerUrl: 'https://id.undefineds.co',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
      storageProviderUrl: 'https://node-0000.undefineds.co',
      storageProviderLabel: 'Local',
      authorizationQuery: {
        provisionCode: 'pc-legacy',
      },
    })
  })

  it('captures callback errors before the auth library cleans the URL', () => {
    const captured = capturePendingCallbackError('http://localhost:5173/auth/callback?error=access_denied&error_description=Denied')

    expect(captured).toEqual({
      error: 'access_denied',
      description: 'Denied',
    })
    expect(getPendingCallbackError()).toEqual({
      error: 'access_denied',
      description: 'Denied',
    })
  })

  it('persists prompt mode in pending login attempts', () => {
    setPendingLoginAttempt({
      issuerUrl: 'https://id.undefineds.co',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
      storageProviderUrl: 'https://node-0000.undefineds.co',
      storageProviderLabel: 'Local',
      prompt: 'none',
    })

    expect(getPendingLoginAttempt()).toEqual({
      issuerUrl: 'https://id.undefineds.co',
      authorizationSurface: 'embedded',
      returnToMicroAppId: 'chat',
      storageProviderUrl: 'https://node-0000.undefineds.co',
      storageProviderLabel: 'Local',
      prompt: 'none',
    })
  })

  it('detects a stored Solid session from the current-session pointer', () => {
    window.localStorage.setItem('solidClientAuthn:currentSession', 'linx-session')
    window.localStorage.setItem(
      'solidClientAuthenticationUser:linx-session',
      JSON.stringify({
        issuer: 'http://localhost:5737',
        isLoggedIn: 'true',
        webId: 'http://localhost:5737/alice/profile/card#me',
      }),
    )

    expect(hasStoredSolidSession()).toBe(true)
  })

  it('ignores a dangling current-session pointer without session metadata', () => {
    window.localStorage.setItem('solidClientAuthn:currentSession', 'linx-session')

    expect(hasStoredSolidSession()).toBe(false)
    expect(getStoredSolidSession()).toBeNull()
  })

  it('ignores OAuth state records that only point at a session id', () => {
    window.localStorage.setItem('solidClientAuthn:currentSession', 'oauth-state')
    window.localStorage.setItem(
      'solidClientAuthenticationUser:oauth-state',
      JSON.stringify({ sessionId: 'linx-session' }),
    )

    expect(hasStoredSolidSession()).toBe(false)
    expect(getStoredSolidSession()).toBeNull()
  })

  it('ignores pending OAuth login metadata without a completed session', () => {
    window.localStorage.setItem('solidClientAuthn:currentSession', 'pending-session')
    window.localStorage.setItem(
      'solidClientAuthenticationUser:pending-session',
      JSON.stringify({
        issuer: 'https://id.example.com/',
        redirectUrl: 'http://127.0.0.1:43123/auth/callback',
        clientId: 'dynamic-client',
        codeVerifier: 'verifier',
      }),
    )

    expect(hasStoredSolidSession()).toBe(false)
    expect(getStoredSolidSession()).toBeNull()
  })

  it('reads the current stored Solid session metadata', () => {
    window.localStorage.setItem('solidClientAuthn:currentSession', 'linx-session')
    window.localStorage.setItem(
      'solidClientAuthenticationUser:linx-session',
      JSON.stringify({
        issuer: 'http://localhost:5737',
        redirectUrl: 'http://127.0.0.1:43123/auth/callback',
        clientId: 'http://127.0.0.1:43123/client',
        isLoggedIn: 'true',
        tokenType: 'Bearer',
      }),
    )

    expect(getStoredSolidSession()).toEqual({
      sessionId: 'linx-session',
      issuerUrl: 'http://localhost:5737',
      redirectUrl: 'http://127.0.0.1:43123/auth/callback',
      clientId: 'http://127.0.0.1:43123/client',
      tokenType: 'Bearer',
      webId: null,
    })
  })

  it('clears unrestorable auth state before a fresh login attempt', () => {
    window.localStorage.setItem('solidClientAuthn:currentSession', 'pending-session')
    window.localStorage.setItem(
      'solidClientAuthenticationUser:pending-session',
      JSON.stringify({
        issuer: 'https://id.example.com/',
        redirectUrl: 'http://127.0.0.1:43123/auth/callback',
        clientId: 'dynamic-client',
      }),
    )
    window.localStorage.setItem('linx-login', '{"state":{"storedAccount":{}}}')

    expect(clearUnrestorableSolidAuthState()).toBe(true)
    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBeNull()
    expect(window.localStorage.getItem('solidClientAuthenticationUser:pending-session')).toBeNull()
    expect(window.localStorage.getItem('linx-login')).toBe('{"state":{"storedAccount":{}}}')
  })

  it('reads the remembered account record from localStorage', () => {
    window.localStorage.setItem('linx-remembered-account', JSON.stringify({
      displayName: 'Ganlu',
      issuerUrl: 'https://cloud.example.com',
      issuerLabel: 'Cloud',
      storageProviderUrl: 'https://cloud.example.com',
      storageProviderLabel: 'Cloud',
      webId: 'https://alice.example/profile/card#me',
    }))

    expect(getRememberedAccount()).toEqual({
      displayName: 'Ganlu',
      issuerUrl: 'https://cloud.example.com',
      issuerLabel: 'Cloud',
      storageProviderUrl: 'https://cloud.example.com',
      storageProviderLabel: 'Cloud',
      webId: 'https://alice.example/profile/card#me',
    })
  })

  it('migrates legacy remembered accounts that used providerUrl/providerLabel', () => {
    window.localStorage.setItem('linx-remembered-account', JSON.stringify({
      displayName: 'Ganlu05',
      providerUrl: 'https://node-0000.undefineds.co',
      providerLabel: 'Local',
      webId: 'https://id.undefineds.co/ganlu05/profile/card#me',
    }))

    expect(getRememberedAccount()).toEqual({
      displayName: 'Ganlu05',
      issuerUrl: 'https://node-0000.undefineds.co',
      issuerLabel: undefined,
      storageProviderUrl: 'https://node-0000.undefineds.co',
      storageProviderLabel: 'Local',
      webId: 'https://id.undefineds.co/ganlu05/profile/card#me',
    })
  })

  it('keeps restorable auth state when preparing a fresh login attempt', () => {
    window.localStorage.setItem('solidClientAuthn:currentSession', 'linx-session')
    window.localStorage.setItem(
      'solidClientAuthenticationUser:linx-session',
      JSON.stringify({
        issuer: 'https://id.example.com/',
        redirectUrl: 'http://127.0.0.1:43123/auth/callback',
        clientId: 'dynamic-client',
        webId: 'https://id.example.com/alice/profile/card#me',
      }),
    )

    expect(clearUnrestorableSolidAuthState()).toBe(false)
    expect(window.localStorage.getItem('solidClientAuthn:currentSession')).toBe('linx-session')
    expect(window.localStorage.getItem('solidClientAuthenticationUser:linx-session')).not.toBeNull()
  })

  it('does not delete pending OIDC callback context while checking stored sessions', () => {
    window.localStorage.setItem(
      'solidClientAuthenticationUser:oauth-state',
      JSON.stringify({ sessionId: 'linx-session' }),
    )
    window.localStorage.setItem(
      'solidClientAuthenticationUser:linx-session',
      JSON.stringify({
        issuer: 'http://localhost:3000',
        redirectUrl: 'http://localhost:5173/auth/callback',
        clientId: 'http://localhost:5173/client',
        codeVerifier: 'verifier',
      }),
    )

    expect(hasStoredSolidSession()).toBe(false)
    expect(window.localStorage.getItem('solidClientAuthenticationUser:oauth-state')).toBe(
      JSON.stringify({ sessionId: 'linx-session' }),
    )
    expect(window.localStorage.getItem('solidClientAuthenticationUser:linx-session')).toBe(
      JSON.stringify({
        issuer: 'http://localhost:3000',
        redirectUrl: 'http://localhost:5173/auth/callback',
        clientId: 'http://localhost:5173/client',
        codeVerifier: 'verifier',
      }),
    )
  })
})
