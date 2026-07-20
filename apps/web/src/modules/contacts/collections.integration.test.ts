// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import type { SolidDatabase } from '@undefineds.co/drizzle-solid'
import { contactResource, solidSchema } from '@undefineds.co/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'
import {
  contactCollection,
  initializeContactCollections,
} from './data/collections'

let context: XpodIntegrationContext<typeof solidSchema> | null = null
const createdSubjects: string[] = []

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    resources: [contactResource],
  })
  await initializeContactCollections(context.db)
  return context
}

async function cleanup() {
  if (!context) return
  const db = context.db
  if (!db) return
  for (const subject of createdSubjects) {
    try {
      await (db as any).deleteByIri(contactResource as any, subject)
    } catch {
      // ignore cleanup errors
    }
  }
}

afterAll(async () => {
  await cleanup()
  await context?.stop()
}, 30000)

describe('contact collections integration', () => {
  it('round-trips direct repository CRUD through the Pod query layer', { timeout: 60000 }, async () => {
    const { db: database, webId } = await getContext()

    const id = `contact-${Date.now()}`
    const resourceId = contactResource.buildId({ id })
    const [created] = await database.insert(contactResource).values({
      id: resourceId,
      name: 'Integration Contact',
      about: webId,
      contactType: 'solid',
    }).execute()

    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push(subject)

    expect(created).toBeDefined()

    // Round-trip: SELECT back via SPARQL endpoint
    const row = await (database as any).findById(contactResource as any, resourceId)
    expect(row).toBeTruthy()
    expect(row?.name).toBe('Integration Contact')
    expect(row?.contactType).toBe('solid')

    await (database as any).updateById(contactResource as any, resourceId, {
      name: 'Integration Contact Updated',
      note: 'updated through direct repository CRUD',
    })
    const updated = await (database as any).findById(contactResource as any, resourceId)
    expect(updated?.name).toBe('Integration Contact Updated')
    expect(updated?.note).toBe('updated through direct repository CRUD')

    await (database as any).deleteById(contactResource as any, resourceId)
    const deleted = await (database as any).findById(contactResource as any, resourceId)
    expect(deleted).toBeNull()
  })

  it('lists direct writes through a collection-backed resource query', { timeout: 60000 }, async () => {
    const { db: database } = await getContext()

    const timestamp = Date.now()
    const contacts = [
      { id: contactResource.buildId({ id: `solid-${timestamp}` }), name: 'Solid User', contactType: 'solid', about: `https://solid-${timestamp}.pod/#me` },
      { id: contactResource.buildId({ id: `ext-${timestamp}` }), name: 'External User', contactType: 'external', externalId: `wxid_${timestamp}`, about: `wxid_${timestamp}` },
    ]

    for (const contact of contacts) {
      const [created] = await database.insert(contactResource).values(contact).execute()
      const subject = (created as any)?.['@id']
      if (subject) createdSubjects.push(subject)
      expect(created).toBeDefined()
    }

    // Verify both contacts via SPARQL SELECT
    const solidRow = await (database as any).findById(
      contactResource as any,
      contactResource.buildId({ id: `solid-${timestamp}` }),
    )
    expect(solidRow).toBeTruthy()
    expect(solidRow?.contactType).toBe('solid')

    const extRow = await (database as any).findById(
      contactResource as any,
      contactResource.buildId({ id: `ext-${timestamp}` }),
    )
    expect(extRow).toBeTruthy()
    expect(extRow?.contactType).toBe('external')
  })

  it('round-trips collection CRUD through the same Pod resource', { timeout: 60000 }, async () => {
    const { db: database, webId } = await getContext()
    const resourceId = contactResource.buildId({ id: `collection-contact-${Date.now()}` })

    const insert = contactCollection.insert({
      id: resourceId,
      name: 'Collection Contact',
      about: webId,
      contactType: 'solid',
    } as any)
    await insert.isPersisted.promise

    await contactCollection.fetch()
    const fetched = contactCollection.toArray.find((row) => row.name === 'Collection Contact')
    expect(fetched?.id).toBe(resourceId)
    expect(await (database as any).findById(contactResource as any, resourceId)).toMatchObject({
      name: 'Collection Contact',
      contactType: 'solid',
    })

    const update = contactCollection.update(resourceId, (draft: any) => {
      draft.name = 'Collection Contact Updated'
      draft.note = 'updated through TanStack collection CRUD'
    })
    await update.isPersisted.promise

    await contactCollection.fetch()
    const persistedUpdate = await (database as any).findById(contactResource as any, resourceId)
    expect(persistedUpdate).toMatchObject({
      name: 'Collection Contact Updated',
      note: 'updated through TanStack collection CRUD',
    })
    expect(contactCollection.toArray.map((row) => ({ id: row.id, name: row.name }))).toContainEqual({
      id: resourceId,
      name: 'Collection Contact Updated',
    })

    const clearNote = contactCollection.update(resourceId, (draft: any) => {
      draft.note = null
    })
    await clearNote.isPersisted.promise

    await contactCollection.fetch()
    const cleared = await (database as any).findById(contactResource as any, resourceId)
    expect(cleared?.note).toBeUndefined()
    expect(contactCollection.toArray.find((row) => row.id === resourceId)?.name).toBe('Collection Contact Updated')

    const remove = contactCollection.delete(resourceId)
    await remove.isPersisted.promise

    await contactCollection.fetch()
    expect(contactCollection.get(resourceId)).toBeUndefined()
    expect(await (database as any).findById(contactResource as any, resourceId)).toBeNull()
  })
})
