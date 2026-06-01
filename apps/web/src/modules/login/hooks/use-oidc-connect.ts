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
const CANCELLED = Symbol('oidc-connect-cancelled')

interface OidcConnectOptions {
  authorizationSurface?: 'window' | 'embedded' | 'external'
  returnToMicroAppId?: Parameters<typeof ensurePendingPostLoginMicroAppId>[0]
  storageProviderUrl?: string
  storageProviderLabel?: string
  issuerLabel?: string
  authorizationQuery?: Record<string, string | null | undefined>
  prompt?: 'none' | 'consent'
}

export function useOidcConnect() {
  const { login } = useSession()
  const connectingRef = useRef(false)
  const generationRef = useRef(0)
  const cancelRef = useRef<{ generation: number; resolve: () => void } | null>(null)

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
    const generation = ++generationRef.current

    try {
      clearUnrestorableSolidAuthState()

      const normalizedEntryUrl = issuerUrl.replace(/\/$/, '')
      const cancelSignal = createDeferred<typeof CANCELLED>()
      cancelRef.current = {
        generation,
        resolve: () => cancelSignal.resolve(CANCELLED),
      }
      const resolvedIssuerResult = await Promise.race([
        resolveOidcIssuer(normalizedEntryUrl),
        cancelSignal.promise,
      ])
      if (resolvedIssuerResult === CANCELLED) return
      const resolvedIssuerUrl = resolvedIssuerResult
      const returnToMicroAppId =
        options?.returnToMicroAppId
        ?? getPendingPostLoginMicroAppId()
        ?? resolvePostLoginMicroAppId()
      ensurePendingPostLoginMicroAppId(returnToMicroAppId)
      setPendingLoginAttempt({
        issuerUrl: resolvedIssuerUrl,
        authorizationSurface: options?.authorizationSurface ?? 'window',
        returnToMicroAppId,
        storageProviderUrl: options?.storageProviderUrl ?? normalizedEntryUrl,
        storageProviderLabel: options?.storageProviderLabel,
        authorizationQuery: normalizeAuthorizationQuery(options?.authorizationQuery),
        prompt: options?.prompt,
      })

      const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
      const authorizationSurface = options?.authorizationSurface ?? 'window'
      const redirectUrlResult = desktopApi?.auth?.prepareLoopbackRedirect
        ? await Promise.race([
            desktopApi.auth.prepareLoopbackRedirect(),
            cancelSignal.promise,
          ])
        : `${window.location.origin}/auth/callback`
      if (redirectUrlResult === CANCELLED) return
      const redirectUrl = redirectUrlResult

      const redirectHandler =
        authorizationSurface === 'embedded' && desktopApi?.auth?.openEmbeddedAuthorization
          ? (url: string) => desktopApi.auth.openEmbeddedAuthorization(appendAuthorizationQuery(url, options?.authorizationQuery), {
              providerLabel: options?.storageProviderLabel ?? options?.issuerLabel,
            })
          : authorizationSurface === 'external'
          ? desktopApi?.app?.openExternal
            ? (url: string) => desktopApi.app.openExternal(appendAuthorizationQuery(url, options?.authorizationQuery))
            : undefined
          : desktopApi?.auth?.openAuthorizationWindow
          ? (url: string) => desktopApi.auth.openAuthorizationWindow(appendAuthorizationQuery(url, options?.authorizationQuery), {
              providerLabel: options?.storageProviderLabel ?? options?.issuerLabel,
            })
          : desktopApi?.app?.openExternal
          ? (url: string) => desktopApi.app.openExternal(appendAuthorizationQuery(url, options?.authorizationQuery))
          : undefined
      const redirectStarted = redirectHandler ? createDeferred<void>() : null
      const handleRedirect = redirectHandler
        ? (url: string) => {
            try {
              if (generationRef.current !== generation) {
                redirectStarted?.resolve()
                return undefined
              }
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

      const loginOptions = {
        oidcIssuer: resolvedIssuerUrl,
        redirectUrl,
        clientName: 'LinX',
        tokenType: 'DPoP',
        handleRedirect,
      } satisfies Parameters<typeof login>[0]
      if (options?.prompt) {
        ;(loginOptions as Parameters<typeof login>[0] & { prompt: 'none' | 'consent' }).prompt = options.prompt
      }

      const loginPromise = Promise.resolve(login(loginOptions))
      void loginPromise.catch(() => {
        // Setup failures are handled by the races below. If a cancelled stale
        // login later rejects, it must not surface as an unhandled rejection.
      })

      if (redirectStarted) {
        await Promise.race([
          redirectStarted.promise,
          loginPromise,
          timeout(LOGIN_SETUP_TIMEOUT_MS, '登录窗口打开超时，请重试。'),
          cancelSignal.promise,
        ])
      } else {
        await Promise.race([
          loginPromise,
          timeout(LOGIN_SETUP_TIMEOUT_MS, '登录跳转超时，请重试。'),
          cancelSignal.promise,
        ])
      }
    } catch (error) {
      clearPendingLoginAttempt()
      clearPendingPostLoginMicroAppId()
      throw error
    } finally {
      if (generationRef.current === generation) {
        connectingRef.current = false
        cancelRef.current = null
      } else if (cancelRef.current?.generation === generation) {
        cancelRef.current = null
      }
    }
  }, [login, resolveOidcIssuer])

  const cancel = useCallback(() => {
    cancelRef.current?.resolve()
    cancelRef.current = null
    generationRef.current += 1
    connectingRef.current = false
  }, [])

  return { connect, cancel }
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

function normalizeAuthorizationQuery(
  query?: Record<string, string | null | undefined>,
): Record<string, string> | undefined {
  if (!query) return undefined

  const entries = Object.entries(query).filter(
    ([key, value]) => key.length > 0 && typeof value === 'string' && value.length > 0,
  ) as Array<[string, string]>
  if (entries.length === 0) return undefined
  return Object.fromEntries(entries)
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
