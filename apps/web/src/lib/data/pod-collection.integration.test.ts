// @vitest-environment node
import dotenv from 'dotenv'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, eq } from '@undefineds.co/drizzle-solid'
import { QueryClient } from '@tanstack/react-query'
import { aiProviderTable, solidSchema, type SolidDatabase } from '@undefineds.co/models'
import { createPodCollection } from './pod-collection'
import { startLocalXpod, type LocalXpodTestPod } from '../../test-utils/local-xpod'

dotenv.config({ path: '.env' })

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

let localXpod: LocalXpodTestPod | null = null

async function ensureEnv(): Promise<typeof env> {
  if (env.webId && env.clientId && env.clientSecret && env.oidcIssuer) return env
  if (!localXpod) {
    localXpod = await startLocalXpod()
  }
  env.webId = localXpod.webId
  env.clientId = localXpod.clientId
  env.clientSecret = localXpod.clientSecret
  env.oidcIssuer = localXpod.oidcIssuer
  return env
}

let db: SolidDatabase<any> | null = null
let session: Session | null = null
const createdSubjects: string[] = []

async function getDb() {
  if (db) return db
  const activeEnv = await ensureEnv()
  session = new Session()
  await session.login({
    clientId: activeEnv.clientId!,
    clientSecret: activeEnv.clientSecret!,
    oidcIssuer: activeEnv.oidcIssuer!,
    tokenType: 'DPoP',
  })
  const createdDb = drizzle(session, { logger: false, disableInteropDiscovery: true, schema: solidSchema }) as SolidDatabase<any>
  db = createdDb
  await createdDb.init([aiProviderTable])
  return createdDb
}

async function cleanup() {
  if (!db) return
  for (const subject of createdSubjects) {
    try {
      await db.delete(aiProviderTable).whereByIri(subject).execute()
    } catch {
      // ignore cleanup errors
    }
  }
}

afterAll(async () => {
  await cleanup()
  if (session) {
    await Promise.race([
      session.logout(),
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ])
  }
  await Promise.race([
    localXpod?.stop() ?? Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ])
}, 60000)

describe('pod-collection integration', () => {
  it('optimistic insert updates local state before persistence', { timeout: 30000 }, async () => {
    const database = await getDb()
    const queryClient = new QueryClient()

    const collection = createPodCollection({
      table: aiProviderTable,
      queryKey: ['model-providers-test-optimistic'],
      queryClient,
      getDb: () => database,
    })

    const ready = new Promise<void>((resolve) => collection.onFirstReady(resolve))
    collection.startSyncImmediate()
    await ready

    const id = crypto.randomUUID()
    let optimisticSeen = false
    const subscription = collection.subscribeChanges((changes) => {
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

    const rows = await database.select().from(aiProviderTable).where(eq(aiProviderTable.id, id)).execute()
    const created = rows[0]
    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push(subject)
    expect(created?.id).toBe(id)
  })

  it('pod notifications invalidate queries on create/update/delete', { timeout: 20000 }, async () => {
    const database = await getDb()
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

    const unsubscribe = await collection.subscribeToPod(database)

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

    await database.update(aiProviderTable).set({ proxyUrl: 'https://proxy.changed.test.com' }).where({ id } as any).execute()
    await database.delete(aiProviderTable).where({ id } as any).execute()
    await unsubscribe()

    expect(notified).toBe(true)
  })
})
