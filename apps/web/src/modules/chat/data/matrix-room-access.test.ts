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
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 200 }))
    await expect(grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })).rejects.toThrow('没有提供访问控制地址')
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('reports a denied ACR write instead of claiming success', async () => {
    const fetchImpl = orderedAcrFetch({ patchStatus: 403, putStatus: 403 })
    await expect(grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })).rejects.toThrow('HTTP 403')
  })

  it('guards the ACR replacement write with the version of the read it merged', async () => {
    const fetchImpl = orderedAcrFetch({ patchStatus: 405 })
    await grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })
    const puts = fetchImpl.mock.calls.filter(([input, init]) => (
      String(input) === `${ROOM}.acr` && init?.method === 'PUT'
    ))
    expect(puts).toHaveLength(1)
    expect(new Headers((puts[0]?.[1] as RequestInit).headers).get('If-Match')).toBe('"room-acr-v1"')
    expect(fetchImpl.mock.calls.filter(([input, init]) => (
      String(input) === `${ROOM}.acr` && init?.method === 'HEAD'
    ))).toHaveLength(0)
  })
})

// The passing backend acceptance helper tolerates HEAD 200 OR 404 and then
// authorizes via the container's own server-advertised Link rel="acl". That is
// what its source proves: the helper ALLOWS a 404, not that the real 431 run
// measured one. These cases pin the same contract on the product path — a
// simulated 404 with a valid advertised control — plus everything that must
// still refuse. Whether a real RC container is actually absent stays unobserved.
describe('grantMatrixRoomAccess when the container HEAD answers 404', () => {
  /**
   * Simulates a server that answers 404 for the room container while still
   * advertising the container's own control document.
   */
  function missingContainerFetch(options: {
    link?: string | null
    acrPutStatus?: number
  } = {}) {
    const link = options.link === undefined ? `<${ROOM}.acr>; rel="acl"` : options.link
    return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method?.toUpperCase()
      if (url === ROOM && method === 'HEAD') {
        return new Response(null, {
          status: 404,
          ...(link ? { headers: { Link: link } } : {}),
        })
      }
      if (url === `${ROOM}.acr` && method === 'PUT') {
        return new Response(null, { status: options.acrPutStatus ?? 201 })
      }
      return new Response(null, { status: 404 })
    })
  }

  it('establishes the room-scoped ACR when the container is absent, before any invite', async () => {
    const fetchImpl = missingContainerFetch()
    // This case owns the grant itself; the create-then-grant-then-invite ordering
    // is asserted separately in matrix-service.test.ts, where the invite happens.
    const result = await grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })

    expect(result).toMatchObject({ roomContainerUri: ROOM, mechanism: 'acp', grantedWebIds: [BOB] })
    const put = fetchImpl.mock.calls.find(([input, init]) => (
      String(input) === `${ROOM}.acr` && init?.method === 'PUT'
    ))
    expect(put).toBeDefined()
    const body = String((put?.[1] as RequestInit).body)
    // The container itself plus future descendants; owner keeps Control, Bob never gets it.
    expect(body).toContain(`acp:resource <${ROOM}>`)
    expect(body).toContain(`<${BOB}>`)
    expect(body).toContain('acp:memberAccessControl')
    expect(body).toContain('acl:Control')
    // The control document written is the container's own advertised ACR.
    expect(fetchImpl.mock.calls.some(([input, init]) => (
      String(input) === `${ROOM}.acl` && init?.method === 'PUT'
    ))).toBe(false)
  })

  it('still refuses a 404 that advertises no control link, and writes nothing', async () => {
    const fetchImpl = missingContainerFetch({ link: null })
    await expect(grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })).rejects.toThrow('资源没有提供访问控制地址，无法授权。')
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('still refuses a 404 that advertises a control outside the owner root', async () => {
    const fetchImpl = missingContainerFetch({ link: '<https://evil.example/x.acr>; rel="acl"' })
    await expect(grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })).rejects.toThrow('资源返回了越界的访问控制地址。')
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('still refuses a 404 whose advertised control is not this container\'s own document', async () => {
    // Same origin and inside the container path, but not <container>.acl|.acr:
    // the product never rewrites the advertised URI into one it prefers.
    const fetchImpl = missingContainerFetch({ link: `<${ROOM}other.acr>; rel="acl"` })
    await expect(grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })).rejects.toThrow('资源返回了越界的访问控制地址。')
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('still refuses a missing container when the Pod advertises WAC, which needs the resource itself', async () => {
    const fetchImpl = missingContainerFetch({ link: `<${ROOM}.acl>; rel="acl"` })
    await expect(grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })).rejects.toThrow('群聊空间还不存在，暂时不能授权。')
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('keeps 401 and 403 as failures instead of reading them as a missing container', async () => {
    for (const status of [401, 403]) {
      const fetchImpl = vi.fn(async () => new Response(null, { status }))
      await expect(grantMatrixRoomAccess({
        db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
      })).rejects.toThrow(`HTTP ${status}`)
      expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
    }
  })

  it('surfaces the discovery HEAD status when the container first answers 404 then discovery is denied', async () => {
    // First HEAD (the container probe) is a 404, so the missing-container path is
    // taken; the discovery HEAD that follows is denied. The refusal must report
    // the real permission status, not be folded into "the space does not exist".
    let headCount = 0
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'HEAD') {
        headCount += 1
        return new Response(null, { status: headCount === 1 ? 404 : 403 })
      }
      return new Response(null, { status: 404 })
    })
    await expect(grantMatrixRoomAccess({
      db: db(), authFetch: fetchImpl as unknown as typeof fetch, ownerWebId: OWNER, participants: [BOB], chatUri: CHAT_URI,
    })).rejects.toThrow('HTTP 403')
    // It really was the second HEAD that produced the status.
    expect(headCount).toBe(2)
    expect(fetchImpl.mock.calls.some(([, init]) => init?.method === 'PUT')).toBe(false)
  })

  it('reports a refused ACR bootstrap on a missing container instead of claiming success', async () => {
    const fetchImpl = missingContainerFetch({ acrPutStatus: 403 })
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

  it('preserves the exact supplied full WebID bytes for hashing and targetWebID', () => {
    // URL-equivalent but byte-different identities must not be normalized:
    // the backend hashes the exact string it receives.
    const raw = 'https://ID.example:443/a/../bob#me'
    expect(validateMatrixInvitees([raw], OWNER)).toEqual([raw])
    expect(validateMatrixInvitees([raw], OWNER)[0]).not.toBe(new URL(raw).href)
    expect(validateMatrixInvitees([BOB], OWNER)).toEqual([BOB])
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

function orderedAcrFetch(options: { patchStatus?: number; putStatus?: number } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method?.toUpperCase()
    if (method === 'HEAD' && url === ROOM) {
      return new Response(null, { status: 200, headers: { Link: `<${ROOM}.acr>; rel="acl"` } })
    }
    if (url === `${ROOM}.acr` && (method === 'PUT' || method === 'PATCH')) {
      const status = method === 'PATCH' ? options.patchStatus : options.putStatus
      if (status && status >= 400) return res(url, null, { status })
      return res(url, null, { status: method === 'PATCH' ? 200 : 201 })
    }
    if (url === `${ROOM}.acr`) {
      return res(url, acrTurtle(), {
        status: 200,
        headers: { 'Content-Type': 'text/turtle', ETag: '"room-acr-v1"' },
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
