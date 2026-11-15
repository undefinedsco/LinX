export interface MatrixVersionsResponse {
  versions: string[]
  unstable_features?: Record<string, boolean>
}

export interface MatrixLoginFlowsResponse {
  flows: Array<{ type: string }>
}

export interface MatrixCreateRoomRequest {
  visibility?: 'private' | 'public'
  room_alias_name?: string
  name?: string
  topic?: string
  invite?: string[]
  creation_content?: Record<string, unknown>
  initial_state?: Array<{
    type: string
    state_key?: string
    content?: Record<string, unknown>
  }>
  preset?: string
  is_direct?: boolean
}

export interface MatrixCreateRoomResponse {
  room_id: string
}

export interface MatrixWhoamiResponse {
  user_id: string
  device_id?: string
  is_guest?: boolean
}

export interface MatrixJoinedRoomsResponse {
  joined_rooms: string[]
}

export interface MatrixJoinRoomResponse {
  room_id: string
}

export interface MatrixInviteRequest {
  user_id: string
  /**
   * Optional extension (Xpod): the invited person's full WebID. Only accepted
   * by the server when `user_id` is that WebID's canonical MXID; it lets the
   * server register a cross-Pod room reference. Never a secret.
   */
  targetWebID?: string
}

export interface MatrixSetStateResponse {
  event_id: string
}

export interface MatrixSendEventRequest {
  body?: string
  msgtype?: string
  [key: string]: unknown
}

export interface MatrixSendEventResponse {
  event_id: string
}

export interface MatrixClientEvent {
  event_id: string
  room_id: string
  type: string
  sender: string
  origin_server_ts: number
  content: Record<string, unknown>
  state_key?: string
  unsigned?: Record<string, unknown>
}

export interface MatrixSyncResponse {
  next_batch: string
  rooms: {
    join: Record<string, {
      state: { events: MatrixClientEvent[] }
      timeline: {
        events: MatrixClientEvent[]
        limited: boolean
        prev_batch?: string
      }
    }>
  }
}

export interface MatrixMessagesResponse {
  chunk: MatrixClientEvent[]
  start?: string
  end: string
}

export interface MatrixMembersResponse {
  chunk: MatrixClientEvent[]
}

export interface MatrixClientOptions {
  baseUrl: string
  accessToken?: string
  tokenType?: 'Bearer' | 'DPoP' | (string & {})
  fetch?: typeof fetch
  randomId?: () => string
}

export interface MatrixSyncOptions {
  since?: string
  limit?: number
  timeout?: number
}

export interface MatrixMessagesOptions {
  from?: string
  dir?: 'b' | 'f'
  limit?: number
}

export class MatrixClientError extends Error {
  readonly status: number
  readonly errcode?: string
  readonly body?: unknown

  constructor(message: string, input: { status: number; errcode?: string; body?: unknown }) {
    super(message)
    this.name = 'MatrixClientError'
    this.status = input.status
    this.errcode = input.errcode
    this.body = input.body
  }
}

export class MatrixClient {
  private readonly baseUrl: string
  private readonly accessToken?: string
  private readonly tokenType: string
  private readonly fetchImpl: typeof fetch
  private readonly randomId: () => string

  constructor(options: MatrixClientOptions) {
    const baseUrl = options.baseUrl.trim()
    if (!baseUrl) {
      throw new Error('MatrixClient requires baseUrl')
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.accessToken = options.accessToken
    this.tokenType = options.tokenType ?? 'Bearer'
    this.fetchImpl = options.fetch ?? globalThis.fetch
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('MatrixClient requires a fetch implementation')
    }
    this.randomId = options.randomId ?? defaultRandomId
  }

  async versions(): Promise<MatrixVersionsResponse> {
    return this.request('GET', '/_matrix/client/versions')
  }

  async loginFlows(): Promise<MatrixLoginFlowsResponse> {
    return this.request('GET', '/_matrix/client/v3/login')
  }

  async whoami(): Promise<MatrixWhoamiResponse> {
    return this.request('GET', '/_matrix/client/v3/account/whoami')
  }

  async createRoom(input: MatrixCreateRoomRequest = {}): Promise<MatrixCreateRoomResponse> {
    return this.request('POST', '/_matrix/client/v3/createRoom', input)
  }

  async joinedRooms(): Promise<MatrixJoinedRoomsResponse> {
    return this.request('GET', '/_matrix/client/v3/joined_rooms')
  }

  async joinRoom(roomIdOrAlias: string): Promise<MatrixJoinRoomResponse> {
    return this.request('POST', `/_matrix/client/v3/join/${encodePathSegment(roomIdOrAlias)}`, {})
  }

