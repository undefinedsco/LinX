import { describe, expect, it, vi } from 'vitest'
import {
  accessControlResourceFromLink,
  grantPublicReadAccess,
  removePublicResource,
  type SolidAccessControlResource,
} from './public-resource-access'

describe('public Solid resource access', () => {
  it('uses the ACP relation instead of relying on an .acr URL suffix', () => {
    expect(accessControlResourceFromLink(
      'https://pod.example/public/share.html',
      '<https://pod.example/policies/share>; rel="http://www.w3.org/ns/solid/acp#accessControl"',
    )).toEqual({
      kind: 'acr',
      url: 'https://pod.example/policies/share',
    })
  })

  it('does not delete caller-owned resources when a permission write fails', async () => {
    const accessControl: SolidAccessControlResource = {
      kind: 'acl',
      url: 'https://pod.example/public/share.html.acl',
    }
    const authFetch = vi.fn(async () => new Response('', { status: 500 }))

    await expect(grantPublicReadAccess(
      authFetch as typeof fetch,
      'https://pod.example/public/share.html',
      'https://id.example/alice#me',
      accessControl,
    )).rejects.toThrow('Permission write failed with HTTP 500')

    expect(authFetch).toHaveBeenCalledTimes(1)
    expect(authFetch).toHaveBeenCalledWith(accessControl.url, expect.objectContaining({ method: 'PUT' }))
  })

  it('deletes public content first and continues after an access-control failure', async () => {
    const resourceUrl = 'https://pod.example/public/share.html'
    const advertisedAccessControl = 'https://pod.example/.acr/share'
    const attempted: string[] = []
    const authFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      attempted.push(url)
      return new Response(null, {
        status: url === advertisedAccessControl ? 500 : 204,
      })
    })

    await expect(removePublicResource(
      authFetch as typeof fetch,
      resourceUrl,
      advertisedAccessControl,
    )).rejects.toThrow('Resource revoke failed with HTTP 500')

    expect(attempted).toEqual([
      resourceUrl,
      advertisedAccessControl,
      `${resourceUrl}.acl`,
      `${resourceUrl}.acr`,
    ])
  })
})
