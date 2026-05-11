// @vitest-environment node
import { afterAll, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { aiProviderTable, solidSchema } from '@undefineds.co/models'
import { deleteExactRecord } from './exact-records'
import { createPodCollection } from './pod-collection'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '../../test/xpod-integration'

let context: XpodIntegrationContext<typeof solidSchema> | null = null
const createdSubjects: string[] = []

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    tables: [aiProviderTable],
  })
  return context
}

async function cleanup() {
  if (!context) return
  const db = context.db
  if (!db) return
  for (const subject of createdSubjects) {
    try {
      await deleteExactRecord(db as any, aiProviderTable as any, subject)
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
  it('optimistic insert updates local state before persistence', { timeout: 30000 }, async () => {
    const { db: database, baseUrl } = await getContext()
    const queryClient = new QueryClient()

    const collection = createPodCollection({
      table: aiProviderTable,
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
        hasModel: '/settings/ai/models.ttl#model-1',
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

      await tx.isPersisted.promise

      const created = await (database as any).findByLocator(aiProviderTable as any, { id } as any)
      const subject = (created as any)?.['@id']
      const expectedModelUri = new URL('/settings/ai/models.ttl#model-1', baseUrl).href
      if (subject) createdSubjects.push(subject)
      expect(created?.id).toBe(id)
      expect(created?.baseUrl).toBe('https://api.test.com')
      expect(created?.proxyUrl).toBe('https://proxy.test.com')
      expect(created?.hasModel).toBe(expectedModelUri)
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
      table: aiProviderTable,
      queryKey: ['model-providers-test-notify'],
      queryClient,
      getDb: () => database as any,
    })

    let unsubscribe: (() => void | Promise<void>) | null = null

    try {
      unsubscribe = await collection.subscribeToPod(database as any)

      const id = crypto.randomUUID()
      const [created] = await (database as any)
        .insert(aiProviderTable)
        .values({
          id,
          baseUrl: 'https://api.test.com',
          proxyUrl: 'https://proxy.test.com',
          hasModel: '/settings/ai/models.ttl#model-1',
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

      await (database as any).updateByLocator(aiProviderTable as any, { id } as any, {
        proxyUrl: 'https://proxy.changed.test.com',
      })
      await (database as any).deleteByLocator(aiProviderTable as any, { id } as any)

      expect(await notified).toBe(true)
    } finally {
      await unsubscribe?.()
      invalidateSpy.mockRestore()
      await collection.cleanup()
      queryClient.clear()
    }
  })
})
