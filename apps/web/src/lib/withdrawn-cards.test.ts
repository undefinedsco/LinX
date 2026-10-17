import { describe, expect, it } from 'vitest'
import {
  parseWithdrawnCards,
  readWithdrawnCards,
  renderWithdrawnCardsContext,
  serializeWithdrawnCards,
  withdrawnCardsUrl,
  writeWithdrawnCards,
} from './withdrawn-cards'

const A = 'https://pod.example/notes/a.md'
const B = 'https://pod.example/data/people.ttl#zhou'

describe('withdrawn cards document', () => {
  it('round-trips the list through Turtle', () => {
    expect(parseWithdrawnCards(serializeWithdrawnCards([A, B, A]))).toEqual([A, B])
    expect(parseWithdrawnCards(serializeWithdrawnCards([]))).toEqual([])
  })

  it('reads the full-IRI form other tools may write', () => {
    expect(parseWithdrawnCards(`<#withdrawn> <https://undefineds.co/vocab/withdrawnCard> <${A}> .\n`)).toEqual([A])
  })

  it('lives under settings/linx in the Pod', () => {
    expect(withdrawnCardsUrl('https://pod.example/')).toBe('https://pod.example/settings/linx/withdrawn-cards.ttl')
  })

  it('treats a missing document as an empty list and writes with PUT', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    const fetchFn = async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return new Response(init?.method === 'PUT' ? '' : 'not found', { status: init?.method === 'PUT' ? 201 : 404 })
    }
    expect(await readWithdrawnCards('https://pod.example/', fetchFn)).toEqual([])
    await writeWithdrawnCards('https://pod.example/', fetchFn, [A])
    expect(calls[1].init?.method).toBe('PUT')
    expect(String(calls[1].init?.body)).toContain(`<${A}>`)
  })

  it('tells the model to leave withdrawn cards out of new work', () => {
    expect(renderWithdrawnCardsContext([])).toBeNull()
    const text = renderWithdrawnCardsContext([A]) ?? ''
    expect(text).toContain('已撤回的卡片')
    expect(text).toContain(A)
  })
})
