import { defaultMicroAppId, isValidMicroAppId, type MicroAppId } from '@/modules/layout/micro-app-registry'

const POST_LOGIN_MICRO_APP_KEY = 'linx-post-login-micro-app'
const PENDING_LOGIN_ATTEMPT_KEY = 'linx-pending-login-attempt'
const CALLBACK_ERROR_KEY = 'linx-pending-callback-error'
const CURRENT_SOLID_SESSION_KEY = 'solidClientAuthn:currentSession'
const SOLID_SESSION_PREFIX = 'solidClientAuthenticationUser:'

export interface PendingLoginAttempt {
  issuerUrl: string
  authorizationSurface: 'window' | 'embedded' | 'external'
  returnToMicroAppId: MicroAppId
  providerUrl?: string
  providerLabel?: string
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

  const sessionId = window.localStorage.getItem(CURRENT_SOLID_SESSION_KEY)
  if (!sessionId) return null

  const raw = window.localStorage.getItem(`${SOLID_SESSION_PREFIX}${sessionId}`)
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
}

export function clearUnrestorableSolidAuthState(): boolean {
  if (typeof window === 'undefined') return false
  if (getStoredSolidSession()) return false

  let removed = false
  const keys = Object.keys(localStorage)
  for (const key of keys) {
    if (
      key.startsWith('solidClientAuthenticationUser:')
      || key.startsWith('solidClientAuthn:')
      || key.startsWith('oidc.')
    ) {
      localStorage.removeItem(key)
      removed = true
    }
  }

  return removed
}

export const clearStoredSolidSession = (_storageKey?: string) => {
  if (typeof window === 'undefined') return
  const keys = Object.keys(localStorage)
  for (const key of keys) {
    if (
      key.startsWith('solidClientAuthenticationUser:')
      || key.startsWith('solidClientAuthn:')
      || key.startsWith('oidc.')
    ) {
      localStorage.removeItem(key)
    }
  }
  clearPendingPostLoginMicroAppId()
  clearPendingLoginAttempt()
  clearPendingCallbackError()
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
    const parsed = JSON.parse(raw) as Partial<PendingLoginAttempt>
    if (
      typeof parsed.issuerUrl === 'string'
      && (parsed.authorizationSurface === 'window'
        || parsed.authorizationSurface === 'embedded'
        || parsed.authorizationSurface === 'external')
      && isValidMicroAppId(parsed.returnToMicroAppId)
    ) {
      const attempt: PendingLoginAttempt = {
        issuerUrl: parsed.issuerUrl,
        authorizationSurface: parsed.authorizationSurface,
        returnToMicroAppId: parsed.returnToMicroAppId,
      }
      if (typeof parsed.providerUrl === 'string') {
        attempt.providerUrl = parsed.providerUrl
      }
      if (typeof parsed.providerLabel === 'string') {
        attempt.providerLabel = parsed.providerLabel
      }
      return {
        ...attempt,
      }
    }
  } catch {
    // ignore invalid payloads
  }

  window.sessionStorage.removeItem(PENDING_LOGIN_ATTEMPT_KEY)
  return null
}

export function setPendingLoginAttempt(attempt: PendingLoginAttempt) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(PENDING_LOGIN_ATTEMPT_KEY, JSON.stringify(attempt))
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
