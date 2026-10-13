/**
 * Accounts are shown as "名字@提供方" (R6 §2); the full address is only
 * handed out by the explicit "复制地址" action.
 *
 * - https://zhouhe.undefineds.co/profile/card#me → zhouhe@undefineds.co
 * - https://pod.example/alice/profile/card#me   → alice@pod.example
 * - https://linzhou.undefineds.co/agents/linx/  → linx@linzhou.undefineds.co
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const PROFILE_SEGMENTS = new Set(['profile', 'card', 'card.ttl', 'index.ttl'])

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url : null
  } catch {
    return null
  }
}

function isLocalHost(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname) || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname) || hostname.endsWith('.localhost')
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function formatAccountAddress(iri: string | null | undefined): string | null {
  if (typeof iri !== 'string' || !iri.trim()) return null
  const url = parseHttpUrl(iri.trim())
  if (!url) return null

  const segments = url.pathname.split('/').filter(Boolean).map(decodeSegment)
  const agentsIndex = segments.indexOf('agents')
  if (agentsIndex >= 0 && segments[agentsIndex + 1]) {
    // Built-in keys look like "__secretary__"; the underscores are plumbing.
    const key = segments[agentsIndex + 1].replace(/^_+|_+$/g, '') || segments[agentsIndex + 1]
    return `${key}@${url.host}`
  }

  const profileIndex = segments.indexOf('profile')
  const ownerSegments = (profileIndex >= 0 ? segments.slice(0, profileIndex) : segments)
    .filter((segment) => !PROFILE_SEGMENTS.has(segment))
  if (ownerSegments.length > 0) {
    return `${ownerSegments[ownerSegments.length - 1]}@${url.host}`
  }

  const labels = url.hostname.split('.')
  if (labels.length >= 3 && !isLocalHost(url.hostname)) {
    const port = url.port ? `:${url.port}` : ''
    return `${labels[0]}@${labels.slice(1).join('.')}${port}`
  }
  return url.host
}

export type AccountInput =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'ok'; webId: string }

function withProfileFragment(url: URL): string {
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length === 0) {
    url.pathname = '/profile/card'
    url.hash = 'me'
    return url.href
  }
  const last = segments[segments.length - 1]
  if (!url.hash && (last === 'card' || last === 'card.ttl')) url.hash = 'me'
  return url.href
}

/**
 * Accepts what people actually paste: the full address, an address without
 * "https://", or the short "名字@提供方" form shown in LinX.
 */
export function parseAccountInput(raw: string): AccountInput {
  const value = raw.trim()
  if (!value) return { kind: 'empty' }

  const direct = parseHttpUrl(value)
  if (direct) return direct.hostname ? { kind: 'ok', webId: withProfileFragment(direct) } : { kind: 'invalid' }

  const short = value.match(/^([A-Za-z0-9._~-]+)@([A-Za-z0-9.-]+(?::\d+)?)$/)
  if (short) {
    const [, name, provider] = short
    const hostname = provider.split(':')[0] ?? provider
    const webId = isLocalHost(hostname)
      ? `http://${provider}/${name}/profile/card#me`
      : `https://${name}.${provider}/profile/card#me`
    return parseHttpUrl(webId) ? { kind: 'ok', webId } : { kind: 'invalid' }
  }

  if (/^[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?::\d+)?(?:\/\S*)?$/.test(value)) {
    const url = parseHttpUrl(`https://${value}`)
    if (url) return { kind: 'ok', webId: withProfileFragment(url) }
  }
  return { kind: 'invalid' }
}

/** The profile document behind a WebID (the part before "#"). */
export function profileDocumentUrl(webId: string): string {
  const hashIndex = webId.indexOf('#')
  return hashIndex >= 0 ? webId.slice(0, hashIndex) : webId
}

export function isSameAccount(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false
  const normalize = (value: string) => value.trim().replace(/\/$/, '')
  return normalize(left) === normalize(right)
}
