// @vitest-environment node
import dotenv from 'dotenv'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, type SolidDatabase } from 'drizzle-solid'
import { QueryClient } from '@tanstack/react-query'
import { modelProviderTable, linxSchema } from '@linx/models'
import { createPodCollection } from './pod-collection'

dotenv.config({ path: '../../.env' })

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

const hasEnv = Boolean(env.webId && env.clientId && env.clientSecret && env.oidcIssuer)

let db: SolidDatabase | null = null
let session: Session | null = null
const createdSubjects: string[] = []

async function getDb() {
  if (db) return db
  session = new Session()
  await session.login({
    clientId: env.clientId!,
    clientSecret: env.clientSecret!,
    oidcIssuer: env.oidcIssuer!,
    tokenType: 'DPoP',
  })
  db = drizzle(session, { logger: false, disableInteropDiscovery: true, schema: linxSchema })
  await db.init([modelProviderTable])
  return db
}

async function cleanup() {
  if (!db) return
  for (const subject of createdSubjects) {
    try {
      await db.delete(modelProviderTable).where({ '@id': subject } as any).execute()
    } catch {
      // ignore cleanup errors
    }
  }
}

afterAll(async () => {
  await cleanup()
  if (session) await session.logout()
}, 20000)

describe('pod-collection integration', () => {
  it.skipIf(!hasEnv)('optimistic insert updates local state before persistence', { timeout: 30000 }, async () => {
    const database = await getDb()
    const queryClient = new QueryClient()

    const collection = createPodCollection({
      table: modelProviderTable,
      queryKey: ['model-providers-test-optimistic'],
      queryClient,
      getDb: () => database,
    })

    const ready = new Promise<void>((resolve) => collection.onFirstReady(resolve))
    collection.startSyncImmediate()
    await ready

    const id = `optimistic-${Date.now()}`
    let optimisticSeen = false
    const subscription = collection.subscribeChanges((changes) => {
      if (changes.some((change) => change.type === 'insert' && change.value?.id === id)) {
        optimisticSeen = true
      }
    })

    const tx = collection.insert({
      id,
      enabled: true,
      apiKey: 'sk-test',
      baseUrl: 'https://api.test.com',
      models: [{ id: 'model-1', name: 'model-1', enabled: true }],
    } as any)

    let optimisticCheck: ReturnType<typeof setInterval> | null = null
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
    subscription.unsubscribe()
    expect(result).toBe('optimistic')

    await tx.isPersisted.promise

    const rows = await database.select().from(modelProviderTable).where({ id } as any).execute()
    const created = rows[0]
    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push(subject)
    expect(created?.id).toBe(id)
  })

  it.skipIf(!hasEnv)('pod notifications invalidate queries on create/update/delete', { timeout: 20000 }, async () => {
    const database = await getDb()
    const queryClient = new QueryClient()
    const invalidateSpy = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockImplementation(async () => {})

    const collection = createPodCollection({
      table: modelProviderTable,
      queryKey: ['model-providers-test-notify'],
      queryClient,
      getDb: () => database,
    })

    const unsubscribe = await collection.subscribeToPod(database)

    const id = `notify-${Date.now()}`
    const [created] = await database
      .insert(modelProviderTable)
      .values({
        id,
        enabled: true,
        apiKey: 'sk-test',
        baseUrl: 'https://api.test.com',
        models: [{ id: 'model-1', name: 'model-1', enabled: true }],
      })
      .execute()

    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push(subject)

    const notified = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000)
      const check = setInterval(() => {
        if (invalidateSpy.mock.calls.length > 0) {
          clearTimeout(timeout)
          clearInterval(check)
          resolve(true)
        }
      }, 100)
    })

    await database.update(modelProviderTable).set({ enabled: false }).where({ id } as any).execute()
    await database.delete(modelProviderTable).where({ id } as any).execute()
    await unsubscribe()

    expect(notified).toBe(true)
  })
})
