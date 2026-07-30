// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import type { SolidDatabase } from '@undefineds.co/drizzle-solid'
import { favoriteResource, solidSchema, SCHEMA } from '@undefineds.co/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'

let context: XpodIntegrationContext<typeof solidSchema> | null = null
const createdSubjects: string[] = []

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    resources: [favoriteResource],
  })
  return context
}

async function cleanup() {
  if (!context) return
  const db = context.db
  if (!db) return
  for (const subject of createdSubjects) {
    try {
      await (db as any).deleteByIri(favoriteResource as any, subject)
    } catch {
      // ignore cleanup errors
    }
  }
}

afterAll(async () => {
  await cleanup()
  await context?.stop()
}, 30000)

function makeFavoriteValues(webId: string, tag: string) {
  return {
    id: favoriteResource.buildId({ id: `favorite-${tag}` }),
    targetType: SCHEMA.CreativeWork,
    target: `${webId.split('#')[0]}favorite-${tag}`,
    title: `Integration Favorite ${tag}`,
    sourceModule: 'files',
    searchText: `integration favorite ${tag}`,
    favoredAt: new Date(),
    updatedAt: new Date(),
  }
}

describe('favorite collections integration', () => {
  it('round-trips direct repository CRUD through the Pod query layer', { timeout: 60000 }, async () => {
    const { db: database, webId } = await getContext()
    const tag = `direct-${Date.now()}`
    const values = makeFavoriteValues(webId, tag)

    const [created] = await database.insert(favoriteResource).values(values).execute()
    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push(subject)
    expect(created).toBeDefined()

    const row = await (database as any).findById(favoriteResource as any, values.id)
    expect(row).toBeTruthy()
    expect(row?.title).toBe(values.title)
    expect(row?.sourceModule).toBe('files')

    await (database as any).updateById(favoriteResource as any, values.id, {
      title: 'Integration Favorite Updated',
      snapshotContent: 'updated through direct repository CRUD',
    })
    const updated = await (database as any).findById(favoriteResource as any, values.id)
    expect(updated?.title).toBe('Integration Favorite Updated')
    expect(updated?.snapshotContent).toBe('updated through direct repository CRUD')

    await (database as any).deleteById(favoriteResource as any, values.id)
    const deleted = await (database as any).findById(favoriteResource as any, values.id)
    expect(deleted).toBeNull()
  })
})
