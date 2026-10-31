import type { SolidDatabase } from '@undefineds.co/models'
import {
  discoverAdvertisedAccessControl,
  grantAdvertisedAcrAccess,
  grantAdvertisedWacAccess,
} from '@/lib/solid/advertised-acr'

/**
 * Canonical room container for a Matrix chat document.
 *
 * The chat URI comes from the ORM's `resolveRowIri(chatResource, …)` contract;
 * the room container is its parent container (the `index.ttl` directory). No
 * Pod layout is guessed beyond that contract.
 */
export function matrixRoomContainerUri(chatUri: string): string {
  const parsed = new URL(chatUri)
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('群聊地址不是有效的 HTTP(S) 地址。')
  }
  parsed.hash = ''
  parsed.search = ''
  const slash = parsed.pathname.lastIndexOf('/')
  parsed.pathname = parsed.pathname.slice(0, slash + 1)
  return parsed.href
}

export type MatrixRoomGrantMechanism = 'acp' | 'wac'

export interface MatrixRoomGrantInput {
  db: SolidDatabase
  /** Alice's DPoP-authenticated Pod fetch. Never the Matrix `sk` transport. */
  authFetch: typeof fetch
  ownerWebId: string
  /** Full WebIDs of invitees; only Read/Append/Write plus member descendants. */
  participants: string[]
  /** Canonical chat URI resolved by the ORM. */
  chatUri: string
}

export interface MatrixRoomGrantResult {
  roomContainerUri: string
  aclUri: string
  grantedWebIds: string[]
  mechanism: 'acp' | 'wac'
}

/**
 * Grant each invited WebID Read/Append/Write on the canonical room container
 * AND its future descendants, through the access-control mechanism the Pod
 * advertises:
 * - WAC: real resource + default ACL dataset operations (preserving any
 *   existing/fallback rules), saved to the advertised ACL;
 * - ACP: the advertised ACR with both accessControl and memberAccessControl.
 * The owner keeps control; invitees never get Control, public, or an
 * authenticated-agent rule. Existing owner policies are preserved.
 *
 * A resource-only grant is never reported as success.
 */
export async function grantMatrixRoomAccess(input: MatrixRoomGrantInput): Promise<MatrixRoomGrantResult> {
  const roomContainerUri = matrixRoomContainerUri(input.chatUri)
  const owner = requireWebId(input.ownerWebId, '群聊创建者')
  const granted = normalizeParticipants(input.participants, owner)

  const info = await input.authFetch(roomContainerUri, { method: 'HEAD' })
  if (info.status === 404) throw new Error('群聊空间还不存在，暂时不能授权。')
  if (!info.ok) throw new Error(`读取群聊空间失败（HTTP ${info.status}）。`)

  const control = await discoverAdvertisedAccessControl(roomContainerUri, input.authFetch)
  for (const webId of granted) {
    if (control.kind === 'wac') {
      await grantAdvertisedWacAccess({
        resourceUrl: roomContainerUri,
        agentWebId: webId,
        access: { read: true, append: true, write: true },
        authFetch: input.authFetch,
      })
      continue
    }
    await grantAdvertisedAcrAccess({
      resourceUrl: roomContainerUri,
      ownerWebId: owner,
      agentWebId: webId,
      access: { read: true, append: true, write: true },
      // The room container itself plus future descendants.
      links: 'both',
      authFetch: input.authFetch,
      controlPrefix: 'linxMatrixEditor',
      label: '群聊空间',
    })
  }

  return {
    roomContainerUri,
    aclUri: control.url,
    grantedWebIds: granted,
    mechanism: control.kind,
  }
}

function normalizeParticipants(participants: string[], owner: string): string[] {
  const result: string[] = []
  for (const participant of participants) {
    const webId = requireWebId(participant, '受邀成员')
    if (webId === owner) continue
    if (result.includes(webId)) continue
    result.push(webId)
  }
  if (result.length === 0) throw new Error('没有可授权的受邀成员。')
  return result
}

/**
 * Validate a full WebID without assuming a profile document template. Accepts
 * any HTTP(S) URL with no embedded credentials or control characters.
 */
export function normalizeWebId(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (url.username || url.password) return null
    if (!url.pathname) return null
    // Return the exact supplied bytes: the backend hashes the WebID string and
    // verifies the invite's targetWebID against it, so URL-normalizing here
    // (host case, default port, dot segments) would break the pair.
    return trimmed
  } catch {
    return null
  }
}

/** Validate all invitee WebIDs up front so an invalid one never yields a partial invite. */
export function validateMatrixInvitees(participants: string[], ownerWebId?: string): string[] {
  const owner = ownerWebId ? normalizeWebId(ownerWebId) : null
  if (ownerWebId && !owner) {
    throw new Error('群聊创建者的 WebID 无效，请使用完整的 HTTP(S) 地址。')
  }
  const seen = new Set<string>()
  const result: string[] = []
  for (const participant of participants) {
    const webId = normalizeWebId(participant)
    if (!webId) {
      throw new Error(`受邀成员的 WebID 无效：${displayParticipant(participant)}。请使用完整的 HTTP(S) 地址。`)
    }
    if (owner && webId === owner) continue
    if (seen.has(webId)) continue
    seen.add(webId)
    result.push(webId)
  }
  return result
}

function displayParticipant(value: string): string {
  const trimmed = String(value ?? '').trim()
  return trimmed.length > 0 && trimmed.length <= 80 ? trimmed : '未填写'
}

function requireWebId(value: string | undefined, role: string): string {
  const webId = normalizeWebId(value)
  if (!webId) {
    throw new Error(`${role}的 WebID 无效，请使用完整的 HTTP(S) 地址（例如 https://bob.example/#id）。`)
  }
  return webId
}
