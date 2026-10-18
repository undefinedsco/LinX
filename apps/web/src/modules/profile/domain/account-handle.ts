/**
 * Accounts are shown as "名字@提供方" (linzhou@undefineds.co); copying always
 * gives the full address. The raw WebID never appears on screen.
 */

const SECOND_LEVEL_LABELS = new Set(['com', 'co', 'org', 'net', 'gov', 'edu', 'ac'])
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function isIpAddress(hostname: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname) || hostname.includes(':') || hostname.startsWith('[')
}

function isThisComputer(hostname: string): boolean {
  return LOOPBACK_HOSTS.has(hostname)
    || hostname.endsWith('.localhost')
    || /^(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\./u.test(hostname)
}

/** The organisation part of a host: id.undefineds.co → undefineds.co. */
export function providerDomain(hostname: string): string {
  const host = hostname.toLowerCase()
  if (isIpAddress(host)) return host
  const labels = host.split('.').filter(Boolean)
  if (labels.length <= 2) return labels.join('.')
  const secondLevel = labels[labels.length - 2]
  const topLevel = labels[labels.length - 1]
  if (SECOND_LEVEL_LABELS.has(secondLevel) && topLevel.length === 2) {
    return labels.slice(-3).join('.')
  }
  return labels.slice(-2).join('.')
}

export function accountHandle(webId: string | null | undefined): string {
  if (!webId) return ''
  let url: URL
  try {
    url = new URL(webId)
  } catch {
    return webId
  }

  const hostname = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter(Boolean)
  const first = segments[0]
  const pathName = first && first !== 'profile' && first !== 'card' ? safeDecode(first) : ''

  if (isThisComputer(hostname)) {
    return `${pathName || 'me'}@本机`
  }

  if (pathName) return `${pathName}@${providerDomain(hostname)}`

  // Subdomain pods: alice.solidcommunity.net/profile/card#me
  const labels = hostname.split('.')
  if (labels.length >= 3 && !isIpAddress(hostname)) {
    return `${labels[0]}@${labels.slice(1).join('.')}`
  }
  return hostname
}

/** The profile document that holds `#me`: profile/card is itself a card. */
export function profileDocumentUri(webId: string): string {
  const hashIndex = webId.indexOf('#')
  return hashIndex === -1 ? webId : webId.slice(0, hashIndex)
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
