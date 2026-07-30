// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import {
  aiModelResource,
  aiProviderResource,
  credentialResource,
  solidSchema,
} from '@undefineds.co/models'
import {
  initializeModelCollections,
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

describe('model services collections integration', () => {
  it('credential CRUD via drizzle-solid persists to Pod RDF', { timeout: 30000 }, async () => {
    const { db: database } = await getContext()

    const id = crypto.randomUUID()
    const credentialResourceId = credentialResource.buildId({ id })

    const [created] = await database.insert(credentialResource).values({
      id: credentialResourceId,
      provider: '/settings/providers/openai.ttl',
      service: 'ai',
      status: 'active',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      label: 'Test key',
    } as any).execute()

    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push({ kind: 'credential', id: subject })
    expect(created).toBeDefined()

    const row = await (database as any).findById(credentialResource as any, credentialResourceId)
    expect(row).toMatchObject({
      id: credentialResourceId,
      service: 'ai',
      status: 'active',
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      label: 'Test key',
    })
    expect(row?.provider).toContain('/settings/providers/openai.ttl')

    await (database as any).updateById(credentialResource as any, credentialResourceId, {
      status: 'inactive',
      label: 'Updated test key',
    })
    const updated = await (database as any).findById(credentialResource as any, credentialResourceId)
    expect(updated).toMatchObject({
      status: 'inactive',
      label: 'Updated test key',
    })

    await (database as any).deleteById(credentialResource as any, credentialResourceId)
    const deleted = await (database as any).findById(credentialResource as any, credentialResourceId)
    expect(deleted).toBeNull()
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
