// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest'
import { solidProfileResource, solidSchema } from '@undefineds.co/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'
import { initializeProfileOps, profileOps } from './collections'

let context: XpodIntegrationContext<typeof solidSchema> | null = null

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    resources: [solidProfileResource],
  })
  initializeProfileOps(context.db, context.webId)
  return context
}

afterAll(async () => {
  initializeProfileOps(null, null)
  await context?.stop()
}, 30000)

describe('profile singleton integration', () => {
  it('reads and updates the WebID-addressed profile through the singleton query model', { timeout: 60000 }, async () => {
    const { webId } = await getContext()
    const original = await profileOps.fetch()

    expect(original).toBeTruthy()

    const marker = `profile-integration-${Date.now()}`
    try {
      const updated = await profileOps.updateNote(marker)

      expect(updated).toBeTruthy()
      expect(updated?.note).toBe(marker)
      expect(await profileOps.fetch()).toMatchObject({
        note: marker,
      })
    } finally {
      await profileOps.updateNote(original?.note ?? '')
    }

    expect((await profileOps.fetch())?.['@id'] ?? webId).toBeTruthy()
  })
})
