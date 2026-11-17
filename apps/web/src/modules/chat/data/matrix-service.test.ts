import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matrixUserIdFromWebId, MatrixClientError } from '@linx/agent-runtime/matrix-client'
import { withProtocolMetadata } from '@undefineds.co/models'
import {
  createMatrixGroupRoom,
  createPodMatrixClient,
  formatMatrixErrorForUser,
  matrixServerNameFromUserId,
  readMatrixRoomId,
  sendMatrixThreadMessage,
} from './matrix-service'
import {
  MatrixInterfaceAuthorizationRequiredError,
  resetMatrixInterfaceCredentialsForTests,
  type MatrixInterfaceAccess,
  type MatrixInterfaceCredential,
} from '@/lib/matrix/pod-interface-access'

const WEB_ID = 'https://pod.example/alice/profile/card#me'
const POD_BASE = 'https://pod.example/alice/'

function database(): any {
  return {
    getDialect: () => ({ getPodUrl: () => POD_BASE }),
    resolveRowIri: (resource: any, row: { id: string }) =>
      resource?.name === 'chat'
        ? `https://pod.example/alice/.data/chat/${row.id}`
        : `https://pod.example/alice/.data/${row.id}`,
  }
}

function accessWith(credential: MatrixInterfaceCredential | null): MatrixInterfaceAccess {
  return {
    get: () => credential,
    authorize: vi.fn(async () => {
      throw new Error('not used')
    }),
    release: vi.fn(async () => undefined),
  }
}

const CREDENTIAL = {
  apiKey: 'sk-interface',
  webId: WEB_ID,
  accountOrigin: 'https://id.identity.example',
  origin: 'https://pod.example',
  podUrl: POD_BASE,
}

beforeEach(() => resetMatrixInterfaceCredentialsForTests())
afterEach(() => resetMatrixInterfaceCredentialsForTests())

describe('matrix server name from the whoami MXID', () => {
  it('uses the bare host for the default-port production authority', () => {
    expect(matrixServerNameFromUserId('@u_alice:ids.sealosgzg.site')).toBe('ids.sealosgzg.site')
  })

  it('keeps a non-default port instead of reducing the server to the port number', async () => {
    for (const server of ['localhost:5739', 'pod.local:8443']) {
      const userId = `@u_alice:${server}`
      expect(matrixServerNameFromUserId(userId)).toBe(server)
      // The invite must target the same account the provider derived for this WebID.
      expect(await matrixUserIdFromWebId(WEB_ID, matrixServerNameFromUserId(userId)))
        .toBe(await matrixUserIdFromWebId(WEB_ID, server))
    }
  })

  it('keeps a bracketed IPv6 authority, with and without a port', async () => {
    for (const server of ['[::1]', '[2001:db8::1]:8448']) {
      const userId = `@u_alice:${server}`
      expect(matrixServerNameFromUserId(userId)).toBe(server)
      expect(await matrixUserIdFromWebId(WEB_ID, matrixServerNameFromUserId(userId)))
        .toBe(await matrixUserIdFromWebId(WEB_ID, server))
    }
  })

  it('keeps rejecting malformed or non-string MXIDs', () => {
    const invalid: unknown[] = [
      '',
      '@',
      '@u_alice',
      '@u_alice:',
      '@:pod.example',
      'u_alice:pod.example',
      ' @u_alice:pod.example',
      null,
      undefined,
      42,
    ]
    for (const userId of invalid) {
      expect(() => matrixServerNameFromUserId(userId as string)).toThrow('无效的账号标识')
    }
  })
})

