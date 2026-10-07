// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { issueResource, solidSchema } from '@undefineds.co/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'
import {
  initializeSymphonyControlCollections,
  symphonyControlOps,
  symphonyIssueCollection,
} from './collections'

let context: XpodIntegrationContext<typeof solidSchema> | null = null
const createdIds: string[] = []

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    resources: [issueResource],
  })
  initializeSymphonyControlCollections(context.db)
  return context
}

afterAll(async () => {
  if (context) {
    for (const id of createdIds) {
      await (context.db as any).deleteById(issueResource as any, id).catch(() => undefined)
    }
  }
  initializeSymphonyControlCollections(null)
  await context?.stop()
}, 30000)

describe('symphony control collection integration', () => {
  it('hydrates a control resource written to the private Pod', { timeout: 60000 }, async () => {
    const { db, webId } = await getContext()
    const key = `integration-${Date.now()}`
    const id = issueResource.buildId({ id: key })
    createdIds.push(id)

    await db.insert(issueResource).values({
      id,
      title: 'Symphony integration issue',
      description: 'proves the web control collection reads private Pod state',
      status: 'open',
      priority: 'medium',
      labels: ['integration', 'symphony'],
      createdBy: webId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).execute()

    const issues = await symphonyIssueCollection.fetch({ refetch: true })
    expect(issues.find((issue) => issue.id === id)).toMatchObject({
      title: 'Symphony integration issue',
      status: 'open',
      labels: expect.arrayContaining(['integration', 'symphony']),
    })

    const snapshot = await symphonyControlOps.fetchSnapshot()
    expect(snapshot.issues.some((issue) => issue.id === id)).toBe(true)
  })
})
