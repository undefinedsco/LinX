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
import {
  createLoginTransaction,
  inferLoginRoute,
  normalizeLoginUrl,
  sanitizeAuthorizationQuery,
  type LoginRoute,
} from '../login-transaction'

const PROVIDER_CHECK_TIMEOUT = 5000
const AUTH_SURFACE_HANDOFF_TIMEOUT_MS = 250
const LOGIN_SETUP_TIMEOUT_MS = 10000
const LOGIN_SETUP_RETRY_ATTEMPTS = 2
const LOGIN_SETUP_RETRY_DELAY_MS = 500
const CANCELLED = Symbol('oidc-connect-cancelled')

interface OidcConnectOptions {
  authorizationSurface?: 'window' | 'embedded' | 'external'
  returnToMicroAppId?: Parameters<typeof ensurePendingPostLoginMicroAppId>[0]
  route?: LoginRoute
  accountIssuerUrl?: string
  accountIssuerLabel?: string
  storageProviderUrl?: string
  storageProviderLabel?: string
  issuerLabel?: string
  authorizationQuery?: Record<string, string | null | undefined>
  prompt?: 'none' | 'consent'
  strictDiscovery?: boolean
  nodeId?: string
}

export function useOidcConnect() {
  const solidSession = useSession()
  const login = solidSession.session?.login ?? solidSession.login
  const connectingRef = useRef(false)
  const generationRef = useRef(0)
  const cancelRef = useRef<{ generation: number; resolve: () => void } | null>(null)

  const resolveOidcIssuer = useCallback(async (url: string, options?: { strict?: boolean }): Promise<string> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), PROVIDER_CHECK_TIMEOUT)
    const normalizedEntryUrl = url.replace(/\/$/, '')
    const strictDiscovery = options?.strict || isLoopbackUrl(normalizedEntryUrl)

    try {
      if (!strictDiscovery) {
        return normalizedEntryUrl
      }

      const desktopResolvedIssuer = await resolveDesktopOidcIssuer(normalizedEntryUrl)
      if (desktopResolvedIssuer) {
        return desktopResolvedIssuer
      }

      const configUrl = `${normalizedEntryUrl}/.well-known/openid-configuration`
      const response = await fetch(configUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      if (!response.ok) {
        throw new Error('无法打开这个空间的登录页。请确认服务已启动，然后重试。')
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
        throw new Error('连接超时。请检查网络后重试。')
      }
      throw new Error('无法连接这个空间。请确认服务已启动，然后重试。')
    } finally {
      clearTimeout(timeoutId)
    }
  }, [])

  const connect = useCallback(async (issuerUrl: string, options?: OidcConnectOptions) => {
    if (connectingRef.current) {
      throw new Error('登录流程仍在进行。请稍后重试。')
    }
    connectingRef.current = true
    const generation = ++generationRef.current

    try {
      clearUnrestorableSolidAuthState()

      const requestedEntryUrl = issuerUrl.replace(/\/$/, '')
      const explicitAccountIssuerUrl = normalizeLoginUrl(options?.accountIssuerUrl)
      const explicitStorageProviderUrl = normalizeLoginUrl(options?.storageProviderUrl)
      const normalizedEntryUrl = shouldUseAccountAuthorityEntry({
        route: options?.route,
        requestedEntryUrl,
        accountIssuerUrl: explicitAccountIssuerUrl,
        storageProviderUrl: explicitStorageProviderUrl,
      })
        ? explicitAccountIssuerUrl!
        : requestedEntryUrl
      const cancelSignal = createDeferred<typeof CANCELLED>()
      cancelRef.current = {
        generation,
        resolve: () => cancelSignal.resolve(CANCELLED),
      }
      const resolvedIssuerResult = await Promise.race([
        resolveOidcIssuer(normalizedEntryUrl, { strict: options?.strictDiscovery }),
        cancelSignal.promise,
      ])
      if (resolvedIssuerResult === CANCELLED) return
      const resolvedIssuerUrl = resolvedIssuerResult
      const oidcEntryUrl = normalizedEntryUrl
      const returnToMicroAppId =
        options?.returnToMicroAppId
        ?? getPendingPostLoginMicroAppId()
        ?? resolvePostLoginMicroAppId()
      ensurePendingPostLoginMicroAppId(returnToMicroAppId)
      const oidcIssuerUrl = resolvedIssuerUrl
      const accountIssuerUrl = explicitAccountIssuerUrl ?? oidcIssuerUrl
      const storageProviderUrl = explicitStorageProviderUrl ?? requestedEntryUrl
      const accountIssuerLabel = options?.accountIssuerLabel ?? options?.issuerLabel
      const authorizationQuery = sanitizeAuthorizationQuery(options?.authorizationQuery)
      const route = options?.route ?? inferLoginRoute({
        oidcEntryUrl: normalizedEntryUrl,
        oidcIssuerUrl: resolvedIssuerUrl,
        accountIssuerUrl,
        storageProviderUrl,
        storageProviderLabel: options?.storageProviderLabel,
        accountIssuerLabel,
      })
      const transaction = createLoginTransaction({
        route,
        oidcEntryUrl,
        oidcIssuerUrl,
        accountIssuerUrl,
        accountIssuerLabel,
        authorizationSurface: options?.authorizationSurface ?? 'window',
        returnToMicroAppId,
        storageProviderUrl,
        storageProviderLabel: options?.storageProviderLabel,
        authorizationQuery,
        prompt: options?.prompt,
        strictDiscovery: options?.strictDiscovery,
        nodeId: options?.nodeId,
      })
      setPendingLoginAttempt({
        issuerUrl: oidcEntryUrl,
        accountIssuerUrl: explicitAccountIssuerUrl ?? undefined,
        accountIssuerLabel: explicitAccountIssuerUrl ? accountIssuerLabel : undefined,
        authorizationSurface: options?.authorizationSurface ?? 'window',
        returnToMicroAppId,
        storageProviderUrl,
        storageProviderLabel: options?.storageProviderLabel,
        authorizationQuery,
        prompt: options?.prompt,
        strictDiscovery: options?.strictDiscovery === true ? true : undefined,
      }, transaction)

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
          ? (url: string) => desktopApi.auth.openEmbeddedAuthorization(appendAuthorizationQuery(url, authorizationQuery), {
              providerLabel: options?.storageProviderLabel ?? options?.issuerLabel,
            })
        : authorizationSurface === 'external'
          ? desktopApi?.app?.openExternal
            ? (url: string) => desktopApi.app.openExternal(appendAuthorizationQuery(url, authorizationQuery))
            : undefined
        : desktopApi?.auth?.openAuthorizationWindow
          ? (url: string) => desktopApi.auth.openAuthorizationWindow(appendAuthorizationQuery(url, authorizationQuery), {
              providerLabel: options?.storageProviderLabel ?? options?.issuerLabel,
            })
        : desktopApi?.app?.openExternal
          ? (url: string) => desktopApi.app.openExternal(appendAuthorizationQuery(url, authorizationQuery))
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
        oidcIssuer: transaction?.oidcIssuerUrl ?? oidcIssuerUrl,
        redirectUrl,
        clientName: 'LinX',
        tokenType: 'DPoP',
        handleRedirect,
      } satisfies Parameters<typeof login>[0]
      if (options?.prompt) {
        ;(loginOptions as Parameters<typeof login>[0] & { prompt: 'none' | 'consent' }).prompt = options.prompt
      }
      console.info('[login] oidc login setup', {
        oidcIssuer: loginOptions.oidcIssuer,
        redirectUrl: loginOptions.redirectUrl,
        authorizationSurface,
        hasHandleRedirect: Boolean(handleRedirect),
        route: transaction?.route ?? options?.route,
        storageProviderUrl: transaction?.storageProviderUrl ?? options?.storageProviderUrl,
        prompt: options?.prompt,
      })

      await runLoginSetupWithRetry({
        login: () => login(loginOptions),
        redirectStarted,
        cancelPromise: cancelSignal.promise,
        timeoutMessage: redirectStarted
          ? '登录窗口打开超时，请重试。'
          : '登录跳转超时，请重试。',
      })
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

function shouldUseAccountAuthorityEntry(input: {
  route?: LoginRoute
  requestedEntryUrl: string
  accountIssuerUrl: string | null
  storageProviderUrl: string | null
}): boolean {
  if (input.route !== 'local') {
    return false
  }

  if (!input.accountIssuerUrl || !input.storageProviderUrl) {
    return false
  }

  const accountOrigin = normalizeOrigin(input.accountIssuerUrl)
  const storageOrigin = normalizeOrigin(input.storageProviderUrl)
  if (!accountOrigin || !storageOrigin || accountOrigin === storageOrigin) {
    return false
  }

  // Local+Cloud uses Cloud for OIDC and the selected Local SP for storage.
  // If a caller still passes the SP URL as the first argument, correct the
  // login entry before discovery so Local never becomes the token issuer.
  return normalizeOrigin(input.requestedEntryUrl) === storageOrigin
}

function normalizeOrigin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

async function resolveDesktopOidcIssuer(url: string): Promise<string | null> {
  const desktopApi = typeof window !== 'undefined' ? window.xpodDesktop : undefined
  if (!desktopApi?.auth?.resolveOidcIssuer) {
    return null
  }

  try {
    const issuer = await desktopApi.auth.resolveOidcIssuer(url)
    return typeof issuer === 'string' && issuer.trim().length > 0
      ? issuer.replace(/\/$/, '')
      : null
  } catch {
    return null
  }
}

function timeout<T>(ms: number, message: string): Promise<T> {
  return new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error(message)), ms)
  })
}

