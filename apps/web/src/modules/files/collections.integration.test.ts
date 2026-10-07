// @vitest-environment node
import { QueryClient } from '@tanstack/react-query'
import { afterAll, describe, expect, it } from 'vitest'
import { solidSchema } from '@undefineds.co/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'
import {
  filesResourceMutationCollection,
  filesResourceQueryKeys,
  filesResourceCollection,
  initializeFilesCollections,
} from './data/collections'

let context: XpodIntegrationContext<typeof solidSchema> | null = null
const createdUris: string[] = []

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    resources: [],
  })
  initializeFilesCollections(context.db)
  return context
}

afterAll(async () => {
  if (context) {
    for (const uri of createdUris) {
      await context.authenticatedFetch(uri, { method: 'DELETE' }).catch(() => undefined)
    }
  }
  initializeFilesCollections(null)
  await context?.stop()
}, 30000)

describe('files resource collection integration', () => {
  it('lists, reads, and updates a private Pod file through the optimistic mutation pipeline', { timeout: 60000 }, async () => {
    const { db, podUrl } = await getContext()
    const containerUri = podUrl.endsWith('/') ? podUrl : `${podUrl}/`
    const resourceUri = new URL(`files-integration-${Date.now()}.md`, containerUri).href
    const cacheClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const containerEntriesKey = filesResourceQueryKeys.containerEntries(containerUri)
    cacheClient.setQueryData(containerEntriesKey, [])
    createdUris.push(resourceUri)

    const created = await filesResourceMutationCollection.createRawText({
      cacheClient,
      db,
      resource: {
        uri: resourceUri,
        mimeType: 'text/markdown',
      },
      content: '# Files integration',
    })

    expect(created.content).toBe('# Files integration')
    expect(cacheClient.getQueryData(containerEntriesKey)).toEqual([
      expect.objectContaining({
        uri: resourceUri,
        mimeType: 'text/markdown',
      }),
    ])

    const entries = await filesResourceCollection.listContainerEntries(containerUri, 'Integration', db)
    expect(entries.some((entry) => entry.uri === resourceUri)).toBe(true)

    const raw = await filesResourceCollection.readRawText(resourceUri, db)
    expect(raw.content).toBe('# Files integration')
    expect(raw.etag).toBeTruthy()

    const saved = await filesResourceMutationCollection.saveRawText({
      cacheClient,
      db,
      resource: raw,
      content: '# Files integration updated',
    })
    expect(saved.content).toBe('# Files integration updated')
    expect(await filesResourceCollection.readRawText(resourceUri, db)).toMatchObject({
      content: '# Files integration updated',
    })

    await filesResourceMutationCollection.delete({
      cacheClient,
      db,
      resourceUri,
    })
    createdUris.splice(createdUris.indexOf(resourceUri), 1)
    expect(cacheClient.getQueryData(containerEntriesKey)).toEqual([])
    await expect(filesResourceCollection.readRawText(resourceUri, db)).rejects.toThrow(/HTTP 404|读取文件失败/)
  })
})