describe('matrix transport authorization', () => {
  it('attaches the Pod interface credential to Matrix requests', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ joined_rooms: [] }))
    const client = createPodMatrixClient({
      db: database(),
      credential: CREDENTIAL,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      randomId: () => 'txn',
    })

    await client.joinedRooms()

    const [request] = fetchImpl.mock.calls[0] as unknown as [Request]
    expect(request).toBeInstanceOf(Request)
    expect(request.url).toBe('https://pod.example/_matrix/client/v3/joined_rooms')
    expect(request.headers.get('authorization')).toBe('Bearer sk-interface')
    expect(request.headers.get('dpop')).toBeNull()
    expect(request.credentials).toBe('omit')
  })

  it('sends messages with the scoped credential and no DPoP', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ event_id: '$e' }))
    const client = createPodMatrixClient({
      db: database(),
      credential: CREDENTIAL,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      randomId: () => 'txn-1',
    })

    await client.sendMessage('!room:pod.example', 'hello')

    const [request] = fetchImpl.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('PUT')
    expect(request.headers.get('authorization')).toBe('Bearer sk-interface')
    expect(request.headers.get('dpop')).toBeNull()
  })

  it('sends the selected full Pod root, not just its origin', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ joined_rooms: [] }))
    const client = createPodMatrixClient({
      db: database(),
      credential: { ...CREDENTIAL, podUrl: 'https://pod.example/alice/second-pod/' },
      fetchImpl: fetchImpl as unknown as typeof fetch,
      randomId: () => 'txn',
    })

    await client.joinedRooms()

    const [request] = fetchImpl.mock.calls[0] as unknown as [Request]
    expect(request.headers.get('x-xpod-pod-url')).toBe('https://pod.example/alice/second-pod/')
  })

  it('refuses a credential bound to a different Pod root than the current one', async () => {
    const fetchImpl = vi.fn()
    await expect(sendMatrixThreadMessage({
      db: database(),
      access: accessWith({ ...CREDENTIAL, podUrl: 'https://pod.example/alice/stale-pod/' }),
      webId: WEB_ID,
      thread: {
        id: 'chat/matrix/index.ttl#thread',
        metadata: { chat_id: 'matrix/index.ttl#this', roomId: '!room:pod.example' },
      },
      body: 'hello',
    })).rejects.toThrow('当前选择的空间已变化')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fails before any request when no credential was authorized', async () => {
    const fetchImpl = vi.fn()
    await expect(sendMatrixThreadMessage({
      db: database(),
      access: accessWith(null),
      webId: WEB_ID,
      thread: {
        id: 'chat/matrix/index.ttl#thread',
        metadata: { chat_id: 'matrix/index.ttl#this', roomId: '!room:pod.example' },
      },
      body: 'hello',
    })).rejects.toBeInstanceOf(MatrixInterfaceAuthorizationRequiredError)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refuses a credential issued for another account', async () => {
    const fetchImpl = vi.fn()
    await expect(sendMatrixThreadMessage({
      db: database(),
      access: accessWith({ ...CREDENTIAL, webId: 'https://pod.example/bob/profile/card#me' }),
      webId: WEB_ID,
      thread: {
        id: 'chat/matrix/index.ttl#thread',
        metadata: { chat_id: 'matrix/index.ttl#this', roomId: '!room:pod.example' },
      },
      body: 'hello',
    })).rejects.toThrow('当前账号或空间已变化')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

// Xpod's canonical Matrix writer stores the room id under
// metadata.protocols.matrix. roomId, not at the metadata root. The old reader saw
// no room id, returned false from the ChatKit send hook, and Alice's message was
// written into her local chat instead of the shared room Bob reads.
describe('matrix room id from canonical server metadata', () => {
  const canonicalMetadata = withProtocolMetadata(
    { chat_id: 'matrix/index.ttl#this', protocol: 'matrix', surface_id: 'matrix-index' },
    'matrix',
    { roomId: '!canonical:pod.example' },
  )

  it('reads the namespaced room id the backend persists', () => {
    expect(canonicalMetadata).not.toHaveProperty('roomId')
    expect(readMatrixRoomId(canonicalMetadata)).toBe('!canonical:pod.example')
  })

  it('keeps reading a legacy flat room id for rows written before namespacing', () => {
    expect(readMatrixRoomId({ chat_id: 'matrix/index.ttl#this', roomId: '!legacy:pod.example' }))
      .toBe('!legacy:pod.example')
  })

  it('still refuses metadata with no usable room id', () => {
    expect(readMatrixRoomId(null)).toBeNull()
    expect(readMatrixRoomId({ chat_id: 'matrix/index.ttl#this' })).toBeNull()
    expect(readMatrixRoomId({ protocols: { matrix: { roomId: '' } } })).toBeNull()
  })

  it('performs the Matrix send for a server-shaped thread instead of falling back to a local message', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ event_id: '$canonical-event' }))
    vi.stubGlobal('fetch', fetchImpl)
    try {
      const result = await sendMatrixThreadMessage({
        db: database(),
        access: accessWith(CREDENTIAL),
        webId: WEB_ID,
        thread: {
          id: 'chat/matrix/index.ttl#thread',
          metadata: canonicalMetadata,
        },
        body: 'Alice 原消息',
      })

      // The regression is the missing request: 0 calls meant no room send at all.
      expect(fetchImpl).toHaveBeenCalledTimes(1)
      expect(result).not.toBeNull()
      const [request] = fetchImpl.mock.calls[0] as unknown as [Request]
      expect(request.method).toBe('PUT')
      expect(new URL(request.url).pathname)
        .toContain('/_matrix/client/v3/rooms/!canonical%3Apod.example/send/m.room.message/')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('matrix error wording', () => {
  it('shows the safe server reason for a Matrix 403', () => {
    const error = new MatrixClientError('An invitation is required', {
      status: 403,
      errcode: 'M_FORBIDDEN',
    })
    const formatted = formatMatrixErrorForUser(error)
    expect(formatted).toBe('群聊操作没有完成：An invitation is required')
    expect(formatted).not.toContain('登录')
  })

  it('does not present a Matrix 403 as an expired login', () => {
    const error = new MatrixClientError('Grant Pod interface access before using Matrix', {
      status: 403,
      errcode: 'M_FORBIDDEN',
    })
    expect(formatMatrixErrorForUser(error)).toBe(
      '群聊操作没有完成：Grant Pod interface access before using Matrix',
    )
  })

  it('hides reasons that could leak addresses or credentials', () => {
    const error = new MatrixClientError('failed at https://pod.example/?token=secret', { status: 403 })
    expect(formatMatrixErrorForUser(error)).toBe('当前空间没有允许这次群聊操作。')
  })

  it('returns null for unrelated errors so the shared formatter owns them', () => {
    expect(formatMatrixErrorForUser(new Error('network down'))).toBeNull()
  })
})

describe('createMatrixGroupRoom grant-then-invite ordering', () => {
  // The precondition the RC54 backend acceptance flow also encodes: room-scoped
  // access is granted BEFORE the Matrix invite, and a failed grant aborts with no
  // invite sent. Matrix invitations never grant Solid ACL themselves.
  function orderingDb(): any {
    return {
      getDialect: () => ({ getPodUrl: () => POD_BASE, getAuthenticatedFetch: () => vi.fn() }),
      // Use the real shared layout rather than a hand-rolled path, so the asserted
      // container is the one the product actually authorizes.
      resolveRowIri: (resource: any, row: { id: string }) => resource.buildIri(POD_BASE, { id: row.id }),
    }
  }

  /** Stub the Pod-facing Matrix transport; record which endpoints were hit. */
  function stubMatrixTransport() {
    const hits: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init)
      const path = new URL(request.url).pathname
      hits.push(path)
      if (path.endsWith('/account/whoami')) return Response.json({ user_id: '@alice:pod.example' })
      if (path.endsWith('/createRoom')) return Response.json({ room_id: '!room:pod.example' })
      if (path.endsWith('/invite')) return Response.json({})
      return Response.json({})
    }) as unknown as typeof fetch
    return { hits, restore: () => { globalThis.fetch = original } }
  }

  it('resolves the room grant before the first invite, on the canonical container', async () => {
    // One shared timeline: the grant pushes into it, and the transport stub pushes
    // the Matrix endpoints it actually received, so their relative order is real.
    const events: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init)
      const path = new URL(request.url).pathname
      events.push(`matrix:${path}`)
      if (path.endsWith('/account/whoami')) return Response.json({ user_id: '@alice:pod.example' })
      if (path.endsWith('/createRoom')) return Response.json({ room_id: '!room:pod.example' })
      return Response.json({})
    }) as unknown as typeof fetch
    try {
      await createMatrixGroupRoom({
        db: orderingDb(),
        access: accessWith(CREDENTIAL),
        webId: WEB_ID,
        ownerRef: WEB_ID,
        name: 'group',
        participants: ['https://bob.example/#id'],
        grantRoomAccess: (async (input: { roomContainerUri: string }) => {
          events.push(`grant:${input.roomContainerUri}`)
          return {
            roomContainerUri: input.roomContainerUri,
            aclUri: `${input.roomContainerUri}.acr`,
            grantedWebIds: ['https://bob.example/#id'],
            mechanism: 'acp' as const,
          }
        }) as any,
      })
    } finally {
      globalThis.fetch = original
    }

    const grantIndex = events.findIndex((entry) => entry.startsWith('grant:'))
    const inviteIndex = events.findIndex((entry) => entry.endsWith('/invite'))
    expect(grantIndex).toBeGreaterThanOrEqual(0)
    expect(inviteIndex).toBeGreaterThanOrEqual(0)
    // The invite must be sent only after the room-scoped grant resolves.
    expect(grantIndex).toBeLessThan(inviteIndex)
    // The canonical ORM container, not a guessed path and not the Pod root.
    expect(events[grantIndex]).toMatch(/\.data\/chat\/matrix-[0-9a-f]{16}\/$/)
  })

  it('sends no invite when the room grant fails', async () => {
    const { hits, restore } = stubMatrixTransport()
    try {
      await expect(createMatrixGroupRoom({
        db: orderingDb(),
        access: accessWith(CREDENTIAL),
        webId: WEB_ID,
        ownerRef: WEB_ID,
        name: 'group',
        participants: ['https://bob.example/#id'],
        grantRoomAccess: (async () => {
          throw new Error('群聊空间还不存在，暂时不能授权。')
        }) as any,
      })).rejects.toThrow('群聊空间还不存在')
    } finally {
      restore()
    }

    expect(hits.some((path) => path.endsWith('/invite'))).toBe(false)
  })
})
