import { useCallback, useRef } from 'react'
import { useSession } from '@inrupt/solid-ui-react'
import {
  clearPendingLoginAttempt,
  clearPendingPostLoginMicroAppId,
  clearUnrestorableSolidAuthState,
  getPendingPostLoginMicroAppId,
  ensurePendingPostLoginMicroAppId,
  resolvePostLoginMicroAppId,
  setPendingLoginAttempt,
} from '../login-utils'

const PROVIDER_CHECK_TIMEOUT = 5000
const AUTH_SURFACE_HANDOFF_TIMEOUT_MS = 250
const LOGIN_SETUP_TIMEOUT_MS = 10000

interface OidcConnectOptions {
  authorizationSurface?: 'window' | 'embedded' | 'external'
  returnToMicroAppId?: Parameters<typeof ensurePendingPostLoginMicroAppId>[0]
  providerUrl?: string
  providerLabel?: string
  authorizationQuery?: Record<string, string | null | undefined>
}

export function useOidcConnect() {
  const { login } = useSession()
  const connectingRef = useRef(false)

  const resolveOidcIssuer = useCallback(async (url: string): Promise<string> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PROVIDER_CHECK_TIMEOUT)
    const normalizedEntryUrl = url.replace(/\/$/, '')
    const strictDiscovery = isLoopbackUrl(normalizedEntryUrl)

    try {
      const configUrl = `${normalizedEntryUrl}/.well-known/openid-configuration`
      const response = await fetch(configUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) {
        throw new Error(`OIDC 配置不可用: ${response.status}`)
      }

      const payload = await response.json().catch(() => null) as { issuer?: string } | null
      if (typeof payload?.issuer === 'string' && payload.issuer.trim().length > 0) {
        return payload.issuer.replace(/\/$/, '')
      }

      return normalizedEntryUrl
    } catch (err: any) {
      if (!strictDiscovery) {
        return normalizedEntryUrl
      }
      if (err.name === 'AbortError') {
        throw new Error('连接超时，请检查网络')
      }
      if (err.message?.includes('OIDC')) throw err
      throw new Error('无法连接服务器')
    } finally {
      clearTimeout(timeoutId)
    }
  }, [])

  const connect = useCallback(async (issuerUrl: string, options?: OidcConnectOptions) => {
    if (connectingRef.current) return
    connectingRef.current = true

    try {
      clearUnrestorableSolidAuthState()

      const normalizedEntryUrl = issuerUrl.replace(/\/$/, '')
      const resolvedIssuerUrl = await resolveOidcIssuer(normalizedEntryUrl)
      const returnToMicroAppId =
        options?.returnToMicroAppId
        ?? getPendingPostLoginMicroAppId()
        ?? resolvePostLoginMicroAppId()
      ensurePendingPostLoginMicroAppId(returnToMicroAppId)
      setPendingLoginAttempt({
        issuerUrl: resolvedIssuerUrl,
        authorizationSurface: options?.authorizationSurface ?? 'window',
        returnToMicroAppId,
        providerUrl: options?.providerUrl ?? normalizedEntryUrl,
        providerLabel: options?.providerLabel,
      })

      const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
      const authorizationSurface = options?.authorizationSurface ?? 'window'
      const redirectUrl = desktopApi?.auth?.prepareLoopbackRedirect
        ? await desktopApi.auth.prepareLoopbackRedirect()
        : `${window.location.origin}/auth/callback`

      const redirectHandler =
        authorizationSurface === 'embedded' && desktopApi?.auth?.openEmbeddedAuthorization
          ? (url: string) => desktopApi.auth.openEmbeddedAuthorization(appendAuthorizationQuery(url, options?.authorizationQuery))
          : authorizationSurface === 'external'
          ? desktopApi?.app?.openExternal
            ? (url: string) => desktopApi.app.openExternal(appendAuthorizationQuery(url, options?.authorizationQuery))
            : undefined
          : desktopApi?.auth?.openAuthorizationWindow
          ? (url: string) => desktopApi.auth.openAuthorizationWindow(appendAuthorizationQuery(url, options?.authorizationQuery))
          : desktopApi?.app?.openExternal
          ? (url: string) => desktopApi.app.openExternal(appendAuthorizationQuery(url, options?.authorizationQuery))
          : undefined
      const redirectStarted = redirectHandler ? createDeferred<void>() : null
      const handleRedirect = redirectHandler
        ? (url: string) => {
            try {
              const result = redirectHandler(url)
              const handoffTimeoutId = window.setTimeout(() => {
                redirectStarted?.resolve()
              }, AUTH_SURFACE_HANDOFF_TIMEOUT_MS)
              void Promise.resolve(result).then(
                () => {
                  window.clearTimeout(handoffTimeoutId)
                  redirectStarted?.resolve()
                },
                (error) => {
                  window.clearTimeout(handoffTimeoutId)
                  redirectStarted?.reject(error)
                },
              )
              return result
            } catch (error) {
              redirectStarted?.reject(error)
              throw error
            }
        }
        : undefined

      const loginPromise = Promise.resolve(login({
        oidcIssuer: resolvedIssuerUrl,
        redirectUrl,
        clientName: 'LinX',
        tokenType: 'DPoP',
        handleRedirect,
      }))

      if (redirectStarted) {
        void loginPromise.catch(() => {
          // The setup path is handled by the race below. After the auth surface
          // opens, Inrupt intentionally keeps the login promise pending.
        })
        await Promise.race([
          redirectStarted.promise,
          loginPromise,
          timeout(LOGIN_SETUP_TIMEOUT_MS, '登录窗口打开超时，请重试。'),
        ])
      } else {
        await Promise.race([
          loginPromise,
          timeout(LOGIN_SETUP_TIMEOUT_MS, '登录跳转超时，请重试。'),
        ])
      }
    } catch (error) {
      clearPendingLoginAttempt()
      clearPendingPostLoginMicroAppId()
      throw error
    } finally {
      connectingRef.current = false
    }
  }, [login, resolveOidcIssuer])

  return { connect }
}

function isLoopbackUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '[::1]'
  } catch {
    return false
  }
}

function timeout<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms)
  })
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function appendAuthorizationQuery(
  url: string,
  query?: Record<string, string | null | undefined>,
): string {
  if (!query) {
    return url
  }

  try {
    const parsed = new URL(url)
    for (const [key, value] of Object.entries(query)) {
      if (typeof value !== 'string' || value.length === 0) {
        continue
      }
      parsed.searchParams.set(key, value)
    }
    return parsed.toString()
  } catch {
    return url
  }
}
