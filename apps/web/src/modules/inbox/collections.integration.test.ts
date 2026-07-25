// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import type { SolidDatabase } from '@undefineds.co/drizzle-solid'
import { approvalResource, solidSchema } from '@undefineds.co/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'
import {
  approvalCollection,
  initializeInboxCollections,
} from './data/collections'

let context: XpodIntegrationContext<typeof solidSchema> | null = null
const createdSubjects: string[] = []

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    resources: [approvalResource],
  })
  await initializeInboxCollections(context.db)
  return context
}

async function cleanup() {
  if (!context) return
  const db = context.db
  if (!db) return
  for (const subject of createdSubjects) {
    try {
      await (db as any).deleteByIri(approvalResource as any, subject)
    } catch {
      // ignore cleanup errors
    }
  }
}

afterAll(async () => {
  await cleanup()
  await context?.stop()
}, 30000)

function makeApprovalValues(webId: string, tag: string) {
  const base = webId.split('#')[0]
  return {
    id: approvalResource.buildId({ id: `approval-${tag}` }),
    session: `${base}session-${tag}`,
    toolCallId: `tool-${tag}`,
    toolName: 'integration-tool',
    target: `${base}target-${tag}`,
    action: `${base}action-${tag}`,
    risk: 'low',
    status: 'pending',
    createdAt: new Date(),
  }
}

describe('inbox approval collections integration', () => {
  it('round-trips direct repository CRUD through the Pod query layer', { timeout: 60000 }, async () => {
    const { db: database, webId } = await getContext()
    const tag = `direct-${Date.now()}`
    const values = makeApprovalValues(webId, tag)

    const [created] = await database.insert(approvalResource).values(values).execute()
    const subject = (created as any)?.['@id']
    if (subject) createdSubjects.push(subject)
    expect(created).toBeDefined()

    const row = await (database as any).findById(approvalResource as any, values.id)
    expect(row).toBeTruthy()
    expect(row?.toolName).toBe('integration-tool')
    expect(row?.risk).toBe('low')

    await (database as any).updateById(approvalResource as any, values.id, {
      status: 'approved',
      reason: 'updated through direct repository CRUD',
    })
    const updated = await (database as any).findById(approvalResource as any, values.id)
    expect(updated?.status).toBe('approved')
    expect(updated?.reason).toBe('updated through direct repository CRUD')

    await (database as any).deleteById(approvalResource as any, values.id)
    const deleted = await (database as any).findById(approvalResource as any, values.id)
    expect(deleted).toBeNull()
  })

  it('round-trips collection CRUD through the same Pod resource', { timeout: 60000 }, async () => {
    const { db: database, webId } = await getContext()
    const tag = `collection-${Date.now()}`
    const values = makeApprovalValues(webId, tag)

    const insert = approvalCollection.insert(values as any)
    await insert.isPersisted.promise

    await approvalCollection.fetch()
    const fetched = approvalCollection.toArray.find((row) => row.id === values.id)
    expect(fetched?.id).toBe(values.id)
    expect(await (database as any).findById(approvalResource as any, values.id)).toMatchObject({
      toolName: 'integration-tool',
      risk: 'low',
    })

    const update = approvalCollection.update(values.id, (draft: any) => {
      draft.status = 'rejected'
      draft.reason = 'updated through TanStack collection CRUD'
    })
    await update.isPersisted.promise

    await approvalCollection.fetch()
    const persistedUpdate = await (database as any).findById(approvalResource as any, values.id)
    expect(persistedUpdate).toMatchObject({
      status: 'rejected',
      reason: 'updated through TanStack collection CRUD',
    })

    const remove = approvalCollection.delete(values.id)
    await remove.isPersisted.promise

    await approvalCollection.fetch()
    expect(approvalCollection.get(values.id)).toBeUndefined()
    expect(await (database as any).findById(approvalResource as any, values.id)).toBeNull()
  })
})
