import { getThingAll } from '@inrupt/solid-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  advertisedAcrControlKey,
  createInitialAdvertisedAcr,
  discoverAdvertisedAccessControl,
  grantAdvertisedAcrAccess,
  mergeAdvertisedAcrGrant,
  readAdvertisedAcr,
  saveAdvertisedAcr,
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
        ].join('\n'), { status: 200, headers: { 'Content-Type': 'text/turtle', ETag: 'W/"raced-acr"' } })
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

/**
 * Stateful fake Pod for the ACR grant path: discovery HEAD, one real GET that
 * carries an ETag, then PATCH/PUT writes that honour If-Match. A successful
 * write applies the sent Turtle to the stored document, so assertions about
 * which grants survive are made against the actual wire body.
 */
function fakePodAcr(options: {
  document: string
  etag: string
  /** How many PATCH attempts the fake refuses before accepting them. */
  patchFailures?: number
  /** Interleaving writer: runs while a PATCH is refused, before the fallback. */
  onPatchRefused?: () => void
  omitReadETag?: boolean
}) {
  const state = {
    document: options.document,
    etag: options.etag,
    writes: [] as Array<{ method: string; ifMatch: string | null; body: string }>,
  }
  let patchFailures = options.patchFailures ?? 0
  let read = false
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = (init?.method ?? 'GET').toUpperCase()
    if (method === 'HEAD' && url === ROOM) {
      return res(url, null, { status: 200, headers: { Link: `<${ACR}>; rel="acl"` } })
    }
    if (url !== ACR) return res(url, null, { status: 404 })
    if (method === 'GET') {
      read = true
      return res(url, state.document, {
        status: 200,
        headers: {
          'Content-Type': 'text/turtle',
          ...(options.omitReadETag ? {} : { ETag: state.etag }),
        },
      })
    }
    const ifMatch = new Headers(init?.headers).get('If-Match')
    if (method === 'PATCH') {
      if (patchFailures > 0) {
        patchFailures -= 1
        options.onPatchRefused?.()
        return res(url, null, { status: 405 })
      }
      state.writes.push({ method, ifMatch, body: String(init?.body ?? '') })
      state.document = `${state.document}\n${String(init?.body ?? '')}`
      state.etag = `"after-patch-${state.writes.length}"`
      return res(url, null, { status: 200, headers: { ETag: state.etag } })
    }
    if (method === 'PUT') {
      if (ifMatch !== state.etag) {
        state.writes.push({ method, ifMatch, body: String(init?.body ?? '') })
        return res(url, null, { status: 412 })
      }
      state.writes.push({ method, ifMatch, body: String(init?.body ?? '') })
      state.document = String(init?.body ?? '')
      state.etag = `"after-put-${state.writes.length}"`
      return res(url, null, { status: 200, headers: { ETag: state.etag } })
    }
    return res(url, null, { status: 405 })
  })
  return {
    fetchImpl,
    state,
    /** Mutate the stored document as an interleaving writer would. */
    race(nextDocument: string, nextEtag: string) {
      if (!read) throw new Error('race() must run after the grant read the document')
      state.document = nextDocument
      state.etag = nextEtag
    },
  }
}

function writesOf(pod: ReturnType<typeof fakePodAcr>, method: string) {
  return pod.state.writes.filter((write) => write.method === method)
}

