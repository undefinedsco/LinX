import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  advertisedAcrControlKey,
  createInitialAdvertisedAcr,
  discoverAdvertisedAccessControl,
  grantAdvertisedAcrAccess,
} from './advertised-acr'

const ROOM = 'https://pods.example/alice/.data/chat/r/'
const ACR = `${ROOM}.acr`
const OWNER = 'https://pods.example/alice/profile/card#me'
const A = 'https://a.example/users/one#me'
const B = 'https://b.example/users/one#me'

afterEach(() => vi.restoreAllMocks())

describe('stable ACR control keys', () => {
  it('gives different full WebIDs distinct keys even with a shared suffix', async () => {
    const one = await advertisedAcrControlKey('linxMatrixEditor', A)
    const two = await advertisedAcrControlKey('linxMatrixEditor', B)
    expect(one).not.toBe(two)
    expect(one).toMatch(/^linxMatrixEditor-[0-9a-f]{32}$/)
  })

  it('is deterministic for the same identity', async () => {
    expect(await advertisedAcrControlKey('linxMatrixEditor', A))
      .toBe(await advertisedAcrControlKey('linxMatrixEditor', A))
  })
})

describe('advertised access-control discovery', () => {
  it('distinguishes WAC .acl from ACP .acr', async () => {
    const wac = vi.fn(async () => new Response(null, { status: 200, headers: { Link: `<${ROOM}.acl>; rel="acl"` } }))
    const acp = vi.fn(async () => new Response(null, { status: 200, headers: { Link: `<${ACR}>; rel="acl"` } }))
    await expect(discoverAdvertisedAccessControl(ROOM, wac as any)).resolves.toEqual({ kind: 'wac', url: `${ROOM}.acl` })
    await expect(discoverAdvertisedAccessControl(ROOM, acp as any)).resolves.toEqual({ kind: 'acp', url: ACR })
  })

  it('rejects a control address outside the resource', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 200,
      headers: { Link: '<https://evil.example/x.acl>; rel="acl"' },
    }))
    await expect(discoverAdvertisedAccessControl(ROOM, fetchImpl as any))
      .rejects.toThrow('越界')
  })
})

describe('ACR bootstrap race', () => {
  it('uses If-None-Match:* and rereads/merges on 412 instead of replacing', async () => {
    let creates = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'HEAD' && url === ROOM) {
        return res(url, null, { status: 200, headers: { Link: `<${ACR}>; rel="acl"` } })
      }
      if (url === ACR && (init?.method === 'PUT' || init?.method === 'PATCH')) {
        creates += 1
        return res(url, null, { status: creates === 1 ? 412 : 201 })
      }
      if (url === ACR) {
        if (creates === 0) return res(url, '', { status: 404 })
        return res(url, [
          '@prefix acp: <http://www.w3.org/ns/solid/acp#>.',
          '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
          '<#acr> a acp:AccessControlResource;',
          `  acp:resource <${ROOM}>;`,
          '  acp:accessControl <#other>.',
          '<#other> a acp:AccessControl; acp:apply <#otherPolicy>.',
          '<#otherPolicy> a acp:Policy; acp:allow acl:Read; acp:anyOf <#otherMatcher>.',
          `<#otherMatcher> a acp:Matcher; acp:agent <${OWNER}>.`,
        ].join('\n'), { status: 200, headers: { 'Content-Type': 'text/turtle' } })
      }
      return res(url, null, { status: 404 })
    })

    await grantAdvertisedAcrAccess({
      resourceUrl: ROOM,
      ownerWebId: OWNER,
      agentWebId: A,
      access: { read: true, append: true, write: true },
      links: 'both',
      authFetch: fetchImpl as any,
      controlPrefix: 'linxMatrixEditor',
    })

    const writes = fetchImpl.mock.calls.filter(([input, init]) => (
      String(input) === ACR && (init?.method === 'PUT' || init?.method === 'PATCH')
    ))
    expect(writes).toHaveLength(2)
    expect(new Headers((writes[0]?.[1] as RequestInit).headers).get('if-none-match')).toBe('*')
    const merged = String((writes[1]?.[1] as RequestInit).body)
    // The second write is an incremental insert against the raced ACR, not a
    // wholesale replacement that would drop the owner/other policies.
    expect(merged).toContain('INSERT DATA')
    expect(merged).not.toContain('DELETE DATA')
    expect(merged).toContain('linxMatrixEditor-')
  })

  it('never grants Control to the added agent', () => {
    const turtle = createInitialAdvertisedAcr({
      resourceUrl: ROOM,
      ownerWebId: OWNER,
      agentWebId: A,
      links: 'both',
      controlPrefix: 'linxMatrixEditor',
    })
    const agentPart = turtle.slice(turtle.indexOf('<#agent> a acp:AccessControl'))
    expect(agentPart).not.toContain('acl:Control')
    expect(turtle).toContain('acp:memberAccessControl')
  })
})

function res(url: string, body: BodyInit | null, init: ResponseInit): Response {
  const response = new Response(body, init)
  Object.defineProperty(response, 'url', { value: url })
  return response
}
