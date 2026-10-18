import { describe, expect, it, vi } from 'vitest'
import { forgetNote, rememberNote, RememberFailedError } from './remembered'

const FILE = 'https://alice.example/.data/agents/linx/remembered.ttl'
const ME = 'https://alice.example/profile/card#me'
const MESSAGE = 'https://alice.example/.data/chat/c1/2026/10/11/messages.ttl#m2'

function turtleWith(notes: Array<{ id: string; content: string; replacedBy?: string }>): string {
  return [
    '@prefix as: <https://www.w3.org/ns/activitystreams#>.',
    '@prefix dct: <http://purl.org/dc/terms/>.',
    ...notes.map((note) => `<#${note.id}> a as:Note; as:content ${JSON.stringify(note.content)}${note.replacedBy ? `; dct:isReplacedBy <#${note.replacedBy}>` : ''}.`),
  ].join('\n')
}

function podFetch(file: string | null) {
  const calls: Array<{ method: string; body?: string; headers?: Record<string, string> }> = []
  const fn = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    calls.push({ method, body: init?.body as string | undefined, headers: init?.headers as Record<string, string> })
    if (method === 'GET') {
      return file === null
        ? new Response('', { status: 404 })
        : Object.defineProperty(new Response(file, { status: 200, headers: { 'Content-Type': 'text/turtle' } }), 'url', { value: FILE })
    }
    return new Response('', { status: 200 })
  })
  return { fn: fn as unknown as typeof fetch, calls }
}

describe('remembering a message', () => {
  it('creates the file and writes one as:Note linked back to the message', async () => {
    const { fn, calls } = podFetch(null)
    const result = await rememberNote({
      fileUrl: FILE, authFetch: fn, content: '排班不设最低次数', sourceUri: MESSAGE, creatorWebId: ME, now: new Date('2026-10-11T02:00:00Z'),
    })
    expect(result.status).toBe('remembered')
    const put = calls.find((call) => call.method === 'PUT')
    expect(put?.headers?.['If-None-Match']).toBe('*')
    const patch = calls.find((call) => call.method === 'PATCH')
    expect(patch?.body).toContain('INSERT DATA')
    expect(patch?.body).toContain('"排班不设最低次数"')
    expect(patch?.body).toContain(`<http://purl.org/dc/terms/source> <${MESSAGE}>`)
    expect(patch?.body).toContain('"2026-10-11T02:00:00.000Z"^^<http://www.w3.org/2001/XMLSchema#dateTime>')
    expect(patch?.body).toContain(`<http://purl.org/dc/terms/creator> <${ME}>`)
  })

  it('does not write twice for something already remembered', async () => {
    const { fn, calls } = podFetch(turtleWith([{ id: 'n1', content: '排班不设最低次数' }]))
    const result = await rememberNote({ fileUrl: FILE, authFetch: fn, content: ' 排班不设最低次数 ', sourceUri: MESSAGE, creatorWebId: ME })
    expect(result).toEqual({ status: 'already', noteUri: `${FILE}#n1` })
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false)
  })

  it('keeps an old note and marks it replaced when told it is contradicted', async () => {
    const { fn, calls } = podFetch(turtleWith([{ id: 'n1', content: '排班至少 2 次' }]))
    const result = await rememberNote({
      fileUrl: FILE, authFetch: fn, content: '排班不设最低次数', sourceUri: MESSAGE, creatorWebId: ME, replaces: `${FILE}#n1`,
    })
    expect(result).toMatchObject({ status: 'replaced', replacedUri: `${FILE}#n1`, replacedContent: '排班至少 2 次' })
    expect(calls.find((call) => call.method === 'PATCH')?.body).toContain(`<${FILE}#n1> <http://purl.org/dc/terms/isReplacedBy>`)
  })

  it('says why it failed', async () => {
    const forbidden = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) =>
      new Response('', { status: (init?.method ?? 'GET') === 'GET' ? 404 : 403 })) as unknown as typeof fetch
    await expect(rememberNote({ fileUrl: FILE, authFetch: forbidden, content: 'x', sourceUri: MESSAGE, creatorWebId: ME }))
      .rejects.toMatchObject({ reason: 'forbidden' })
    const offline = vi.fn(async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
    await expect(rememberNote({ fileUrl: FILE, authFetch: offline, content: 'x', sourceUri: MESSAGE, creatorWebId: ME }))
      .rejects.toBeInstanceOf(RememberFailedError)
  })

  it('undoes a note and revives the one it replaced', async () => {
    const { fn, calls } = podFetch('')
    await forgetNote({ fileUrl: FILE, authFetch: fn, noteUri: `${FILE}#n2`, replacedUri: `${FILE}#n1` })
    const body = calls[0].body!
    expect(body).toContain(`DELETE WHERE { <${FILE}#n2> ?p ?o }`)
    expect(body).toContain(`DELETE DATA { <${FILE}#n1> <http://purl.org/dc/terms/isReplacedBy> <${FILE}#n2> }`)
  })
})
