// @vitest-environment node
import dotenv from 'dotenv'
import { afterAll, describe, expect, it } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, eq, type SolidDatabase } from '@undefineds.co/drizzle-solid'
import { contactTable, solidSchema } from '@undefineds.co/models'
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

let session: Session | null = null
let db: SolidDatabase | null = null
const createdSubjects: string[] = []

async function getDb(): Promise<SolidDatabase> {
  if (db) return db

  const activeEnv = await ensureEnv()
  session = new Session()
  await session.login({
    clientId: activeEnv.clientId!,
    clientSecret: activeEnv.clientSecret!,
    oidcIssuer: activeEnv.oidcIssuer!,
    tokenType: 'DPoP',
  })

  db = drizzle(session, { logger: false, disableInteropDiscovery: true, schema: solidSchema })
  await db.init([contactTable])
  return db
}

async function cleanup() {
  if (!db) return
  for (const subject of createdSubjects) {
    try {
      await db.delete(contactTable).whereByIri(subject).execute()
    } catch {
      // ignore cleanup errors
    }
  }
}

afterAll(async () => {
  await cleanup()
  if (session) await session.logout()
  await localXpod?.stop()
}, 30000)

describe('contact collections integration', () => {
  it('insert contact and SELECT back via SPARQL', { timeout: 30000 }, async () => {
    const database = await getDb()

    const id = `contact-${Date.now()}`
    const [created] = await database.insert(contactTable).values({
      id,
      name: 'Integration Contact',
      entityUri: env.webId!,
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
  })

  it('insert multiple contacts and verify via SELECT', { timeout: 30000 }, async () => {
    const database = await getDb()

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

    const extRows = await database.select().from(contactTable).where(eq(contactTable.id, `ext-${timestamp}`)).execute()
    expect(extRows.length).toBe(1)
    expect(extRows[0]?.contactType).toBe('external')
  })

  it('delete contact and verify via SELECT', { timeout: 30000 }, async () => {
    const database = await getDb()

    const id = `contact-del-${Date.now()}`
    const [created] = await database.insert(contactTable).values({
      id,
      name: 'Delete Me',
      entityUri: env.webId!,
      contactType: 'solid',
    }).execute()

    expect(created).toBeDefined()

    await database.delete(contactTable).where(eq(contactTable.id, id)).execute()

    // Verify deletion via SPARQL SELECT
    const rows = await database.select().from(contactTable).where(eq(contactTable.id, id)).execute()
    expect(rows.length).toBe(0)
  })
})
