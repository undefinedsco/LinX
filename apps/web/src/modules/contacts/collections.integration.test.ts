// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import type { SolidDatabase } from '@undefineds.co/drizzle-solid'
import { ContactClass, contactTable, linxSchema } from '@linx/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'

let context: XpodIntegrationContext<typeof linxSchema> | null = null
const createdSubjects: string[] = []

async function getContext(): Promise<XpodIntegrationContext<typeof linxSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: linxSchema,
    tables: [contactTable],
  })
  return context
}

async function cleanup() {
  if (!context) return
  const db = context.db
  if (!db) return
  for (const subject of createdSubjects) {
    try {
      await (db as any).deleteByIri(contactTable as any, subject)
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
  it('insert contact and SELECT back via SPARQL', { timeout: 30000 }, async () => {
    const { db: database, webId } = await getContext()

    const id = `contact-${Date.now()}`
    const [created] = await database.insert(contactTable).values({
      id,
      name: 'Integration Contact',
      entityUri: webId,
      contactType: 'solid',
    }).execute()

    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push(subject)

    expect(created).toBeDefined()

    // Round-trip: SELECT back via SPARQL endpoint
    const row = await (database as any).findByLocator(contactTable as any, { id } as any)
    expect(row).toBeTruthy()
    expect(row?.name).toBe('Integration Contact')
    expect(row?.contactType).toBe('solid')
  })

  it('insert multiple contacts and verify via SELECT', { timeout: 30000 }, async () => {
    const { db: database } = await getContext()

    const timestamp = Date.now()
    const contacts = [
      { id: `solid-${timestamp}`, name: 'Solid User', contactType: 'solid', entityUri: `https://solid-${timestamp}.pod/#me` },
      { id: `ext-${timestamp}`, name: 'External User', contactType: 'external', externalId: `wxid_${timestamp}`, entityUri: `wxid_${timestamp}` },
    ]

    for (const contact of contacts) {
      const [created] = await database.insert(contactTable).values(contact).execute()
      const subject = (created as any)?.['@id']
      if (subject) createdSubjects.push(subject)
      expect(created).toBeDefined()
    }

    // Verify both contacts via SPARQL SELECT
    const solidRow = await (database as any).findByLocator(contactTable as any, { id: `solid-${timestamp}` } as any)
    expect(solidRow).toBeTruthy()
    expect(solidRow?.contactType).toBe('solid')

    const extRow = await (database as any).findByLocator(contactTable as any, { id: `ext-${timestamp}` } as any)
    expect(extRow).toBeTruthy()
    expect(extRow?.contactType).toBe('external')
  })

  it('delete contact and verify via SELECT', { timeout: 30000 }, async () => {
    const { db: database, webId } = await getContext()

    const id = `contact-del-${Date.now()}`
    const [created] = await database.insert(contactTable).values({
      id,
      name: 'Delete Me',
      entityUri: webId,
      contactType: 'solid',
    }).execute()

    expect(created).toBeDefined()

    await (database as any).deleteByLocator(contactTable as any, { id } as any)

    // Verify deletion via SPARQL SELECT
    const row = await (database as any).findByLocator(contactTable as any, { id } as any)
    expect(row).toBeNull()
  })
})
