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
const PENDING_LOGIN_MAX_AGE_MS = 15 * 60 * 1000
const CALLBACK_ERROR_KEY = 'linx-pending-callback-error'
const CURRENT_SOLID_SESSION_KEY = 'solidClientAuthn:currentSession'
const SOLID_SESSION_PREFIX = 'solidClientAuthenticationUser:'
const SECURE_SOLID_SESSION_PREFIX = 'solidClientAuthn:secure:'
const SOLID_CLIENT_METADATA_KEY = 'linx-solid-client-registration'
const REMEMBERED_ACCOUNT_KEY = 'linx-remembered-account'
const LOGIN_STORE_KEY = 'linx-login'
const LOGIN_CLIENT_SCHEMA_KEY = 'linx-login-client-schema'
const LOGIN_CLIENT_SCHEMA_VERSION = '3'

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
  prompt?: 'none' | 'consent' | 'login'
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
 * Login state is only a restore hint, never an authority. When its contract
 * changes, discard the previous browser-side identity binding and let the
 * current Xpod/provider capabilities drive a fresh login. Pod data is not
 * touched by this migration.
 */
export function reconcileLoginClientSchema(): boolean {
  if (typeof window === 'undefined') return false
  if (window.localStorage.getItem(LOGIN_CLIENT_SCHEMA_KEY) === LOGIN_CLIENT_SCHEMA_VERSION) {
    return false
  }

  clearSolidAuthClientState()
  window.localStorage.removeItem(REMEMBERED_ACCOUNT_KEY)
  window.localStorage.removeItem(LOGIN_STORE_KEY)
  clearPendingPostLoginMicroAppId()
  clearPendingLoginAttempt()
  clearPendingCallbackError()
  markLoginClientSchemaCurrent()
  return true
}

export function markLoginClientSchemaCurrent(): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LOGIN_CLIENT_SCHEMA_KEY, LOGIN_CLIENT_SCHEMA_VERSION)
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
    const insecure = JSON.parse(raw) as Record<string, unknown>
    const secureRaw = window.localStorage.getItem(`${SECURE_SOLID_SESSION_PREFIX}${SOLID_SESSION_PREFIX}${sessionId}`)
    const secure = secureRaw ? JSON.parse(secureRaw) as Record<string, unknown> : {}
    const parsed = { ...insecure, ...secure }
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

function isSolidAuthStorageKey(key: string): boolean {
  return key.startsWith('solidClientAuthenticationUser:')
    || key.startsWith('solidClientAuthn:')
    || key.startsWith('oidc.')
}

function storageKeys(storage: Storage): string[] {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index))
    .filter((key): key is string => key !== null)
}

export function clearSolidAuthClientState(): boolean {
  if (typeof window === 'undefined') return false

  let removed = false
  const keys = storageKeys(window.localStorage)
  for (const key of keys) {
    if (isSolidAuthStorageKey(key)) {
      window.localStorage.removeItem(key)
      removed = true
    }
  }
  if (clearSolidClientRegistrationCache()) removed = true

  return removed
}

/**
 * Fields Inrupt's `ClientRegistrar.getClient()` reads from a session record to
 * reuse a dynamically registered client instead of registering a new one.
 * `expiresAt` is mandatory for a secret-bearing client: the SDK treats a missing
 * expiry as an EXPIRED registration and re-runs DCR.
 */
const SOLID_CLIENT_REGISTRATION_FIELDS = [
  'clientId',
  'clientSecret',
  'expiresAt',
  'clientName',
  'clientType',
  'idTokenSignedResponseAlg',
] as const

/**
 * Session-scoped fields the SDK re-creates on every authorization. Dropped when
 * a stored session cannot be restored; the registration above is kept.
 *
 * `issuer` is deliberately NOT dropped: it is a non-secret account binding used
 * by scoped forget, and without `redirectUrl`/`dpop`/`keepAlive` the record still
 * cannot be mistaken for a restorable session.
 */
