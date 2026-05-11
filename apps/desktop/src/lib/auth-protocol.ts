const LINX_PROTOCOL = 'linx:'
const LINX_AUTH_HOST = 'auth'
const LINX_AUTH_PATH = '/callback'
const LOOPBACK_AUTH_PATH = '/auth/callback'

export function isLinxAuthCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      parsed.protocol === LINX_PROTOCOL
      && parsed.hostname === LINX_AUTH_HOST
      && normalizePathname(parsed.pathname) === LINX_AUTH_PATH
    )
  } catch {
    return false
  }
}

export function isLoopbackAuthCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
      && normalizePathname(parsed.pathname) === LOOPBACK_AUTH_PATH
    )
  } catch {
    return false
  }
}

export function isDesktopAuthCallbackUrl(url: string): boolean {
  return isLinxAuthCallbackUrl(url) || isLoopbackAuthCallbackUrl(url)
}

export function extractLinxAuthCallbackUrl(argv: string[]): string | null {
  for (const arg of argv) {
    if (isLinxAuthCallbackUrl(arg)) {
      return arg
    }
  }

  return null
}

function normalizePathname(pathname: string): string {
  if (!pathname) {
    return '/'
  }

  return pathname.startsWith('/') ? pathname.replace(/\/+$/, '') || '/' : `/${pathname.replace(/\/+$/, '')}`
}
