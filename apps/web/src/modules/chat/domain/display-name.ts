/** name@provider from a WebID; the address itself is never shown. */
export function displayNameOf(webId: string): string {
  try {
    const url = new URL(webId)
    const first = url.pathname.split('/').filter(Boolean)[0]
    return first ? `${decodeURIComponent(first)}@${url.host}` : url.host
  } catch {
    return webId
  }
}