const SOLID_SESSION_STATE_FIELDS = [
  'isLoggedIn',
  'webId',
  'refreshToken',
  'accessToken',
  'idToken',
  'dpop',
  'keepAlive',
  'redirectUrl',
  'tokenType',
  'publicKey',
  'privateKey',
  'codeVerifier',
] as const

interface ParsedSolidSessionRecord {
  key: string
  value: Record<string, unknown> | null
}

/**
 * Shape the Inrupt SDK itself keeps for a registered client.
 *
 * `oidc-client-ext.registerClient()` requests `token_endpoint_auth_method:
 * "none"`, so a public client comes back WITHOUT `client_secret`. The SDK's
 * `ClientRegistrar.getClient()` therefore treats the secret as optional and
 * only applies expiry to confidential (secret-bearing) clients. Both fields are
 * modelled that way here instead of inventing values the provider never issued.
 */
interface SolidClientRegistration {
  clientId: string
  clientType: 'dynamic' | 'static' | 'solid-oidc'
  clientSecret?: string
  expiresAt?: string
  clientName?: string
  idTokenSignedResponseAlg?: string
  issuer?: string
}

function parseSolidSessionRecord(key: string): ParsedSolidSessionRecord | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(key)
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return {
      key,
      value: parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null,
    }
  } catch {
    return null
  }
}

function hasClientRegistration(value: Record<string, unknown> | null): boolean {
  if (!value) return false
  return typeof value.clientId === 'string' && value.clientId.length > 0
}

/**
 * The session record the SDK currently points at, if any. Only that one record
 * may be rewritten: records belonging to another provider/account are never
 * touched by the session helpers below.
 */
function currentSolidSessionRecord(): ParsedSolidSessionRecord | null {
  if (typeof window === 'undefined') return null
  const sessionId = window.localStorage.getItem(CURRENT_SOLID_SESSION_KEY)
  if (!sessionId) return null
  return parseSolidSessionRecord(`${SOLID_SESSION_PREFIX}${sessionId}`)
}

function withoutFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...value }
  for (const field of fields) delete next[field]
  return next
}

/**
 * Compare issuers by protocol + host (which are case-insensitive) while keeping
 * the path and query EXACTLY as issued: issuer identifiers are case-sensitive
 * after the host, so `/Tenant` and `/tenant` are different issuers.
 */
