// @vitest-environment node
/**
 * live sync 回归：subscribeToPod 的 onCreate/onUpdate 改为点查+writeUpsert 后，
 * 本地写经 SSE 绕回触发 subscribe 回调，与 onInsert 的 writeUpsert 冗余但幂等，
 * 断言 syncedData/toArray 该行恰一份（无重复行）、subscribe 回调不崩、值正确。
 * delete 仍走 invalidate 兜底（IRI→id 未优化），fetch 后该行消失。
 */
import { afterAll, describe, expect, it } from 'vitest'
import { contactResource, solidSchema } from '@undefineds.co/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'
import {
  contactCollection,
  initializeContactCollections,
} from './modules/contacts/data/collections'

let context: XpodIntegrationContext<typeof solidSchema> | null = null
let unsub: (() => void) | null = null

async function getContext(): Promise<XpodIntegrationContext<typeof solidSchema>> {
  if (context) return context
  context = await createXpodIntegrationContext({
    schema: solidSchema,
    resources: [contactResource],
  })
  await initializeContactCollections(context.db)
  return context
}

afterAll(async () => {
  try {
    unsub?.()
  } catch {
    // ignore
  }
  await context?.stop()
}, 30000)

describe('live sync subscribe writeUpsert regression', () => {
  it('keeps exactly one copy after local insert triggers the subscribe round-trip', { timeout: 60000 }, async () => {
    const ctx = await getContext()
    unsub = await (contactCollection as any).subscribeToPod(ctx.db)

    const id = contactResource.buildId({ id: `live-${Date.now()}` })
    const insert = contactCollection.insert({
      id,
      name: 'Live Sync Contact',
      about: ctx.webId,
      contactType: 'solid',
    } as any)
    await insert.isPersisted.promise

    // allow the SSE round-trip (local write -> subscribe onCreate -> writeUpsert) to settle
    await new Promise((resolve) => setTimeout(resolve, 2500))

    const copiesBeforeFetch = contactCollection.toArray.filter((row) => row.id === id)
    expect(copiesBeforeFetch).toHaveLength(1)
    expect(contactCollection.get(id)?.name).toBe('Live Sync Contact')

    await contactCollection.fetch()
    const copiesAfterFetch = contactCollection.toArray.filter((row) => row.id === id)
    expect(copiesAfterFetch).toHaveLength(1)

    const remove = contactCollection.delete(id)
    await remove.isPersisted.promise
    await contactCollection.fetch()
    expect(contactCollection.toArray.filter((row) => row.id === id)).toHaveLength(0)
  })
})
