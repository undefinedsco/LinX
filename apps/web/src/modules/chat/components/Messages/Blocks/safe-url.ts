export function safeExternalUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const baseUrl = typeof window === 'undefined' ? 'http://localhost' : window.location.origin
    const url = new URL(value, baseUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'blob:'
      ? value
      : null
  } catch {
    return null
  }
}

export function safeImageUrl(value: string | undefined): string | null {
  if (!value) return null
  if (value.startsWith('data:image/')) return value
  return safeExternalUrl(value)
}
