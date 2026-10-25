import { describe, expect, it, vi } from 'vitest'
import {
  grantMatrixRoomAccess,
  matrixRoomContainerUri,
  validateMatrixInvitees,
} from './matrix-room-access'

const CHAT_URI = 'https://pod.example/alice/.data/chat/matrix-abc/index.ttl#this'
const ROOM = 'https://pod.example/alice/.data/chat/matrix-abc/'
const OWNER = 'https://pod.example/alice/profile/card#me'
// Valid WebID without a /profile/card document template.
const BOB = 'https://bob.example/#id'

function db(): any {
  return { getDialect: () => ({ getPodUrl: () => 'https://pod.example/alice/' }) }
}

function fetchOk(): any {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => (
    init?.method === 'PUT'
      ? new Response(null, { status: 201 })
      : new Response(null, { status: 404 })
  ))
}

describe('matrix room container', () => {
  it('derives the canonical room container from the ORM chat URI', () => {
    expect(matrixRoomContainerUri(CHAT_URI)).toBe(ROOM)
  })

  it('rejects non-HTTP chat URIs instead of guessing a path', () => {
    expect(() => matrixRoomContainerUri('urn:chat:abc')).toThrow()
  })
})

describe('grantMatrixRoomAccess', () => {
  it('grants WAC resource and future descendants, preserving the existing ACL', async () => {
    const fetchImpl = orderedWacFetch([BOB])
    const result = await grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })

    expect(result).toMatchObject({
      roomContainerUri: ROOM,
      grantedWebIds: [BOB],
      mechanism: 'wac',
    })
    const writes = fetchImpl.mock.calls.filter(([input, init]) => (
      String(input) === `${ROOM}.acl` && (init?.method === 'PUT' || init?.method === 'PATCH')
    ))
    expect(writes).toHaveLength(1)
    const body = String((writes[0]?.[1] as RequestInit).body)
    expect(body).toContain('http://www.w3.org/ns/auth/acl#agent')
    expect(body).toContain('http://www.w3.org/ns/auth/acl#default')
  })

  it('grants ACP access and member access for future descendants, owner keeps Control', async () => {
    const fetchImpl = orderedAcrFetch()
    const result = await grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })
    expect(result.mechanism).toBe('acp')
    const write = fetchImpl.mock.calls.find(([input, init]) => (
      String(input) === `${ROOM}.acr` && (init?.method === 'PUT' || init?.method === 'PATCH')
    ))
    const body = String((write?.[1] as RequestInit).body)
    expect(body).toContain('http://www.w3.org/ns/solid/acp#accessControl')
    expect(body).toContain('http://www.w3.org/ns/solid/acp#memberAccessControl')
    expect(body).toContain(`<${BOB}>`)
    expect(body).not.toContain('http://www.w3.org/ns/auth/acl#Control')
  })

  it('accepts a valid WebID that does not use /profile/card', async () => {
    const fetchImpl = orderedAcrFetch()
    const result = await grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })
    expect(result.grantedWebIds).toEqual([BOB])
  })

  it('rejects an invalid invitee with an actionable error, not silent success', async () => {
    const fetchImpl = orderedAcrFetch()
    await expect(grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER,
      participants: [BOB, 'not-a-webid'], chatUri: CHAT_URI,
    })).rejects.toThrow('受邀成员的 WebID 无效')
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('fails when no access-control mechanism is advertised instead of guessing .acl', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    await expect(grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })).rejects.toThrow('没有提供访问控制地址')
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('reports a denied ACR write instead of claiming success', async () => {
    const fetchImpl = orderedAcrFetch({ writeStatus: 403 })
    await expect(grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })).rejects.toThrow('HTTP 403')
  })
})

