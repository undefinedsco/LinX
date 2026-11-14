/**
 * Browser-owned Pod interface credential for the Matrix compatibility adapter.
 *
 * Matrix routes require a caller credential the Xpod service can use to open the
 * Pod on the caller's behalf. The browser session's DPoP token cannot be replayed
 * by the service, so the browser issues its own Account client credential (`sk-`
 * wrapper) and sends it only to the Matrix origin.
 *
 * The credential is created only from an explicit user action, kept in memory for
 * the current session, and scoped to one WebID + Account authority + Pod origin +
 * session. It is never written to localStorage, runtime config, logs, or sent to
 * another origin.
 */

export interface MatrixInterfaceCredential {
  /** `sk-` wrapper. Never log or persist this value. */
  apiKey: string
  webId: string
  /** Account authority that issued and can revoke the credential. */
  accountOrigin: string
  /** Exact Matrix service origin this credential may be sent to. */
  origin: string
  /** Authoritative full Pod root selected for this session (path preserved). */
  podUrl: string
  /** Account resource used to revoke the credential, when the server returned it. */
  resource?: string
}

export interface MatrixInterfaceScope {
  webId: string
  /** Authoritative full Pod root selected by the existing current-Pod binding. */
  podUrl: string
  /** Exact Matrix service origin the credential may be sent to. */
  origin: string
  /** Authoritative Account issuer origin of the active login, never the Pod origin. */
  accountOrigin: string
  sessionId?: string
}

export class MatrixInterfaceAuthorizationRequiredError extends Error {
  readonly code = 'matrix_interface_authorization_required'

  constructor(readonly origin: string) {
    super('Matrix 群聊需要授权访问当前空间，授权后才能收发群消息。')
    this.name = 'MatrixInterfaceAuthorizationRequiredError'
  }
}

/**
 * The Account authority refused or hid the credential control: programmatic
 * issuance is not available here. This is not a sign-in failure; the person can
 * grant a credential on the authoritative Account page and import it.
 */
export class MatrixInterfaceAuthorizeUnavailableError extends Error {
  readonly code = 'matrix_interface_authorize_unavailable'

  constructor(readonly accountOrigin: string) {
    super('当前账号服务不支持直接创建访问凭据，请到账号服务页面创建后导入。')
    this.name = 'MatrixInterfaceAuthorizeUnavailableError'
  }
}

export class MatrixInterfaceScopeError extends Error {
  readonly code = 'matrix_interface_scope_mismatch'

  constructor(message = 'Matrix 请求目标与已授权的空间地址不一致，已阻止发送凭据。') {
    super(message)
    this.name = 'MatrixInterfaceScopeError'
  }
}

export interface ImportedMatrixCredentialInput {
  /** Full `sk-…` wrapper, pasted from the Account page. */
  apiKey?: string
  /** Or the client id/secret pair shown by the Account page. */
  clientId?: string
  clientSecret?: string
}

export interface MatrixInterfaceAccess {
  /** Read the already-authorized credential; never creates one. */
  get(): MatrixInterfaceCredential | null
  /** Authoritative Account issuer origin of this scope, for the native grant page. */
  accountOrigin(): string | null
  /**
   * Explicit user-gesture authorization. Creates a new Account client credential
   * for the current WebID and Pod origin, in memory only. Concurrent calls share
   * one in-flight request.
   */
  authorize(): Promise<MatrixInterfaceCredential>
  /**
   * Explicit user gesture: accept a credential the person created on the
   * authoritative Account page. Verified against Matrix whoami before caching;
   * memory only, no persistent vault.
   */
  importAuthorization(input: ImportedMatrixCredentialInput): Promise<MatrixInterfaceCredential>
  /** Revoke (best effort) and drop the in-memory credential for this scope. */
  release(): Promise<void>
}

const credentialCache = new Map<string, MatrixInterfaceCredential>()
const pendingAuthorizations = new Map<string, Promise<MatrixInterfaceCredential>>()

/** Test-only: clear process-wide cached credentials and pending issues. */
export function resetMatrixInterfaceCredentialsForTests(): void {
  credentialCache.clear()
  pendingAuthorizations.clear()
}

