import { defaultMicroAppId, isValidMicroAppId, type MicroAppId } from '@/modules/layout/micro-app-registry'
import {
  createLoginTransaction,
  normalizeLoginTransaction,
  normalizeLoginUrl,
  sanitizeAuthorizationQuery,
  type LoginTransaction,
} from './login-transaction'

const POST_LOGIN_MICRO_APP_KEY = 'linx-post-login-micro-app'
const PENDING_LOGIN_ATTEMPT_KEY = 'linx-pending-login-attempt'
const CALLBACK_ERROR_KEY = 'linx-pending-callback-error'
const CURRENT_SOLID_SESSION_KEY = 'solidClientAuthn:currentSession'
const SOLID_SESSION_PREFIX = 'solidClientAuthenticationUser:'
const PENDING_LOGIN_MAX_AGE_MS = 15 * 60 * 1000

export interface PendingLoginAttempt {
  /** OIDC entry URL passed to Inrupt. For Local+Cloud this is the Cloud issuer. */
  issuerUrl: string
  /** Semantic identity issuer stored on the remembered account after login. */
  accountIssuerUrl?: string
  accountIssuerLabel?: string
  authorizationSurface: 'window' | 'embedded' | 'external'
  returnToMicroAppId: MicroAppId
  storageProviderUrl?: string
  storageProviderLabel?: string
  authorizationQuery?: Record<string, string>
  prompt?: 'none' | 'consent'
  strictDiscovery?: boolean
}

type PendingLoginPayload = Partial<PendingLoginAttempt> & {
  providerUrl?: string
  providerLabel?: string
  oidcEntryUrl?: string
  oidcIssuerUrl?: string
  loginTransaction?: unknown
  transaction?: unknown
  nodeId?: string
  createdAt?: number
}

export interface PendingCallbackError {
  error: string
  description: string | null
}

export interface StoredSolidSessionInfo {
  sessionId: string
  issuerUrl: string | null
  redirectUrl: string | null
  clientId: string | null
  tokenType: string | null
  webId: string | null
}

/**
 * 检查是否有有效的存储会话
 */
export const hasStoredSolidSession = (_storageKey?: string) => {
  if (typeof window === 'undefined') return false

  return Boolean(getStoredSolidSession())
}

export function getStoredSolidSession(): StoredSolidSessionInfo | null {
  if (typeof window === 'undefined') return null
  const storage = getLocalStorage()
  if (!storage) return null

  const sessionId = storage.getItem(CURRENT_SOLID_SESSION_KEY)
  if (!sessionId) return null

  const raw = storage.getItem(`${SOLID_SESSION_PREFIX}${sessionId}`)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (!hasRestorableSessionMetadata(parsed)) return null

    return {
      sessionId,
      issuerUrl: typeof parsed.issuer === 'string' ? parsed.issuer : null,
      redirectUrl: typeof parsed.redirectUrl === 'string' ? parsed.redirectUrl : null,
      clientId: typeof parsed.clientId === 'string' ? parsed.clientId : null,
      tokenType: typeof parsed.tokenType === 'string' ? parsed.tokenType : null,
      webId: typeof parsed.webId === 'string' ? parsed.webId : null,
    }
  } catch {
    return null
  }
}

function hasRestorableSessionMetadata(parsed: Record<string, unknown>): boolean {
  return parsed.isLoggedIn === 'true'
    || parsed.isLoggedIn === true
    || typeof parsed.webId === 'string'
    || typeof parsed.refreshToken === 'string'
    || (
      typeof parsed.issuer === 'string'
      && typeof parsed.redirectUrl === 'string'
      && typeof parsed.clientId === 'string'
      && (
        parsed.dpop === 'true'
        || parsed.dpop === true
        || parsed.keepAlive === 'true'
        || parsed.keepAlive === true
      )
    )
}

export function clearUnrestorableSolidAuthState(): boolean {
  if (typeof window === 'undefined') return false
  if (getStoredSolidSession()) return false
  const storage = getLocalStorage()
  if (!storage) return false

  let removed = false
  const keys = Object.keys(storage)
  for (const key of keys) {
    if (
      key.startsWith('solidClientAuthenticationUser:')
      || key.startsWith('solidClientAuthn:')
      || key.startsWith('oidc.')
    ) {
      storage.removeItem(key)
      removed = true
    }
  }

  return removed
}

