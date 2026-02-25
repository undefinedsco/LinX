export interface ResolvePodUrlOptions {
  signal?: AbortSignal
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

export function extractPodUrlFromWebId(webId: string): string {
  try {
    const url = new URL(webId)
    const pathParts = url.pathname.split('/')
    const profileIndex = pathParts.indexOf('profile')
    if (profileIndex > 0) {
      const podPath = pathParts.slice(0, profileIndex).join('/')
      return trimTrailingSlash(`${url.origin}${podPath}`)
    }
    return trimTrailingSlash(url.origin)
  } catch {
    return ''
  }
}

export async function resolvePodUrl(webId: string, options: ResolvePodUrlOptions = {}): Promise<string> {
  const fallback = extractPodUrlFromWebId(webId)

  if (typeof window === 'undefined' || !(window as any).__LINX_SERVICE__) {
    return fallback
  }

  try {
    const res = await fetch('/api/service/status', {
      signal: options.signal,
    })
    if (!res.ok) return fallback

    const data = await res.json()
    const serviceUrl = data?.pod?.publicUrl || data?.pod?.baseUrl
    if (typeof serviceUrl === 'string' && serviceUrl.trim()) {
      return trimTrailingSlash(serviceUrl)
    }
  } catch {
    // Fallback to URL derived from WebID when service endpoint is unavailable.
  }

  return fallback
}
