export type ShareStorage =
  | { kind: 'cloud' }
  | { kind: 'local'; lastHeartbeatAt?: number | null; now?: () => number }

export interface SharePreviewInput {
  canonicalResourceUrl: string
  storage: ShareStorage
}

export interface SharePreviewModel {
  linkUrl: string
  qrPayload: string
  storageLabel: '云端空间' | '本机空间'
  hint: string
  blocksShare: false
}

const HEARTBEAT_FRESH_MS = 2 * 60 * 1000
const CREDENTIAL_PATTERNS = [
  /access_token=/iu,
  /id_token=/iu,
  /refresh_token=/iu,
  /serviceToken=/u,
  /serviceAccessToken=/u,
  /provisionCode=/u,
  /authorization=/iu,
]

export function createSharePreview(input: SharePreviewInput): SharePreviewModel {
  const url = normalizeCanonicalResourceUrl(input.canonicalResourceUrl)
  assertNoCredentialMaterial(url)

  if (input.storage.kind === 'cloud') {
    return {
      linkUrl: url,
      qrPayload: url,
      storageLabel: '云端空间',
      hint: '拥有权限的人可通过链接访问。',
      blocksShare: false,
    }
  }

  return {
    linkUrl: url,
    qrPayload: url,
    storageLabel: '本机空间',
    hint: getLocalHeartbeatHint(input.storage),
    blocksShare: false,
  }
}

function normalizeCanonicalResourceUrl(rawUrl: string): string {
  const parsed = new URL(rawUrl)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Share URL must be an HTTP(S) resource URL')
  }
  return parsed.toString()
}

function assertNoCredentialMaterial(url: string): void {
  if (CREDENTIAL_PATTERNS.some((pattern) => pattern.test(url))) {
    throw new Error('Share URL must not contain credentials or provision data')
  }
}

function getLocalHeartbeatHint(storage: Extract<ShareStorage, { kind: 'local' }>): string {
  const heartbeat = typeof storage.lastHeartbeatAt === 'number' ? storage.lastHeartbeatAt : null
  const now = storage.now?.() ?? Date.now()
  if (heartbeat !== null && now - heartbeat <= HEARTBEAT_FRESH_MS) {
    return '本机空间最近在线。对方访问时仍需保持在线。'
  }
  return '本机空间可能离线。链接仍可创建，对方打开时会再次检测。'
}