export const clearStoredSolidSession = (_storageKey?: string) => {
  if (typeof window === 'undefined') return
  clearStoredSolidAuthRecords()
  clearPendingPostLoginMicroAppId()
  clearPendingLoginAttempt()
  clearPendingCallbackError()
}

export function clearStoredSolidAuthRecords() {
  if (typeof window === 'undefined') return
  const storage = getLocalStorage()
  if (!storage) return
  const keys = Object.keys(storage)
  for (const key of keys) {
    if (
      key.startsWith('solidClientAuthenticationUser:')
      || key.startsWith('solidClientAuthn:')
      || key.startsWith('oidc.')
    ) {
      storage.removeItem(key)
    }
  }
}

function getLocalStorage(): Storage | null {
  const storage = typeof window !== 'undefined' ? window.localStorage : undefined
  if (
    !storage
    || typeof storage.getItem !== 'function'
    || typeof storage.removeItem !== 'function'
  ) {
    return null
  }
  return storage
}

export function resolvePostLoginMicroAppId(pathname?: string): MicroAppId {
  const fallback = defaultMicroAppId
  const candidatePath = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '')
  const segment = candidatePath.replace(/^\//, '').split('/')[0]
  return isValidMicroAppId(segment) ? segment : fallback
}

export function getPendingPostLoginMicroAppId(): MicroAppId | null {
  if (typeof window === 'undefined') return null
  const value = window.sessionStorage.getItem(POST_LOGIN_MICRO_APP_KEY)
  return isValidMicroAppId(value ?? undefined) ? (value as MicroAppId) : null
}

export function ensurePendingPostLoginMicroAppId(microAppId: MicroAppId) {
  if (typeof window === 'undefined') return
  if (getPendingPostLoginMicroAppId()) return
  window.sessionStorage.setItem(POST_LOGIN_MICRO_APP_KEY, microAppId)
}

export function consumePendingPostLoginMicroAppId(): MicroAppId {
  if (typeof window === 'undefined') return defaultMicroAppId
  const value = getPendingPostLoginMicroAppId()
  window.sessionStorage.removeItem(POST_LOGIN_MICRO_APP_KEY)
  return value ?? defaultMicroAppId
}

export function clearPendingPostLoginMicroAppId() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(POST_LOGIN_MICRO_APP_KEY)
}

export function getPendingLoginAttempt(): PendingLoginAttempt | null {
  if (typeof window === 'undefined') return null

  const raw = window.sessionStorage.getItem(PENDING_LOGIN_ATTEMPT_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as PendingLoginPayload
    const attempt = normalizePendingLoginAttemptPayload(parsed)
    if (attempt) return attempt
  } catch {
    // ignore invalid payloads
  }

  window.sessionStorage.removeItem(PENDING_LOGIN_ATTEMPT_KEY)
  return null
}

export function getPendingLoginTransaction(): LoginTransaction | null {
  if (typeof window === 'undefined') return null

  const raw = window.sessionStorage.getItem(PENDING_LOGIN_ATTEMPT_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as PendingLoginPayload
    const explicitTransaction = normalizeLoginTransaction(parsed.loginTransaction)
      ?? normalizeLoginTransaction(parsed.transaction)
    if (explicitTransaction) {
      return explicitTransaction
    }

    const attempt = normalizePendingLoginAttemptPayload(parsed)
    if (!attempt) return null

    return createLoginTransaction({
      ...parsed,
      issuerUrl: attempt.issuerUrl,
      oidcIssuerUrl: parsed.oidcIssuerUrl ?? attempt.issuerUrl,
      oidcEntryUrl: parsed.oidcEntryUrl,
      accountIssuerUrl: attempt.accountIssuerUrl,
      accountIssuerLabel: attempt.accountIssuerLabel,
      authorizationSurface: attempt.authorizationSurface,
      returnToMicroAppId: attempt.returnToMicroAppId,
      storageProviderUrl: attempt.storageProviderUrl,
      storageProviderLabel: attempt.storageProviderLabel,
      authorizationQuery: attempt.authorizationQuery,
      prompt: attempt.prompt,
      strictDiscovery: attempt.strictDiscovery,
    })
  } catch {
    return null
  }
}