  async joinRoomById(roomId: string): Promise<MatrixJoinRoomResponse> {
    return this.request('POST', `/_matrix/client/v3/rooms/${encodePathSegment(roomId)}/join`, {})
  }

  async inviteUser(
    roomId: string,
    userId: string,
    options: { targetWebID?: string } = {},
  ): Promise<Record<string, never>> {
    return this.request('POST', `/_matrix/client/v3/rooms/${encodePathSegment(roomId)}/invite`, {
      user_id: userId,
      ...(options.targetWebID ? { targetWebID: options.targetWebID } : {}),
    } satisfies MatrixInviteRequest)
  }

  async leaveRoom(roomId: string): Promise<Record<string, never>> {
    return this.request('POST', `/_matrix/client/v3/rooms/${encodePathSegment(roomId)}/leave`, {})
  }

  async sendMessage(roomId: string, body: string, options: {
    msgtype?: string
    txnId?: string
    content?: Omit<MatrixSendEventRequest, 'body' | 'msgtype'>
  } = {}): Promise<MatrixSendEventResponse> {
    return this.sendEvent(
      roomId,
      'm.room.message',
      options.txnId ?? this.randomId(),
      {
        ...(options.content ?? {}),
        msgtype: options.msgtype ?? 'm.text',
        body,
      },
    )
  }

  async sendEvent(
    roomId: string,
    eventType: string,
    txnId: string,
    content: MatrixSendEventRequest | Record<string, unknown> = {},
  ): Promise<MatrixSendEventResponse> {
    return this.request(
      'PUT',
      `/_matrix/client/v3/rooms/${encodePathSegment(roomId)}/send/${encodePathSegment(eventType)}/${encodePathSegment(txnId)}`,
      content,
    )
  }

  async sync(options: MatrixSyncOptions = {}): Promise<MatrixSyncResponse> {
    return this.request('GET', appendQuery('/_matrix/client/v3/sync', {
      since: options.since,
      limit: options.limit,
      timeout: options.timeout,
    }))
  }

  async messages(roomId: string, options: MatrixMessagesOptions = {}): Promise<MatrixMessagesResponse> {
    return this.request('GET', appendQuery(`/_matrix/client/v3/rooms/${encodePathSegment(roomId)}/messages`, {
      from: options.from,
      dir: options.dir,
      limit: options.limit,
    }))
  }

  async getEvent(roomId: string, eventId: string): Promise<MatrixClientEvent> {
    return this.request('GET', `/_matrix/client/v3/rooms/${encodePathSegment(roomId)}/event/${encodePathSegment(eventId)}`)
  }

  async getState(roomId: string, eventType: string, stateKey = ''): Promise<Record<string, unknown>> {
    const statePath = stateKey
      ? `/_matrix/client/v3/rooms/${encodePathSegment(roomId)}/state/${encodePathSegment(eventType)}/${encodePathSegment(stateKey)}`
      : `/_matrix/client/v3/rooms/${encodePathSegment(roomId)}/state/${encodePathSegment(eventType)}`
    return this.request('GET', statePath)
  }

  async setState(
    roomId: string,
    eventType: string,
    stateKey: string,
    content: Record<string, unknown> = {},
  ): Promise<MatrixSetStateResponse> {
    const statePath = stateKey
      ? `/_matrix/client/v3/rooms/${encodePathSegment(roomId)}/state/${encodePathSegment(eventType)}/${encodePathSegment(stateKey)}`
      : `/_matrix/client/v3/rooms/${encodePathSegment(roomId)}/state/${encodePathSegment(eventType)}`
    return this.request('PUT', statePath, content)
  }

  async members(roomId: string): Promise<MatrixMembersResponse> {
    return this.request('GET', `/_matrix/client/v3/rooms/${encodePathSegment(roomId)}/members`)
  }

  private async request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
    const headers = new Headers()
    headers.set('Accept', 'application/json')
    if (body !== undefined) {
      headers.set('Content-Type', 'application/json')
    }
    if (this.accessToken) {
      headers.set('Authorization', `${this.tokenType} ${this.accessToken}`)
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const parsed = await parseMatrixJson(response)
    if (!response.ok) {
      const errorBody = isRecord(parsed) ? parsed : {}
      const message = typeof errorBody.error === 'string'
        ? errorBody.error
        : `Matrix request failed: ${response.status}`
      throw new MatrixClientError(message, {
        status: response.status,
        errcode: typeof errorBody.errcode === 'string' ? errorBody.errcode : undefined,
        body: parsed,
      })
    }
    return parsed as T
  }
}

export function createMatrixClient(options: MatrixClientOptions): MatrixClient {
  return new MatrixClient(options)
}