function normalizeSolidIssuer(url?: string | null): string | null {
  if (typeof url !== 'string') return null
  const trimmed = url.trim()
  if (trimmed.length === 0) return null
  try {
    const parsed = new URL(trimmed)
    const path = parsed.pathname.replace(/\/$/, '')
    return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`
  } catch {
    return trimmed.replace(/\/$/, '')
  }
}

/** Copy ONLY whitelisted registration metadata — never whole session records. */
function toClientRegistration(
  value: Record<string, unknown> | null,
): SolidClientRegistration | null {
  if (!hasClientRegistration(value)) return null
  const source = value as Record<string, unknown>

  // A public client legitimately has no secret. Expiry is only meaningful for a
  // confidential (secret-bearing) client: `ClientRegistrar.getClient()` computes
  // `expired` solely from `clientSecret !== undefined`, so a secretless client
  // must never be rejected just because it has no `expiresAt`.
  const clientSecret = typeof source.clientSecret === 'string' && source.clientSecret.length > 0
    ? source.clientSecret
    : undefined

  const clientType = source.clientType === 'static' || source.clientType === 'solid-oidc'
    ? source.clientType
    : 'dynamic'

  const registration: SolidClientRegistration = {
    clientId: source.clientId as string,
    clientType,
  }
  if (clientSecret) {
    registration.clientSecret = clientSecret
    const rawExpiry = source.expiresAt
    if (typeof rawExpiry === 'string' || typeof rawExpiry === 'number') {
      const expiresAt = Number.parseInt(String(rawExpiry), 10)
      if (!Number.isNaN(expiresAt)) registration.expiresAt = String(expiresAt)
    }
  }
  if (typeof source.clientName === 'string') registration.clientName = source.clientName
  if (typeof source.idTokenSignedResponseAlg === 'string') {
    registration.idTokenSignedResponseAlg = source.idTokenSignedResponseAlg
  }
  const issuer = normalizeSolidIssuer(
    typeof source.issuer === 'string' ? source.issuer : null,
  )
  if (issuer) registration.issuer = issuer
  return registration
}

/**
 * Whether the SDK would reuse this registration, mirroring
 * `ClientRegistrar.getClient()`:
 *  - a client type it knows, plus
 *  - expiry ONLY for secret-bearing clients (`expiresAt` 0 = never expires;
 *    a missing/unparseable expiry on a confidential client = expired).
 * A public client has no secret, so expiry does not apply to it at all.
 *
 * `expectedIssuer` is exact: an issuerless or different issuer registration is
 * never offered to a provider it does not belong to.
 */
function isReusableRegistration(
  registration: SolidClientRegistration | null,
  expectedIssuer?: string | null,
): registration is SolidClientRegistration {
  if (!registration) return false
  if (registration.clientSecret) {
    // Confidential: the SDK needs a parseable expiry; 0 means "never expires".
    if (registration.expiresAt === undefined) return false
    const expiresAt = Number.parseInt(registration.expiresAt, 10)
    if (Number.isNaN(expiresAt)) return false
    if (expiresAt !== 0 && Math.floor(Date.now() / 1000) > expiresAt) return false
  }
  const expected = normalizeSolidIssuer(expectedIssuer)
  if (!expected) return true
  return registration.issuer === expected
}

/* ------------------------------------------------------------------------- *
 * Issuer-keyed registration cache
 *
 * Inrupt deletes EVERY `solidClientAuthenticationUser:*` record when an
 * interactive login starts (proven against the real SDK), so a session record
 * alone cannot keep a client reusable across a provider switch. This cache holds
 * one whitelisted registration per issuer so A -> B -> A still reuses A's client.
 * It never stores tokens, DPoP keys or any other session field, and lives outside
 * the SDK prefix so it must be cleared explicitly with the auth state.
 * ------------------------------------------------------------------------- */

function readSolidClientRegistrationCache(): Record<string, SolidClientRegistration> {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(SOLID_CLIENT_METADATA_KEY)
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const entries: Record<string, SolidClientRegistration> = {}
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const registration = toClientRegistration(value as Record<string, unknown>)
      if (registration) entries[key] = registration
    }
    return entries
  } catch {
    return {}
  }
}

function writeSolidClientRegistrationCache(
  entries: Record<string, SolidClientRegistration>,
): void {
  if (typeof window === 'undefined') return
  if (Object.keys(entries).length === 0) {
    window.localStorage.removeItem(SOLID_CLIENT_METADATA_KEY)
    return
  }
  window.localStorage.setItem(SOLID_CLIENT_METADATA_KEY, JSON.stringify(entries))
}

function cacheSolidClientRegistration(
  value: Record<string, unknown> | null,
): boolean {
  const registration = toClientRegistration(value)
  if (!registration?.issuer) return false
  const entries = readSolidClientRegistrationCache()
  entries[registration.issuer] = registration
  writeSolidClientRegistrationCache(entries)
  return true
}

/** Snapshot the current session's registration under its issuer. */
export function rememberSolidClientRegistration(): boolean {
  const record = currentSolidSessionRecord()
  if (!record) return false
  return cacheSolidClientRegistration(record.value)
}

/** The cached registration for this exact issuer, if it would still be reused. */
function getCachedSolidClientRegistration(
  issuerUrl?: string | null,
): SolidClientRegistration | null {
  const issuer = normalizeSolidIssuer(issuerUrl)
  if (!issuer) return null
  const registration = readSolidClientRegistrationCache()[issuer]
  return isReusableRegistration(registration, issuer) ? registration : null
}

function clearSolidClientRegistrationCache(): boolean {
  if (typeof window === 'undefined') return false
  if (window.localStorage.getItem(SOLID_CLIENT_METADATA_KEY) === null) return false
  window.localStorage.removeItem(SOLID_CLIENT_METADATA_KEY)
  return true
}

/** Drop cached clients for exactly one issuer, leaving other providers intact. */
function clearSolidClientRegistrationCacheForIssuer(issuerUrl?: string | null): boolean {
  const issuer = normalizeSolidIssuer(issuerUrl)
  if (!issuer) return false
  const entries = readSolidClientRegistrationCache()
  if (!entries[issuer]) return false
  delete entries[issuer]
  writeSolidClientRegistrationCache(entries)
  return true
}

/**
 * Re-attach an issuer's cached registration to a session record that has none.
 * Returns the login options so the caller can also hand them to `login()`, which
 * is what actually prevents the pre-redirect DCR.
 */
export function adoptPreservedSolidClientRegistration(
  sessionId: string,
  issuerUrl?: string | null,
): SolidClientLoginOptions | null {
  if (typeof window === 'undefined') return null
  if (!sessionId) return null
  const key = `${SOLID_SESSION_PREFIX}${sessionId}`
  const existing = parseSolidSessionRecord(key)
  if (hasClientRegistration(existing?.value ?? null)) return null
  const registration = getCachedSolidClientRegistration(issuerUrl)
  if (!registration) return null
  window.localStorage.setItem(
    key,
    JSON.stringify({ ...(existing?.value ?? {}), ...registration }),
  )
  return toLoginOptions(registration)
}

/**
 * Registration to hand back to `login()`, scoped to this exact issuer.
 *
 * Pass this for a new session as well as a reused one: the SDK's static-client
 * path rewrites the stored `clientType` without `expiresAt`, so seeding storage
 * alone would leave the callback exchange re-registering.
 */
export function getStoredSolidClientLoginOptions(issuerUrl?: string | null): SolidClientLoginOptions | null {
  const registration = getStoredSolidClientRegistration(issuerUrl)
  return registration ? toLoginOptions(registration) : null
}

/**
 * The reusable registration for this exact issuer, from the live SDK record
 * first and the issuer-keyed cache second.
 */
export function getStoredSolidClientRegistration(
  issuerUrl?: string | null,
): SolidClientRegistration | null {
  const issuer = normalizeSolidIssuer(issuerUrl)
  if (!issuer) return null
  const record = currentSolidSessionRecord()
  const fromSession = toClientRegistration(record?.value ?? null)
  if (isReusableRegistration(fromSession, issuer)) return fromSession
  return getCachedSolidClientRegistration(issuer)
}

/**
 * `login()` options for a reusable client. A public client has no secret, so the
 * key is omitted entirely rather than passed as undefined.
 */
function toLoginOptions(registration: SolidClientRegistration): SolidClientLoginOptions {
  return registration.clientSecret
    ? { clientId: registration.clientId, clientSecret: registration.clientSecret }
    : { clientId: registration.clientId }
}

export interface SolidClientLoginOptions {
  clientId: string
  clientSecret?: string
}

interface SolidAccountBinding {
  issuerUrl?: string | null
  webId?: string | null
  storageProviderUrl?: string | null
}

function solidAccountMatcher(binding: SolidAccountBinding) {
  const issuers = new Set(
    [binding.issuerUrl, binding.storageProviderUrl]
      .map((value) => normalizeSolidIssuer(value))
      .filter((value): value is string => value !== null),
  )
  const webIds = new Set(
    [binding.webId]
      .map((value) => (typeof value === 'string' ? value.replace(/\/$/, '') : ''))
      .filter((value) => value.length > 0),
  )
  const matches = (value: Record<string, unknown> | null): boolean => {
    if (!value) return false
    const issuer = normalizeSolidIssuer(typeof value.issuer === 'string' ? value.issuer : null)
    if (issuer && issuers.has(issuer)) return true
    return typeof value.webId === 'string' && webIds.has(value.webId.replace(/\/$/, ''))
  }
  return { issuers, matches }
}

/** Remove one provider's registration without clearing other providers. */
export function clearSolidClientRegistrationForAccount(binding: SolidAccountBinding): boolean {
  if (typeof window === 'undefined') return false
  const { issuers, matches } = solidAccountMatcher(binding)
  const cacheIssuers = new Set(issuers)

  let cleared = false
  for (const key of storageKeys(window.localStorage)) {
    if (!key.startsWith(SOLID_SESSION_PREFIX)) continue
    const record = parseSolidSessionRecord(key)
    if (!record || !hasClientRegistration(record.value) || !matches(record.value)) continue
    const issuer = normalizeSolidIssuer(
      typeof record.value?.issuer === 'string' ? record.value.issuer : null,
    )
    if (issuer) cacheIssuers.add(issuer)
    const remaining = withoutFields(record.value!, SOLID_CLIENT_REGISTRATION_FIELDS)
    if (Object.keys(remaining).length === 0) {
      window.localStorage.removeItem(key)
    } else {
      window.localStorage.setItem(key, JSON.stringify(remaining))
    }
    cleared = true
  }

  for (const issuer of cacheIssuers) {
    if (clearSolidClientRegistrationCacheForIssuer(issuer)) cleared = true
  }

  return cleared
}

/**
 * Drop the stored session(s) belonging to ONE provider/account.
 *
 * Used on rejected-client paths where the session itself is unusable. Unlike
 * `clearStoredSolidSession()` this never touches another provider's record, so a
 * failure on one account cannot force every other account to log in again.
 */
export function clearSolidSessionForAccount(
  binding: SolidAccountBinding,
): boolean {
  if (typeof window === 'undefined') return false
  const { matches } = solidAccountMatcher(binding)

  let cleared = false
  for (const key of storageKeys(window.localStorage)) {
    if (!key.startsWith(SOLID_SESSION_PREFIX)) continue
    const record = parseSolidSessionRecord(key)
    if (!record || !matches(record.value)) continue
    window.localStorage.removeItem(key)
    window.localStorage.removeItem(`${SECURE_SOLID_SESSION_PREFIX}${key}`)
    cleared = true
  }

  const currentSessionId = window.localStorage.getItem(CURRENT_SOLID_SESSION_KEY)
  if (currentSessionId) {
    const currentKey = `${SOLID_SESSION_PREFIX}${currentSessionId}`
    if (window.localStorage.getItem(currentKey) === null) {
      window.localStorage.removeItem(CURRENT_SOLID_SESSION_KEY)
    }
  }

  return cleared
}

/**
 * Drop an unrestorable AUTH SESSION while KEEPING its registered client.
 *
 * Only the current session's record is touched. A record with no `clientId` has
 * no reusable registration and is removed entirely rather than left behind as
 * an unrestorable leftover.
 */
export function clearSolidSessionPreservingClient(): boolean {
  if (typeof window === 'undefined') return false
  const record = currentSolidSessionRecord()
  if (!record) return false

  if (!hasClientRegistration(record.value)) {
    window.localStorage.removeItem(record.key)
    return true
  }

  rememberSolidClientRegistration()
  const remaining = withoutFields(record.value!, SOLID_SESSION_STATE_FIELDS)
  window.localStorage.setItem(record.key, JSON.stringify(remaining))
  return true
}

/**
 * Purge the client registration the provider ACTUALLY rejected
 * (`invalid_client` / `unknown_client`).
 *
 * Bounded by construction: only the current session's registration (and its
 * issuer's cache entry) is removed, so the next attempt registers once and then
 * reuses that client. Keeping a rejected registration would fail every retry.
 */
export function clearSolidClientRegistration(): boolean {
  if (typeof window === 'undefined') return false
  const record = currentSolidSessionRecord()
  const issuer = normalizeSolidIssuer(
    typeof record?.value?.issuer === 'string' ? record.value.issuer : null,
  )
  let cleared = false
  if (record && hasClientRegistration(record.value)) {
    const remaining = withoutFields(record.value!, SOLID_CLIENT_REGISTRATION_FIELDS)
    window.localStorage.setItem(record.key, JSON.stringify(remaining))
    cleared = true
  }
  if (clearSolidClientRegistrationCacheForIssuer(issuer)) cleared = true
  return cleared
}

/**
 * Reduce leftover Inrupt auth metadata to what is still useful, without ever
 * destroying a client that could be reused.
 *
 * Scoped steps, none of which touches another provider's registration:
 *  - the record the SDK points at keeps its registration but loses session state;
 *  - a record with no `clientId` cannot be restored by anything and is removed;
 *  - when no `currentSession` pointer survives, a reusable registration is
 *    remembered in the issuer-keyed cache so the next login can adopt it.
 *
 * Returns true when the stored state was modified.
 */
export function clearUnrestorableSolidAuthState(): boolean {
  if (typeof window === 'undefined') return false
  if (getStoredSolidSession()) return false

  const current = currentSolidSessionRecord()
  if (current) {
    clearSolidSessionPreservingClient()
    removeOrphanedSolidSecureRecords()
    return true
  }

  let modified = false
  for (const key of storageKeys(window.localStorage)) {
    if (!key.startsWith(SOLID_SESSION_PREFIX)) continue
    const record = parseSolidSessionRecord(key)
    if (!record) continue
    if (!hasClientRegistration(record.value)) {
      // Nothing in here can restore a session or a client.
      window.localStorage.removeItem(key)
      modified = true
      continue
    }
    if (cacheSolidClientRegistration(record.value)) modified = true
  }
  if (removeOrphanedSolidSecureRecords()) modified = true
  return modified
}

/**
 * Complete a session-record write with whitelisted, still-valid registration
 * metadata for the SAME issuer and client the SDK just wrote.
 *
 * The SDK persists a static client as `{clientId, clientSecret, clientType,
 * clientName}` and, in the same login, adds `issuer`/`redirectUrl`/`dpop`/
 * `codeVerifier`. It never writes `expiresAt` for that path, so the callback's
 * `ClientRegistrar.getClient()` sees a secret-bearing client with no expiry,
 * treats it as expired, and performs a second DCR with a different `client_id`.
 *
 * Called from the storage adapter so it covers desktop and plain browser
 * navigation alike. Returns `serialized` unchanged unless ALL of these hold:
 *  - the record already carries a known issuer and a `clientId`;
 *  - the cached registration for that exact issuer has the same `clientId`;
 *  - that registration is still reusable.
 * Only `clientType`/`expiresAt` (plus optional name/alg) are merged; nothing
 * else on the record is read or rewritten.
 */
export function withRetainedSolidClientRegistration(
  storageKey: string,
  serialized: string,
): string {
  if (typeof window === 'undefined') return serialized
  if (!storageKey.startsWith(SOLID_SESSION_PREFIX)) return serialized

  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return serialized
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return serialized
  const value = parsed as Record<string, unknown>

  const issuer = normalizeSolidIssuer(typeof value.issuer === 'string' ? value.issuer : null)
  if (!issuer) return serialized
  if (!hasClientRegistration(value)) return serialized

  const registration = getCachedSolidClientRegistration(issuer)
  if (!registration || registration.clientId !== value.clientId) return serialized
  if (!isReusableRegistration(registration, issuer)) return serialized
  // A confidential registration is only reusable with an explicit expiry.
  if (registration.clientSecret && !registration.expiresAt) return serialized

  const patch: Record<string, unknown> = { clientType: registration.clientType }
  if (registration.expiresAt) patch.expiresAt = registration.expiresAt
  if (typeof registration.clientName === 'string') patch.clientName = registration.clientName
  if (typeof registration.idTokenSignedResponseAlg === 'string') {
    patch.idTokenSignedResponseAlg = registration.idTokenSignedResponseAlg
  }

  const alreadyComplete = Object.entries(patch)
    .every(([key, expected]) => value[key] === expected)
  if (alreadyComplete) return serialized

  return JSON.stringify({ ...value, ...patch })
}

/**
 * Remove secure shadow records whose plain counterpart no longer exists.
 *
 * `PersistentSessionStorage` mirrors the SDK's secure store at
 * `solidClientAuthn:secure:solidClientAuthenticationUser:<id>`, which is where
 * refresh tokens and DPoP keys live. Once the plain record is gone nothing can
 * pair that shadow with a session, so keeping it would leave credentials in the
 * browser forever without ever making a session restorable.
 *
 * A shadow whose plain record still exists is NEVER touched. The secure payload
 * is not read or parsed.
 */
function removeOrphanedSolidSecureRecords(): boolean {
  if (typeof window === 'undefined') return false
  let removed = false
  for (const key of storageKeys(window.localStorage)) {
    if (!key.startsWith(SECURE_SOLID_SESSION_PREFIX)) continue
    const inner = key.slice(SECURE_SOLID_SESSION_PREFIX.length)
    if (!inner.startsWith(SOLID_SESSION_PREFIX)) continue
    if (window.localStorage.getItem(inner) !== null) continue
    window.localStorage.removeItem(key)
    removed = true
  }
  return removed
}

/**
 * 判断错误是否源于 OIDC 客户端失效：动态注册的 client 在服务端被清除或不兼容，
 * 服务端会返回 unknown client / invalid_client / unauthorized_client。
 * 这类错误无法靠重试解决，必须清除本地陈旧会话后重新登录。
 */
export function isInvalidClientError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /unknown client|unknown_client|invalid_client|invalid client|unauthorized_client/i.test(message)
}

export function isInvalidClientErrorCode(errorCode: string | null | undefined): boolean {
  if (!errorCode) return false
  return /unknown_client|invalid_client|unknown client|invalid client|unauthorized_client/i.test(errorCode)
}

/**
 * Full auth-state wipe for explicit sign-out and schema reset.
 *
 * The issuer-keyed registration cache lives OUTSIDE the SDK's prefixes, so it
 * must be cleared here too: otherwise a sign-out would leave reusable
 * clientSecret material behind for the next login to pick up.
 */
export const clearStoredSolidSession = (_storageKey?: string) => {
  if (typeof window === 'undefined') return
  const keys = storageKeys(window.localStorage)
  for (const key of keys) {
    if (isSolidAuthStorageKey(key)) {
      window.localStorage.removeItem(key)
    }
  }
  clearSolidClientRegistrationCache()
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

export function setPendingPostLoginMicroAppId(microAppId: MicroAppId) {
  if (typeof window === 'undefined') return
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
  if (attempt.prompt === 'none' || attempt.prompt === 'consent' || attempt.prompt === 'login') {
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
  if (parsed.prompt === 'none' || parsed.prompt === 'consent' || parsed.prompt === 'login') {
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
export const SWITCH_ACCOUNT_EVENT = 'linx:switch-account'
export const SESSION_RECOVERY_EVENT = 'linx:session-recovery-required'

export function requestSignOut() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SIGN_OUT_EVENT))
}

/** Leave this account and go back to the login screen to pick another. */
export function requestSwitchAccount() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SWITCH_ACCOUNT_EVENT))
}

export function requestSessionRecovery() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SESSION_RECOVERY_EVENT))
}