describe('ACR write versioning', () => {
  const EXISTING = [
    '@prefix acp: <http://www.w3.org/ns/solid/acp#>.',
    '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
    '<#acr> a acp:AccessControlResource;',
    `  acp:resource <${ROOM}>;`,
    '  acp:accessControl <#owner>, <#other>.',
    '<#owner> a acp:AccessControl; acp:apply <#ownerPolicy>.',
    '<#ownerPolicy> a acp:Policy; acp:allow acl:Read, acl:Write, acl:Control; acp:anyOf <#ownerMatcher>.',
    `<#ownerMatcher> a acp:Matcher; acp:agent <${OWNER}>.`,
    '<#other> a acp:AccessControl; acp:apply <#otherPolicy>.',
    '<#otherPolicy> a acp:Policy; acp:allow acl:Read; acp:anyOf <#otherMatcher>.',
    `<#otherMatcher> a acp:Matcher; acp:agent <${B}>.`,
    '',
  ].join('\n')

  const grant = (pod: ReturnType<typeof fakePodAcr>) => grantAdvertisedAcrAccess({
    resourceUrl: ROOM,
    ownerWebId: OWNER,
    agentWebId: A,
    access: { read: true, append: true, write: true },
    links: 'both',
    authFetch: pod.fetchImpl as any,
    controlPrefix: 'linxMatrixEditor',
  })

  it('saves normally with one incremental PATCH and no replacement PUT', async () => {
    const pod = fakePodAcr({ document: EXISTING, etag: '"v1"' })
    await grant(pod)

    expect(writesOf(pod, 'PATCH')).toHaveLength(1)
    expect(writesOf(pod, 'PUT')).toHaveLength(0)
    const patch = writesOf(pod, 'PATCH')[0]
    expect(patch?.body).toContain('INSERT DATA')
    expect(patch?.body).not.toContain('DELETE DATA')
    expect(pod.state.document).toContain(`<${A}>`)
    expect(pod.state.document).toContain(`<${B}>`)
  })

  it('falls back to a PUT guarded by the ETag of the read the merge came from', async () => {
    const pod = fakePodAcr({ document: EXISTING, etag: '"read-version"', patchFailures: 1 })
    await grant(pod)

    const puts = writesOf(pod, 'PUT')
    expect(puts).toHaveLength(1)
    expect(puts[0]?.ifMatch).toBe('"read-version"')
    expect(puts[0]?.body).toContain(`<${OWNER}>`)
    expect(puts[0]?.body).toContain(`<${B}>`)
    expect(puts[0]?.body).toContain(`<${A}>`)
    // No HEAD probe may substitute a newer server version for the PUT.
    expect(pod.fetchImpl.mock.calls.filter(([input, init]) => (
      String(input) === ACR && init?.method === 'HEAD'
    ))).toHaveLength(0)
  })

  it('fails clearly on a concurrent update and never overwrites it', async () => {
    const concurrent = `${EXISTING}\n<#newcomer> a acp:AccessControl; acp:apply <#newcomerPolicy>.`
    // Another grant lands after our read and before the fallback write: the
    // document and its ETag move on, so the stale If-Match must be refused.
    const pod = fakePodAcr({
      document: EXISTING,
      etag: '"v1"',
      patchFailures: 1,
      onPatchRefused: () => pod.race(concurrent, '"v2-concurrent"'),
    })

    await expect(grant(pod)).rejects.toThrow('访问控制刚被其他人更新')
    const puts = writesOf(pod, 'PUT')
    expect(puts).toHaveLength(1)
    expect(puts[0]?.ifMatch).toBe('"v1"')
    expect(pod.state.document).toContain('newcomer')
  })

  it('saves normally with one incremental PATCH even when the read had no ETag', async () => {
    const pod = fakePodAcr({ document: EXISTING, etag: '"v1"', omitReadETag: true })
    await grant(pod)

    expect(writesOf(pod, 'PATCH')).toHaveLength(1)
    expect(writesOf(pod, 'PATCH')[0]?.body).toContain('INSERT DATA')
    expect(writesOf(pod, 'PUT')).toHaveLength(0)
    expect(pod.state.document).toContain(`<${A}>`)
    expect(pod.state.document).toContain(`<${B}>`)
  })

  it('never sends a replacement PUT when a failed PATCH has no read ETag', async () => {
    const pod = fakePodAcr({ document: EXISTING, etag: '"v1"', patchFailures: 1, omitReadETag: true })
    await expect(grant(pod)).rejects.toThrow('没有返回版本标识')
    // The incremental PATCH is still attempted first; only the replacement is
    // refused because it cannot be guarded by the original read version.
    expect(writesOf(pod, 'PATCH')).toHaveLength(0)
    expect(writesOf(pod, 'PUT')).toHaveLength(0)
  })

  it('preserves the preexisting owner and other-agent grants in the replacement body', async () => {
    const pod = fakePodAcr({ document: EXISTING, etag: '"v1"', patchFailures: 1 })
    await grant(pod)
    const body = writesOf(pod, 'PUT')[0]?.body ?? ''
    // Read the surviving policies back out of the actual replacement document.
    const snapshot = await readAdvertisedAcr(ACR, async () => res(ACR, body, {
      status: 200,
      headers: { 'Content-Type': 'text/turtle', ETag: '"v1"' },
    }) as any)
    const subjects = getThingAll(snapshot.acr).map((thing) => thing.url)
    expect(subjects.some((url) => url.endsWith('#ownerMatcher'))).toBe(true)
    expect(subjects.some((url) => url.endsWith('#otherMatcher'))).toBe(true)
    expect(subjects.some((url) => url.includes('linxMatrixEditor-') && url.endsWith('Matcher'))).toBe(true)
  })

  it('keeps the incremental save working when the expected version is missing', async () => {
    const pod = fakePodAcr({ document: EXISTING, etag: '"v1"' })
    const snapshot = await readAdvertisedAcr(ACR, pod.fetchImpl as any)
    const merged = await mergeAdvertisedAcrGrant({
      acr: snapshot.acr,
      acrUrl: ACR,
      agentWebId: A,
      access: { read: true, append: true, write: true },
      links: 'both',
      controlKey: await advertisedAcrControlKey('linxMatrixEditor', A),
    })
    await saveAdvertisedAcr(ACR, merged, pod.fetchImpl as any, undefined)
    expect(writesOf(pod, 'PATCH')).toHaveLength(1)
    expect(writesOf(pod, 'PUT')).toHaveLength(0)
  })
})

function res(url: string, body: BodyInit | null, init: ResponseInit): Response {
  const response = new Response(body, init)
  Object.defineProperty(response, 'url', { value: url })
  return response
}
