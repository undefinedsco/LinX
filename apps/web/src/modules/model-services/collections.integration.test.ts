// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import type { SolidDatabase } from '@undefineds.co/drizzle-solid'
import {
  aiModelResource,
  aiProviderResource,
  credentialResource,
  solidSchema,
} from '@undefineds.co/models'
import {
  initializeModelCollections,
  credentialCollection,
} from './collections'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'

let context: XpodIntegrationContext<typeof solidSchema> | null = null
const createdSubjects: Array<{ kind: 'credential' | 'provider' | 'model'; id: string }> = []

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    resources: [credentialResource, aiProviderResource, aiModelResource],
    initialize: (db) => {
      initializeModelCollections(db)
    },
  })
  return context
}

async function cleanup() {
  if (!context) return
  const db = context.db
  if (!db) return

  for (const entry of createdSubjects) {
    try {
      if (entry.kind === 'credential') {
        await (db as any).deleteByIri(credentialResource as any, entry.id)
      } else if (entry.kind === 'provider') {
        await (db as any).deleteByIri(aiProviderResource as any, entry.id)
      } else {
        await (db as any).deleteByIri(aiModelResource as any, entry.id)
      }
    } catch {
      // ignore cleanup errors
    }
  }
}

afterAll(async () => {
  await cleanup()
  await context?.stop()
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

describe('model services collections integration', () => {
  it('credential collection optimistic insert persists', { timeout: 30000 }, async () => {
    const { db: database } = await getContext()

    const ready = new Promise<void>((resolve) => credentialCollection.onFirstReady(resolve))
    credentialCollection.startSyncImmediate()
    await ready

    const id = crypto.randomUUID()
    const newCredential = {
      id,
      provider: '/settings/providers/openai.ttl',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      label: 'Test key',
    }

    let optimisticSeen = false
    const subscription = credentialCollection.subscribeChanges((changes) => {
      if (changes.some((change) => change.type === 'insert' && (change.value as any)?.id === id)) {
        optimisticSeen = true
      }
    })

    const tx = credentialCollection.insert(newCredential as any)
    const result = await Promise.race([
      waitFor(() => optimisticSeen).then((ok) => (ok ? 'optimistic' : 'timeout')),
      tx.isPersisted.promise.then(() => 'persisted'),
    ])

    subscription.unsubscribe()
    expect(result).toBe('optimistic')

    await tx.isPersisted.promise

    const credentialResourceId = credentialResource.buildId({ id })
    const created = await (database as any).findById(credentialResource as any, credentialResourceId)
    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push({ kind: 'credential', id: subject })
    expect(created?.id).toBe(credentialResourceId)
    expect(created?.provider).toContain('/settings/providers/openai.ttl')
  })

  it('provider/model CRUD via drizzle-solid persists to Pod', { timeout: 30000 }, async () => {
    const { db: database } = await getContext()

    const providerId = crypto.randomUUID()
    const modelId = `model-${crypto.randomUUID()}`

    // INSERT
    await database.insert(aiProviderResource).values({
      id: aiProviderResource.buildId({ id: providerId }),
      baseUrl: 'https://api.example.com/v1',
      proxyUrl: '',
      hasModel: `/settings/providers/${providerId}.ttl#${modelId}`,
    } as any).execute()

    await database.insert(aiModelResource).values({
      id: aiModelResource.buildId({ id: modelId, isProvidedBy: providerId }),
      displayName: modelId,
      modelType: 'chat',
      isProvidedBy: providerId,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).execute()

    const providerResourceId = aiProviderResource.buildId({ id: providerId })
    const createdProvider = await (database as any).findById(aiProviderResource as any, providerResourceId)
    const modelResourceId = aiModelResource.buildId({ id: modelId, isProvidedBy: providerId })
    const createdModel = await (database as any).findById(aiModelResource as any, modelResourceId)
    expect(createdProvider?.baseUrl).toBe('https://api.example.com/v1')
    expect(createdModel?.status).toBe('active')

    const providerSubject = (createdProvider as any)?.['@id']
    const modelSubject = (createdModel as any)?.['@id']
    if (providerSubject) createdSubjects.push({ kind: 'provider', id: providerSubject })
    if (modelSubject) createdSubjects.push({ kind: 'model', id: modelSubject })

    // UPDATE
    await (database as any).updateById(aiProviderResource as any, providerResourceId, {
      baseUrl: 'https://api.changed.com/v1',
    })
    await (database as any).updateById(aiModelResource as any, modelResourceId, {
      status: 'inactive',
    })

    const updatedProvider = await (database as any).findById(aiProviderResource as any, providerResourceId)
    const updatedModel = await (database as any).findById(aiModelResource as any, modelResourceId)
    expect(updatedProvider?.baseUrl).toBe('https://api.changed.com/v1')
    expect(updatedModel?.status).toBe('inactive')

    // DELETE
    await (database as any).deleteById(aiModelResource as any, modelResourceId)
    await (database as any).deleteById(aiProviderResource as any, providerResourceId)

    const providerRow = await (database as any).findById(aiProviderResource as any, providerResourceId)
    const modelRow = await (database as any).findById(aiModelResource as any, modelResourceId)
    expect(providerRow).toBeNull()
    expect(modelRow).toBeNull()
  })
})
