import { describe, expect, it, vi } from 'vitest'
import {
  buildRootNodes,
  listContainerEntries,
  readFileDetail,
} from './browser'

function createResponse(body: string, headers: Record<string, string>) {
  return new Response(body, {
    status: 200,
    headers,
  })
}

function createDb(overrides?: {
  listContainerResources?: (containerUrl: string) => Promise<string[]>
  fetch?: typeof fetch
}) {
  const authFetch = overrides?.fetch ?? (vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'GET' && url.endsWith('README.md')) {
      return createResponse('# LinX\n真实预览', {
        'content-type': 'text/markdown',
        'content-length': '17',
        'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
      })
    }

    return createResponse('', {
      'content-type': url.endsWith('/') ? 'text/turtle' : 'text/markdown',
      'content-length': url.endsWith('/') ? '0' : '17',
      'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
    })
  })) as typeof fetch

  return {
    getDialect: () => ({
      getPodUrl: () => 'https://pod.example/',
      getAuthenticatedFetch: () => authFetch,
      listContainerResources: overrides?.listContainerResources ?? (async (containerUrl: string) => {
        if (containerUrl === 'https://pod.example/public/') {
          return [
            'https://pod.example/public/docs/',
            'https://pod.example/public/README.md',
          ]
        }
        if (containerUrl === 'https://pod.example/') {
          return [
            'https://pod.example/public/',
            'https://pod.example/private/',
          ]
        }
        if (containerUrl === 'https://pod.example/.data/workspaces/ws-1/') {
          return ['https://pod.example/.data/workspaces/ws-1/session.log']
        }
        return []
      }),
    }),
  } as any
}

describe('files browser', () => {
  it('lists container entries using real container resources and metadata', async () => {
    const db = createDb()

    const entries = await listContainerEntries(db, 'https://pod.example/public/', '当前话题')

    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({
      uri: 'https://pod.example/public/docs/',
      kind: 'container',
    })
    expect(entries[1]).toMatchObject({
      uri: 'https://pod.example/public/README.md',
      kind: 'resource',
      mimeType: 'text/markdown',
      sourceLabel: '当前话题',
    })
  })

  it('builds root nodes with current workspace and pod root', async () => {
    const db = createDb()

    const rootData = await buildRootNodes(db, 'https://pod.example/.data/workspaces/ws-1/')

    expect(rootData.podRootUri).toBe('https://pod.example/')
    expect(rootData.nodes).toEqual([
      expect.objectContaining({ id: 'all', count: 3 }),
      expect.objectContaining({
        id: 'workspace:https://pod.example/.data/workspaces/ws-1/',
        type: 'workspace',
        count: 1,
      }),
      expect.objectContaining({
        id: 'pod-root',
        type: 'container',
        count: 2,
      }),
    ])
  })

  it('reads text preview for a selected file', async () => {
    const db = createDb()

    const detail = await readFileDetail(db, 'https://pod.example/public/README.md')

    expect(detail.name).toBe('README.md')
    expect(detail.previewText).toContain('真实预览')
    expect(detail.parentUri).toBe('https://pod.example/public/')
  })

  it('returns user-facing preview errors without transport details', async () => {
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'GET' && url.endsWith('README.md')) {
          return new Response('Internal Server Error', { status: 500 })
        }

        return createResponse('', {
          'content-type': 'text/markdown',
          'content-length': '17',
          'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
        })
      }) as typeof fetch,
    })

    const detail = await readFileDetail(db, 'https://pod.example/public/README.md')

    expect(detail.previewUnavailableReason).toBe('预览加载失败。请检查网络后重试，或直接打开文件。')
    expect(detail.previewUnavailableReason).not.toMatch(/HTTP|500|https?:\/\//i)
  })
})
