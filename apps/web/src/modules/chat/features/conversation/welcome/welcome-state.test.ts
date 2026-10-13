import { describe, expect, it, vi } from 'vitest'
import { hasBeenWelcomed, markWelcomed, welcomeFileUrl } from './welcome-state'

const POD = 'https://alice.example/'

describe('welcome state in the Pod', () => {
  it('lives at /settings/linx/welcome.ttl', () => {
    expect(welcomeFileUrl(POD)).toBe('https://alice.example/settings/linx/welcome.ttl')
    expect(welcomeFileUrl('https://alice.example')).toBe('https://alice.example/settings/linx/welcome.ttl')
  })

  it('is welcomed when the file exists, not when it is missing, unknown on other errors', async () => {
    const responses = [200, 404, 500]
    const fetcher = vi.fn(async () => new Response('', { status: responses.shift() })) as unknown as typeof fetch
    await expect(hasBeenWelcomed(POD, fetcher)).resolves.toBe(true)
    await expect(hasBeenWelcomed(POD, fetcher)).resolves.toBe(false)
    await expect(hasBeenWelcomed(POD, fetcher)).rejects.toThrow()
  })

  it('records the date once and tolerates another device winning', async () => {
    const calls: Array<{ body: string; headers: Record<string, string> }> = []
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ body: init?.body as string, headers: init?.headers as Record<string, string> })
      return new Response('', { status: calls.length === 1 ? 201 : 412 })
    }) as unknown as typeof fetch
    await markWelcomed(POD, fetcher, new Date('2026-10-11T00:00:00Z'))
    await markWelcomed(POD, fetcher)
    expect(calls[0].headers['If-None-Match']).toBe('*')
    expect(calls[0].body).toContain('dct:date "2026-10-11T00:00:00.000Z"^^xsd:dateTime')
  })
})
