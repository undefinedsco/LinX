// @vitest-environment node
import { afterAll, describe, expect, it, vi } from 'vitest'
import { eq } from '@undefineds.co/drizzle-solid'
import { QueryClient } from '@tanstack/react-query'
import { aiProviderTable, linxSchema } from '@linx/models'
import { createPodCollection } from './pod-collection'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '../../test/xpod-integration'

let context: XpodIntegrationContext<typeof linxSchema> | null = null
const createdSubjects: string[] = []

async function getContext(): Promise<XpodIntegrationContext<typeof linxSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: linxSchema,
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
      await db.delete(aiProviderTable).where({ '@id': subject } as any).execute()
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
      getDb: () => database,
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

      const rows = await database.select().from(aiProviderTable).where(eq(aiProviderTable.id, id)).execute()
      const created = rows[0]
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
      getDb: () => database,
    })

    let unsubscribe: (() => void | Promise<void>) | null = null

    try {
      unsubscribe = await collection.subscribeToPod(database)

      const id = crypto.randomUUID()
      const [created] = await database
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

      await database.update(aiProviderTable).set({ proxyUrl: 'https://proxy.changed.test.com' }).where({ id } as any).execute()
      await database.delete(aiProviderTable).where({ id } as any).execute()

      expect(await notified).toBe(true)
    } finally {
      await unsubscribe?.()
      invalidateSpy.mockRestore()
      await collection.cleanup()
      queryClient.clear()
    }
  })
})
