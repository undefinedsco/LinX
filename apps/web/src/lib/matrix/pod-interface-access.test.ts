import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMatrixInterfaceAccess,
  createMatrixInterfaceFetch,
  MatrixInterfaceAuthorizeUnavailableError,
  MatrixInterfaceScopeError,
  releaseAllMatrixInterfaceCredentials,
  releaseStaleMatrixInterfaceCredentials,
  resetMatrixInterfaceCredentialsForTests,
  resolveMatrixAccountOrigin,
  resolveMatrixInterfaceScope,
} from './pod-interface-access'

const WEB_ID = 'https://pod.example/alice/profile/card#me'
const POD_URL = 'https://pod.example/alice/'
const ACCOUNT_ORIGIN = 'https://id.identity.example'
const ACCOUNT_INDEX = `${ACCOUNT_ORIGIN}/.account/`
const COLLECTION = `${ACCOUNT_ORIGIN}/.account/account/alice/client-credentials/`
const CREDENTIAL_RESOURCE = `${COLLECTION}client-1`

afterEach(() => {
  resetMatrixInterfaceCredentialsForTests()
})

function accountFetch(overrides: {
  control?: string | null
  createResponse?: Response
  deleteResponse?: Response
} = {}) {
  const control = overrides.control === undefined ? COLLECTION : overrides.control
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.href === ACCOUNT_INDEX && !init?.method) {
      return Response.json({
        controls: { account: { ...(control ? { clientCredentials: control } : {}) } },
      })
    }
    if (url.href === COLLECTION && init?.method === 'POST') {
      return overrides.createResponse ?? Response.json({
        id: 'client-1',
        secret: 'secret-1',
        resource: CREDENTIAL_RESOURCE,
      }, { status: 201 })
    }
    if (url.href === CREDENTIAL_RESOURCE && init?.method === 'DELETE') {
      return overrides.deleteResponse ?? new Response(null, { status: 204 })
    }
    return new Response('not found', { status: 404 })
  })
}

function whoamiFetch(webId = WEB_ID) {
  return vi.fn(async () => Response.json({
    user_id: '@alice:pod.example',
    'co.undefineds.webid': webId,
  }))
}

function createAccess(
  fetchImpl: ReturnType<typeof accountFetch> = accountFetch(),
  matrixFetch: ReturnType<typeof whoamiFetch> = whoamiFetch(),
) {
  return createMatrixInterfaceAccess({
    webId: WEB_ID,
    podUrl: POD_URL,
    accountOrigin: ACCOUNT_ORIGIN,
    sessionId: 'session-1',
    sessionFetch: fetchImpl,
    fetchImpl: matrixFetch,
  })
}

