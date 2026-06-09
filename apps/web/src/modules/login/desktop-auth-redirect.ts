export function normalizeDesktopAuthRedirectUrl(url: string): string {
  if (typeof window === 'undefined') return url

  try {
    const parsed = new URL(url)
    const isLoopback =
      (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
      && parsed.pathname === '/auth/callback'
    const isLinxProtocol =
      parsed.protocol === 'linx:'
      && parsed.hostname === 'auth'
      && parsed.pathname === '/callback'

    if (isLoopback || isLinxProtocol) {
      if (window.location.protocol === 'file:') {
        return buildCurrentDocumentRedirectUrl(parsed.search)
      }

      return `${window.location.origin}/auth/callback${parsed.search}`
    }

    return url
  } catch {
    return url
  }
}

export function getCurrentLocationCallbackRedirectUrl(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const parsed = new URL(window.location.href)
    return parsed.pathname === '/auth/callback' && parsed.searchParams.has('code')
      ? window.location.href
      : null
  } catch {
    return null
  }
}

export function isCallbackErrorRedirect(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.searchParams.has('error')
  } catch {
    return false
  }
}

function buildCurrentDocumentRedirectUrl(search: string): string {
  const currentUrl = new URL(window.location.href)
  currentUrl.search = search
  return currentUrl.toString()
}