export function matrixServerNameFromBaseUrl(baseUrl: string): string {
  return new URL(baseUrl).host
}

/**
 * Canonical Matrix user id for a full WebID, matching xpod's
 * `MatrixIdentity.matrixUserIdForWebId`: `@u_<sha256(fullWebID)>:<server>`.
 *
 * The hash is over the complete WebID string (origin, path, fragment), so two
 * identities never collide by path or by a shared suffix, and it is never
 * decoded back into business identity.
 *
 * `serverName` must be the authenticated service's own authority (from
 * `whoami`), including any port; this helper never assumes the API host.
 */
export async function matrixUserIdFromWebId(webId: string, serverName: string): Promise<string> {
  const normalizedWebId = requireFullWebId(webId)
  // Match xpod `isMatrixServerName` exactly: host[:port] with an optional
  // bracketed IPv6 literal; ports/IPv6 are legitimate, userinfo/paths/schemes
  // and malformed authorities are not.
  if (!isMatrixServerName(serverName)) {
    throw new Error('Matrix server name is invalid')
  }
  return `@u_${await sha256Hex(normalizedWebId)}:${serverName}`
}

/**
 * Validate an exact full WebID and return the ORIGINAL bytes.
 *
 * `URL` is used only to check the scheme and reject embedded credentials; it
 * must not rewrite the identity (host casing, default port, dot segments,
 * percent/Unicode forms). The backend hashes exactly the supplied `targetWebID`
 * bytes, so normalizing here would break the invite pair.
 */
function requireFullWebId(value: string): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || /[\s\u0000-\u001f\u007f]/u.test(value)) {
    throw new Error('Matrix user mapping requires a full WebID')
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Matrix user mapping requires a full WebID')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Matrix user mapping requires a full WebID')
  }
  return value
}

/**
 * Matrix server-name/authority validation, mirroring xpod's
 * `MatrixIdentity.isMatrixServerName`.
 */
export function isMatrixServerName(value: string): boolean {
  if (typeof value !== 'string' || !value || value !== value.trim()) return false
  if (/[\s@/?#\\]/u.test(value) || value.includes('://')) return false
  if (value.startsWith('[')) {
    return /^\[[0-9a-fA-F:.]+\](?::\d{1,5})?$/u.test(value)
  }
  return /^([A-Za-z0-9.-]+)(?::(\d{1,5}))?$/u.test(value)
}

/**
 * Legacy display-only slug. Never use this for authentication, invitation, or
 * any MXID the server will compare against a WebID-derived identity.
 */
export function matrixLocalpartFromUserId(userId: string): string {
  try {
    const url = new URL(userId)
    const withoutHash = `${url.pathname}${url.hash}`.replace(/^\/+/, '')
    return matrixSlug(withoutHash || url.host)
  } catch {
    return matrixSlug(userId)
  }
}

export async function matrixRoomSurfaceId(roomId: string): Promise<string> {
  const digest = await sha256Hex(roomId)
  return `matrix-${digest.slice(0, 16)}`
}

export async function matrixChatResourceIdFromRoomId(roomId: string): Promise<string> {
  return `${await matrixRoomSurfaceId(roomId)}/index.ttl#this`
}

export async function matrixThreadResourceIdFromRoomId(roomId: string): Promise<string> {
  return `chat/${await matrixRoomSurfaceId(roomId)}/index.ttl#thread`
}

function appendQuery(path: string, values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      continue
    }
    params.set(key, String(value))
  }
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value)
}

async function parseMatrixJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) {
    return null
  }
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    if (!response.ok) {
      throw new MatrixClientError(`Matrix request returned non-JSON error: ${response.status}`, {
        status: response.status,
        body: text,
      })
    }
    throw error
  }
}

function defaultRandomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function matrixSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._=-]+/g, '_').replace(/^_+|_+$/g, '') || 'user'
}

async function sha256Hex(value: string): Promise<string> {
  const subtle = await resolveSubtleCrypto()
  if (!subtle) {
    throw new Error('Matrix room resource mapping requires Web Crypto SHA-256 support.')
  }
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

type DigestSubtleCrypto = {
  digest(algorithm: string, data: unknown): Promise<ArrayBuffer>
}

async function resolveSubtleCrypto(): Promise<DigestSubtleCrypto | null> {
  if (globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle as unknown as DigestSubtleCrypto
  }
  if (typeof process !== 'undefined' && process.versions?.node) {
    const nodeCrypto = await import('node:crypto')
    return nodeCrypto.webcrypto.subtle as unknown as DigestSubtleCrypto
  }
  return null
}
