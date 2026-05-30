import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearLocalAccessRoutesForTests,
  installLocalAccessRoute,
  resolveBestLocalAccessRoute,
  type LocalAccessRouteSelection,
} from './local-access-route'

afterEach(() => {
  clearLocalAccessRoutesForTests()
  vi.unstubAllGlobals()
})

describe('Local access route selection', () => {
  it('silently selects the fastest same-node local route while keeping canonical Pod URL', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith('http://localhost:5737/')) {
        return jsonResponse({ contract: 'linx-local-onboarding/v1', baseUrl: 'https://node.example/' })
      }
      if (url.startsWith('https://node.example/')) {
        return jsonResponse({ contract: 'linx-local-onboarding/v1', baseUrl: 'https://node.example/' })
      }
      throw new Error(`unexpected URL: ${url}`)
    }) as unknown as typeof fetch
    let nowCall = 0
    const nowValues = [0, 0, 5, 50]

    const selection = await resolveBestLocalAccessRoute({
      canonicalPodUrl: 'https://node.example/alice/',
      storageProviderLabel: 'Local',
      storageProviderUrl: 'https://node.example/',
      snapshot: {
        state: 'ready',
        spaceKind: 'local',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'https://node.example/',
        publicUrl: 'https://node.example/',
        capabilities: null,
        cloudIdentityUrl: 'https://id.undefineds.co',
        provisionCode: 'code',
        provisionUrl: null,
        nodeId: 'node-1',
        message: null,
        errorCode: null,
        canRetry: true,
        canOpenSettings: true,
      },
      fetchImpl,
      now: () => nowValues[nowCall++] ?? 50,
    })

    expect(selection).toMatchObject({
      canonicalBaseUrl: 'https://node.example/',
      canonicalPodUrl: 'https://node.example/alice/',
      accessBaseUrl: 'http://localhost:5737/',
      accessPodUrl: 'http://localhost:5737/alice/',
      kind: 'local',
    })
  })

  it('falls back to LAN when localhost is not reachable', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith('http://localhost:5737/')) {
        throw new Error('connection refused')
      }
      if (url.startsWith('http://192.168.1.10:5737/')) {
        return jsonResponse({ contract: 'linx-local-onboarding/v1', baseUrl: 'https://node.example/' })
      }
      if (url.startsWith('https://node.example/')) {
        return jsonResponse({ contract: 'linx-local-onboarding/v1', baseUrl: 'https://node.example/' })
      }
      throw new Error(`unexpected URL: ${url}`)
    }) as unknown as typeof fetch
    let nowCall = 0
    const nowValues = [0, 0, 0, 10, 50]

    const selection = await resolveBestLocalAccessRoute({
      canonicalPodUrl: 'https://node.example/alice/',
      storageProviderLabel: 'Local',
      storageProviderUrl: 'https://node.example/',
      snapshot: {
        state: 'ready',
        spaceKind: 'local',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://192.168.1.10:5737/',
        publicUrl: 'https://node.example/',
        capabilities: null,
        cloudIdentityUrl: 'https://id.undefineds.co',
        provisionCode: 'code',
        provisionUrl: null,
        nodeId: 'node-1',
        message: null,
        errorCode: null,
        canRetry: true,
        canOpenSettings: true,
      },
      fetchImpl,
      now: () => nowValues[nowCall++] ?? 50,
    })

    expect(selection?.kind).toBe('lan')
    expect(selection?.accessBaseUrl).toBe('http://192.168.1.10:5737/')
  })

  it('falls back to the public route when localhost and LAN are not reachable', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.startsWith('http://localhost:5737/')) {
        throw new Error('connection refused')
      }
      if (url.startsWith('http://192.168.1.10:5737/')) {
        throw new Error('network unreachable')
      }
      if (url.startsWith('https://node.example/')) {
        return jsonResponse({ contract: 'linx-local-onboarding/v1', baseUrl: 'https://node.example/' })
      }
      throw new Error(`unexpected URL: ${url}`)
    }) as unknown as typeof fetch

    const selection = await resolveBestLocalAccessRoute({
      canonicalPodUrl: 'https://node.example/alice/',
      storageProviderLabel: 'Local',
      storageProviderUrl: 'https://node.example/',
      snapshot: {
        state: 'ready',
        spaceKind: 'local',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://192.168.1.10:5737/',
        publicUrl: 'https://node.example/',
        capabilities: null,
        cloudIdentityUrl: 'https://id.undefineds.co',
        provisionCode: 'code',
        provisionUrl: null,
        nodeId: 'node-1',
        message: null,
        errorCode: null,
        canRetry: true,
        canOpenSettings: true,
      },
      fetchImpl,
    })

    expect(selection?.kind).toBe('public')
    expect(selection?.accessBaseUrl).toBe('https://node.example/')
    expect(selection?.accessPodUrl).toBe('https://node.example/alice/')
  })

  it('uses deterministic route priority only when same-node candidates tie on latency', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (
        url.startsWith('http://localhost:5737/')
        || url.startsWith('http://192.168.1.10:5737/')
        || url.startsWith('https://node.example/')
      ) {
        return jsonResponse({ contract: 'linx-local-onboarding/v1', baseUrl: 'https://node.example/' })
      }
      throw new Error(`unexpected URL: ${url}`)
    }) as unknown as typeof fetch

    const selection = await resolveBestLocalAccessRoute({
      canonicalPodUrl: 'https://node.example/alice/',
      storageProviderLabel: 'Local',
      storageProviderUrl: 'https://node.example/',
      snapshot: {
        state: 'ready',
        spaceKind: 'local',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://192.168.1.10:5737/',
        publicUrl: 'https://node.example/',
        capabilities: null,
        cloudIdentityUrl: 'https://id.undefineds.co',
        provisionCode: 'code',
        provisionUrl: null,
        nodeId: 'node-1',
        message: null,
        errorCode: null,
        canRetry: true,
        canOpenSettings: true,
      },
      fetchImpl,
      now: () => 100,
    })

    expect(selection?.kind).toBe('local')
    expect(selection?.accessBaseUrl).toBe('http://localhost:5737/')
    expect(selection?.probes.map((probe) => probe.kind)).toEqual(['local', 'lan', 'public'])
  })

  it('rejects reachable routes that do not prove the canonical baseUrl', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      contract: 'linx-local-onboarding/v1',
      baseUrl: 'https://other-node.example/',
    })) as unknown as typeof fetch

    await expect(resolveBestLocalAccessRoute({
      canonicalPodUrl: 'https://node.example/alice/',
      storageProviderLabel: 'Local',
      storageProviderUrl: 'https://node.example/',
      snapshot: {
        state: 'ready',
        spaceKind: 'local',
        localUrl: 'http://localhost:5737/',
        baseUrl: 'http://192.168.1.10:5737/',
        publicUrl: 'https://node.example/',
        capabilities: null,
        cloudIdentityUrl: 'https://id.undefineds.co',
        provisionCode: 'code',
        provisionUrl: null,
        nodeId: 'node-1',
        message: null,
        errorCode: null,
        canRetry: true,
        canOpenSettings: true,
      },
      fetchImpl,
    })).resolves.toBeNull()
  })

  it('rewrites http canonical Pod requests to the selected access route without changing caller URL semantics', async () => {
    const nativeFetch = vi.fn(async () => new Response('ok')) as unknown as typeof fetch
    vi.stubGlobal('fetch', nativeFetch)

    installLocalAccessRoute({
      canonicalBaseUrl: 'http://192.168.1.10:5737/',
      canonicalPodUrl: 'http://192.168.1.10:5737/alice/',
      accessBaseUrl: 'http://localhost:5737/',
      accessPodUrl: 'http://localhost:5737/alice/',
      kind: 'local',
      latencyMs: 3,
      probes: [],
    } satisfies LocalAccessRouteSelection)

    await fetch('http://192.168.1.10:5737/alice/.data/chats/index.ttl?x=1#frag', {
      method: 'HEAD',
      headers: { DPoP: 'proof' },
    })

    expect(nativeFetch).toHaveBeenCalledWith('http://localhost:5737/alice/.data/chats/index.ttl?x=1#frag', {
      method: 'HEAD',
      headers: { DPoP: 'proof' },
    })
    expect((window as any).__LINX_ACCESS_ROUTE__).toMatchObject({
      rewriteEnabled: true,
      rewriteDisabledReason: null,
    })
  })

  it('keeps https canonical spaces on the canonical route when the best local entry is plain http', async () => {
    const nativeFetch = vi.fn(async () => new Response('ok')) as unknown as typeof fetch
    vi.stubGlobal('fetch', nativeFetch)

    installLocalAccessRoute({
      canonicalBaseUrl: 'https://node.example/',
      canonicalPodUrl: 'https://node.example/alice/',
      accessBaseUrl: 'http://localhost:5737/',
      accessPodUrl: 'http://localhost:5737/alice/',
      kind: 'local',
      latencyMs: 3,
      probes: [],
    } satisfies LocalAccessRouteSelection)

    await fetch('https://node.example/alice/.data/chats/index.ttl')

    expect(nativeFetch).toHaveBeenCalledWith('https://node.example/alice/.data/chats/index.ttl')
    expect((window as any).__LINX_ACCESS_ROUTE__).toMatchObject({
      accessBaseUrl: 'http://localhost:5737/',
      kind: 'local',
      rewriteEnabled: false,
      rewriteDisabledReason: 'https-canonical-to-http-access',
    })
  })

  it('clears an old selected route when the next selection is canonical', async () => {
    const nativeFetch = vi.fn(async () => new Response('ok')) as unknown as typeof fetch
    vi.stubGlobal('fetch', nativeFetch)

    installLocalAccessRoute({
      canonicalBaseUrl: 'http://192.168.1.10:5737/',
      canonicalPodUrl: 'http://192.168.1.10:5737/alice/',
      accessBaseUrl: 'http://localhost:5737/',
      accessPodUrl: 'http://localhost:5737/alice/',
      kind: 'local',
      latencyMs: 3,
      probes: [],
    })
    installLocalAccessRoute({
      canonicalBaseUrl: 'http://192.168.1.10:5737/',
      canonicalPodUrl: 'http://192.168.1.10:5737/alice/',
      accessBaseUrl: 'http://192.168.1.10:5737/',
      accessPodUrl: 'http://192.168.1.10:5737/alice/',
      kind: 'canonical',
      latencyMs: 20,
      probes: [],
    })

    await fetch('http://192.168.1.10:5737/alice/.data/chats/index.ttl')

    expect(nativeFetch).toHaveBeenCalledWith('http://192.168.1.10:5737/alice/.data/chats/index.ttl', undefined)
  })
})

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
