// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { eq, type SolidDatabase } from '@undefineds.co/drizzle-solid'
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
      await db.delete(contactTable).where({ '@id': subject } as any).execute()
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
    const rows = await database.select().from(contactTable).where(eq(contactTable.id, id)).execute()
    expect(rows.length).toBe(1)
    expect(rows[0]?.name).toBe('Integration Contact')
    expect(rows[0]?.contactType).toBe('solid')
    expect(rows[0]?.rdfType).toBe(ContactClass.PERSON)
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
    const solidRows = await database.select().from(contactTable).where(eq(contactTable.id, `solid-${timestamp}`)).execute()
    expect(solidRows.length).toBe(1)
    expect(solidRows[0]?.contactType).toBe('solid')
    expect(solidRows[0]?.rdfType).toBe(ContactClass.PERSON)

    const extRows = await database.select().from(contactTable).where(eq(contactTable.id, `ext-${timestamp}`)).execute()
    expect(extRows.length).toBe(1)
    expect(extRows[0]?.contactType).toBe('external')
    expect(extRows[0]?.rdfType).toBe(ContactClass.PERSON)
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

    await database.delete(contactTable).where(eq(contactTable.id, id)).execute()

    // Verify deletion via SPARQL SELECT
    const rows = await database.select().from(contactTable).where(eq(contactTable.id, id)).execute()
    expect(rows.length).toBe(0)
  })
})
