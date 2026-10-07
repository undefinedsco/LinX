// @vitest-environment node
import { afterAll, expect, it } from 'vitest'
import { solidSchema } from '@undefineds.co/models'
import { createXpodIntegrationContext, type XpodIntegrationContext } from '@/test/xpod-integration'
import { grantAiServiceResourceAccess } from '../fetch-handler'

let context: XpodIntegrationContext<typeof solidSchema> | undefined
afterAll(async () => context?.stop(), 90_000)

it('initializes a real Pod resource before granting access and preserves its contents on reauthorization', { timeout: 90_000 }, async () => {
  context = await createXpodIntegrationContext({ schema: solidSchema, resources: [] })
  const url = new URL(`settings/access-regression-${Date.now()}.ttl`, context.podUrl).href
  const input = {
    resource: { id: 'regression', url, access: { read: true, append: true, write: true } as const },
    ownerWebId: context.webId,
    serviceWebId: new URL('service/profile/card#me', context.baseUrl).href,
    members: false,
    authFetch: context.authenticatedFetch,
  }
  expect((await input.authFetch(url, { method: 'HEAD' })).status).toBe(404)
  expect(await grantAiServiceResourceAccess(input)).toMatchObject({ read: true, append: true, write: true })
  expect((await input.authFetch(url)).status).toBe(200)
  const contents = '<> <http://www.w3.org/2000/01/rdf-schema#label> "preserve-existing-data" .'
  expect((await input.authFetch(url, { method: 'PUT', headers: { 'Content-Type': 'text/turtle' }, body: contents })).ok).toBe(true)
  await grantAiServiceResourceAccess(input)
  expect(await (await input.authFetch(url)).text()).toContain('preserve-existing-data')
})