async function runLoginSetupWithRetry(input: {
  login: () => Promise<void>
  redirectStarted: ReturnType<typeof createDeferred<void>> | null
  cancelPromise: Promise<typeof CANCELLED>
  timeoutMessage: string
}): Promise<void | typeof CANCELLED> {
  let lastError: unknown

  for (let attempt = 1; attempt <= LOGIN_SETUP_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await runLoginSetupOnce(input)
    } catch (error) {
      lastError = error
      if (attempt >= LOGIN_SETUP_RETRY_ATTEMPTS || !isTransientLoginSetupError(error)) {
        throw error
      }
      await delay(LOGIN_SETUP_RETRY_DELAY_MS * attempt)
    }
  }

  throw lastError
}

async function runLoginSetupOnce(input: {
  login: () => Promise<void>
  redirectStarted: ReturnType<typeof createDeferred<void>> | null
  cancelPromise: Promise<typeof CANCELLED>
  timeoutMessage: string
}): Promise<void | typeof CANCELLED> {
  const loginPromise = Promise.resolve(input.login())
  void loginPromise.catch(() => {
    // Setup failures are handled by the races below. If a cancelled stale
    // login later rejects, it must not surface as an unhandled rejection.
  })

  if (input.redirectStarted) {
    return Promise.race<void | typeof CANCELLED>([
      input.redirectStarted.promise,
      loginPromise,
      timeout(LOGIN_SETUP_TIMEOUT_MS, input.timeoutMessage),
      input.cancelPromise,
    ])
  }

  const loginFailureOnly = loginPromise.then<never>(
    () => new Promise<never>(() => {
      // In browser-window auth, a successful login setup should leave this page.
      // If the page is still alive, wait for the timeout so the UI can recover.
    }),
    (error) => {
      throw error
    },
  )

  return Promise.race<void | typeof CANCELLED>([
    loginFailureOnly,
    timeout(LOGIN_SETUP_TIMEOUT_MS, input.timeoutMessage),
    input.cancelPromise,
  ])
}

function isTransientLoginSetupError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /Failed to fetch|ERR_NETWORK|network|NetworkError|fetch failed|登录页打开失败/i.test(message)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
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
  query?: Record<string, string>,
): string {
  if (!query) {
    return url
  }

  try {
    const parsed = new URL(url)
    for (const [key, value] of Object.entries(query)) {
      parsed.searchParams.set(key, value)
    }
    return parsed.toString()
  } catch {
    return url
  }
}
