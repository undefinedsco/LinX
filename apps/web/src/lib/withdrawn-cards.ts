/**
 * R6 K2b 撤回: a card the person withdrew is no longer used by future work.
 * Finished work and earlier chats keep what they already used.
 *
 * Stored in the Pod at `settings/linx/withdrawn-cards.ttl` so the runtime, other
 * devices and LinX all see the same list:
 *
 *   @prefix udfs: <https://undefineds.co/vocab/> .
 *   <#withdrawn> udfs:withdrawnCard <card-uri-1>, <card-uri-2> .
 *
 * The card files themselves are not changed.
 */

export const WITHDRAWN_CARDS_PATH = 'settings/linx/withdrawn-cards.ttl'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export function withdrawnCardsUrl(podBaseUrl: string): string {
  return new URL(WITHDRAWN_CARDS_PATH, podBaseUrl.endsWith('/') ? podBaseUrl : `${podBaseUrl}/`).href
}

/** Card addresses listed in the document (order kept, duplicates dropped). */
export function parseWithdrawnCards(turtle: string): string[] {
  const at = turtle.indexOf('withdrawnCard')
  if (at < 0) return []
  const rest = turtle.slice(at + 'withdrawnCard'.length).replace(/^>/, '')
  const end = rest.search(/\s\.\s*(?:\n|$)/)
  const objects = end >= 0 ? rest.slice(0, end) : rest
  const uris = [...objects.matchAll(/<([^>]+)>/g)].map((match) => match[1])
  return [...new Set(uris)]
}

export function serializeWithdrawnCards(uris: readonly string[]): string {
  const unique = [...new Set(uris)]
  const header = '@prefix udfs: <https://undefineds.co/vocab/> .\n\n'
  if (unique.length === 0) return `${header}<#withdrawn> a udfs:WithdrawnCards .\n`
  return `${header}<#withdrawn> udfs:withdrawnCard ${unique.map((uri) => `<${uri}>`).join(',\n    ')} .\n`
}

export async function readWithdrawnCards(podBaseUrl: string, fetchFn: FetchLike): Promise<string[]> {
  const response = await fetchFn(withdrawnCardsUrl(podBaseUrl), { headers: { Accept: 'text/turtle' } })
  if (response.status === 404) return []
  if (!response.ok) throw new Error(`读取撤回的卡片失败（${response.status}）`)
  return parseWithdrawnCards(await response.text())
}

export async function writeWithdrawnCards(podBaseUrl: string, fetchFn: FetchLike, uris: readonly string[]): Promise<void> {
  const response = await fetchFn(withdrawnCardsUrl(podBaseUrl), {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: serializeWithdrawnCards(uris),
  })
  if (!response.ok) throw new Error(`保存撤回的卡片失败（${response.status}）`)
}

/** The part of the model instructions that keeps withdrawn cards out of new work; null when none. */
export function renderWithdrawnCardsContext(uris: readonly string[]): string | null {
  if (uris.length === 0) return null
  return [
    '## 已撤回的卡片',
    '下面这些卡片已被撤回：以后的工作不要再引用或依据它们（除非对方在这条消息里明确提到）。已经完成的工作不受影响。',
    ...uris.map((uri) => `- ${uri}`),
  ].join('\n')
}
