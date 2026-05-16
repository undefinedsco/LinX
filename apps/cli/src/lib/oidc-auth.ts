import { createServer } from 'node:http'
import { AddressInfo, type Socket } from 'node:net'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  EVENTS,
  getSessionFromStorage,
  refreshSession,
  Session,
  type SessionTokenSet,
} from '@inrupt/solid-client-authn-node'
import type { LinxStoredCredentials } from '@undefineds.co/models/client'
import { isLinxOidcOAuthSecrets, resolveLinxCloudAccountBaseUrl, type LinxOidcOAuthSecrets } from '@undefineds.co/models/client'
import { saveAccountSession } from './account-session.js'
import { loadCredentials, saveCredentials } from './credentials-store.js'
import { createOidcSessionStorage } from './oidc-session-storage.js'

const execFileAsync = promisify(execFile)
const DEFAULT_CALLBACK_HOST = '127.0.0.1'
const DEFAULT_CALLBACK_PATH = '/auth/callback'
const DEFAULT_CLIENT_NAME = 'LinX CLI'

export interface BrowserOidcLoginOptions {
  issuerUrl?: string
  callbackHost?: string
  callbackPath?: string
  clientName?: string
  forceFresh?: boolean
  forceRefreshExisting?: boolean
  openBrowser?: (url: string) => Promise<void>
  onAuthUrl?: (url: string) => void
  signal?: AbortSignal
  manualRedirectUrl?: (signal?: AbortSignal) => Promise<string>
}

export interface BrowserOidcLoginResult {
  url: string
  webId: string
  tokenSet: SessionTokenSet
  credentialsToSave: LinxStoredCredentials
}

export interface EnsureBrowserOidcLoginResult extends BrowserOidcLoginResult {
  reusedExistingSession: boolean
}

export async function ensureBrowserConsentLogin(
  options: BrowserOidcLoginOptions = {},
): Promise<EnsureBrowserOidcLoginResult> {
  if (!options.forceFresh) {
    const reused = await reuseExistingBrowserConsentLogin(options).catch(() => null)
    if (reused) {
      return {
        ...reused,
        reusedExistingSession: true,
      }
    }
  }

  const fresh = await loginWithBrowserConsent(options)
  return {
    ...fresh,
    reusedExistingSession: false,
  }
}

export async function loginWithBrowserConsent(
  options: BrowserOidcLoginOptions = {},
): Promise<BrowserOidcLoginResult> {
  const storage = createOidcSessionStorage()
  const session = new Session({
    storage,
    keepAlive: false,
  }, `linx-cli-oidc-${Date.now()}`)

  const baseUrl = resolveLinxCloudAccountBaseUrl(options.issuerUrl)
  let latestTokenSet: SessionTokenSet | null = null

  session.events.on(EVENTS.NEW_TOKENS, (tokenSet) => {
    latestTokenSet = tokenSet
  })

  await withCallbackServer(
    options.callbackHost ?? DEFAULT_CALLBACK_HOST,
    options.callbackPath ?? DEFAULT_CALLBACK_PATH,
    async (callbackUrl) => {
      let redirectSeen = false
      await session.login({
        oidcIssuer: baseUrl.replace(/\/$/, ''),
        redirectUrl: callbackUrl,
        clientName: options.clientName ?? DEFAULT_CLIENT_NAME,
        handleRedirect: async (url) => {
          redirectSeen = true
          options.onAuthUrl?.(url)
          if (options.openBrowser) {
            await options.openBrowser(url)
          } else if (!options.onAuthUrl) {
            await openBrowser(url)
          }
        },
        tokenType: 'Bearer',
      })

      if (!redirectSeen) {
        throw new Error('OIDC login did not produce a browser redirect URL')
      }
    },
    async (requestUrl) => {
      assertOidcCallbackDidNotReturnError(requestUrl)
      await session.handleIncomingRedirect(requestUrl)
    },
    options.manualRedirectUrl,
    options.signal,
  )

  if (!session.info.isLoggedIn || !session.info.webId) {
    throw new Error('Login did not complete successfully')
  }

  const tokenSet = latestTokenSet as SessionTokenSet | null
  if (!tokenSet?.refreshToken) {
    throw new Error('OIDC login completed without a refresh token')
  }

  const result = {
    url: baseUrl,
    webId: session.info.webId,
    tokenSet,
    credentialsToSave: serializeOidcCredentials(baseUrl, session.info.webId, tokenSet),
  }
  persistBrowserLoginResult(result)
  return result
}

