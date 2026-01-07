// @vitest-environment node
import dotenv from 'dotenv'
import { afterAll, describe, expect, it } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, eq, type SolidDatabase } from 'drizzle-solid'
import { linxSchema, modelProviderTable } from '@linx/models'
import { initializeModelCollections, providerCollection } from './collections'

dotenv.config({ path: '../../.env' })

const env = {
  webId: process.env.SOLID_WEBID,
  clientId: process.env.SOLID_CLIENT_ID,
  clientSecret: process.env.SOLID_CLIENT_SECRET,
  oidcIssuer: process.env.SOLID_OIDC_ISSUER,
}

const hasEnv = Boolean(env.webId && env.clientId && env.clientSecret && env.oidcIssuer)

let session: Session | null = null
let db: SolidDatabase | null = null
const createdSubjects: string[] = []

async function getDb(): Promise<SolidDatabase> {
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
  initializeModelCollections(db)
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
}, 40000)

function waitFor(predicate: () => boolean, timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs)
    const interval = setInterval(() => {
      if (predicate()) {
        clearTimeout(timeout)
        clearInterval(interval)
        resolve(true)
      }
    }, 50)
  })
}

describe('model provider collection integration', () => {
  it.skipIf(!hasEnv)('optimistic insert persists', { timeout: 30000 }, async () => {
    const database = await getDb()
    const ready = new Promise<void>((resolve) => providerCollection.onFirstReady(resolve))
    providerCollection.startSyncImmediate()
    await ready

    const id = `provider-${Date.now()}`
    const newProvider = {
      id,
      enabled: true,
      apiKey: 'sk-test',
      baseUrl: 'https://api.test.com',
      models: [{ id: 'model-1', name: 'model-1', enabled: true, capabilities: [] }],
    }

    let optimisticSeen = false
    const subscription = providerCollection.subscribeChanges((changes) => {
      if (changes.some((change) => change.type === 'insert' && change.value?.id === id)) {
        optimisticSeen = true
      }
    })

    const tx = providerCollection.insert(newProvider as any)
    const result = await Promise.race([
      waitFor(() => optimisticSeen).then((ok) => (ok ? 'optimistic' : 'timeout')),
      tx.isPersisted.promise.then(() => 'persisted'),
    ])

    subscription.unsubscribe()
    expect(result).toBe('optimistic')

    await tx.isPersisted.promise

    const rows = await database.select().from(modelProviderTable).where(eq(modelProviderTable.id, id)).execute()
    const created = rows[0]
    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push(subject)
    expect(created?.id).toBe(id)
  })

  it.skipIf(!hasEnv)('updates and deletes via collection', { timeout: 30000 }, async () => {
    const database = await getDb()

    const ready = new Promise<void>((resolve) => providerCollection.onFirstReady(resolve))
    providerCollection.startSyncImmediate()
    await ready

    const id = `provider-update-${Date.now()}`
    const insertTx = providerCollection.insert({
      id,
      enabled: false,
      apiKey: '',
      baseUrl: 'https://api.test.com',
      models: [{ id: 'model-2', name: 'model-2', enabled: true, capabilities: [] }],
    } as any)
    await insertTx.isPersisted.promise

    const matchesId = (row: any) => row?.id === id || row?.['@id']?.includes?.(id)
    await waitFor(() => {
      return (providerCollection.state.data ?? []).some(matchesId)
    })
    if (!providerCollection.state.data?.some(matchesId)) {
      await providerCollection.fetch()
    }

    const [created] = await database.select().from(modelProviderTable).where(eq(modelProviderTable.id, id)).execute()
    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push(subject)

    const stateItem = providerCollection.state.data?.find(matchesId)
    if (!stateItem) return
    const key = (stateItem as any)?.['@id'] ?? stateItem?.id ?? id

    const updateTx = providerCollection.update(key, (draft: any) => {
      draft.enabled = true
      draft.apiKey = 'sk-updated'
    })
    await updateTx.isPersisted.promise

    const [updated] = await database.select().from(modelProviderTable).where(eq(modelProviderTable.id, id)).execute()
    expect(updated?.enabled).toBe(true)
    expect(updated?.apiKey).toBe('sk-updated')

    const deleteTx = providerCollection.delete(key)
    await deleteTx.isPersisted.promise
    const rows = await database.select().from(modelProviderTable).where(eq(modelProviderTable.id, id)).execute()
    expect(rows.length).toBe(0)
  })
})