export function setPendingLoginAttempt(attempt: PendingLoginAttempt, loginTransaction?: LoginTransaction | null) {
  if (typeof window === 'undefined') return
  const persisted: PendingLoginAttempt = {
    issuerUrl: attempt.issuerUrl,
    authorizationSurface: attempt.authorizationSurface,
    returnToMicroAppId: attempt.returnToMicroAppId,
  }
  const accountIssuerUrl = normalizeStoredUrl(attempt.accountIssuerUrl)
  if (accountIssuerUrl) {
    persisted.accountIssuerUrl = accountIssuerUrl
  }
  if (attempt.accountIssuerLabel) {
    persisted.accountIssuerLabel = attempt.accountIssuerLabel
  }
  if (attempt.storageProviderUrl) {
    persisted.storageProviderUrl = attempt.storageProviderUrl
  }
  if (attempt.storageProviderLabel) {
    persisted.storageProviderLabel = attempt.storageProviderLabel
  }
  const authorizationQuery = sanitizeAuthorizationQuery(attempt.authorizationQuery)
  if (authorizationQuery) {
    persisted.authorizationQuery = authorizationQuery
  }
  if (attempt.prompt === 'none' || attempt.prompt === 'consent') {
    persisted.prompt = attempt.prompt
  }
  if (attempt.strictDiscovery === true) {
    persisted.strictDiscovery = true
  }
  const transaction = normalizeLoginTransaction(loginTransaction)
    ?? createLoginTransaction({
      issuerUrl: persisted.issuerUrl,
      oidcIssuerUrl: persisted.issuerUrl,
      accountIssuerUrl: persisted.accountIssuerUrl,
      accountIssuerLabel: persisted.accountIssuerLabel,
      authorizationSurface: persisted.authorizationSurface,
      returnToMicroAppId: persisted.returnToMicroAppId,
      storageProviderUrl: persisted.storageProviderUrl,
      storageProviderLabel: persisted.storageProviderLabel,
      authorizationQuery: persisted.authorizationQuery,
      prompt: persisted.prompt,
      strictDiscovery: persisted.strictDiscovery,
    })
  const payload = transaction
    ? {
        ...persisted,
        oidcEntryUrl: transaction.oidcEntryUrl,
        oidcIssuerUrl: transaction.oidcIssuerUrl,
        loginTransaction: transaction,
      }
    : persisted
  window.sessionStorage.setItem(PENDING_LOGIN_ATTEMPT_KEY, JSON.stringify(payload))
}

export function consumePendingLoginAttempt(): PendingLoginAttempt | null {
  const attempt = getPendingLoginAttempt()
  clearPendingLoginAttempt()
  return attempt
}

export function clearPendingLoginAttempt() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(PENDING_LOGIN_ATTEMPT_KEY)
}

export function cleanupExpiredLoginTransaction(
  now = Date.now(),
  maxAgeMs = PENDING_LOGIN_MAX_AGE_MS,
): boolean {
  if (typeof window === 'undefined') return false
  const raw = window.sessionStorage.getItem(PENDING_LOGIN_ATTEMPT_KEY)
  if (!raw) return false

  try {
    const parsed = JSON.parse(raw) as PendingLoginPayload
    const transactionPayload = parsed.loginTransaction ?? parsed.transaction
    const createdAt = transactionPayload
      && typeof transactionPayload === 'object'
      && !Array.isArray(transactionPayload)
      && typeof (transactionPayload as { createdAt?: unknown }).createdAt === 'number'
        ? (transactionPayload as { createdAt: number }).createdAt
        : typeof parsed.createdAt === 'number' ? parsed.createdAt : null
    if (createdAt && createdAt <= now && now - createdAt <= maxAgeMs) {
      return false
    }
  } catch {
    // Malformed transient auth state is never useful for a future login.
  }

  clearPendingLoginAttempt()
  return true
}