export function createMatrixInterfaceAccess(options: {
  webId: string | undefined
  podUrl: string | null
  accountOrigin: string | null
  sessionId?: string
  sessionFetch: typeof fetch
  /** Test seam for the Matrix whoami check; production uses ordinary fetch. */
  fetchImpl?: typeof fetch
}): MatrixInterfaceAccess {
  const scope = resolveMatrixInterfaceScope(
    options.webId,
    options.podUrl,
    options.sessionId,
    options.accountOrigin,
  )
  const scopeKey = scope ? matrixInterfaceScopeKey(scope) : null
  let released = false

  return {
    accountOrigin() {
      return scope ? scope.accountOrigin : null
    },

    get() {
      if (!scope || !scopeKey) return null
      const cached = credentialCache.get(scopeKey)
      if (!cached) return null
      if (cached.webId !== scope.webId
        || cached.origin !== scope.origin
        || cached.accountOrigin !== scope.accountOrigin
        || cached.podUrl !== scope.podUrl) {
        credentialCache.delete(scopeKey)
        return null
      }
      return cached
    },

    async authorize() {
      if (!scope || !scopeKey) {
        throw new Error(accountAuthorityMessage(options.accountOrigin))
      }
      released = false
      const existing = this.get()
      if (existing) return existing
      const inFlight = pendingAuthorizations.get(scopeKey)
      if (inFlight) return await inFlight

      const request = createAccountClientCredential({
        scope,
        sessionFetch: options.sessionFetch,
      }).then(async (credential) => {
        await verifyCredentialOwner({
          credential,
          ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
        })
        if (released) {
          await revokeMatrixInterfaceCredential(credential, options.sessionFetch)
          throw new Error('本次授权已取消，请重新授权 Matrix 群聊。')
        }
        credentialCache.set(scopeKey, credential)
        return credential
      }).finally(() => {
        pendingAuthorizations.delete(scopeKey)
      })
      pendingAuthorizations.set(scopeKey, request)
      return await request
    },

    async importAuthorization(input) {
      if (!scope || !scopeKey) {
        throw new Error(accountAuthorityMessage(options.accountOrigin))
      }
      const credential = buildImportedCredential(input, scope)
      await verifyCredentialOwner({
        credential,
        ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      })
      credentialCache.set(scopeKey, credential)
      return credential
    },

    async release() {
      released = true
      if (!scopeKey) return
      const cached = credentialCache.get(scopeKey)
      credentialCache.delete(scopeKey)
      if (cached) await revokeMatrixInterfaceCredential(cached, options.sessionFetch)
    },
  }
}

/**
 * Resolve the Account authority of the active login.
 *
 * The issuer comes from the persisted DPoP session only when that record belongs
 * to the exact session and WebID currently in use. A remembered account counts
 * only when it names the same WebID. The Pod URL is never used as an issuer
 * fallback: Cloud identity and Pod origins are different deployments.
 */
export function resolveMatrixAccountOrigin(input: {
  webId?: string
  sessionId?: string
  storedSession?: {
    sessionId?: string | null
    webId?: string | null
    issuerUrl?: string | null
  } | null
  rememberedAccount?: {
    webId?: string | null
    issuerUrl?: string | null
  } | null
}): string | null {
  const webId = input.webId
  if (!webId || !isHttpUrl(webId)) return null

  const stored = input.storedSession
  if (stored?.issuerUrl
    && stored.webId === webId
    && (!input.sessionId || stored.sessionId === input.sessionId)) {
    return originOf(stored.issuerUrl)
  }

  const remembered = input.rememberedAccount
  if (remembered?.issuerUrl && remembered.webId === webId) {
    return originOf(remembered.issuerUrl)
  }

  return null
}

export function matrixInterfaceScopeKey(scope: MatrixInterfaceScope): string {
  return `${scope.webId}\n${scope.accountOrigin}\n${scope.origin}\n${scope.podUrl}\n${scope.sessionId ?? ''}`
}

/**
 * Normalize an authoritative Pod root: absolute HTTP(S), no credentials, no
 * query/fragment, trailing slash. The path is preserved so two owned Pods on the
 * same host are not collapsed to one another.
 */