export async function getOidcAccessToken(
  credentials: Pick<LinxStoredCredentials, 'authType' | 'secrets' | 'webId' | 'url'>,
  options: { forceRefresh?: boolean } = {},
): Promise<string | null> {
  if (credentials.authType !== 'oidc_oauth' || !isLinxOidcOAuthSecrets(credentials.secrets)) {
    return null
  }

  const secrets = credentials.secrets as LinxOidcOAuthSecrets
  if (options.forceRefresh || !secrets.oidcAccessToken) {
    return refreshStoredOidcSession(credentials, secrets)
  }

  const expiresAt = secrets.oidcExpiresAt ? new Date(secrets.oidcExpiresAt).getTime() : 0
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60_000) {
    return refreshStoredOidcSession(credentials, secrets)
  }

  return secrets.oidcAccessToken
}

export async function restoreStoredOidcSession(
  credentials: Pick<LinxStoredCredentials, 'authType' | 'secrets' | 'webId' | 'url'>,
  options: { forceRefresh?: boolean } = {},
): Promise<Session | null> {
  if (credentials.authType !== 'oidc_oauth' || !isLinxOidcOAuthSecrets(credentials.secrets)) {
    return null
  }

  const storage = createOidcSessionStorage()
  const sessionId = await resolveStoredOidcSessionId(storage, credentials.webId, credentials.url)
  if (!sessionId) {
    return null
  }

  const session = await getSessionFromStorage(sessionId, {
    storage,
    refreshSession: false,
  })
  if (!session) {
    return null
  }

  if (options.forceRefresh || !session.info.isLoggedIn) {
    await refreshSession(session, { storage })
  }

  return session.info.isLoggedIn ? session : null
}

export function serializeOidcCredentials(
  url: string,
  webId: string,
  tokenSet: SessionTokenSet,
): LinxStoredCredentials {
  return {
    url,
    webId,
    authType: 'oidc_oauth',
    secrets: {
      oidcRefreshToken: tokenSet.refreshToken ?? '',
      oidcAccessToken: tokenSet.accessToken ?? '',
      oidcExpiresAt: tokenSet.expiresAt
        ? new Date(tokenSet.expiresAt * 1000).toISOString()
        : new Date().toISOString(),
      oidcClientId: tokenSet.clientId,
    },
  }
}

export function assertOidcCallbackDidNotReturnError(requestUrl: string): void {
  const url = new URL(requestUrl)
  const error = url.searchParams.get('error')
  if (!error) return
  const description = url.searchParams.get('error_description')
  throw new Error(
    [`OIDC callback returned ${error}`, description ? `description: ${description}` : null, `redirect: ${url.origin}${url.pathname}`]
      .filter(Boolean)
      .join('; '),
  )
}

