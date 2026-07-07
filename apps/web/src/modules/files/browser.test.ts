import { describe, expect, it, vi } from 'vitest'
import {
  buildRootNodes,
  classifyFilesEntry,
  getFilesResourceActions,
  getFilesEntryOpenMode,
  listAllBrowsableEntries,
  listContainerEntries,
  parseTreeNodeId,
  readFileDetail,
  readFilesAccessBasics,
  readFilesMetaSidecar,
  readStructuredViewMetadata,
  readBlobResource,
  readRawTextResource,
  probeFilesAccessSource,
  resolveFilesResourceSidecars,
  resolveFilesSidecarPlacement,
  resolveStructuredSubjectContainingResourceUri,
  resolveStructuredSubjectResourceUri,
  copyFileResource,
  createBlobResource,
  createFolderResource,
  createRawTextResource,
  deleteFileResource,
  moveFileResource,
  saveStructuredViewMetadata,
  saveRawTextResource,
  summarizeWacAclPolicy,
  FilesSaveConflictError,
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
      semanticKind: 'container',
      mimeType: 'inode/container',
    })
    expect(entries[1]).toMatchObject({
      uri: 'https://pod.example/public/README.md',
      kind: 'resource',
      semanticKind: 'file',
      mimeType: 'text/markdown',
      sourceLabel: '当前话题',
    })
  })

  it('lists all browsable entries recursively only when requested', async () => {
    const db = createDb({
      listContainerResources: async (containerUrl: string) => {
        if (containerUrl === 'https://pod.example/') {
          return [
            'https://pod.example/public/',
            'https://pod.example/README.md',
          ]
        }
        if (containerUrl === 'https://pod.example/public/') {
          return [
            'https://pod.example/public/docs/',
            'https://pod.example/public/local.md',
          ]
        }
        if (containerUrl === 'https://pod.example/public/docs/') {
          return ['https://pod.example/public/docs/deep.md']
        }
        return []
      },
    })

    const shallowEntries = await listAllBrowsableEntries(db, 'https://pod.example/public/')
    const recursiveEntries = await listAllBrowsableEntries(db, 'https://pod.example/public/', { recursive: true })

    expect(shallowEntries.map((entry) => entry.uri)).toEqual([
      'https://pod.example/public/docs/',
      'https://pod.example/public/',
      'https://pod.example/public/local.md',
      'https://pod.example/README.md',
    ])
    expect(recursiveEntries.map((entry) => entry.uri)).toEqual([
      'https://pod.example/public/docs/',
      'https://pod.example/public/',
      'https://pod.example/public/docs/deep.md',
      'https://pod.example/public/local.md',
      'https://pod.example/README.md',
    ])
    expect(recursiveEntries.find((entry) => entry.uri === 'https://pod.example/public/docs/deep.md')).toMatchObject({
      parentUri: 'https://pod.example/public/docs/',
      sourceLabel: '当前话题',
    })
  })

  it('keeps container entries visible when one child metadata read fails', async () => {
    const db = createDb({
      listContainerResources: async (containerUrl: string) => {
        if (containerUrl === 'https://pod.example/public/') {
          return [
            'https://pod.example/public/docs/',
            'https://pod.example/public/private.md',
            'https://pod.example/public/README.md',
          ]
        }
        return []
      },
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'HEAD' && url.endsWith('/private.md')) {
          throw new Error('Forbidden')
        }

        return createResponse('', {
          'content-type': url.endsWith('/') ? 'text/turtle' : 'text/markdown',
          'content-length': url.endsWith('/') ? '0' : '17',
          'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
        })
      }) as typeof fetch,
    })

    const entries = await listContainerEntries(db, 'https://pod.example/public/')

    expect(entries.map((entry) => entry.uri)).toEqual([
      'https://pod.example/public/docs/',
      'https://pod.example/public/private.md',
      'https://pod.example/public/README.md',
    ])
    expect(entries.find((entry) => entry.uri.endsWith('/private.md'))).toMatchObject({
      name: 'private.md',
      kind: 'resource',
      mimeType: 'text/markdown',
      size: null,
      modifiedAt: null,
      metadataState: 'unavailable',
    })
  })

  it('keeps permission metadata failures explicit on container entries', async () => {
    const db = createDb({
      listContainerResources: async (containerUrl: string) => {
        if (containerUrl === 'https://pod.example/public/') {
          return ['https://pod.example/public/private.md']
        }
        return []
      },
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'HEAD' && url.endsWith('/private.md')) {
          return new Response('', { status: 403 })
        }

        return createResponse('', {
          'content-type': 'text/markdown',
        })
      }) as typeof fetch,
    })

    const entries = await listContainerEntries(db, 'https://pod.example/public/')

    expect(entries[0]).toMatchObject({
      uri: 'https://pod.example/public/private.md',
      metadataState: 'unavailable',
      metadataErrorKind: 'forbidden',
    })
  })

  it('keeps .meta and access policy sidecars out of browsable container entries and counts', async () => {
    const db = createDb({
      listContainerResources: async (containerUrl: string) => {
        if (containerUrl === 'https://pod.example/public/') {
          return [
            'https://pod.example/public/docs/',
            'https://pod.example/public/docs/.meta',
            'https://pod.example/public/.meta/',
            'https://pod.example/public/docs/.acr',
            'https://pod.example/public/.acr/',
            'https://pod.example/public/.acr/policy.ttl',
            'https://pod.example/public/.acl/',
            'https://pod.example/public/.acl/policy.ttl',
            'https://pod.example/public/README.md',
            'https://pod.example/public/README.md.meta',
            'https://pod.example/public/README.md.acl',
          ]
        }
        if (containerUrl === 'https://pod.example/') {
          return [
            'https://pod.example/public/',
            'https://pod.example/.meta',
            'https://pod.example/.meta/',
            'https://pod.example/.acr',
            'https://pod.example/.acr/',
            'https://pod.example/.acl/',
          ]
        }
        return []
      },
    })

    const entries = await listContainerEntries(db, 'https://pod.example/public/')

    expect(entries.map((entry) => entry.uri)).toEqual([
      'https://pod.example/public/docs/',
      'https://pod.example/public/README.md',
    ])
    expect(entries.map((entry) => entry.semanticKind)).not.toContain('meta-sidecar')
    expect(entries.map((entry) => entry.semanticKind)).not.toContain('access-policy-sidecar')

    const detail = await readFileDetail(db, 'https://pod.example/public/')
    expect(detail.childEntries?.map((entry) => entry.uri)).toEqual([
      'https://pod.example/public/docs/',
      'https://pod.example/public/README.md',
    ])

    const rootData = await buildRootNodes(db, 'https://pod.example/public/')
    expect(rootData.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'all', count: 3 }),
      expect.objectContaining({ id: 'smart-root:recent', label: '最近文件', type: 'recent' }),
      expect.objectContaining({ id: 'workspace:https://pod.example/public/', count: 2 }),
      expect.objectContaining({ id: 'pod-root', count: 1 }),
      expect.objectContaining({ id: 'smart-root:agents' }),
      expect.objectContaining({ id: 'smart-root:workspaces' }),
      expect.objectContaining({ id: 'smart-root:repositories' }),
    ]))
  })

  it('classifies .data, .vocab, .meta, and access sidecars', () => {
    const root = 'https://pod.example/'

    expect(classifyFilesEntry('https://pod.example/.data/workspaces/ws-1/state.ttl', false, root)).toBe('structured-data')
    expect(classifyFilesEntry('https://pod.example/.vocab/terms.ttl', false, root)).toBe('vocab-terms')
    expect(classifyFilesEntry('https://pod.example/.vocab/shapes.ttl', false, root)).toBe('vocab-shapes')
    expect(classifyFilesEntry('https://pod.example/.vocab/namespaces.ttl', false, root)).toBe('vocab-namespaces')
    expect(classifyFilesEntry('https://pod.example/.vocab/domain.ttl', false, root)).toBe('structured-data')
    expect(classifyFilesEntry('https://pod.example/.vocab/archive/terms-2026.ttl', false, root)).toBe('structured-data')
    expect(classifyFilesEntry('https://pod.example/.data/workspaces/ws-1/cards/report.card.ttl', false, root)).toBe('source-linked-card')
    expect(classifyFilesEntry('https://pod.example/public/reports/report.card.ttl', false, root)).toBe('source-linked-card')
    expect(classifyFilesEntry('https://pod.example/public/report.md.meta', false, root)).toBe('meta-sidecar')
    expect(classifyFilesEntry('https://pod.example/.meta/', true, root)).toBe('meta-sidecar')
    expect(classifyFilesEntry('https://pod.example/.meta/readme.ttl', false, root)).toBe('meta-sidecar')
    expect(classifyFilesEntry('https://pod.example/public/.meta/', true, root)).toBe('meta-sidecar')
    expect(classifyFilesEntry('https://pod.example/public/.meta/readme.ttl', false, root)).toBe('meta-sidecar')
    expect(classifyFilesEntry('https://pod.example/public/.acr', false, root)).toBe('access-policy-sidecar')
    expect(classifyFilesEntry('https://pod.example/.acr/', true, root)).toBe('access-policy-sidecar')
    expect(classifyFilesEntry('https://pod.example/.acr/policy.ttl', false, root)).toBe('access-policy-sidecar')
    expect(classifyFilesEntry('https://pod.example/public/.acr/', true, root)).toBe('access-policy-sidecar')
    expect(classifyFilesEntry('https://pod.example/public/.acr/policy.ttl', false, root)).toBe('access-policy-sidecar')
    expect(classifyFilesEntry('https://pod.example/.acl/', true, root)).toBe('access-policy-sidecar')
    expect(classifyFilesEntry('https://pod.example/.acl/policy.ttl', false, root)).toBe('access-policy-sidecar')
    expect(classifyFilesEntry('https://pod.example/public/.acl/', true, root)).toBe('access-policy-sidecar')
    expect(classifyFilesEntry('https://pod.example/public/.acl/policy.ttl', false, root)).toBe('access-policy-sidecar')
    expect(classifyFilesEntry('https://pod.example/public/graph.ttl', false, root)).toBe('structured-data')
    expect(classifyFilesEntry('https://pod.example/public/schema.jsonld', false, root)).toBe('structured-data')
  })

  it('parses recent files smart root', () => {
    expect(parseTreeNodeId('smart-root:recent')).toEqual({ kind: 'recent' })
  })

  it('uses fetched RDF content type to classify extensionless data and generic vocab resources', async () => {
    const db = createDb({
      listContainerResources: async (containerUrl: string) => {
        if (containerUrl === 'https://pod.example/.data/workspaces/ws-1/') {
          return ['https://pod.example/.data/workspaces/ws-1/state']
        }
        if (containerUrl === 'https://pod.example/.vocab/') {
          return ['https://pod.example/.vocab/domain']
        }
        return []
      },
      fetch: vi.fn(async () => createResponse('@prefix udfs: <https://undefineds.co/vocab/> .', {
        'content-type': 'text/turtle',
        'content-length': '45',
        'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
      })) as typeof fetch,
    })

    const dataEntries = await listContainerEntries(db, 'https://pod.example/.data/workspaces/ws-1/')
    const vocabEntries = await listContainerEntries(db, 'https://pod.example/.vocab/')
    const detail = await readFileDetail(db, 'https://pod.example/.data/workspaces/ws-1/state')

    expect(dataEntries[0]).toMatchObject({
      uri: 'https://pod.example/.data/workspaces/ws-1/state',
      semanticKind: 'structured-data',
      mimeType: 'text/turtle',
    })
    expect(vocabEntries[0]).toMatchObject({
      uri: 'https://pod.example/.vocab/domain',
      semanticKind: 'structured-data',
      mimeType: 'text/turtle',
    })
    expect(detail.semanticKind).toBe('structured-data')
  })

  it('derives open modes from file semantics', () => {
    expect(getFilesEntryOpenMode({ kind: 'container', semanticKind: 'container', mimeType: 'inode/container' })).toBe('browse-container')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'structured-data', mimeType: 'text/turtle' })).toBe('structured-data-table')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'vocab-terms', mimeType: 'text/turtle' })).toBe('locked-vocab-table')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'vocab-shapes', mimeType: 'text/turtle' })).toBe('locked-vocab-table')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'vocab-namespaces', mimeType: 'text/turtle' })).toBe('locked-vocab-table')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'source-linked-card', mimeType: 'text/turtle' })).toBe('source-linked-card-preview')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'meta-sidecar', mimeType: 'text/turtle' })).toBe('sidecar-detail')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'access-policy-sidecar', mimeType: 'text/turtle' })).toBe('sidecar-detail')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'file', mimeType: 'text/markdown' })).toBe('editable-file-sheet')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'file', mimeType: 'text/plain' })).toBe('editable-file-sheet')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'file', mimeType: 'text/html' })).toBe('editable-file-sheet')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'file', mimeType: 'text/css' })).toBe('editable-file-sheet')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'file', mimeType: 'text/csv' })).toBe('editable-file-sheet')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'file', mimeType: 'application/json' })).toBe('editable-file-sheet')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'file', mimeType: 'application/javascript' })).toBe('editable-file-sheet')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'file', mimeType: 'application/yaml' })).toBe('editable-file-sheet')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'file', mimeType: 'application/ld+json' })).toBe('structured-data-table')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'file', mimeType: 'application/rdf+xml' })).toBe('structured-data-table')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'file', mimeType: 'text/turtle' })).toBe('structured-data-table')
    expect(getFilesEntryOpenMode({ kind: 'resource', semanticKind: 'file', mimeType: 'image/png' })).toBe('readonly-preview')
  })

  it('derives resource actions from file semantics and host capabilities', () => {
    expect(getFilesResourceActions({
      uri: 'https://pod.example/public/README.md',
      name: 'README.md',
      kind: 'resource',
      semanticKind: 'file',
      mimeType: 'text/markdown',
    })).toEqual([
      {
        id: 'download',
        label: '下载',
        href: 'https://pod.example/public/README.md',
        downloadName: 'README.md',
      },
    ])

    expect(getFilesResourceActions({
      uri: 'https://pod.example/public/',
      name: 'public',
      kind: 'container',
      semanticKind: 'container',
      mimeType: 'inode/container',
    })).toEqual([])

    expect(getFilesResourceActions({
      uri: 'https://pod.example/public/README.md',
      name: 'README.md',
      kind: 'resource',
      semanticKind: 'file',
      mimeType: 'text/markdown',
    }, { systemOpen: true })).toEqual([
      {
        id: 'download',
        label: '下载',
        href: 'https://pod.example/public/README.md',
        downloadName: 'README.md',
      },
      {
        id: 'system-open',
        label: '系统打开',
        href: 'https://pod.example/public/README.md',
      },
    ])
  })

  it('resolves sidecar ownership for file and container sidecars', () => {
    expect(resolveFilesSidecarPlacement({
      uri: 'https://pod.example/public/report.md.meta',
      semanticKind: 'meta-sidecar',
    })).toEqual({
      kind: 'meta',
      sidecarUri: 'https://pod.example/public/report.md.meta',
      ownerUri: 'https://pod.example/public/report.md',
      provider: undefined,
    })

    expect(resolveFilesSidecarPlacement({
      uri: 'https://pod.example/public/.acr',
      semanticKind: 'access-policy-sidecar',
    })).toEqual({
      kind: 'access-policy',
      sidecarUri: 'https://pod.example/public/.acr',
      ownerUri: 'https://pod.example/public/',
      provider: 'acr',
    })
  })

  it('resolves resource-level sidecar candidates for files and containers', () => {
    expect(resolveFilesResourceSidecars({
      uri: 'https://pod.example/public/report.md',
      kind: 'resource',
    })).toEqual({
      ownerUri: 'https://pod.example/public/report.md',
      metaUri: 'https://pod.example/public/report.md.meta',
      accessPolicyUris: {
        acr: 'https://pod.example/public/report.md.acr',
        acl: 'https://pod.example/public/report.md.acl',
      },
    })

    expect(resolveFilesResourceSidecars({
      uri: 'https://pod.example/public',
      kind: 'container',
    })).toEqual({
      ownerUri: 'https://pod.example/public/',
      metaUri: 'https://pod.example/public/.meta',
      accessPolicyUris: {
        acr: 'https://pod.example/public/.acr',
        acl: 'https://pod.example/public/.acl',
      },
    })
  })

  it('probes access policy candidates without treating paths as active policy', async () => {
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.endsWith('.acr')) return new Response('', { status: 404 })
        if (url.endsWith('.acl')) return new Response('', { status: 403 })
        return new Response('', { status: 200 })
      }) as typeof fetch,
    })

    await expect(probeFilesAccessSource(db, 'https://pod.example/public/README.md.acr')).resolves.toEqual({
      uri: 'https://pod.example/public/README.md.acr',
      state: 'missing',
      status: 404,
    })
    await expect(probeFilesAccessSource(db, 'https://pod.example/public/README.md.acl')).resolves.toEqual({
      uri: 'https://pod.example/public/README.md.acl',
      state: 'inaccessible',
      status: 403,
    })
  })

  it('reads meta sidecar content with explicit sidecar state', async () => {
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === 'https://pod.example/public/README.md.meta') {
          return new Response('<#meta> <#summary> "File metadata" .', {
            status: 200,
            headers: {
              'Content-Type': 'text/turtle',
              ETag: '"meta-1"',
            },
          })
        }
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    await expect(readFilesMetaSidecar(db, {
      uri: 'https://pod.example/public/README.md',
      kind: 'resource',
    })).resolves.toEqual({
      ownerUri: 'https://pod.example/public/README.md',
      metaUri: 'https://pod.example/public/README.md.meta',
      state: 'exists',
      status: 200,
      content: '<#meta> <#summary> "File metadata" .',
      mimeType: 'text/turtle',
      etag: '"meta-1"',
      size: 36,
    })
  })

  it('discovers linked meta sidecars from owner Link headers when the path sidecar is missing', async () => {
    const calls: string[] = []
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push(`${init?.method ?? 'GET'} ${url}`)
        if (url === 'https://pod.example/public/README.md' && init?.method === 'HEAD') {
          return new Response('', {
            status: 200,
            headers: {
              Link: '<https://pod.example/.meta/readme.ttl>; rel="describedby"',
            },
          })
        }
        if (url === 'https://pod.example/.meta/readme.ttl') {
          return new Response('<#meta> <#summary> "Linked metadata" .', {
            status: 200,
            headers: {
              'Content-Type': 'text/turtle',
              ETag: '"linked-meta-1"',
            },
          })
        }
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    await expect(readFilesMetaSidecar(db, {
      uri: 'https://pod.example/public/README.md',
      kind: 'resource',
    })).resolves.toEqual({
      ownerUri: 'https://pod.example/public/README.md',
      metaUri: 'https://pod.example/.meta/readme.ttl',
      state: 'exists',
      status: 200,
      content: '<#meta> <#summary> "Linked metadata" .',
      mimeType: 'text/turtle',
      etag: '"linked-meta-1"',
      size: 38,
    })
    expect(calls).toEqual([
      'GET https://pod.example/public/README.md.meta',
      'HEAD https://pod.example/public/README.md',
      'GET https://pod.example/.meta/readme.ttl',
    ])
  })

  it('accepts metadata link relations for non-conventional meta sidecars', async () => {
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === 'https://pod.example/public/.meta') return new Response('', { status: 404 })
        if (url === 'https://pod.example/public/' && init?.method === 'HEAD') {
          return new Response('', {
            status: 200,
            headers: {
              Link: '<metadata/container.ttl>; rel="metadata"',
            },
          })
        }
        if (url === 'https://pod.example/public/metadata/container.ttl') {
          return new Response('<#meta> <#summary> "Container metadata" .', {
            status: 200,
            headers: { 'Content-Type': 'text/turtle' },
          })
        }
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    await expect(readFilesMetaSidecar(db, {
      uri: 'https://pod.example/public/',
      kind: 'container',
    })).resolves.toMatchObject({
      ownerUri: 'https://pod.example/public/',
      metaUri: 'https://pod.example/public/metadata/container.ttl',
      state: 'exists',
      content: '<#meta> <#summary> "Container metadata" .',
      mimeType: 'text/turtle',
    })
  })

  it('ignores cross-origin linked metadata sidecars from owner Link headers', async () => {
    const calls: string[] = []
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push(`${init?.method ?? 'GET'} ${url}`)
        if (url === 'https://pod.example/public/README.md.meta') {
          return new Response('', { status: 404 })
        }
        if (url === 'https://pod.example/public/README.md' && init?.method === 'HEAD') {
          return new Response('', {
            status: 200,
            headers: {
              Link: '<https://metadata.example/readme.ttl>; rel="describedby"',
            },
          })
        }
        if (url === 'https://metadata.example/readme.ttl') {
          return new Response('<#meta> <#summary> "External metadata" .', {
            status: 200,
            headers: { 'Content-Type': 'text/turtle' },
          })
        }
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    await expect(readFilesMetaSidecar(db, {
      uri: 'https://pod.example/public/README.md',
      kind: 'resource',
    })).resolves.toMatchObject({
      ownerUri: 'https://pod.example/public/README.md',
      metaUri: 'https://pod.example/public/README.md.meta',
      state: 'missing',
      status: 404,
      content: null,
    })
    expect(calls).toEqual([
      'GET https://pod.example/public/README.md.meta',
      'HEAD https://pod.example/public/README.md',
    ])
  })

  it('reads structured view metadata from an app meta sidecar', async () => {
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === 'https://pod.example/.data/files/files.ttl.meta') {
          return new Response([
            '@prefix udfs: <https://undefineds.co/vocab/> .',
            '',
            '<#view> a udfs:StructuredViewMetadata ;',
            '  udfs:document <https://pod.example/.data/files/files.ttl> ;',
            '  udfs:viewMode "kanban" ;',
            '  udfs:classScope <https://pod.example/.vocab/terms.ttl#FileResource> ;',
            '  udfs:kanbanGroupPredicate <https://pod.example/.vocab/terms.ttl#mode> ;',
            '  udfs:selectedSubject "#FileResource" ;',
            '  udfs:writesCanonicalData false .',
          ].join('\n'), {
            status: 200,
            headers: { 'Content-Type': 'text/turtle', ETag: '"meta-view-1"' },
          })
        }
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    await expect(readStructuredViewMetadata(db, {
      uri: 'https://pod.example/.data/files/files.ttl',
      kind: 'resource',
    })).resolves.toMatchObject({
      state: 'exists',
      metaUri: 'https://pod.example/.data/files/files.ttl.meta',
      etag: '"meta-view-1"',
      metadata: {
        documentUri: 'https://pod.example/.data/files/files.ttl',
        viewMode: 'kanban',
        classScope: 'https://pod.example/.vocab/terms.ttl#FileResource',
        kanbanGroupPredicate: 'https://pod.example/.vocab/terms.ttl#mode',
        whiteboard: {
          selectedSubjects: ['#FileResource'],
          positions: {},
        },
      },
    })
  })

  it('saves structured view metadata by patching only the view triples in meta sidecar', async () => {
    const saved: Array<{ url: string; init: RequestInit }> = []
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'PATCH') {
          saved.push({ url, init })
          return new Response(null, { status: 204, headers: { ETag: '"meta-view-2"' } })
        }
        if (url === 'https://pod.example/.data/files/files.ttl.meta') {
          return new Response([
            '@prefix ex: <https://example.com/> .',
            '@prefix udfs: <https://undefineds.co/vocab/> .',
            '',
            '<#owner> ex:note "Keep this unrelated metadata" .',
            '<#view> a udfs:StructuredViewMetadata ;',
            '  udfs:document <https://pod.example/.data/files/files.ttl> ;',
            '  udfs:viewMode "table" ;',
            '  udfs:writesCanonicalData false .',
          ].join('\n'), {
            status: 200,
            headers: { 'Content-Type': 'text/turtle', ETag: '"meta-view-1"' },
          })
        }
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    await expect(saveStructuredViewMetadata(db, {
      uri: 'https://pod.example/.data/files/files.ttl',
      kind: 'resource',
    }, {
      documentUri: 'https://pod.example/.data/files/files.ttl',
      viewMode: 'whiteboard',
      classScope: 'https://pod.example/.vocab/terms.ttl#FileResource',
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: null,
      columnSizing: { subject: 144 },
      whiteboard: {
        selectedSubjects: ['#FileResource'],
        positions: { '#FileResource': { x: 24, y: 40 } },
        visualRelations: [
          {
            id: 'visual-file-folder',
            from: '#FileResource',
            to: '#FolderResource',
            label: 'sketch link',
          },
        ],
      },
    })).resolves.toMatchObject({
      state: 'exists',
      etag: '"meta-view-2"',
    })

    expect(saved).toHaveLength(1)
    expect(saved[0].url).toBe('https://pod.example/.data/files/files.ttl.meta')
    expect(saved[0].init.headers).toEqual({
      'Content-Type': 'application/sparql-update',
      'If-Match': '"meta-view-1"',
    })
    expect(saved[0].init.body).toContain('DELETE {')
    expect(saved[0].init.body).toContain('<#view> ?predicate ?object .')
    expect(saved[0].init.body).toContain('?object ?nestedPredicate ?nestedObject .')
    expect(saved[0].init.body).toContain('FILTER(isBlank(?object))')
    expect(saved[0].init.body).toContain('INSERT DATA')
    expect(saved[0].init.body).toContain('udfs:viewMode "whiteboard"')
    expect(saved[0].init.body).toContain('udfs:selectedSubject "#FileResource"')
    expect(saved[0].init.body).toContain('udfs:whiteboardVisualRelation [ udfs:id "visual-file-folder" ; udfs:fromSubject "#FileResource" ; udfs:toSubject "#FolderResource" ; udfs:label "sketch link" ]')
    expect(saved[0].init.body).not.toContain('<#owner> ex:note')
    expect(saved[0].init.body).not.toContain('udfs:viewMode "table"')
  })

  it('does not patch linked metadata resources when saving structured view metadata', async () => {
    const saved: Array<{ url: string; init: RequestInit }> = []
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'PATCH') {
          saved.push({ url, init })
          return new Response(null, { status: 201, headers: { ETag: '"path-meta-new-1"' } })
        }
        if (url === 'https://pod.example/.data/files/files.ttl.meta') {
          return new Response('', { status: 404 })
        }
        if (url === 'https://pod.example/.data/files/files.ttl' && init?.method === 'HEAD') {
          return new Response('', {
            status: 200,
            headers: {
              Link: '<https://pod.example/.meta/readonly-files.ttl>; rel="describedby"',
            },
          })
        }
        if (url === 'https://pod.example/.meta/readonly-files.ttl') {
          return new Response('<#view> a <https://undefineds.co/vocab/StructuredViewMetadata> .', {
            status: 200,
            headers: { 'Content-Type': 'text/turtle', ETag: '"linked-meta-1"' },
          })
        }
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    await expect(saveStructuredViewMetadata(db, {
      uri: 'https://pod.example/.data/files/files.ttl',
      kind: 'resource',
    }, {
      documentUri: 'https://pod.example/.data/files/files.ttl',
      viewMode: 'table',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: null,
      columnSizing: {},
      whiteboard: {
        selectedSubjects: [],
        positions: {},
        visualRelations: [],
      },
      writesCanonicalData: false,
    })).resolves.toMatchObject({
      state: 'exists',
      metaUri: 'https://pod.example/.data/files/files.ttl.meta',
      etag: '"path-meta-new-1"',
    })

    expect(saved).toHaveLength(1)
    expect(saved[0].url).toBe('https://pod.example/.data/files/files.ttl.meta')
    expect(saved[0].init.headers).toEqual({
      'Content-Type': 'application/sparql-update',
      'If-None-Match': '*',
    })
  })

  it('creates a missing meta sidecar when saving structured view metadata through metadata patch', async () => {
    const saved: Array<{ url: string; init: RequestInit }> = []
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'PATCH') {
          saved.push({ url, init })
          return new Response(null, { status: 201, headers: { ETag: '"meta-view-new-1"' } })
        }
        if (url === 'https://pod.example/.data/files/files.ttl.meta') return new Response('', { status: 404 })
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    await expect(saveStructuredViewMetadata(db, {
      uri: 'https://pod.example/.data/files/files.ttl',
      kind: 'resource',
    }, {
      documentUri: 'https://pod.example/.data/files/files.ttl',
      viewMode: 'kanban',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: 'mode',
      columnSizing: {},
      whiteboard: {
        selectedSubjects: [],
        positions: {},
      },
    })).resolves.toMatchObject({
      state: 'exists',
      etag: '"meta-view-new-1"',
      metadata: {
        viewMode: 'kanban',
        kanbanGroupPredicate: 'mode',
      },
    })

    expect(saved).toHaveLength(1)
    expect(saved[0].url).toBe('https://pod.example/.data/files/files.ttl.meta')
    expect(saved[0].init.headers).toEqual({
      'Content-Type': 'application/sparql-update',
      'If-None-Match': '*',
    })
    expect(saved[0].init.body).toContain('<#view> a udfs:StructuredViewMetadata')
    expect(saved[0].init.body).toContain('udfs:writesCanonicalData false')
  })

  it('does not create a centralized .meta container before creating structured view metadata', async () => {
    const calls: Array<{ url: string; method: string }> = []
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        calls.push({ url, method })
        if (url === 'https://pod.example/.data/files/files.ttl.meta' && method === 'GET') {
          return new Response('', { status: 404 })
        }
        if (url === 'https://pod.example/' && method === 'POST') {
          throw new Error('must not create a centralized .meta container')
        }
        if (url === 'https://pod.example/.data/files/files.ttl.meta' && method === 'PATCH') {
          return new Response(null, { status: 201, headers: { ETag: '"meta-view-new-1"' } })
        }
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    await expect(saveStructuredViewMetadata(db, {
      uri: 'https://pod.example/.data/files/files.ttl',
      kind: 'resource',
    }, {
      documentUri: 'https://pod.example/.data/files/files.ttl',
      viewMode: 'table',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: null,
      columnSizing: {},
      whiteboard: {
        selectedSubjects: [],
        positions: {},
      },
    })).resolves.toMatchObject({
      state: 'exists',
      metaUri: 'https://pod.example/.data/files/files.ttl.meta',
    })

    expect(calls).toEqual([
      { url: 'https://pod.example/.data/files/files.ttl.meta', method: 'GET' },
      { url: 'https://pod.example/.data/files/files.ttl.meta', method: 'PATCH' },
    ])
  })

  it('patches existing metadata resources even when the Pod omits a meta ETag', async () => {
    const saved: Array<{ url: string; init: RequestInit }> = []
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'PATCH') {
          saved.push({ url, init })
          return new Response(null, { status: 204 })
        }
        if (url === 'https://pod.example/.data/files/files.ttl.meta') {
          return new Response([
            '@prefix udfs: <https://undefineds.co/vocab/> .',
            '<files.ttl> a <http://www.w3.org/ns/ldp#Resource> .',
          ].join('\n'), {
            status: 200,
            headers: { 'Content-Type': 'text/turtle' },
          })
        }
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    await expect(saveStructuredViewMetadata(db, {
      uri: 'https://pod.example/.data/files/files.ttl',
      kind: 'resource',
    }, {
      documentUri: 'https://pod.example/.data/files/files.ttl',
      viewMode: 'kanban',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: 'mode',
      columnSizing: {},
      whiteboard: {
        selectedSubjects: [],
        positions: {},
      },
    })).resolves.toMatchObject({
      state: 'exists',
      metadata: {
        viewMode: 'kanban',
      },
    })

    expect(saved).toHaveLength(1)
    expect(saved[0].init.headers).toEqual({
      'Content-Type': 'application/sparql-update',
    })
    expect(saved[0].init.body).toContain('udfs:viewMode "kanban"')
  })

  it('falls back to a BGP-only metadata PATCH when structured view metadata PATCH is unsupported', async () => {
    const saved: Array<{ url: string; init: RequestInit }> = []
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'PATCH') {
          saved.push({ url, init })
          if (saved.length > 1) {
            return new Response(null, { status: 204, headers: { ETag: '"meta-view-bgp-2"' } })
          }
          return new Response(JSON.stringify({
            name: 'NotImplementedHttpError',
            message: 'Non-BGP WHERE statements are not supported',
          }), {
            status: 501,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (url === 'https://pod.example/.data/files/files.ttl.meta') {
          return new Response([
            '@prefix ex: <https://example.com/> .',
            '@prefix udfs: <https://undefineds.co/vocab/> .',
            '',
            '<#owner> ex:note "Keep this unrelated metadata" .',
            '<#view> a udfs:StructuredViewMetadata ;',
            '  udfs:document <https://pod.example/.data/files/files.ttl> ;',
            '  udfs:viewMode "table" ;',
            '  udfs:writesCanonicalData false .',
          ].join('\n'), {
            status: 200,
            headers: { 'Content-Type': 'text/turtle', ETag: '"meta-view-put-1"' },
          })
        }
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    await expect(saveStructuredViewMetadata(db, {
      uri: 'https://pod.example/.data/files/files.ttl',
      kind: 'resource',
    }, {
      documentUri: 'https://pod.example/.data/files/files.ttl',
      viewMode: 'kanban',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: 'mode',
      columnSizing: {},
      whiteboard: {
        selectedSubjects: [],
        positions: {},
      },
    })).resolves.toMatchObject({
      state: 'exists',
      etag: '"meta-view-bgp-2"',
      metadata: {
        viewMode: 'kanban',
        kanbanGroupPredicate: 'mode',
      },
    })

    expect(saved).toHaveLength(2)
    expect(saved[0].init.method).toBe('PATCH')
    expect(saved[0].init.body).toContain('OPTIONAL')
    expect(saved[1].url).toBe('https://pod.example/.data/files/files.ttl.meta')
    expect(saved[1].init.method).toBe('PATCH')
    expect(saved[1].init.headers).toEqual({
      'Content-Type': 'application/sparql-update',
      'If-Match': '"meta-view-put-1"',
    })
    expect(saved[1].init.body).toContain('<#view> ?predicate ?object .')
    expect(saved[1].init.body).not.toContain('OPTIONAL')
    expect(saved[1].init.body).not.toContain('FILTER')
    expect(saved[1].init.body).toContain('udfs:viewMode "kanban"')
    expect(saved[1].init.body).toContain('udfs:kanbanGroupPredicate "mode"')
    expect(saved[1].init.body).not.toContain('udfs:viewMode "table"')
  })

  it('does not full-PUT the meta sidecar when structured view metadata PATCH is unsupported', async () => {
    const saved: Array<{ url: string; method: string | undefined; body: unknown }> = []
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method) {
          saved.push({ url, method: init.method, body: init.body })
        }
        if (init?.method === 'PATCH') {
          return new Response(JSON.stringify({
            name: 'NotImplementedHttpError',
            message: 'PATCH is not supported by this Pod.',
          }), {
            status: 501,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        if (init?.method === 'PUT') {
          return new Response(null, { status: 204, headers: { ETag: '"meta-view-put-2"' } })
        }
        if (url === 'https://pod.example/.data/files/files.ttl.meta') {
          return new Response([
            '@prefix ex: <https://example.com/> .',
            '@prefix udfs: <https://undefineds.co/vocab/> .',
            '',
            '<#owner> ex:note "Keep this unrelated metadata" .',
            '<#view> a udfs:StructuredViewMetadata ;',
            '  udfs:document <https://pod.example/.data/files/files.ttl> ;',
            '  udfs:viewMode "table" ;',
            '  udfs:writesCanonicalData false .',
          ].join('\n'), {
            status: 200,
            headers: { 'Content-Type': 'text/turtle', ETag: '"meta-view-put-1"' },
          })
        }
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    await expect(saveStructuredViewMetadata(db, {
      uri: 'https://pod.example/.data/files/files.ttl',
      kind: 'resource',
    }, {
      documentUri: 'https://pod.example/.data/files/files.ttl',
      viewMode: 'whiteboard',
      classScope: null,
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: null,
      columnSizing: {},
      whiteboard: {
        selectedSubjects: ['#FileResource'],
        positions: { '#FileResource': { x: 24, y: 40 } },
      },
    })).rejects.toThrow('保存视图配置失败: HTTP 501')

    expect(saved.filter((call) => call.method === 'PATCH')).toHaveLength(2)
    expect(saved.some((call) => call.method === 'PUT')).toBe(false)
  })

  it('reports missing and inaccessible meta sidecars without reading owner metadata', async () => {
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === 'https://pod.example/public/.meta') return new Response('', { status: 403 })
        if (url === 'https://pod.example/public/README.md.meta') return new Response('', { status: 404 })
        return new Response('', { status: 200 })
      }) as typeof fetch,
    })

    await expect(readFilesMetaSidecar(db, {
      uri: 'https://pod.example/public/README.md',
      kind: 'resource',
    })).resolves.toMatchObject({
      ownerUri: 'https://pod.example/public/README.md',
      metaUri: 'https://pod.example/public/README.md.meta',
      state: 'missing',
      status: 404,
      content: null,
    })
    await expect(readFilesMetaSidecar(db, {
      uri: 'https://pod.example/public/',
      kind: 'container',
    })).resolves.toMatchObject({
      ownerUri: 'https://pod.example/public/',
      metaUri: 'https://pod.example/public/.meta',
      state: 'inaccessible',
      status: 403,
      content: null,
    })
  })

  it('reads owner access basics from Solid metadata and candidate source probes', async () => {
    const aclContent = [
      '@prefix acl: <http://www.w3.org/ns/auth/acl#> .',
      '@prefix foaf: <http://xmlns.com/foaf/0.1/> .',
      '<#publicRead> a acl:Authorization ;',
      '  acl:agentClass foaf:Agent ;',
      '  acl:mode acl:Read .',
      '<#authenticatedAppend> a acl:Authorization ;',
      '  acl:agentClass acl:AuthenticatedAgent ;',
      '  acl:mode acl:Read, acl:Append .',
      '<#agentWrite> a acl:Authorization ;',
      '  acl:agent <https://app.example/profile#me> ;',
      '  acl:mode acl:Read, acl:Write .',
    ].join('\n')
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url === 'https://pod.example/public/README.md') {
          return new Response('', {
            status: 200,
            headers: {
              Link: '<https://pod.example/public/README.md.acl>; rel="acl"',
              'WAC-Allow': 'user="read append write control",public="read"',
            },
          })
        }
        if (url.endsWith('.acr')) return new Response('', { status: 404 })
        if (url.endsWith('.acl') && init?.method === 'GET') return new Response(aclContent, { status: 200, headers: { 'Content-Type': 'text/turtle' } })
        if (url.endsWith('.acl')) return new Response('', { status: 200 })
        return new Response('', { status: 200 })
      }) as typeof fetch,
    })

    const access = await readFilesAccessBasics(db, {
      uri: 'https://pod.example/public/README.md',
      kind: 'resource',
    })

    expect(access.ownerUri).toBe('https://pod.example/public/README.md')
    expect(access.activeSource).toEqual({
      provider: 'acl',
      uri: 'https://pod.example/public/README.md.acl',
      confidence: 'linked',
      inheritance: 'direct',
    })
    expect(access.effectiveAccess).toEqual({
      user: { read: true, append: true, write: true, control: true },
      public: { read: true, append: false, write: false, control: false },
    })
    expect(access.candidates).toEqual([
      {
        provider: 'acr',
        uri: 'https://pod.example/public/README.md.acr',
        existence: { uri: 'https://pod.example/public/README.md.acr', state: 'missing', status: 404 },
      },
      {
        provider: 'acl',
        uri: 'https://pod.example/public/README.md.acl',
        existence: { uri: 'https://pod.example/public/README.md.acl', state: 'exists', status: 200 },
      },
    ])
    expect(access.policySummary).toMatchObject({
      uri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      state: 'exists',
    })
    expect(access.policySummary?.grants).toEqual(expect.arrayContaining([
        {
          audience: 'public',
          audienceRef: 'foaf:Agent',
          modes: { read: true, append: false, write: false, control: false },
        },
        {
          audience: 'authenticated',
          audienceRef: 'acl:AuthenticatedAgent',
          modes: { read: true, append: true, write: false, control: false },
        },
        {
          audience: 'agent',
          audienceRef: 'https://app.example/profile#me',
          modes: { read: true, append: false, write: true, control: false },
        },
    ]))
    expect(access.policySummary?.grants).toHaveLength(3)
  })

  it.each([
    ['returns 405', async () => new Response('', { status: 405 })],
    ['fails', async () => { throw new Error('HEAD not available') }],
  ])('falls back to GET owner access metadata when HEAD %s', async (_label, readOwnerHead) => {
    const calls: string[] = []
    const aclContent = [
      '@prefix acl: <http://www.w3.org/ns/auth/acl#> .',
      '@prefix foaf: <http://xmlns.com/foaf/0.1/> .',
      '<#publicRead> a acl:Authorization ;',
      '  acl:agentClass foaf:Agent ;',
      '  acl:mode acl:Read .',
    ].join('\n')
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        calls.push(`${init?.method ?? 'GET'} ${url}`)
        if (url === 'https://pod.example/public/README.md' && init?.method === 'HEAD') {
          return readOwnerHead()
        }
        if (url === 'https://pod.example/public/README.md' && init?.method === 'GET') {
          return new Response('owner body should not be consumed', {
            status: 200,
            headers: {
              Link: '<https://pod.example/public/README.md.acl>; rel="acl"',
              'WAC-Allow': 'user="read write control",public="read"',
            },
          })
        }
        if (url.endsWith('.acr')) return new Response('', { status: 404 })
        if (url.endsWith('.acl') && init?.method === 'GET') {
          return new Response(aclContent, {
            status: 200,
            headers: { 'Content-Type': 'text/turtle' },
          })
        }
        if (url.endsWith('.acl')) return new Response('', { status: 200 })
        return new Response('', { status: 404 })
      }) as typeof fetch,
    })

    const access = await readFilesAccessBasics(db, {
      uri: 'https://pod.example/public/README.md',
      kind: 'resource',
    })

    expect(access.activeSource).toEqual({
      provider: 'acl',
      uri: 'https://pod.example/public/README.md.acl',
      confidence: 'linked',
      inheritance: 'direct',
    })
    expect(access.effectiveAccess).toEqual({
      user: { read: true, append: false, write: true, control: true },
      public: { read: true, append: false, write: false, control: false },
    })
    expect(access.policySummary).toMatchObject({
      uri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      state: 'exists',
    })
    expect(access.candidates).toEqual([
      {
        provider: 'acr',
        uri: 'https://pod.example/public/README.md.acr',
        existence: { uri: 'https://pod.example/public/README.md.acr', state: 'missing', status: 404 },
      },
      {
        provider: 'acl',
        uri: 'https://pod.example/public/README.md.acl',
        existence: { uri: 'https://pod.example/public/README.md.acl', state: 'exists', status: 200 },
      },
    ])
    expect(calls).toContain('GET https://pod.example/public/README.md')
  })

  it('summarizes common WAC ACL Turtle grants without a new parser dependency', () => {
    expect(summarizeWacAclPolicy('https://pod.example/public/README.md.acl', [
      '@prefix acl: <http://www.w3.org/ns/auth/acl#> .',
      '@prefix foaf: <http://xmlns.com/foaf/0.1/> .',
      '<#owner> a acl:Authorization ;',
      '  acl:agent <https://alice.example/profile#me> ;',
      '  acl:mode acl:Read, acl:Write, acl:Control .',
      '<#public> a acl:Authorization ;',
      '  acl:agentClass foaf:Agent ;',
      '  acl:mode acl:Read .',
      '<#signedIn> a acl:Authorization ;',
      '  acl:agentClass acl:AuthenticatedAgent ;',
      '  acl:mode acl:Read, acl:Append .',
    ].join('\n'))).toMatchObject({
      uri: 'https://pod.example/public/README.md.acl',
      provider: 'acl',
      state: 'exists',
      grants: [
        {
          audience: 'agent',
          audienceRef: 'https://alice.example/profile#me',
          modes: { read: true, append: false, write: true, control: true },
        },
        {
          audience: 'public',
          audienceRef: 'foaf:Agent',
          modes: { read: true, append: false, write: false, control: false },
        },
        {
          audience: 'authenticated',
          audienceRef: 'acl:AuthenticatedAgent',
          modes: { read: true, append: true, write: false, control: false },
        },
      ],
    })
  })

  it('marks linked access sources outside the resource sidecar paths as inherited or candidate', async () => {
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === 'https://pod.example/public/docs/README.md') {
          return new Response('', {
            status: 200,
            headers: {
              Link: '<https://pod.example/public/.acl>; rel="acl"',
              'WAC-Allow': 'user="read",public=""',
            },
          })
        }
        if (url.endsWith('.acr')) return new Response('', { status: 404 })
        if (url.endsWith('.acl')) return new Response('', { status: 404 })
        return new Response('', { status: 200 })
      }) as typeof fetch,
    })

    const access = await readFilesAccessBasics(db, {
      uri: 'https://pod.example/public/docs/README.md',
      kind: 'resource',
    })

    expect(access.activeSource).toEqual({
      provider: 'acl',
      uri: 'https://pod.example/public/.acl',
      confidence: 'linked',
      inheritance: 'inherited-or-candidate',
    })
  })

  it('still probes access policy candidates when owner access metadata cannot be read', async () => {
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === 'https://pod.example/public/README.md') throw new Error('HEAD not available')
        if (url.endsWith('.acr')) return new Response('', { status: 404 })
        if (url.endsWith('.acl')) return new Response('', { status: 200 })
        return new Response('', { status: 200 })
      }) as typeof fetch,
    })

    await expect(readFilesAccessBasics(db, {
      uri: 'https://pod.example/public/README.md',
      kind: 'resource',
    })).resolves.toMatchObject({
      ownerUri: 'https://pod.example/public/README.md',
      activeSource: null,
      candidates: [
        {
          provider: 'acr',
          uri: 'https://pod.example/public/README.md.acr',
          existence: { uri: 'https://pod.example/public/README.md.acr', state: 'missing', status: 404 },
        },
        {
          provider: 'acl',
          uri: 'https://pod.example/public/README.md.acl',
          existence: { uri: 'https://pod.example/public/README.md.acl', state: 'exists', status: 200 },
        },
      ],
    })
  })

  it('resolves structured subject resources without auto-opening fragments', () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'

    expect(resolveStructuredSubjectResourceUri(documentUri, 'https://pod.example/public/report.md')).toBe('https://pod.example/public/report.md')
    expect(resolveStructuredSubjectResourceUri(documentUri, '../docs/report.md')).toBe('https://pod.example/.data/workspaces/docs/report.md')
    expect(resolveStructuredSubjectResourceUri(documentUri, '/public/report.md')).toBe('https://pod.example/public/report.md')
    expect(resolveStructuredSubjectResourceUri(documentUri, 'https://source.example/report.pdf')).toBeNull()
    expect(resolveStructuredSubjectResourceUri(documentUri, '#Workspace')).toBeNull()
    expect(resolveStructuredSubjectResourceUri(documentUri, 'terms:Workspace')).toBeNull()
    expect(resolveStructuredSubjectResourceUri(documentUri, 'https://pod.example/.vocab/terms.ttl#tags')).toBeNull()
  })

  it('resolves fragment subjects to their containing resource only for explicit peek actions', () => {
    const documentUri = 'https://pod.example/.data/workspaces/ws-1/state.ttl'

    expect(resolveStructuredSubjectContainingResourceUri(documentUri, '#Workspace')).toBe(documentUri)
    expect(resolveStructuredSubjectContainingResourceUri(documentUri, 'https://pod.example/.vocab/terms.ttl#tags')).toBe('https://pod.example/.vocab/terms.ttl')
    expect(resolveStructuredSubjectContainingResourceUri(documentUri, '../terms.ttl#tags')).toBe('https://pod.example/.data/workspaces/terms.ttl')
    expect(resolveStructuredSubjectContainingResourceUri(documentUri, 'terms:Workspace')).toBeNull()
    expect(resolveStructuredSubjectContainingResourceUri(documentUri, 'https://pod.example/public/report.md')).toBeNull()
    expect(resolveStructuredSubjectContainingResourceUri(documentUri, 'https://source.example/terms.ttl#External')).toBeNull()
  })

  it('builds root nodes with current workspace and pod root', async () => {
    const db = createDb()

    const rootData = await buildRootNodes(db, 'https://pod.example/.data/workspaces/ws-1/')

    expect(rootData.podRootUri).toBe('https://pod.example/')
    expect(rootData.nodes).toEqual([
      expect.objectContaining({ id: 'all', count: 3 }),
      expect.objectContaining({ id: 'smart-root:recent', type: 'recent', count: 5 }),
      expect.objectContaining({
        id: 'workspace:https://pod.example/.data/workspaces/ws-1/',
        type: 'workspace',
        count: 1,
      }),
      expect.objectContaining({
        id: 'smart-root:agents',
        label: 'Agent homes',
        type: 'agents-root',
        uri: 'https://pod.example/.data/agents/',
      }),
      expect.objectContaining({
        id: 'smart-root:workspaces',
        label: 'Workspaces',
        type: 'workspaces-root',
        uri: 'https://pod.example/.data/workspaces/',
      }),
      expect.objectContaining({
        id: 'smart-root:repositories',
        label: 'Repositories',
        type: 'repositories-root',
        uri: 'https://pod.example/.data/repositories/',
      }),
      expect.objectContaining({
        id: 'pod-root',
        type: 'container',
        count: 2,
      }),
    ])
  })

  it('counts modified resources and containers in the recent files smart root', async () => {
    const db = createDb({
      listContainerResources: async (containerUrl: string) => {
        if (containerUrl === 'https://pod.example/') {
          return [
            'https://pod.example/public/',
            'https://pod.example/README.md',
            'https://pod.example/README.md.meta',
            'https://pod.example/no-date.md',
          ]
        }
        if (containerUrl === 'https://pod.example/public/') {
          return [
            'https://pod.example/public/docs/',
            'https://pod.example/public/new.md',
          ]
        }
        if (containerUrl === 'https://pod.example/public/docs/') {
          return [
            'https://pod.example/public/docs/deep.md',
          ]
        }
        return []
      },
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'HEAD' && url.endsWith('/no-date.md')) {
          return createResponse('', {
            'content-type': 'text/markdown',
            'content-length': '17',
          })
        }
        return createResponse('', {
          'content-type': url.endsWith('/') ? 'text/turtle' : 'text/markdown',
          'content-length': url.endsWith('/') ? '0' : '17',
          'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
        })
      }) as typeof fetch,
    })

    const rootData = await buildRootNodes(db, 'https://pod.example/public/')

    expect(rootData.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'all', count: 5 }),
      expect.objectContaining({ id: 'smart-root:recent', type: 'recent', count: 5 }),
    ]))
  })

  it('parses path-backed smart root ids as container-backed roots', () => {
    expect(parseTreeNodeId('smart-root:agents')).toEqual({ kind: 'agents-root' })
    expect(parseTreeNodeId('smart-root:workspaces')).toEqual({ kind: 'workspaces-root' })
    expect(parseTreeNodeId('smart-root:repositories')).toEqual({ kind: 'repositories-root' })
  })

  it('reads metadata without body preview for a selected ordinary editable text file', async () => {
    const db = createDb()

    const detail = await readFileDetail(db, 'https://pod.example/public/README.md')

    expect(detail.name).toBe('README.md')
    expect(detail.semanticKind).toBe('file')
    expect(detail.previewText).toBeNull()
    expect(detail.parentUri).toBe('https://pod.example/public/')
  })

  it('does not body GET ordinary editable text file detail on selection', async () => {
    const authFetch = vi.fn(async () => createResponse('body must not be read on selection', {
      'content-type': 'text/css',
      'content-length': '34',
      'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
    })) as typeof fetch
    const db = createDb({ fetch: authFetch })

    const detail = await readFileDetail(db, 'https://pod.example/public/site.css')

    expect(detail.semanticKind).toBe('file')
    expect(detail.mimeType).toBe('text/css')
    expect(detail.previewText).toBeNull()
    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(authFetch).toHaveBeenCalledWith('https://pod.example/public/site.css', { method: 'HEAD' })
  })

  it('rejects inaccessible file metadata instead of rendering a fake detail', async () => {
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'HEAD' && url.endsWith('/private.md')) {
          return new Response('', { status: 403 })
        }

        return createResponse('', {
          'content-type': 'text/markdown',
          'content-length': '17',
          'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
        })
      }) as typeof fetch,
    })

    await expect(readFileDetail(db, 'https://pod.example/public/private.md')).rejects.toThrow(/403/)
  })

  it('reads RDF/XML preview text for generic vocab-adjacent resources', async () => {
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url === 'https://pod.example/.vocab/domain.rdf') {
          return createResponse('<rdf:RDF></rdf:RDF>', {
            'content-type': 'application/rdf+xml',
            'content-length': '19',
            'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
          })
        }
        return createResponse('', {
          'content-type': 'application/rdf+xml',
          'content-length': '0',
        })
      }) as typeof fetch,
    })

    const detail = await readFileDetail(db, 'https://pod.example/.vocab/domain.rdf')

    expect(detail.semanticKind).toBe('structured-data')
    expect(detail.mimeType).toBe('application/rdf+xml')
    expect(detail.previewText).toBe('<rdf:RDF></rdf:RDF>')
  })

  it('reads container detail with child entries', async () => {
    const db = createDb()

    const detail = await readFileDetail(db, 'https://pod.example/public/')

    expect(detail.kind).toBe('container')
    expect(detail.semanticKind).toBe('container')
    expect(detail.mimeType).toBe('inode/container')
    expect(detail.childEntries?.map((entry) => entry.name)).toEqual(['docs', 'README.md'])
    expect(detail.previewUnavailableReason).toContain('容器不提供文本预览')
  })

  it('reads vocab registry detail as a locked semantic resource', async () => {
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'GET' && url.endsWith('/.vocab/terms.ttl')) {
          return createResponse('@prefix udfs: <https://undefineds.co/vocab/> .', {
            'content-type': 'text/turtle',
            'content-length': '45',
            'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
          })
        }

        return createResponse('', {
          'content-type': 'text/turtle',
          'content-length': '45',
          'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
        })
      }) as typeof fetch,
    })

    const detail = await readFileDetail(db, 'https://pod.example/.vocab/terms.ttl')

    expect(detail.semanticKind).toBe('vocab-terms')
    expect(detail.previewText).toContain('@prefix')
  })

  it('does not surface body transport preview errors for ordinary editable text detail', async () => {
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

    expect(detail.previewText).toBeNull()
    expect(detail.previewUnavailableReason).toBe('当前文件类型暂不提供内联预览。')
    expect(detail.previewUnavailableReason).not.toMatch(/HTTP|500|https?:\/\//i)
  })

  it('reads complete raw text with etag through explicit raw text open', async () => {
    const fullText = `${'a'.repeat(12050)}tail`
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (init?.method === 'GET' && url.endsWith('README.md')) {
          return createResponse(fullText, {
            'content-type': 'text/markdown',
            etag: '"raw-1"',
          })
        }

        return createResponse('', {
          'content-type': 'text/markdown',
          'content-length': String(fullText.length),
          'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
        })
      }) as typeof fetch,
    })

    const detail = await readFileDetail(db, 'https://pod.example/public/README.md')
    const raw = await readRawTextResource(db, 'https://pod.example/public/README.md')

    expect(detail.previewText).toBeNull()
    expect(raw.content).toBe(fullText)
    expect(raw.etag).toBe('"raw-1"')
    expect(raw.mimeType).toBe('text/markdown')
  })

  it('reads raw Turtle for structured previews even when the Pod omits an etag', async () => {
    const turtle = [
      '@prefix udfs: <https://undefineds.co/vocab/> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '<#Repository> a udfs:Repository ;',
      '  rdfs:label "LinX Repository Smoke" ;',
      '  udfs:defaultBranch "main" .',
    ].join('\n')
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'GET' && String(input).endsWith('repository.ttl')) {
          return createResponse(turtle, {
            'content-type': 'text/turtle',
          })
        }

        return createResponse('', {
          'content-type': 'text/turtle',
          'content-length': String(turtle.length),
        })
      }) as typeof fetch,
    })

    const raw = await readRawTextResource(db, 'https://pod.example/.data/repositories/repository.ttl')

    expect(raw.content).toBe(turtle)
    expect(raw.mimeType).toBe('text/turtle')
    expect(raw.etag).toBeNull()
  })

  it('bypasses HTTP cache when reading raw text after writes', async () => {
    const authFetch = vi.fn(async () => createResponse('# LinX', {
      'content-type': 'text/markdown',
      etag: '"raw-1"',
    })) as typeof fetch
    const db = createDb({ fetch: authFetch })

    await readRawTextResource(db, 'https://pod.example/public/README.md')

    expect(authFetch).toHaveBeenCalledWith('https://pod.example/public/README.md', {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Accept: 'text/*, application/json;q=0.9, application/ld+json;q=0.9, application/xml;q=0.8, */*;q=0.1',
      },
    })
  })

  it('uses product copy when a resource cannot be saved as original text', async () => {
    const db = createDb({
      fetch: vi.fn(async () => createResponse('PNG', {
        'content-type': 'image/png',
        etag: '"image-raw-1"',
      })) as typeof fetch,
    })

    await expect(readRawTextResource(db, 'https://pod.example/public/diagram.png'))
      .rejects.toThrow('当前文件类型不支持原始内容保存。')
  })

  it('reads binary previews through authenticated fetch', async () => {
    const imageBytes = new Uint8Array([137, 80, 78, 71])
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('https://pod.example/private/diagram.png')
      expect(init?.method).toBe('GET')
      expect(init?.headers).toEqual({
        Accept: 'image/*, application/octet-stream;q=0.8, */*;q=0.1',
      })
      return new Response(imageBytes, {
        status: 200,
        headers: {
          'content-type': 'image/png',
          etag: '"image-1"',
        },
      })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    const resource = await readBlobResource(db, 'https://pod.example/private/diagram.png')

    expect(authFetch).toHaveBeenCalledOnce()
    expect(resource.uri).toBe('https://pod.example/private/diagram.png')
    expect(resource.mimeType).toBe('image/png')
    expect(resource.headers.etag).toBe('"image-1"')
    await expect(resource.blob.arrayBuffer()).resolves.toEqual(imageBytes.buffer)
  })

  it('saves raw text with content type and If-Match then reloads the resource', async () => {
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'PUT') {
        expect(url).toBe('https://pod.example/public/README.md')
        expect(init.headers).toEqual({
          'Content-Type': 'text/markdown',
          'If-Match': '"raw-1"',
        })
        expect(init.body).toBe('# Updated')
        return new Response(null, { status: 204 })
      }
      if (init?.method === 'GET' && url.endsWith('README.md')) {
        return createResponse('# Updated', {
          'content-type': 'text/markdown',
          etag: '"raw-2"',
        })
      }

      return createResponse('', {
        'content-type': 'text/markdown',
        'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
      })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    const saved = await saveRawTextResource(
      db,
      { uri: 'https://pod.example/public/README.md', mimeType: 'text/markdown', etag: '"raw-1"' },
      '# Updated',
    )

    expect(authFetch).toHaveBeenCalledWith('https://pod.example/public/README.md', expect.objectContaining({ method: 'PUT' }))
    expect(saved).toMatchObject({
      content: '# Updated',
      etag: '"raw-2"',
    })
  })

  it('rejects raw text saves when the current resource has no etag', async () => {
    const authFetch = vi.fn()
    const db = createDb({ fetch: authFetch as typeof fetch })

    await expect(saveRawTextResource(
      db,
      { uri: 'https://pod.example/public/README.md', mimeType: 'text/markdown', etag: null } as any,
      '# Updated',
    )).rejects.toThrow('当前资源缺少 ETag，不能安全保存。')

    expect(authFetch).not.toHaveBeenCalled()
  })

  it('rejects invalid json before saving raw source', async () => {
    const authFetch = vi.fn()
    const db = createDb({ fetch: authFetch as typeof fetch })

    await expect(saveRawTextResource(
      db,
      { uri: 'https://pod.example/public/data.json', mimeType: 'application/json', etag: '"json-1"' },
      '{ invalid',
    )).rejects.toThrow(/JSON 校验失败/)

    expect(authFetch).not.toHaveBeenCalled()
  })

  it('reports etag conflicts when raw source save receives 412', async () => {
    const db = createDb({
      fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'PUT') {
          return new Response('', { status: 412 })
        }
        return createResponse('', { 'content-type': 'text/markdown', etag: '"raw-1"' })
      }) as typeof fetch,
    })

    await expect(saveRawTextResource(
      db,
      { uri: 'https://pod.example/public/README.md', mimeType: 'text/markdown', etag: '"raw-1"' },
      '# Updated',
    )).rejects.toBeInstanceOf(FilesSaveConflictError)
  })

  it('creates a new raw text resource without overwriting an existing one', async () => {
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (init?.method === 'PUT') {
        expect(url).toBe('https://pod.example/.data/proposals/vocab/summary.ttl')
        expect(init.headers).toMatchObject({
          'Content-Type': 'text/turtle',
          'If-None-Match': '*',
        })
        expect(init.body).toBe('<#proposal> a <#Proposal> .')
        return new Response('', { status: 201 })
      }
      return createResponse('<#proposal> a <#Proposal> .', {
        'content-type': 'text/turtle',
        etag: '"proposal-1"',
      })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    const created = await createRawTextResource(
      db,
      { uri: 'https://pod.example/.data/proposals/vocab/summary.ttl', mimeType: 'text/turtle' },
      '<#proposal> a <#Proposal> .',
    )

    expect(created).toMatchObject({
      uri: 'https://pod.example/.data/proposals/vocab/summary.ttl',
      content: '<#proposal> a <#Proposal> .',
      mimeType: 'text/turtle',
      etag: '"proposal-1"',
    })
  })

  it('copies and moves file resources with WebDAV destination semantics', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return new Response('', { status: 201 })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    await copyFileResource(db, {
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/report copy.md',
    })
    await moveFileResource(db, {
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/archive/report.md',
    })

    const transferCalls = calls.filter(({ init }) => init?.method === 'COPY' || init?.method === 'MOVE')
    expect(transferCalls).toEqual([
      {
        url: 'https://pod.example/public/report.md',
        init: expect.objectContaining({
          method: 'COPY',
          headers: expect.objectContaining({
            Destination: 'https://pod.example/public/report%20copy.md',
            Overwrite: 'F',
          }),
        }),
      },
      {
        url: 'https://pod.example/public/report.md',
        init: expect.objectContaining({
          method: 'MOVE',
          headers: expect.objectContaining({
            Destination: 'https://pod.example/public/archive/report.md',
            Overwrite: 'F',
          }),
        }),
      },
    ])
  })

  it('reports destination conflicts for file resource copy and move', async () => {
    const db = createDb({
      fetch: vi.fn(async () => new Response('', { status: 412 })) as typeof fetch,
    })

    await expect(copyFileResource(db, {
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/report.md',
    })).rejects.toBeInstanceOf(FilesSaveConflictError)
    await expect(moveFileResource(db, {
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/report.md',
    })).rejects.toBeInstanceOf(FilesSaveConflictError)
  })

  it('falls back to GET, PUT, and DELETE when browser WebDAV transfer headers are blocked', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      if (init?.method === 'MOVE') {
        throw new TypeError('Failed to fetch')
      }
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-type': 'text/markdown',
            etag: '"dest-1"',
            'last-modified': 'Tue, 02 Jan 2024 00:00:00 GMT',
            'content-length': '10',
          },
        })
      }
      if (String(input) === 'https://pod.example/public/report.md.meta' && (!init?.method || init.method === 'GET')) {
        return new Response('', { status: 404 })
      }
      if (!init?.method || init.method === 'GET') {
        return new Response('moved body', {
          status: 200,
          headers: {
            'content-type': 'text/markdown',
            etag: '"source-1"',
            'last-modified': 'Tue, 02 Jan 2024 00:00:00 GMT',
            'content-length': '10',
          },
        })
      }
      if (init.method === 'PUT') {
        return new Response('', { status: 201 })
      }
      if (init.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return new Response('', { status: 500 })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    await moveFileResource(db, {
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/report-renamed.md',
    })

    expect(calls.map((call) => ({ url: call.url, method: call.init?.method ?? 'GET' }))).toEqual([
      { url: 'https://pod.example/public/report.md', method: 'MOVE' },
      { url: 'https://pod.example/public/report.md', method: 'GET' },
      { url: 'https://pod.example/public/report-renamed.md', method: 'PUT' },
      { url: 'https://pod.example/public/report.md.meta', method: 'GET' },
      { url: 'https://pod.example/public/report.md', method: 'DELETE' },
      { url: 'https://pod.example/public/report-renamed.md', method: 'HEAD' },
    ])
    expect(calls[2].init).toEqual(expect.objectContaining({
      method: 'PUT',
      headers: expect.objectContaining({
        'Content-Type': 'text/markdown',
        'If-None-Match': '*',
      }),
    }))
    await expect(new Response(calls[2].init?.body as BodyInit).text()).resolves.toBe('moved body')
  })

  it('falls back to GET and PUT when COPY returns an unsupported-method response', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      if (init?.method === 'COPY') {
        return new Response('', { status: 405 })
      }
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-type': 'text/markdown',
            etag: '"dest-1"',
            'last-modified': 'Tue, 02 Jan 2024 00:00:00 GMT',
            'content-length': '11',
          },
        })
      }
      if (String(input) === 'https://pod.example/public/report.md.meta' && (!init?.method || init.method === 'GET')) {
        return new Response('', { status: 404 })
      }
      if (!init?.method || init.method === 'GET') {
        return new Response('copied body', {
          status: 200,
          headers: {
            'content-type': 'text/markdown',
            etag: '"source-1"',
            'last-modified': 'Tue, 02 Jan 2024 00:00:00 GMT',
            'content-length': '11',
          },
        })
      }
      if (init.method === 'PUT') {
        return new Response('', { status: 201 })
      }
      return new Response('', { status: 500 })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    await copyFileResource(db, {
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/report-copy.md',
    })

    expect(calls.map((call) => ({ url: call.url, method: call.init?.method ?? 'GET' }))).toEqual([
      { url: 'https://pod.example/public/report.md', method: 'COPY' },
      { url: 'https://pod.example/public/report.md', method: 'GET' },
      { url: 'https://pod.example/public/report-copy.md', method: 'PUT' },
      { url: 'https://pod.example/public/report.md.meta', method: 'GET' },
      { url: 'https://pod.example/public/report-copy.md', method: 'HEAD' },
    ])
    expect(calls.some((call) => call.init?.method === 'DELETE')).toBe(false)
    await expect(new Response(calls[2].init?.body as BodyInit).text()).resolves.toBe('copied body')
  })

  it('preserves a file .meta sidecar when COPY falls back to read/write transfer', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (init?.method === 'COPY') return new Response('', { status: 405 })
      if (url === 'https://pod.example/public/report.md.meta' && (!init?.method || init.method === 'GET')) {
        return new Response([
          '@prefix dcterms: <http://purl.org/dc/terms/> .',
          '<report.md> dcterms:source <https://source.example/report> .',
        ].join('\n'), {
          status: 200,
          headers: { 'content-type': 'text/turtle', etag: '"meta-source-1"' },
        })
      }
      if (url === 'https://pod.example/public/report-copy.md.meta' && init?.method === 'PATCH') {
        return new Response('', { status: 201, headers: { etag: '"meta-copy-1"' } })
      }
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-type': 'text/markdown',
            etag: '"dest-1"',
            'last-modified': 'Tue, 02 Jan 2024 00:00:00 GMT',
            'content-length': '11',
          },
        })
      }
      if (!init?.method || init.method === 'GET') {
        return new Response('copied body', {
          status: 200,
          headers: {
            'content-type': 'text/markdown',
            etag: '"source-1"',
            'last-modified': 'Tue, 02 Jan 2024 00:00:00 GMT',
            'content-length': '11',
          },
        })
      }
      if (init.method === 'PUT') return new Response('', { status: 201 })
      return new Response('', { status: 500 })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    await copyFileResource(db, {
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/report-copy.md',
    })

    const metaPatch = calls.find((call) => call.url === 'https://pod.example/public/report-copy.md.meta' && call.init?.method === 'PATCH')
    expect(metaPatch).toBeDefined()
    expect(metaPatch?.init?.headers).toEqual(expect.objectContaining({
      'Content-Type': 'application/sparql-update',
    }))
    expect(String(metaPatch?.init?.body)).toContain('INSERT DATA')
    expect(String(metaPatch?.init?.body)).toContain('<report-copy.md> dcterms:source <https://source.example/report> .')
    expect(String(metaPatch?.init?.body)).not.toContain('<report.md> dcterms:source')
  })

  it('falls back to GET, PUT, and DELETE when MOVE returns an unsupported-method response', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      if (init?.method === 'MOVE') {
        return new Response('', { status: 501 })
      }
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-type': 'text/markdown',
            etag: '"dest-1"',
            'last-modified': 'Tue, 02 Jan 2024 00:00:00 GMT',
            'content-length': '10',
          },
        })
      }
      if (String(input) === 'https://pod.example/public/report.md.meta' && (!init?.method || init.method === 'GET')) {
        return new Response('', { status: 404 })
      }
      if (!init?.method || init.method === 'GET') {
        return new Response('moved body', {
          status: 200,
          headers: {
            'content-type': 'text/markdown',
            etag: '"source-1"',
            'last-modified': 'Tue, 02 Jan 2024 00:00:00 GMT',
            'content-length': '10',
          },
        })
      }
      if (init.method === 'PUT') {
        return new Response('', { status: 201 })
      }
      if (init.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      return new Response('', { status: 500 })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    await moveFileResource(db, {
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/archive/report.md',
    })

    expect(calls.map((call) => ({ url: call.url, method: call.init?.method ?? 'GET' }))).toEqual([
      { url: 'https://pod.example/public/report.md', method: 'MOVE' },
      { url: 'https://pod.example/public/report.md', method: 'GET' },
      { url: 'https://pod.example/public/archive/report.md', method: 'PUT' },
      { url: 'https://pod.example/public/report.md.meta', method: 'GET' },
      { url: 'https://pod.example/public/report.md', method: 'DELETE' },
      { url: 'https://pod.example/public/archive/report.md', method: 'HEAD' },
    ])
    await expect(new Response(calls[2].init?.body as BodyInit).text()).resolves.toBe('moved body')
  })

  it('moves a file .meta sidecar when MOVE falls back to read/write transfer', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (init?.method === 'MOVE') return new Response('', { status: 501 })
      if (url === 'https://pod.example/public/report.md.meta' && (!init?.method || init.method === 'GET')) {
        return new Response([
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '<https://pod.example/public/report.md> rdfs:label "Report metadata" .',
        ].join('\n'), {
          status: 200,
          headers: { 'content-type': 'text/turtle', etag: '"meta-source-1"' },
        })
      }
      if (url === 'https://pod.example/public/archive/report.md.meta' && init?.method === 'PATCH') {
        return new Response('', { status: 201, headers: { etag: '"meta-moved-1"' } })
      }
      if (url === 'https://pod.example/public/report.md.meta' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      if (init?.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: {
            'content-type': 'text/markdown',
            etag: '"dest-1"',
            'last-modified': 'Tue, 02 Jan 2024 00:00:00 GMT',
            'content-length': '10',
          },
        })
      }
      if (!init?.method || init.method === 'GET') {
        return new Response('moved body', {
          status: 200,
          headers: {
            'content-type': 'text/markdown',
            etag: '"source-1"',
            'last-modified': 'Tue, 02 Jan 2024 00:00:00 GMT',
            'content-length': '10',
          },
        })
      }
      if (init.method === 'PUT') return new Response('', { status: 201 })
      if (init.method === 'DELETE') return new Response(null, { status: 204 })
      return new Response('', { status: 500 })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    await moveFileResource(db, {
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/archive/report.md',
    })

    const metaPatch = calls.find((call) => call.url === 'https://pod.example/public/archive/report.md.meta' && call.init?.method === 'PATCH')
    expect(metaPatch).toBeDefined()
    expect(String(metaPatch?.init?.body)).toContain('<https://pod.example/public/archive/report.md> rdfs:label "Report metadata" .')
    expect(String(metaPatch?.init?.body)).not.toContain('<https://pod.example/public/report.md> rdfs:label')
    expect(calls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        url: 'https://pod.example/public/report.md.meta',
        init: expect.objectContaining({ method: 'DELETE' }),
      }),
    ]))
  })

  it('rolls back the fallback destination when MOVE cannot delete the source resource', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      if (init?.method === 'MOVE') return new Response('', { status: 501 })
      if (url === 'https://pod.example/public/report.md.meta' && (!init?.method || init.method === 'GET')) {
        return new Response([
          '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
          '<https://pod.example/public/report.md> rdfs:label "Report metadata" .',
        ].join('\n'), {
          status: 200,
          headers: { 'content-type': 'text/turtle', etag: '"meta-source-1"' },
        })
      }
      if (url === 'https://pod.example/public/archive/report.md.meta' && init?.method === 'PATCH') {
        return new Response('', { status: 201, headers: { etag: '"meta-moved-1"' } })
      }
      if (url === 'https://pod.example/public/report.md' && init?.method === 'DELETE') {
        return new Response('', { status: 403 })
      }
      if (url === 'https://pod.example/public/archive/report.md.meta' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      if (url === 'https://pod.example/public/archive/report.md' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      if (!init?.method || init.method === 'GET') {
        return new Response('moved body', {
          status: 200,
          headers: {
            'content-type': 'text/markdown',
            etag: '"source-1"',
            'last-modified': 'Tue, 02 Jan 2024 00:00:00 GMT',
            'content-length': '10',
          },
        })
      }
      if (init.method === 'PUT') return new Response('', { status: 201 })
      return new Response('', { status: 500 })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    await expect(moveFileResource(db, {
      sourceUri: 'https://pod.example/public/report.md',
      destinationUri: 'https://pod.example/public/archive/report.md',
    })).rejects.toThrow('移动文件失败: HTTP 403')

    expect(calls.map((call) => ({ url: call.url, method: call.init?.method ?? 'GET' }))).toEqual([
      { url: 'https://pod.example/public/report.md', method: 'MOVE' },
      { url: 'https://pod.example/public/report.md', method: 'GET' },
      { url: 'https://pod.example/public/archive/report.md', method: 'PUT' },
      { url: 'https://pod.example/public/report.md.meta', method: 'GET' },
      { url: 'https://pod.example/public/archive/report.md.meta', method: 'PATCH' },
      { url: 'https://pod.example/public/report.md', method: 'DELETE' },
      { url: 'https://pod.example/public/archive/report.md.meta', method: 'DELETE' },
      { url: 'https://pod.example/public/archive/report.md', method: 'DELETE' },
    ])
  })

  it('creates a binary resource with WebDAV PUT and reads its detail', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' })
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return new Response('', {
        status: init?.method === 'PUT' ? 201 : 200,
        headers: {
          'content-type': 'image/png',
          'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
        },
      })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    const created = await createBlobResource(db, {
      uri: 'https://pod.example/public/diagram.png',
      mimeType: 'image/png',
    }, blob)

    expect(calls[0]).toEqual({
      url: 'https://pod.example/public/diagram.png',
      init: expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({
          'Content-Type': 'image/png',
          'If-None-Match': '*',
        }),
        body: blob,
      }),
    })
    expect(created).toMatchObject({
      uri: 'https://pod.example/public/diagram.png',
      kind: 'resource',
      mimeType: 'image/png',
    })
  })

  it('reports binary resource creation conflicts without overwriting existing resources', async () => {
    const db = createDb({
      fetch: vi.fn(async () => new Response('', { status: 412 })) as typeof fetch,
    })

    await expect(createBlobResource(db, {
      uri: 'https://pod.example/public/diagram.png',
      mimeType: 'image/png',
    }, new Blob(['existing'], { type: 'image/png' }))).rejects.toBeInstanceOf(FilesSaveConflictError)
  })

  it('deletes a file resource with WebDAV DELETE', async () => {
    const authFetch = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch
    const db = createDb({ fetch: authFetch })

    await deleteFileResource(db, 'https://pod.example/public/report.md')

    expect(authFetch).toHaveBeenCalledWith('https://pod.example/public/report.md', expect.objectContaining({
      method: 'DELETE',
    }))
  })

  it('deletes the app meta sidecar after deleting a file resource', async () => {
    const calls: Array<{ url: string; method: string | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), method: init?.method })
      return new Response(null, { status: 204 })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    await deleteFileResource(db, 'https://pod.example/public/report.md')

    expect(calls).toEqual([
      { url: 'https://pod.example/public/report.md', method: 'DELETE' },
      { url: 'https://pod.example/public/report.md.meta', method: 'DELETE' },
    ])
  })

  it('treats a missing .meta sidecar as already deleted', async () => {
    const calls: Array<{ url: string; method: string | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: init?.method })
      return new Response(null, { status: url.endsWith('.meta') ? 404 : 204 })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch })

    await deleteFileResource(db, 'https://pod.example/public/report.md')

    expect(calls).toEqual([
      { url: 'https://pod.example/public/report.md', method: 'DELETE' },
      { url: 'https://pod.example/public/report.md.meta', method: 'DELETE' },
    ])
  })

  it('reports delete failures with the response status', async () => {
    const db = createDb({
      fetch: vi.fn(async () => new Response('', { status: 403 })) as typeof fetch,
    })

    await expect(deleteFileResource(db, 'https://pod.example/private/report.md')).rejects.toThrow('删除文件失败: HTTP 403')
  })

  it('creates a container with WebDAV MKCOL and reads the created folder detail', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return new Response('', {
        status: init?.method === 'MKCOL' ? 201 : 200,
        headers: {
          'content-type': 'text/turtle',
          'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
        },
      })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch, listContainerResources: async () => [] })

    const created = await createFolderResource(db, {
      containerUri: 'https://pod.example/public/',
      name: 'Project Notes',
    })

    expect(calls[0]).toEqual({
      url: 'https://pod.example/public/Project%20Notes/',
      init: expect.objectContaining({
        method: 'MKCOL',
      }),
    })
    expect(created).toMatchObject({
      uri: 'https://pod.example/public/Project%20Notes/',
      kind: 'container',
      semanticKind: 'container',
      name: 'Project Notes',
    })
  })

  it('falls back to LDP container POST when MKCOL is not supported', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return new Response('', {
        status: init?.method === 'MKCOL' ? 405 : 201,
        headers: {
          'content-type': 'text/turtle',
          'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
        },
      })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch, listContainerResources: async () => [] })

    const created = await createFolderResource(db, {
      containerUri: 'https://pod.example/public/',
      name: 'Project Notes',
    })

    expect(calls[0]).toEqual({
      url: 'https://pod.example/public/Project%20Notes/',
      init: expect.objectContaining({ method: 'MKCOL' }),
    })
    expect(calls[1]).toEqual({
      url: 'https://pod.example/public/',
      init: expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          Slug: 'Project Notes',
        }),
      }),
    })
    expect(created.uri).toBe('https://pod.example/public/Project%20Notes/')
  })

  it('falls back to LDP container POST when MKCOL is not implemented', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      return new Response('', {
        status: init?.method === 'MKCOL' ? 501 : 201,
        headers: {
          'content-type': 'text/turtle',
          'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
        },
      })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch, listContainerResources: async () => [] })

    const created = await createFolderResource(db, {
      containerUri: 'https://pod.example/public/',
      name: 'Project Notes',
    })

    expect(calls[0]).toEqual({
      url: 'https://pod.example/public/Project%20Notes/',
      init: expect.objectContaining({ method: 'MKCOL' }),
    })
    expect(calls[1]).toEqual({
      url: 'https://pod.example/public/',
      init: expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          Slug: 'Project Notes',
        }),
      }),
    })
    expect(created.uri).toBe('https://pod.example/public/Project%20Notes/')
  })

  it('falls back to LDP container POST when MKCOL fails before returning a response', async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const authFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init })
      if (init?.method === 'MKCOL') {
        throw new TypeError('Failed to fetch')
      }
      return new Response('', {
        status: 201,
        headers: {
          'content-type': 'text/turtle',
          'last-modified': 'Sat, 01 Mar 2026 10:00:00 GMT',
        },
      })
    }) as typeof fetch
    const db = createDb({ fetch: authFetch, listContainerResources: async () => [] })

    const created = await createFolderResource(db, {
      containerUri: 'https://pod.example/public/',
      name: 'Project Notes',
    })

    expect(calls[0]?.init).toEqual(expect.objectContaining({ method: 'MKCOL' }))
    expect(calls[1]).toEqual({
      url: 'https://pod.example/public/',
      init: expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
          Slug: 'Project Notes',
        }),
      }),
    })
    expect(created.uri).toBe('https://pod.example/public/Project%20Notes/')
  })

  it('reports folder creation conflicts without overwriting existing containers', async () => {
    const db = createDb({
      fetch: vi.fn(async () => new Response('', { status: 409 })) as typeof fetch,
    })

    await expect(createFolderResource(db, {
      containerUri: 'https://pod.example/public/',
      name: 'Existing',
    })).rejects.toBeInstanceOf(FilesSaveConflictError)
  })

  it('rejects path-like and escaped folder names before writing', async () => {
    const authFetch = vi.fn(async () => new Response('', { status: 201 })) as typeof fetch
    const db = createDb({ fetch: authFetch })
    const invalidNames = [
      '',
      '   ',
      '.',
      '..',
      'nested/folder',
      'nested\\folder',
      '../escape',
      '%2E%2E',
      'encoded%2Fslash',
      'encoded%5Cslash',
    ]

    for (const name of invalidNames) {
      await expect(createFolderResource(db, {
        containerUri: 'https://pod.example/public/',
        name,
      })).rejects.toThrow('文件夹名称')
    }
    expect(authFetch).not.toHaveBeenCalled()
  })
})