export function normalizeMatrixPodRoot(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (url.username || url.password || url.search || url.hash) return null
    const pathname = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
    return `${url.origin}${pathname}`
  } catch {
    return null
  }
}

export function resolveMatrixInterfaceScope(
  webId: string | undefined,
  podUrl: string | null,
  sessionId?: string,
  accountOrigin?: string | null,
): MatrixInterfaceScope | null {
  if (!webId || !isHttpUrl(webId) || !podUrl) return null
  if (!accountOrigin || !isHttpUrl(accountOrigin)) return null
  const podRoot = normalizeMatrixPodRoot(podUrl)
  const podOrigin = podRoot ? originOf(podRoot) : null
  const account = originOf(accountOrigin)
  if (!podRoot || !podOrigin || !account) return null
  return {
    webId,
    podUrl: podRoot,
    origin: podOrigin,
    accountOrigin: account,
    ...(sessionId ? { sessionId } : {}),
  }
}

/**
 * A fetch that attaches the browser-owned credential to exactly one origin and
 * never forwards the browser session transport (DPoP) or cookies.
 *
 * The caller's Request is preserved as a Request (method, body, signal,
 * headers); the credential is added on a clone so no body is consumed.
 */
export function createMatrixInterfaceFetch(input: {
  /** Pinned Matrix service origin; the request is never retargeted from here. */
  baseUrl: string
  credential: MatrixInterfaceCredential
  /** Trusted Pod root binding (from current Pod, never from request headers). */
  targetPodUrl: string
  fetchImpl?: typeof fetch
}): typeof fetch {
  const origin = originOf(input.baseUrl)
  const credentialOrigin = input.credential.origin
  if (!origin || origin !== credentialOrigin) {
    throw new MatrixInterfaceScopeError()
  }
  // The target Pod root is DATA sent to the pinned Matrix service (the
  // X-Xpod-Pod-Url selection header), not a fetch destination. It may live on a
  // different origin (Cloud api.* vs pods.*); the service validates the
  // registered binding. The request itself stays on the pinned service origin.
  const targetPodRoot = normalizeMatrixPodRoot(input.targetPodUrl)
  if (!targetPodRoot) {
    throw new MatrixInterfaceScopeError('群聊目标空间地址无效，已阻止发送凭据。')
  }
  const fetchImpl = input.fetchImpl ?? globalThis.fetch.bind(globalThis)
  return async (requestInput, init) => {
    const request = new Request(requestInput, init)
    const url = new URL(request.url)
    if (url.origin !== credentialOrigin || url.username || url.password) {
      throw new MatrixInterfaceScopeError()
    }
    const headers = new Headers(request.headers)
    // The credential itself is the only auth: no session DPoP proof and no cookie.
    headers.delete('DPoP')
    headers.set('Authorization', `Bearer ${input.credential.apiKey}`)
    // Selection is a trusted binding, not caller input: overwrite any header the
    // Request already carried so it cannot pick another Pod.
    headers.delete('X-Xpod-Pod-Url')
    headers.set('X-Xpod-Pod-Url', targetPodRoot)
    // Rebuild from the Request so method/body/signal are not lost. `redirect:
    // 'error'` refuses to follow a cross-origin redirect with the credential.
    const authenticated = new Request(request, {
      headers,
      credentials: 'omit',
      redirect: 'error',
    })
    return await fetchImpl(authenticated)
  }
}

/**
 * Revoke one credential through its Account resource. Failures are swallowed
 * after memory is cleared: the credential is session-scoped and revocation is
 * cleanup, not a gate on local logout.
 */
export async function revokeMatrixInterfaceCredential(
  credential: MatrixInterfaceCredential,
  sessionFetch: typeof fetch,
): Promise<void> {
  if (!credential.resource) return
  try {
    const url = new URL(credential.resource)
    if (url.origin !== credential.accountOrigin || url.username || url.password) return
    await sessionFetch(url.href, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      redirect: 'error',
    })
  } catch {
    // Best effort; never log the credential or the account response.
  }
}

/**
 * Drop and revoke every cached credential for one WebID (logout/session switch).
 */