describe('validateMatrixInvitees', () => {
  it('keeps arbitrary legitimate full WebIDs', () => {
    const ids = validateMatrixInvitees([
      'https://bob.example/#id',
      'https://alice.solid.example/profile/card#me',
      'https://team.example/users/bob#me',
    ], OWNER)
    expect(ids).toEqual([
      'https://bob.example/#id',
      'https://alice.solid.example/profile/card#me',
      'https://team.example/users/bob#me',
    ])
  })

  it('rejects the whole list when one WebID is invalid', () => {
    expect(() => validateMatrixInvitees([BOB, 'https://user:pass@bob.example/#id'], OWNER))
      .toThrow('受邀成员的 WebID 无效')
    expect(() => validateMatrixInvitees([BOB, 'https://bob.example/\u0007'], OWNER))
      .toThrow('受邀成员的 WebID 无效')
  })

  it('removes the owner and duplicates but never a valid distinct identity', () => {
    const a = 'https://x.example/profile/card#me'
    const b = 'https://y.example/people/me#me'
    expect(validateMatrixInvitees([OWNER, a, a, b], OWNER)).toEqual([a, b])
  })
})

function orderedWacFetch(agents: string[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'HEAD' && url === ROOM) {
      return res(url, null, { status: 200, headers: { Link: `<${ROOM}.acl>; rel="acl"` } })
    }
    if (url === ROOM && (!init?.method || init.method === 'GET')) {
      return res(url, '', {
        status: 200,
        headers: { Link: `<${ROOM}.acl>; rel="acl"`, 'Content-Type': 'text/turtle' },
      })
    }
    if (url === `${ROOM}.acl` && (init?.method === 'PUT' || init?.method === 'PATCH')) {
      return res(url, null, { status: init.method === 'PATCH' ? 200 : 201 })
    }
    if (url === `${ROOM}.acl`) {
      return res(url, aclTurtle(agents), {
        status: 200,
        headers: { 'Content-Type': 'text/turtle' },
      })
    }
    return res(url, null, { status: 404 })
  })
}

function res(url: string, body: BodyInit | null, init: ResponseInit & { headers?: HeadersInit }): Response {
  const response = new Response(body, init)
  Object.defineProperty(response, 'url', { value: url })
  return response
}

function orderedAcrFetch(options: { writeStatus?: number } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'HEAD' && url === ROOM) {
      return new Response(null, { status: 200, headers: { Link: `<${ROOM}.acr>; rel="acl"` } })
    }
    if (url === `${ROOM}.acr` && (init?.method === 'PUT' || init?.method === 'PATCH')) {
      if (options.writeStatus && options.writeStatus >= 400) {
        return res(url, null, { status: options.writeStatus })
      }
      return res(url, null, { status: init.method === 'PATCH' ? 200 : 201 })
    }
    if (url === `${ROOM}.acr`) {
      return res(url, acrTurtle(), {
        status: 200,
        headers: { 'Content-Type': 'text/turtle' },
      })
    }
    return res(url, null, { status: 404 })
  })
}

function aclTurtle(agents: string[]) {
  return [
    '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
    '<#owner> a acl:Authorization;',
    `  acl:accessTo <${ROOM}>; acl:default <${ROOM}>;`,
    `  acl:agent <${OWNER}>; acl:mode acl:Read, acl:Write, acl:Control.`,
    ...agents.map((agent) => `<#guest> a acl:Authorization; acl:accessTo <${ROOM}>; acl:agent <${agent}>; acl:mode acl:Read.`),
    '',
  ].join('\n')
}

function acrTurtle() {
  return [
    '@prefix acp: <http://www.w3.org/ns/solid/acp#>.',
    '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.',
    '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
    '<#acr> a acp:AccessControlResource;',
    `  acp:resource <${ROOM}>;`,
    '  acp:accessControl <#ownerAccess>.',
    '<#ownerAccess> a acp:AccessControl; acp:apply <#ownerPolicy>.',
    '<#ownerPolicy> a acp:Policy; acp:allow acl:Read, acl:Write, acl:Control; acp:anyOf <#ownerMatcher>.',
    `<#ownerMatcher> a acp:Matcher; acp:agent <${OWNER}>.`,
    '',
  ].join('\n')
}
