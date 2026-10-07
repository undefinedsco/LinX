import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createRawTextResourceWithCache } from './resource-query-cache'

describe('Files resource query cache helpers', () => {
  it('wraps raw-text resource create with optimistic entry and raw-text caches', async () => {
    const cacheClient = new QueryClient()
    const entriesQueryKey = ['files', 'entries', 'all']
    const rawTextQueryRoot = ['files', 'raw-text']
    const resource = {
      uri: 'https://pod.example/public/notes.md',
      mimeType: 'text/markdown',
    }
    cacheClient.setQueryData(entriesQueryKey, [])

    const entryCacheCollection = {
      stageResourceCreate: vi.fn(async (client: QueryClient, input: any) => {
        const previous = client.getQueryData(entriesQueryKey)
        client.setQueryData(entriesQueryKey, [input])
        return previous
      }),
      commitResourceCreate: vi.fn((client: QueryClient, input: any) => {
        client.setQueryData(entriesQueryKey, [input])
      }),
      restore: vi.fn((client: QueryClient, snapshot?: unknown) => {
        client.setQueryData(entriesQueryKey, snapshot)
      }),
      invalidateResourceCreate: vi.fn(async () => undefined),
    }
    const create = vi.fn(async () => {
      expect(cacheClient.getQueryData(entriesQueryKey)).toEqual([
        expect.objectContaining({
          uri: resource.uri,
          size: '# Draft'.length,
        }),
      ])
      expect(cacheClient.getQueryData([...rawTextQueryRoot, resource.uri])).toEqual({
        uri: resource.uri,
        mimeType: 'text/markdown',
        etag: null,
        headers: {},
        content: '# Draft',
      })
      return {
        ...resource,
        content: '# Created from Pod',
        etag: '"created"',
        headers: { etag: '"created"' },
      }
    })

    const result = await createRawTextResourceWithCache({
      cacheClient,
      rawTextQueryRoot,
      entryCacheCollection,
      podRootUri: 'https://pod.example/',
      resource,
      content: '# Draft',
      create,
    })

    expect(result.content).toBe('# Created from Pod')
    expect(entryCacheCollection.stageResourceCreate).toHaveBeenCalledWith(cacheClient, {
      uri: resource.uri,
      kind: 'resource',
      mimeType: 'text/markdown',
      podRootUri: 'https://pod.example/',
      size: '# Draft'.length,
    })
    expect(entryCacheCollection.commitResourceCreate).toHaveBeenCalledWith(cacheClient, {
      uri: resource.uri,
      kind: 'resource',
      mimeType: 'text/markdown',
      podRootUri: 'https://pod.example/',
      size: '# Created from Pod'.length,
    })
    expect(cacheClient.getQueryData([...rawTextQueryRoot, resource.uri])).toEqual({
      uri: resource.uri,
      mimeType: 'text/markdown',
      etag: '"created"',
      headers: { etag: '"created"' },
      content: '# Created from Pod',
    })
    expect(entryCacheCollection.invalidateResourceCreate).toHaveBeenCalledWith(
      cacheClient,
      resource.uri,
      { includeRawText: true },
    )
  })

  it('rolls back raw-text and entry caches when raw-text resource create fails', async () => {
    const cacheClient = new QueryClient()
    const entriesQueryKey = ['files', 'entries', 'all']
    const rawTextQueryRoot = ['files', 'raw-text']
    const resource = {
      uri: 'https://pod.example/public/notes.md',
      mimeType: 'text/markdown',
    }
    const previousEntries = [{ uri: 'https://pod.example/public/report.md' }]
    const previousRawText = {
      uri: resource.uri,
      mimeType: 'text/markdown',
      etag: '"old"',
      headers: { etag: '"old"' },
      content: '# Old',
    }
    cacheClient.setQueryData(entriesQueryKey, previousEntries)
    cacheClient.setQueryData([...rawTextQueryRoot, resource.uri], previousRawText)

    const entryCacheCollection = {
      stageResourceCreate: vi.fn(async (client: QueryClient, input: any) => {
        const previous = client.getQueryData(entriesQueryKey)
        client.setQueryData(entriesQueryKey, [...previousEntries, input])
        return previous
      }),
      commitResourceCreate: vi.fn(),
      restore: vi.fn((client: QueryClient, snapshot?: unknown) => {
        client.setQueryData(entriesQueryKey, snapshot)
      }),
      invalidateResourceCreate: vi.fn(async () => undefined),
    }
    const createError = new Error('create failed')
    const create = vi.fn(async () => {
      expect(cacheClient.getQueryData([...rawTextQueryRoot, resource.uri])).toEqual({
        ...previousRawText,
        content: '# Draft',
      })
      throw createError
    })

    await expect(createRawTextResourceWithCache({
      cacheClient,
      rawTextQueryRoot,
      entryCacheCollection,
      podRootUri: 'https://pod.example/',
      resource,
      content: '# Draft',
      create,
    })).rejects.toThrow(createError)

    expect(entryCacheCollection.restore).toHaveBeenCalledWith(cacheClient, previousEntries)
    expect(entryCacheCollection.commitResourceCreate).not.toHaveBeenCalled()
    expect(cacheClient.getQueryData(entriesQueryKey)).toEqual(previousEntries)
    expect(cacheClient.getQueryData([...rawTextQueryRoot, resource.uri])).toEqual(previousRawText)
    expect(entryCacheCollection.invalidateResourceCreate).toHaveBeenCalledWith(
      cacheClient,
      resource.uri,
      { includeRawText: true },
    )
  })
})