export async function releaseAllMatrixInterfaceCredentials(input: {
  webId?: string
  sessionFetch: typeof fetch
}): Promise<void> {
  const entries = [...credentialCache.entries()]
  credentialCache.clear()
  pendingAuthorizations.clear()
  await Promise.all(entries
    .filter(([, credential]) => !input.webId || credential.webId === input.webId)
    .map(([, credential]) => revokeMatrixInterfaceCredential(credential, input.sessionFetch)))
}

/**
 * Drop and revoke cached credentials that no longer belong to the active scope.
 * Called when the session or space changes.
 */
export async function releaseStaleMatrixInterfaceCredentials(input: {
  scope: MatrixInterfaceScope | null
  sessionFetch: typeof fetch
}): Promise<void> {
  if (!input.scope) return
  const activeKey = matrixInterfaceScopeKey(input.scope)
  const stale = [...credentialCache.entries()].filter(([key]) => key !== activeKey)
  for (const [key, credential] of stale) {
    credentialCache.delete(key)
    await revokeMatrixInterfaceCredential(credential, input.sessionFetch)
  }
}

/**
 * Build an in-memory credential from what the person pasted. The wrapper format
 * is fixed (`sk-base64(client_id:client_secret)`); malformed input is rejected
 * without echoing the value.
 */
function buildImportedCredential(
  input: ImportedMatrixCredentialInput,
  scope: MatrixInterfaceScope,
): MatrixInterfaceCredential {
  const apiKey = normalizeImportedApiKey(input)
  return {
    apiKey,
    webId: scope.webId,
    accountOrigin: scope.accountOrigin,
    origin: scope.origin,
    podUrl: scope.podUrl,
  }
}

function normalizeImportedApiKey(input: ImportedMatrixCredentialInput): string {
  const pastedKey = input.apiKey?.trim()
  if (pastedKey) {
    if (!/^sk-[A-Za-z0-9+/=]+$/.test(pastedKey) || !decodesToClientPair(pastedKey)) {
      throw new Error('访问凭据格式不正确，请重新复制。')
    }
    return pastedKey
  }
  const clientId = input.clientId?.trim()
  const clientSecret = input.clientSecret?.trim()
  if (!clientId || !clientSecret) {
    throw new Error('请填写访问凭据，或完整的 Client ID 与 Secret。')
  }
  if (clientId.length > 512 || clientSecret.length > 2048) {
    throw new Error('访问凭据格式不正确，请重新复制。')
  }
  return `sk-${base64Encode(`${clientId}:${clientSecret}`)}`
}

function decodesToClientPair(apiKey: string): boolean {
  try {
    const decoded = atob(apiKey.slice(3))
    const separator = decoded.indexOf(':')
    return separator > 0 && separator < decoded.length - 1
  } catch {
    return false
  }
}

/**
 * The credential is only usable if the Matrix server says it belongs to the
 * WebID of the current scope. A local string claim is never enough.
 */
export async function verifyCredentialOwner(input: {
  credential: MatrixInterfaceCredential
  fetchImpl?: typeof fetch
}): Promise<void> {
  const scoped = createMatrixInterfaceFetch({
    baseUrl: input.credential.origin,
    credential: input.credential,
    targetPodUrl: input.credential.podUrl,
    ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
  })
  let response: Response
  try {
    response = await scoped(`${input.credential.origin}/_matrix/client/v3/account/whoami`, {
      headers: { Accept: 'application/json' },
    })
  } catch {
    throw new MatrixInterfaceScopeError('无法确认授权凭据属于当前账号，已阻止发送群消息。')
  }
  if (!response.ok) {
    throw new MatrixInterfaceScopeError('访问凭据被群聊服务拒绝，请重新创建或导入。')
  }
  const payload = await response.json().catch(() => null) as {
    'co.undefineds.webid'?: unknown
    webid?: unknown
  } | null
  const owner = typeof payload?.['co.undefineds.webid'] === 'string'
    ? payload['co.undefineds.webid']
    : typeof payload?.webid === 'string'
      ? payload.webid
      : null
  if (!owner || owner !== input.credential.webId) {
    throw new MatrixInterfaceScopeError('授权凭据不属于当前账号，请重新授权。')
  }
}

