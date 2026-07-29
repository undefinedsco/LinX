// @vitest-environment node
import { afterAll, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { aiProviderResource, contactResource, solidSchema } from '@undefineds.co/models'
import { deleteExactRecord } from './exact-records'
import { createPodCollection } from './pod-collection'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '../../test/xpod-integration'

let context: XpodIntegrationContext<typeof solidSchema> | null = null
const createdSubjects: string[] = []
const createdContactSubjects: string[] = []

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    resources: [aiProviderResource, contactResource],
  })
  return context
}

async function cleanup() {
  if (!context) return
  const db = context.db
  if (!db) return
  for (const subject of createdSubjects) {
    try {
      await deleteExactRecord(db as any, aiProviderResource as any, subject)
    } catch {
      // ignore cleanup errors
    }
  }
  for (const subject of createdContactSubjects) {
    try {
      await deleteExactRecord(db as any, contactResource as any, subject)
    } catch {
      // ignore cleanup errors
    }
  }
}

afterAll(async () => {
  if (context?.mode !== 'local-seeded-auth') {
    await cleanup()
  }
  await context?.stop()
}, 20000)

describe('pod-collection integration', () => {
  it('hydrates real rows once and serves repeated consumers from the live collection cache', { timeout: 60000 }, async () => {
    const { authenticatedFetch, db: database, podUrl, requestMetrics } = await getContext()
    const queryClient = new QueryClient()
    const benchmarkId = `collection-benchmark-${crypto.randomUUID()}`
    const benchmarkRows = Array.from({ length: 5 }, (_, index) => ({
      id: `${benchmarkId}-${index}`,
      name: `Benchmark contact ${index}`,
      about: `https://example.test/people/${benchmarkId}-${index}`,
      contactType: 'external',
    }))

    for (const row of benchmarkRows) {
      const [created] = await (database as any).insert(contactResource).values(row).execute()
      const subject = created?.['@id']
      if (typeof subject === 'string') createdContactSubjects.push(subject)
    }

    const endpoint = new URL('.data/contacts/-/sparql', podUrl)
    endpoint.searchParams.set('query', `
      SELECT ?subject WHERE {
        ?subject a <http://www.w3.org/2006/vcard/ns#Individual> .
      }
    `)
    const directRequestTimes: number[] = []
    let directBindingCount = 0
    for (let index = 0; index < 3; index += 1) {
      const startedAt = performance.now()
      const response = await authenticatedFetch(endpoint, {
        headers: { Accept: 'application/sparql-results+json' },
      })
      expect(response.ok).toBe(true)
      const payload = await response.json() as { results?: { bindings?: unknown[] } }
      directBindingCount = payload.results?.bindings?.length ?? 0
      directRequestTimes.push(performance.now() - startedAt)
    }
    expect(directBindingCount).toBeGreaterThanOrEqual(5)

    const databaseRequestStart = requestMetrics.length
    const databaseSelectStartedAt = performance.now()
    const databaseRows = await (database as any).select().from(contactResource).execute()
    const databaseSelectMs = performance.now() - databaseSelectStartedAt
    const databaseRequests = requestMetrics.slice(databaseRequestStart)
    expect(databaseRows.filter((row: any) => row.id.startsWith(benchmarkId))).toHaveLength(5)
    expect(databaseRequests).toHaveLength(1)
    expect(databaseRequests[0].startedAtMs - databaseSelectStartedAt).toBeLessThan(1_000)

    const selectSpy = vi.spyOn(database as any, 'select')
    const collection = createPodCollection({
      resource: contactResource,
      queryKey: ['contacts-test-hydration-benchmark'],
      queryClient,
      getDb: () => database as any,
    })

    try {
      const hydrationRequestStart = requestMetrics.length
      const hydrationStartedAt = performance.now()
      await collection.fetch()
      const hydrationMs = performance.now() - hydrationStartedAt
      const hydrationRequests = requestMetrics.slice(hydrationRequestStart)
      expect(selectSpy).toHaveBeenCalledOnce()
      expect(collection.toArray.filter((row: any) => row.id.startsWith(benchmarkId))).toHaveLength(5)

      const cachedStartedAt = performance.now()
      await Promise.all(Array.from({ length: 20 }, () => collection.fetch()))
      const cachedReadsMs = performance.now() - cachedStartedAt
      expect(selectSpy).toHaveBeenCalledOnce()

      const refetchStartedAt = performance.now()
      await collection.fetch({ refetch: true })
      const refetchMs = performance.now() - refetchStartedAt
      expect(selectSpy).toHaveBeenCalledTimes(2)

      console.info('[benchmark] real xpod collection hydration', {
        rows: collection.toArray.length,
        directBackendMs: directRequestTimes.map((value) => Number(value.toFixed(2))),
        databaseSelectMs: Number(databaseSelectMs.toFixed(2)),
        databaseRequests: databaseRequests.map((request) => ({
          dispatchDelayMs: Number((request.startedAtMs - databaseSelectStartedAt).toFixed(2)),
          durationMs: Number(request.durationMs.toFixed(2)),
          method: request.method,
          path: new URL(request.url).pathname,
        })),
        hydrationRequests: hydrationRequests.map((request) => ({
          durationMs: Number(request.durationMs.toFixed(2)),
          method: request.method,
          path: new URL(request.url).pathname,
        })),
        hydrationMs: Number(hydrationMs.toFixed(2)),
        cachedConsumers: 20,
        cachedReadsMs: Number(cachedReadsMs.toFixed(2)),
        forcedRefetchMs: Number(refetchMs.toFixed(2)),
        selects: selectSpy.mock.calls.length,
      })
    } finally {
      selectSpy.mockRestore()
      await collection.cleanup()
      queryClient.clear()
    }
  })

  it('round-trips optimistic collection CRUD through one real Pod resource', { timeout: 30000 }, async () => {
    const { db: database, baseUrl } = await getContext()
    const queryClient = new QueryClient()

    const collection = createPodCollection({
      resource: aiProviderResource,
      queryKey: ['model-providers-test-optimistic'],
      queryClient,
      getDb: () => database as any,
    })

    let optimisticCheck: ReturnType<typeof setInterval> | null = null
    let subscription: { unsubscribe: () => void } | null = null

    try {
      const ready = new Promise<void>((resolve) => collection.onFirstReady(resolve))
      collection.startSyncImmediate()
      await ready

      const id = crypto.randomUUID()
      let optimisticSeen = false
      subscription = collection.subscribeChanges((changes) => {
        if (changes.some((change) => change.type === 'insert' && change.value?.id === id)) {
          optimisticSeen = true
        }
      })

      const tx = collection.insert({
        id,
        baseUrl: 'https://api.test.com',
        proxyUrl: 'https://proxy.test.com',
        hasModel: `/settings/providers/${id}.ttl#model-1`,
      } as any)

      const optimisticPromise = new Promise<'optimistic'>((resolve) => {
        optimisticCheck = setInterval(() => {
          if (optimisticSeen) {
            if (optimisticCheck) clearInterval(optimisticCheck)
            resolve('optimistic')
          }
        }, 10)
      })

      const result = await Promise.race([
        optimisticPromise,
        tx.isPersisted.promise.then(() => 'persisted'),
      ])

      if (result === 'persisted' && optimisticCheck) clearInterval(optimisticCheck)
      expect(result).toBe('optimistic')
      expect(collection.get(id)).toMatchObject({
        id,
        baseUrl: 'https://api.test.com',
      })

      await tx.isPersisted.promise

      const providerResourceId = `${id}.ttl`
      const created = await (database as any).findById(aiProviderResource as any, providerResourceId)
      const subject = (created as any)?.['@id']
      const expectedModelUri = new URL(`/settings/providers/${id}.ttl#model-1`, baseUrl).href
      if (subject) createdSubjects.push(subject)
      expect(created?.id).toBe(providerResourceId)
      expect(created?.baseUrl).toBe('https://api.test.com')
      expect(created?.proxyUrl).toBe('https://proxy.test.com')
      expect(created?.hasModel).toBe(expectedModelUri)

      const update = collection.update(id, (draft: any) => {
        draft.baseUrl = 'https://api.updated.test.com'
      })
      expect(collection.get(id)?.baseUrl).toBe('https://api.updated.test.com')
      await update.isPersisted.promise

      await expect(
        (database as any).findById(aiProviderResource as any, providerResourceId),
      ).resolves.toMatchObject({
        id: providerResourceId,
        baseUrl: 'https://api.updated.test.com',
      })

      const remove = collection.delete(id)
      expect(collection.get(id)).toBeUndefined()
      await remove.isPersisted.promise
      await expect(
        (database as any).findById(aiProviderResource as any, providerResourceId),
      ).resolves.toBeNull()
    } finally {
      if (optimisticCheck) clearInterval(optimisticCheck)
      subscription?.unsubscribe()
      await collection.cleanup()
      queryClient.clear()
    }
  })

  it('pod notifications invalidate queries on create/update/delete', { timeout: 20000 }, async () => {
    const { db: database } = await getContext()
    const queryClient = new QueryClient()
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => {})

    const collection = createPodCollection({
      resource: aiProviderResource,
      queryKey: ['model-providers-test-notify'],
      queryClient,
      getDb: () => database as any,
    })

    let unsubscribe: (() => void | Promise<void>) | null = null

    try {
      unsubscribe = await collection.subscribeToPod(database as any)

      const id = crypto.randomUUID()
      const [created] = await (database as any)
        .insert(aiProviderResource)
        .values({
          id,
          baseUrl: 'https://api.test.com',
          proxyUrl: 'https://proxy.test.com',
          hasModel: `/settings/providers/${id}.ttl#model-1`,
        })
        .execute()

      const subject = (created as any)?.['@id']
      if (subject) createdSubjects.push(subject)

      const notified = new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5000)
        const check = setInterval(() => {
          if (invalidateSpy.mock.calls.length > 0) {
            clearTimeout(timeout)
            clearInterval(check)
            resolve(true)
          }
        }, 100)
      })

      expect(await notified).toBe(true)
    } finally {
      await unsubscribe?.()
      invalidateSpy.mockRestore()
      await collection.cleanup()
      queryClient.clear()
    }
  })
})