/** Prepare a user-initiated login without deleting remembered account data. */
export function prepareFreshLoginAttempt(): void {
  cleanupExpiredLoginTransaction()
  clearPendingLoginAttempt()
  clearPendingCallbackError()
  clearUnrestorableSolidAuthState()
}

function normalizeStoredUrl(url?: string | null): string | null {
  return normalizeLoginUrl(url)
}

function normalizePendingLoginAttemptPayload(parsed: PendingLoginPayload): PendingLoginAttempt | null {
  if (
    typeof parsed.issuerUrl !== 'string'
    || !(parsed.authorizationSurface === 'window'
      || parsed.authorizationSurface === 'embedded'
      || parsed.authorizationSurface === 'external')
    || !isValidMicroAppId(parsed.returnToMicroAppId)
  ) {
    return null
  }

  const storageProviderUrl = normalizeStoredUrl(parsed.storageProviderUrl)
    ?? normalizeStoredUrl(parsed.providerUrl)
  const storageProviderLabel = parsed.storageProviderLabel ?? parsed.providerLabel
  const attempt: PendingLoginAttempt = {
    issuerUrl: parsed.issuerUrl,
    authorizationSurface: parsed.authorizationSurface,
    returnToMicroAppId: parsed.returnToMicroAppId,
  }
  const accountIssuerUrl = normalizeStoredUrl(parsed.accountIssuerUrl)
  if (accountIssuerUrl) {
    attempt.accountIssuerUrl = accountIssuerUrl
  }
  if (typeof parsed.accountIssuerLabel === 'string' && parsed.accountIssuerLabel.trim().length > 0) {
    attempt.accountIssuerLabel = parsed.accountIssuerLabel
  }
  if (storageProviderUrl) {
    attempt.storageProviderUrl = storageProviderUrl
  }
  if (typeof storageProviderLabel === 'string' && storageProviderLabel.trim().length > 0) {
    attempt.storageProviderLabel = storageProviderLabel
  }
  const authorizationQuery = sanitizeAuthorizationQuery(parsed.authorizationQuery)
  if (authorizationQuery) {
    attempt.authorizationQuery = authorizationQuery
  }
  if (parsed.prompt === 'none' || parsed.prompt === 'consent') {
    attempt.prompt = parsed.prompt
  }
  if (parsed.strictDiscovery === true) {
    attempt.strictDiscovery = true
  }
  return attempt
}

export function capturePendingCallbackError(url?: string): PendingCallbackError | null {
  if (typeof window === 'undefined') return null

  try {
    const parsed = new URL(url ?? window.location.href)
    if (parsed.pathname !== '/auth/callback') {
      return null
    }

    const error = parsed.searchParams.get('error')
    if (!error) {
      return null
    }

    const payload: PendingCallbackError = {
      error,
      description: parsed.searchParams.get('error_description'),
    }

    window.sessionStorage.setItem(CALLBACK_ERROR_KEY, JSON.stringify(payload))
    return payload
  } catch {
    return null
  }
}

export function getPendingCallbackError(): PendingCallbackError | null {
  if (typeof window === 'undefined') return null

  const raw = window.sessionStorage.getItem(CALLBACK_ERROR_KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<PendingCallbackError>
    if (typeof parsed.error === 'string') {
      return {
        error: parsed.error,
        description: typeof parsed.description === 'string' ? parsed.description : null,
      }
    }
  } catch {
    // ignore invalid payloads
  }

  window.sessionStorage.removeItem(CALLBACK_ERROR_KEY)
  return null
}

export function clearPendingCallbackError() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(CALLBACK_ERROR_KEY)
}

/**
 * Standalone sign-out: clears all OIDC/session/pending state and resets the login store.
 * Use this from any component that needs to sign out without access to the login controller.
 */
export async function performSignOut(
  sessionLogout: () => Promise<void>,
): Promise<void> {
  try {
    await sessionLogout()
  } catch {
    // ignore
  }
  clearPendingLoginAttempt()
  clearPendingPostLoginMicroAppId()
  clearStoredSolidSession()
  const { useLoginStore } = await import('@linx/stores/login')
  useLoginStore.getState().reset()
}

export const SIGN_OUT_EVENT = 'linx:sign-out'

export function requestSignOut() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SIGN_OUT_EVENT))
}