async function createAccountClientCredential(input: {
  scope: MatrixInterfaceScope
  sessionFetch: typeof fetch
}): Promise<MatrixInterfaceCredential> {
  const index = new URL('/.account/', input.scope.accountOrigin).href
  const advertised = await readClientCredentialControl(index, input.sessionFetch)
  const collection = advertised ? resolveAccountControlUrl(advertised, index) : null
  if (!collection) {
    throw new MatrixInterfaceAuthorizeUnavailableError(new URL(index).origin)
  }
  const response = await input.sessionFetch(collection, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'LinX Matrix 群聊',
      webId: input.scope.webId,
    }),
    // Account-owning capability semantics: the authoritative Account authority
    // may authenticate this request with its own cookie. Only this origin ever
    // sees it; the Matrix transport below stays credential-less for cookies.
    credentials: 'include',
    redirect: 'error',
  })
  if (!response.ok) {
    // Never surface a server body verbatim: it can echo request details.
    throw new Error(`Pod 接口授权没有完成（HTTP ${response.status}）。请确认当前账号仍可访问该空间后重试。`)
  }
  const payload = await response.json().catch(() => null) as {
    id?: unknown
    secret?: unknown
    resource?: unknown
  } | null
  if (!payload || typeof payload.id !== 'string' || !payload.id
    || typeof payload.secret !== 'string' || !payload.secret) {
    throw new Error('Pod 接口授权返回了不完整的结果，请重试。')
  }
  const resource = typeof payload.resource === 'string'
    ? resolveAccountControlUrl(payload.resource, index)
    : null
  if (payload.resource !== undefined && !resource) {
    throw new Error('Pod 接口授权返回了不可信的账号地址，请重试。')
  }
  return {
    apiKey: `sk-${base64Encode(`${payload.id}:${payload.secret}`)}`,
    webId: input.scope.webId,
    accountOrigin: input.scope.accountOrigin,
    origin: input.scope.origin,
    podUrl: input.scope.podUrl,
    ...(resource ? { resource } : {}),
  }
}

async function readClientCredentialControl(
  index: string,
  sessionFetch: typeof fetch,
): Promise<string | null> {
  let response: Response
  try {
    // The Account authority is the only origin this call touches. The active
    // DPoP session names the account; the cookie mode matches the existing
    // Account capability so a cookie-only authority can also answer.
    response = await sessionFetch(index, {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      redirect: 'error',
    })
  } catch {
    throw new Error('无法读取当前账号的 Pod 接口授权入口，请检查网络后重试。')
  }
  if (!response.ok) {
    // 401/403/404 here means the Account authority does not let this browser
    // session mint credentials. That is an authorization-path gap, not an
    // expired Solid login; guide the explicit native grant instead.
    throw new MatrixInterfaceAuthorizeUnavailableError(new URL(index).origin)
  }
  const payload = await response.json().catch(() => null) as {
    controls?: { account?: { clientCredentials?: unknown } }
  } | null
  const advertised = payload?.controls?.account?.clientCredentials
  if (typeof advertised !== 'string' || !advertised) {
    throw new MatrixInterfaceAuthorizeUnavailableError(new URL(index).origin)
  }
  return advertised
}

function resolveAccountControlUrl(value: string, index: string): string | null {
  try {
    const url = new URL(value, index)
    const authority = new URL(index)
    if (url.origin !== authority.origin) return null
    if (!url.pathname.startsWith('/.account/')) return null
    if (url.username || url.password || url.hash) return null
    return url.href
  } catch {
    return null
  }
}

function accountAuthorityMessage(accountOrigin: string | null): string {
  return accountOrigin
    ? '当前空间或账号尚未就绪，不能授权 Matrix 群聊。'
    : '无法确认当前登录的账号服务，请重新登录后再授权 Matrix 群聊。'
}

function base64Encode(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function originOf(value: string): string | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (url.username || url.password) return null
    return url.origin
  } catch {
    return null
  }
}

function isHttpUrl(value: string): boolean {
  return originOf(value) !== null
}
