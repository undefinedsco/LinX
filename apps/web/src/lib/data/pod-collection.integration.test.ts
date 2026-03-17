// @vitest-environment node
import dotenv from 'dotenv'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, eq, type SolidDatabase } from '@undefineds.co/drizzle-solid'
import { QueryClient } from '@tanstack/react-query'
import { aiProviderTable, linxSchema } from '@linx/models'
import { createPodCollection } from './pod-collection'

dotenv.config({ path: '.env' })

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

const hasEnv = Boolean(env.webId && env.clientId && env.clientSecret && env.oidcIssuer)

// Check if Pod server is reachable before running integration tests
let podReachable = false
if (hasEnv && env.oidcIssuer) {
  try {
    const probeUrl = new URL('.well-known/openid-configuration', env.oidcIssuer).href
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 5000)
    await fetch(probeUrl, { signal: ctrl.signal }).then(() => { podReachable = true })
    clearTimeout(timer)
  } catch { /* server not reachable */ }
}
const canRun = hasEnv && podReachable

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
  await db.init([aiProviderTable])
  return db
}

async function cleanup() {
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
  await cleanup()
  if (session) await session.logout()
}, 20000)

describe('pod-collection integration', () => {
  it.skipIf(!canRun)('optimistic insert updates local state before persistence', { timeout: 30000 }, async () => {
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

  it.skipIf(!canRun)('pod notifications invalidate queries on create/update/delete', { timeout: 20000 }, async () => {
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
