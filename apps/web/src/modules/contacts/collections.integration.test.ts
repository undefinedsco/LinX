// @vitest-environment node
import dotenv from 'dotenv'
import { afterAll, describe, expect, it } from 'vitest'
import { Session } from '@inrupt/solid-client-authn-node'
import { drizzle, eq, type SolidDatabase } from '@undefineds.co/drizzle-solid'
import { contactTable, linxSchema } from '@linx/models'

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

let session: Session | null = null
let db: SolidDatabase | null = null
let loginFailed = false
const createdSubjects: string[] = []

async function getDb(): Promise<SolidDatabase | null> {
  if (loginFailed) return null
  if (db) return db

  try {
    session = new Session()
    await session.login({
      clientId: env.clientId!,
      clientSecret: env.clientSecret!,
      oidcIssuer: env.oidcIssuer!,
      tokenType: 'DPoP',
    })

    db = drizzle(session, { logger: false, disableInteropDiscovery: true, schema: linxSchema })
    await db.init([contactTable])
    return db
  } catch (e) {
    console.log('[Test] Login failed:', (e as Error).message)
    loginFailed = true
    return null
  }
}

async function cleanup() {
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
  if (session) await session.logout()
}, 30000)

describe('contact collections integration', () => {
  it.skipIf(!canRun)('insert contact and SELECT back via SPARQL', { timeout: 30000 }, async () => {
    const database = await getDb()
    if (!database) return

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

  it.skipIf(!canRun)('insert multiple contacts and verify via SELECT', { timeout: 30000 }, async () => {
    const database = await getDb()
    if (!database) return

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

  it.skipIf(!canRun)('delete contact and verify via SELECT', { timeout: 30000 }, async () => {
    const database = await getDb()
    if (!database) return

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