export async function withCallbackServer(
  host: string,
  pathname: string,
  startLogin: (callbackUrl: string) => Promise<void>,
  onCallback: (requestUrl: string) => Promise<void>,
  manualRedirectUrl?: (signal?: AbortSignal) => Promise<string>,
  signal?: AbortSignal,
): Promise<void> {
  // Always provide a signal for manualRedirectUrl (for test/cancel compatibility)
  const internalController = new AbortController()
  const effectiveSignal = signal ?? internalController.signal
  const server = createServer()
  const sockets = new Set<Socket>()
  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => {
      sockets.delete(socket)
    })
  })
  const callbackPromise = new Promise<void>((resolve, reject) => {
    server.on('request', (req, res) => {
      const currentUrl = new URL(req.url ?? '/', `http://${host}`)
      if (currentUrl.pathname !== pathname) {
        res.statusCode = 404
        res.end('Not found')
        return
      }

      const address = server.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Local callback server is not bound to a TCP port'))
        return
      }

      const absoluteUrl = `http://${host}:${address.port}${currentUrl.pathname}${currentUrl.search}`
      onCallback(absoluteUrl)
        .then(() => {
          res.statusCode = 200
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Connection', 'close')
          res.end(renderCallbackPage({
            title: 'LinX Cloud connected',
            description: 'Authentication is complete. You can return to your terminal.',
            tone: 'success',
          }))
          server.closeIdleConnections?.()
          server.closeAllConnections?.()
          resolve()
        })
        .catch((error) => {
          res.statusCode = 500
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Connection', 'close')
          res.end(renderCallbackPage({
            title: 'LinX login failed',
            description: error instanceof Error ? error.message : String(error),
            tone: 'error',
          }))
          server.closeIdleConnections?.()
          server.closeAllConnections?.()
          reject(error)
        })
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, () => resolve())
  })

  try {
    const address = server.address()
    if (!address || typeof address === 'string') {
      throw new Error('Failed to allocate local callback server port')
    }

    const callbackUrl = `http://${host}:${(address as AddressInfo).port}${pathname}`
    await startLogin(callbackUrl)
    // Abort manual redirect when callback completes (or external signal fires)
    const cancellableCallback = callbackPromise.finally(() => internalController.abort())
    const race = Promise.race([
      cancellableCallback,
      waitForManualRedirect(onCallback, manualRedirectUrl, effectiveSignal),
    ])
    if (signal) {
      await Promise.race([race, waitForAbort(signal)])
    } else {
      await race
    }
  } finally {
    server.closeIdleConnections?.()
    server.closeAllConnections?.()
    for (const socket of sockets) {
      try {
        socket.destroy()
      } catch {}
    }
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

function renderCallbackPage(input: {
  title: string
  description: string
  tone: 'success' | 'error'
}): string {
  const escapedTitle = escapeHtml(input.title)
  const escapedDescription = escapeHtml(input.description)
  const accent = input.tone === 'success' ? '#0f8f63' : '#b42318'
  const softAccent = input.tone === 'success' ? '#e8f7f0' : '#fff1f0'
  const icon = input.tone === 'success' ? '✓' : '!'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapedTitle}</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f3eb;
      --card: rgba(255, 255, 255, 0.82);
      --ink: #1d211f;
      --muted: #68706b;
      --line: rgba(44, 58, 49, 0.14);
      --accent: ${accent};
      --soft-accent: ${softAccent};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 32px;
      color: var(--ink);
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at 20% 20%, rgba(15, 143, 99, 0.16), transparent 34%),
        radial-gradient(circle at 80% 10%, rgba(217, 164, 65, 0.22), transparent 30%),
        linear-gradient(135deg, #fbf7ef 0%, #edf4ef 100%);
    }
    .card {
      width: min(520px, 100%);
      padding: 34px;
      border: 1px solid var(--line);
      border-radius: 28px;
      background: var(--card);
      box-shadow: 0 24px 80px rgba(33, 41, 37, 0.16);
      backdrop-filter: blur(14px);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 28px;
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .mark {
      width: 36px;
      height: 36px;
      display: grid;
      place-items: center;
      border-radius: 12px;
      color: white;
      background: #24362c;
      letter-spacing: 0;
      font-size: 15px;
    }
    .status {
      width: 56px;
      height: 56px;
      display: grid;
      place-items: center;
      border-radius: 20px;
      margin-bottom: 20px;
      color: var(--accent);
      background: var(--soft-accent);
      font-size: 28px;
      font-weight: 800;
    }
    h1 {
      margin: 0;
      font-size: clamp(28px, 5vw, 40px);
      line-height: 1.05;
      letter-spacing: -0.04em;
    }
    p {
      margin: 14px 0 0;
      color: var(--muted);
      font-size: 16px;
      line-height: 1.6;
    }
    .hint {
      margin-top: 28px;
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(36, 54, 44, 0.06);
      color: #3d4942;
      font-size: 13px;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="brand"><div class="mark">Lx</div><span>LinX Cloud</span></div>
    <div class="status">${icon}</div>
    <h1>${escapedTitle}</h1>
    <p>${escapedDescription}</p>
    <div class="hint">This local callback page is safe to close. Your terminal session will continue automatically.</div>
  </main>
  <script>
    setTimeout(() => { window.close(); }, 1200);
  </script>
</body>
</html>`
}

async function reuseExistingBrowserConsentLogin(
  options: BrowserOidcLoginOptions,
): Promise<BrowserOidcLoginResult | null> {
  const stored = loadCredentials()
  if (!stored || stored.authType !== 'oidc_oauth') {
    return null
  }

  if (!isLinxOidcOAuthSecrets(stored.secrets) || !stored.secrets.oidcRefreshToken) {
    return null
  }

  const requestedIssuer = resolveLinxCloudAccountBaseUrl(options.issuerUrl)
  const storedIssuer = resolveLinxCloudAccountBaseUrl(stored.url)
  if (requestedIssuer !== storedIssuer) {
    return null
  }

  const accessToken = await getOidcAccessToken(stored, { forceRefresh: options.forceRefreshExisting })
  if (!accessToken || !isLinxOidcOAuthSecrets(stored.secrets)) {
    return null
  }

  return {
    url: stored.url,
    webId: stored.webId,
    tokenSet: {
      issuer: stored.url.replace(/\/$/, ''),
      clientId: stored.secrets.oidcClientId ?? DEFAULT_CLIENT_NAME,
      refreshToken: stored.secrets.oidcRefreshToken,
      accessToken,
      webId: stored.webId,
      expiresAt: stored.secrets.oidcExpiresAt
        ? Math.floor(new Date(stored.secrets.oidcExpiresAt).getTime() / 1000)
        : undefined,
    },
    credentialsToSave: stored,
  }
}

function persistBrowserLoginResult(result: BrowserOidcLoginResult): void {
  saveCredentials(result.credentialsToSave)
  saveAccountSession({
    url: result.url,
    email: 'browser-consent',
    token: 'oidc-session',
    webId: result.webId,
    createdAt: new Date().toISOString(),
  })
}

async function refreshStoredOidcSession(
  credentials: Pick<LinxStoredCredentials, 'authType' | 'secrets' | 'webId' | 'url'>,
  secrets: LinxOidcOAuthSecrets,
): Promise<string | null> {
  const storage = createOidcSessionStorage()
  const sessionId = await resolveStoredOidcSessionId(storage, credentials.webId, credentials.url)
  if (!sessionId) {
    return null
  }

  const session = await getSessionFromStorage(sessionId, {
    storage,
    refreshSession: false,
  })
  if (!session) {
    return null
  }

  let refreshedTokenSet: SessionTokenSet | null = null
  session.events.on(EVENTS.NEW_TOKENS, (tokenSet) => {
    refreshedTokenSet = tokenSet
  })

  await refreshSession(session, { storage })

  const nextTokenSet = refreshedTokenSet as SessionTokenSet | null
  if (!nextTokenSet?.accessToken) {
    return null
  }

  secrets.oidcRefreshToken = nextTokenSet.refreshToken ?? secrets.oidcRefreshToken
  secrets.oidcAccessToken = nextTokenSet.accessToken
  secrets.oidcExpiresAt = nextTokenSet.expiresAt
    ? new Date(nextTokenSet.expiresAt * 1000).toISOString()
    : secrets.oidcExpiresAt
  secrets.oidcClientId = nextTokenSet.clientId ?? secrets.oidcClientId

  saveCredentials({
    url: credentials.url,
    webId: session.info.webId ?? credentials.webId,
    authType: 'oidc_oauth',
    secrets,
  })
  saveAccountSession({
    url: credentials.url,
    email: 'browser-consent',
    token: 'oidc-session',
    webId: session.info.webId ?? credentials.webId,
    createdAt: new Date().toISOString(),
  })

  return nextTokenSet.accessToken
}

async function resolveStoredOidcSessionId(
  storage: ReturnType<typeof createOidcSessionStorage>,
  webId: string,
  issuerUrl: string,
): Promise<string | null> {
  const raw = await storage.get('solidClientAuthn:registeredSessions')
  if (!raw) {
    return null
  }

  let sessionIds: string[] = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      sessionIds = parsed.filter((value): value is string => typeof value === 'string')
    }
  } catch {
    return null
  }

  const normalizedIssuer = issuerUrl.replace(/\/+$/, '')
  for (const sessionId of [...sessionIds].reverse()) {
    const stored = await storage.get(`solidClientAuthenticationUser:${sessionId}`)
    if (!stored) {
      continue
    }

    try {
      const parsed = JSON.parse(stored) as { webId?: string; issuer?: string }
      const sessionWebId = typeof parsed.webId === 'string' ? parsed.webId : null
      const sessionIssuer = typeof parsed.issuer === 'string' ? parsed.issuer.replace(/\/+$/, '') : null
      if (sessionWebId === webId && sessionIssuer === normalizedIssuer) {
        return sessionId
      }
    } catch {
      continue
    }
  }

  return null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function waitForAbort(signal?: AbortSignal): Promise<never> {
  if (!signal) return new Promise(() => undefined)
  return new Promise((_, reject) => {
    if (signal.aborted) { reject(new Error('Login cancelled')); return }
    signal.addEventListener('abort', () => reject(new Error('Login cancelled')), { once: true })
  })
}

async function waitForManualRedirect(
  onCallback: (requestUrl: string) => Promise<void>,
  manualRedirectUrl?: (signal?: AbortSignal) => Promise<string>,
  signal?: AbortSignal,
): Promise<void> {
  if (!manualRedirectUrl) {
    await new Promise(() => undefined)
    return
  }

  let requestUrl: string
  try {
    requestUrl = await manualRedirectUrl(signal)
  } catch (error) {
    if (signal?.aborted) throw error
    await new Promise(() => undefined)
    return
  }
  if (signal?.aborted || !requestUrl) {
    return
  }
  assertOidcCallbackDidNotReturnError(requestUrl)
  await onCallback(requestUrl)
}

export async function openBrowser(url: string): Promise<void> {
  if (process.platform === 'darwin') {
    await execFileAsync('open', [url])
    return
  }
  if (process.platform === 'win32') {
    await execFileAsync('cmd', ['/c', 'start', '', url])
    return
  }
  await execFileAsync('xdg-open', [url])
}

export class LinxOidcLoginExpiredError extends Error {
  readonly authExpired = true
  constructor(cause?: unknown) {
    super('LinX Cloud login expired.')
    this.name = 'LinxOidcLoginExpiredError'
    if (cause !== undefined) (this as any).cause = cause
  }
}

export function isOidcLoginExpiredError(error: unknown): boolean {
  if (error instanceof LinxOidcLoginExpiredError) return true
  if (typeof error === 'object' && error !== null && 'authExpired' in error && (error as any).authExpired === true) return true
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.toLowerCase()
  return normalized.includes('linx cloud login expired')
    || normalized.includes('invalid refresh credentials')
    || normalized.includes('missing static client secret')
    || normalized.includes('invalid_client')
    || normalized.includes('invalid_grant')
}
