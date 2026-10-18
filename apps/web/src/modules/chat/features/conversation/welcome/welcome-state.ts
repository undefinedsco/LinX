/**
 * The welcome shows once, ever (W0 / W0b). Whether it already happened lives in
 * the person's space — `/settings/linx/welcome.ttl` with one `dcterms:date` —
 * so a second device never greets again (spec §3.2).
 */
export const WELCOME_PATH = 'settings/linx/welcome.ttl'

export function welcomeFileUrl(podBaseUrl: string): string {
  return new URL(WELCOME_PATH, `${podBaseUrl.replace(/\/+$/u, '')}/`).toString()
}

/** true = already welcomed, false = never, throws when we cannot tell. */
export async function hasBeenWelcomed(podBaseUrl: string, authFetch: typeof fetch): Promise<boolean> {
  const response = await authFetch(welcomeFileUrl(podBaseUrl), { method: 'HEAD' })
  if (response.ok) return true
  if (response.status === 404) return false
  throw new Error(`读取欢迎状态失败（${response.status}）`)
}

export async function markWelcomed(podBaseUrl: string, authFetch: typeof fetch, now = new Date()): Promise<void> {
  const body = [
    '@prefix dct: <http://purl.org/dc/terms/>.',
    '@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.',
    `<> dct:date "${now.toISOString()}"^^xsd:dateTime.`,
    '',
  ].join('\n')
  const response = await authFetch(welcomeFileUrl(podBaseUrl), {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle', 'If-None-Match': '*' },
    body,
  })
  // 412: another device got there first, which is the same outcome.
  if (!response.ok && response.status !== 412) throw new Error(`记录欢迎状态失败（${response.status}）`)
}