describe('matrix interface access', () => {
  it('reads the Account authority, never the Pod origin, for the credential entry', async () => {
    const sessionFetch = accountFetch()
    const credential = await createAccess(sessionFetch).authorize()

    expect(sessionFetch.mock.calls.map(([input]) => String(input))).toEqual([
      ACCOUNT_INDEX,
      COLLECTION,
    ])
    expect(sessionFetch.mock.calls.every(([input]) => !String(input).includes('pod.example'))).toBe(true)
    // Account capability mode: the authoritative Account origin may use its own
    // cookie; the Matrix transport below never does.
    expect(sessionFetch.mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true)
    expect(credential).toEqual({
      apiKey: `sk-${btoa('client-1:secret-1')}`,
      webId: WEB_ID,
      accountOrigin: ACCOUNT_ORIGIN,
      origin: 'https://pod.example',
      podUrl: POD_URL,
      resource: CREDENTIAL_RESOURCE,
    })
  })

  it('does not create a credential until the user authorizes', async () => {
    const sessionFetch = accountFetch()
    const access = createAccess(sessionFetch)

    expect(access.get()).toBeNull()
    expect(sessionFetch).not.toHaveBeenCalled()

    const credential = await access.authorize()
    expect(access.get()).toEqual(credential)
  })

  it('reuses one session credential and de-duplicates concurrent authorization', async () => {
    const sessionFetch = accountFetch()
    const access = createAccess(sessionFetch)

    const [first, second, third] = await Promise.all([
      access.authorize(),
      access.authorize(),
      access.authorize(),
    ])
    await access.authorize()

    expect(first).toBe(second)
    expect(second).toBe(third)
    const creates = sessionFetch.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(creates).toHaveLength(1)
  })

  it('isolates the credential by WebID, Account authority, Pod origin, and session', async () => {
    const sharedFetch = accountFetch()
    const first = createAccess(sharedFetch)
    await first.authorize()

    const otherUser = createMatrixInterfaceAccess({
      webId: 'https://pod.example/bob/profile/card#me',
      podUrl: POD_URL,
      accountOrigin: ACCOUNT_ORIGIN,
      sessionId: 'session-1',
      sessionFetch: sharedFetch,
    })
    const otherAccount = createMatrixInterfaceAccess({
      webId: WEB_ID,
      podUrl: POD_URL,
      accountOrigin: 'https://other-identity.example',
      sessionId: 'session-1',
      sessionFetch: sharedFetch,
    })
    const otherPod = createMatrixInterfaceAccess({
      webId: WEB_ID,
      podUrl: 'https://other.example/alice/',
      accountOrigin: ACCOUNT_ORIGIN,
      sessionId: 'session-1',
      sessionFetch: sharedFetch,
    })
    const otherSession = createMatrixInterfaceAccess({
      webId: WEB_ID,
      podUrl: POD_URL,
      accountOrigin: ACCOUNT_ORIGIN,
      sessionId: 'session-2',
      sessionFetch: sharedFetch,
    })

    expect(otherUser.get()).toBeNull()
    expect(otherAccount.get()).toBeNull()
    expect(otherPod.get()).toBeNull()
    expect(otherSession.get()).toBeNull()
    expect(first.get()).not.toBeNull()
  })

  it('revokes the credential resource on release and drops it from memory', async () => {
    const sessionFetch = accountFetch()
    const access = createAccess(sessionFetch)
    await access.authorize()

    await access.release()

    expect(access.get()).toBeNull()
    const deletes = sessionFetch.mock.calls.filter(([, init]) => init?.method === 'DELETE')
    expect(deletes).toHaveLength(1)
    expect(String(deletes[0]?.[0])).toBe(CREDENTIAL_RESOURCE)
  })

  it('revokes every credential of the logged-out WebID', async () => {
    const sessionFetch = accountFetch()
    await createAccess(sessionFetch).authorize()

    await releaseAllMatrixInterfaceCredentials({ webId: WEB_ID, sessionFetch })

    expect(sessionFetch.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
  })

  it('drops credentials that no longer belong to the active scope', async () => {
    const sessionFetch = accountFetch()
    await createAccess(sessionFetch).authorize()

    const nextScope = resolveMatrixInterfaceScope(
      WEB_ID,
      'https://second.example/alice/',
      'session-2',
      ACCOUNT_ORIGIN,
    )
    await releaseStaleMatrixInterfaceCredentials({ scope: nextScope, sessionFetch })

    expect(sessionFetch.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(1)
    const next = createMatrixInterfaceAccess({
      webId: WEB_ID,
      podUrl: 'https://second.example/alice/',
      accountOrigin: ACCOUNT_ORIGIN,
      sessionId: 'session-2',
      sessionFetch,
    })
    expect(next.get()).toBeNull()
  })

  it('reports unavailable programmatic issuance without claiming an expired login', async () => {
    const access = createAccess(accountFetch({ control: null }))
    const error = await access.authorize().catch((cause: unknown) => cause as Error)
    expect(error).toBeInstanceOf(MatrixInterfaceAuthorizeUnavailableError)
    expect(error.message).toContain('到账号服务页面创建后导入')
    expect(error.message).not.toMatch(/登录|过期|expired/iu)
  })

  it('treats a 401 from the Account authority as unavailable programmatic issuance', async () => {
    const access = createAccess(
      vi.fn(async () => new Response('', { status: 401 })) as unknown as ReturnType<typeof accountFetch>,
    )
    await expect(access.authorize())
      .rejects.toBeInstanceOf(MatrixInterfaceAuthorizeUnavailableError)
  })

  it('rejects an advertised control on another origin', async () => {
    const access = createAccess(accountFetch({
      control: 'https://attacker.example/.account/client-credentials/',
    }))
    await expect(access.authorize()).rejects.toBeInstanceOf(MatrixInterfaceAuthorizeUnavailableError)
  })

  it('rejects a credential resource outside the Account authority', async () => {
    const access = createAccess(accountFetch({
      createResponse: Response.json({
        id: 'client-1',
        secret: 'secret-1',
        resource: 'https://attacker.example/.account/account/alice/client-credentials/client-1',
      }, { status: 201 }),
    }))
    await expect(access.authorize()).rejects.toThrow('不可信的账号地址')
  })

  it('does not echo the server body when authorization is refused', async () => {
    const access = createAccess(accountFetch({
      createResponse: new Response('{"secret":"do-not-print"}', { status: 403 }),
    }))
    const error = await access.authorize().catch((cause: unknown) => cause as Error)
    expect(error.message).toContain('HTTP 403')
    expect(error.message).not.toContain('do-not-print')
  })

  it('imports a pasted sk- credential into memory after whoami verifies its owner', async () => {
    const sessionFetch = accountFetch()
    const matrixFetch = whoamiFetch()
    const access = createAccess(sessionFetch, matrixFetch)
    const apiKey = `sk-${btoa('client-9:secret-9')}`

    const credential = await access.importAuthorization({ apiKey })

    expect(access.get()).toEqual(credential)
    expect(matrixFetch).toHaveBeenCalledTimes(1)
    const [whoamiRequest] = matrixFetch.mock.calls[0] as unknown as [Request]
    expect(whoamiRequest.url).toBe('https://pod.example/_matrix/client/v3/account/whoami')
    expect(whoamiRequest.headers.get('authorization')).toBe(`Bearer ${apiKey}`)
    expect(sessionFetch).not.toHaveBeenCalled()
  })

  it('builds the sk- wrapper from an imported client id and secret', async () => {
    const access = createAccess(accountFetch(), whoamiFetch())
    const credential = await access.importAuthorization({
      clientId: 'client-9',
      clientSecret: 'secret-9',
    })
    expect(credential.apiKey).toBe(`sk-${btoa('client-9:secret-9')}`)
    expect(credential.resource).toBeUndefined()
  })

  it('rejects an imported credential that the Matrix server says belongs to another WebID', async () => {
    const access = createAccess(
      accountFetch(),
      whoamiFetch('https://pod.example/bob/profile/card#me'),
    )
    await expect(access.importAuthorization({ apiKey: `sk-${btoa('client-9:secret-9')}` }))
      .rejects.toThrow('不属于当前账号')
    expect(access.get()).toBeNull()
  })

  it('rejects a malformed imported credential without echoing it', async () => {
    const access = createAccess(accountFetch(), whoamiFetch())
    const error = await access.importAuthorization({ apiKey: 'not-a-key' })
      .catch((cause: unknown) => cause as Error)
    expect(error.message).toContain('格式不正确')
    expect(error.message).not.toContain('not-a-key')
  })

  it('does not create a credential or send Matrix traffic when import is cancelled', async () => {
    const sessionFetch = accountFetch()
    const matrixFetch = whoamiFetch()
    const access = createAccess(sessionFetch, matrixFetch)

    // Cancel is a UI no-op: nothing is authorized or imported.
    expect(access.get()).toBeNull()
    expect(sessionFetch).not.toHaveBeenCalled()
    expect(matrixFetch).not.toHaveBeenCalled()
  })

  it('requires an explicit Account authority instead of falling back to the Pod origin', async () => {
    const access = createMatrixInterfaceAccess({
      webId: WEB_ID,
      podUrl: POD_URL,
      accountOrigin: null,
      sessionFetch: accountFetch(),
    })
    await expect(access.authorize()).rejects.toThrow('无法确认当前登录的账号服务')
  })
})

describe('account authority resolution', () => {
  it('uses the persisted session issuer only for the same session and WebID', () => {
    expect(resolveMatrixAccountOrigin({
      webId: WEB_ID,
      sessionId: 'session-1',
      storedSession: { sessionId: 'session-1', webId: WEB_ID, issuerUrl: `${ACCOUNT_ORIGIN}/` },
    })).toBe(ACCOUNT_ORIGIN)

    expect(resolveMatrixAccountOrigin({
      webId: WEB_ID,
      sessionId: 'session-1',
      storedSession: { sessionId: 'stale-session', webId: WEB_ID, issuerUrl: `${ACCOUNT_ORIGIN}/` },
    })).toBeNull()
  })

  it('ignores a remembered account for a different WebID', () => {
    expect(resolveMatrixAccountOrigin({
      webId: WEB_ID,
      rememberedAccount: { webId: 'https://other.example/profile/card#me', issuerUrl: ACCOUNT_ORIGIN },
    })).toBeNull()

    expect(resolveMatrixAccountOrigin({
      webId: WEB_ID,
      rememberedAccount: { webId: WEB_ID, issuerUrl: ACCOUNT_ORIGIN },
    })).toBe(ACCOUNT_ORIGIN)
  })

  it('also accepts a current stored session without a session-id argument', () => {
    expect(resolveMatrixAccountOrigin({
      webId: WEB_ID,
      storedSession: { sessionId: 'session-1', webId: WEB_ID, issuerUrl: ACCOUNT_ORIGIN },
    })).toBe(ACCOUNT_ORIGIN)
  })
})

describe('scoped Matrix transport', () => {
  const credential = {
    apiKey: 'sk-scoped',
    webId: WEB_ID,
    accountOrigin: ACCOUNT_ORIGIN,
    origin: 'https://pod.example',
    podUrl: POD_URL,
    resource: CREDENTIAL_RESOURCE,
  }

  it('sends only the Pod credential, without DPoP or cookies', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }))
    const scoped = createMatrixInterfaceFetch({
      baseUrl: 'https://pod.example',
      credential,
      targetPodUrl: credential.podUrl,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await scoped('https://pod.example/_matrix/client/v3/joined_rooms', {
      headers: { DPoP: 'browser-proof', 'X-Other': 'kept' },
      credentials: 'include',
    })

    const [request] = fetchImpl.mock.calls[0] as unknown as [Request]
    expect(request).toBeInstanceOf(Request)
    expect(request.url).toBe('https://pod.example/_matrix/client/v3/joined_rooms')
    expect(request.headers.get('authorization')).toBe('Bearer sk-scoped')
    expect(request.headers.get('dpop')).toBeNull()
    expect(request.headers.get('x-other')).toBe('kept')
    expect(request.credentials).toBe('omit')
    expect(request.redirect).toBe('error')
  })

  it('preserves Request method, body, and abort signal', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ event_id: '$e' }))
    const scoped = createMatrixInterfaceFetch({
      baseUrl: 'https://pod.example',
      credential,
      targetPodUrl: credential.podUrl,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const controller = new AbortController()
    const body = JSON.stringify({ body: 'hello', msgtype: 'm.text' })
    const request = new Request(
      'https://pod.example/_matrix/client/v3/rooms/!room/send/m.room.message/txn-1',
      {
        method: 'PUT',
        body,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      },
    )

    await scoped(request)

    const [forwarded] = fetchImpl.mock.calls[0] as unknown as [Request]
    expect(forwarded.method).toBe('PUT')
    expect(await forwarded.text()).toBe(body)
    expect(forwarded.headers.get('authorization')).toBe('Bearer sk-scoped')
    // The forwarded Request follows the caller's signal: aborting the original
    // controller must abort the Matrix request too.
    expect(forwarded.signal.aborted).toBe(false)
    controller.abort()
    expect(forwarded.signal.aborted).toBe(true)
  })

  it('keeps two Pod roots on the same origin distinct and sends the selected one', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }))
    const alice = createMatrixInterfaceFetch({
      baseUrl: 'https://pod.example',
      credential: { ...credential, podUrl: 'https://pod.example/alice/' },
      targetPodUrl: 'https://pod.example/alice/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })
    const bob = createMatrixInterfaceFetch({
      baseUrl: 'https://pod.example',
      credential: { ...credential, podUrl: 'https://pod.example/team/bob/' },
      targetPodUrl: 'https://pod.example/team/bob/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await alice('https://pod.example/_matrix/client/v3/joined_rooms')
    await bob('https://pod.example/_matrix/client/v3/joined_rooms')

    const [aliceRequest, bobRequest] = fetchImpl.mock.calls.map(
      ([request]) => request as Request,
    )
    expect(aliceRequest?.headers.get('x-xpod-pod-url')).toBe('https://pod.example/alice/')
    expect(bobRequest?.headers.get('x-xpod-pod-url')).toBe('https://pod.example/team/bob/')
    expect(aliceRequest?.url).toBe('https://pod.example/_matrix/client/v3/joined_rooms')
  })

  it('overwrites a caller-supplied Pod selection header with the trusted binding', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }))
    const scoped = createMatrixInterfaceFetch({
      baseUrl: 'https://pod.example',
      credential,
      targetPodUrl: credential.podUrl,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await scoped('https://pod.example/_matrix/client/v3/joined_rooms', {
      headers: { 'X-Xpod-Pod-Url': 'https://pod.example/other/' },
    })

    const [request] = fetchImpl.mock.calls[0] as unknown as [Request]
    expect(request.headers.get('x-xpod-pod-url')).toBe(credential.podUrl)
  })

  it('accepts a cross-origin Pod root as data while pinning the request to the service', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ joined_rooms: [] }))
    const scoped = createMatrixInterfaceFetch({
      baseUrl: 'https://pod.example',
      credential,
      targetPodUrl: 'https://pods.other.example/alice/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await scoped('https://pod.example/_matrix/client/v3/joined_rooms')

    const [request] = fetchImpl.mock.calls[0] as unknown as [Request]
    expect(new URL(request.url).origin).toBe('https://pod.example')
    expect(request.headers.get('x-xpod-pod-url')).toBe('https://pods.other.example/alice/')
    expect(request.headers.get('authorization')).toBe('Bearer sk-scoped')
  })

  it('refuses to send the credential to another origin', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ ok: true }))
    const scoped = createMatrixInterfaceFetch({
      baseUrl: 'https://pod.example',
      credential,
      targetPodUrl: credential.podUrl,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })

    await expect(scoped('https://attacker.example/_matrix/client/v3/sync'))
      .rejects.toBeInstanceOf(MatrixInterfaceScopeError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses to build a transport for a different Pod', () => {
    expect(() => createMatrixInterfaceFetch({
      baseUrl: 'https://other.example',
      credential,
      targetPodUrl: credential.podUrl,
    })).toThrow(MatrixInterfaceScopeError)
  })
})

