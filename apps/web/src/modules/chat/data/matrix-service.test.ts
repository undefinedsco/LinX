import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { matrixUserIdFromWebId, MatrixClientError } from '@linx/agent-runtime/matrix-client'
import {
  createPodMatrixClient,
  formatMatrixErrorForUser,
  matrixServerNameFromUserId,
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