describe('matrix interface scope', () => {
  it('requires a WebID, an absolute Pod URL, and an Account authority', () => {
    expect(resolveMatrixInterfaceScope(undefined, POD_URL, 's1', ACCOUNT_ORIGIN)).toBeNull()
    expect(resolveMatrixInterfaceScope(WEB_ID, null, 's1', ACCOUNT_ORIGIN)).toBeNull()
    expect(resolveMatrixInterfaceScope(WEB_ID, 'not-a-url', 's1', ACCOUNT_ORIGIN)).toBeNull()
    expect(resolveMatrixInterfaceScope(WEB_ID, POD_URL, 's1', null)).toBeNull()
    expect(resolveMatrixInterfaceScope(WEB_ID, POD_URL, 's1', 'not-a-url')).toBeNull()
    expect(resolveMatrixInterfaceScope(WEB_ID, POD_URL, 's1', ACCOUNT_ORIGIN)).toMatchObject({
      webId: WEB_ID,
      origin: 'https://pod.example',
      accountOrigin: ACCOUNT_ORIGIN,
      sessionId: 's1',
    })
  })

  it('keeps Account and Pod origins distinct', () => {
    expect(resolveMatrixInterfaceScope(WEB_ID, POD_URL, 's1', ACCOUNT_ORIGIN)).toMatchObject({
      origin: 'https://pod.example',
      accountOrigin: 'https://id.identity.example',
    })
  })
})
