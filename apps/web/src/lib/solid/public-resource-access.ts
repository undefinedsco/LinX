export interface SolidAccessControlResource {
  kind: 'acl' | 'acr'
  url: string
}

function safeHttpUrl(value: string, label: string): URL {
  const url = new URL(value)
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new Error(`${label} must be an HTTP(S) URL without embedded credentials`)
  }
  return url
}

function publicReadAcl(resourceUrl: string, ownerWebId: string): string {
  const resource = safeHttpUrl(resourceUrl, 'Resource URL').href
  const owner = safeHttpUrl(ownerWebId, 'Owner WebID').href
  return `@prefix acl: <http://www.w3.org/ns/auth/acl#> .\n@prefix foaf: <http://xmlns.com/foaf/0.1/> .\n\n<#owner> a acl:Authorization; acl:accessTo <${resource}>; acl:agent <${owner}>; acl:mode acl:Read, acl:Write, acl:Control .\n<#public> a acl:Authorization; acl:accessTo <${resource}>; acl:agentClass foaf:Agent; acl:mode acl:Read .\n`
}

function publicReadAcr(resourceUrl: string, ownerWebId: string): string {
  const resource = safeHttpUrl(resourceUrl, 'Resource URL').href
  const owner = safeHttpUrl(ownerWebId, 'Owner WebID').href
  return `@prefix acp: <http://www.w3.org/ns/solid/acp#> .\n@prefix acl: <http://www.w3.org/ns/auth/acl#> .\n\n<#root> a acp:AccessControlResource; acp:resource <${resource}>; acp:accessControl <#ownerAccess>, <#publicReadAccess> .\n<#ownerAccess> a acp:AccessControl; acp:apply <#ownerPolicy> .\n<#ownerPolicy> a acp:Policy; acp:allow acl:Read, acl:Write, acl:Control; acp:anyOf <#ownerMatcher> .\n<#ownerMatcher> a acp:Matcher; acp:agent <${owner}> .\n<#publicReadAccess> a acp:AccessControl; acp:apply <#publicReadPolicy> .\n<#publicReadPolicy> a acp:Policy; acp:allow acl:Read; acp:anyOf <#publicMatcher> .\n<#publicMatcher> a acp:Matcher; acp:agent acp:PublicAgent .\n`
}

export function accessControlResourceFromLink(
  resourceUrl: string,
  linkHeader: string | null,
): SolidAccessControlResource | null {
  if (!linkHeader) return null
  for (const entry of linkHeader.split(/,(?=\s*<)/u)) {
    const match = entry.match(/<([^>]+)>\s*;[\s\S]*?rel\s*=\s*"?([^";,]+)"?/iu)
    if (!match) continue
    const relation = match[2].trim()
    const isAcr = relation.includes('accessControl')
    if (relation !== 'acl' && !isAcr) continue
    const url = new URL(match[1], resourceUrl).href
    if (new URL(url).origin !== new URL(resourceUrl).origin) {
      throw new Error('Permission resource must use the same origin as its resource')
    }
    return { kind: isAcr ? 'acr' : 'acl', url }
  }
  return null
}

export async function discoverAccessControlResource(
  authFetch: typeof fetch,
  resourceUrl: string,
): Promise<SolidAccessControlResource> {
  const response = await authFetch(resourceUrl, { method: 'HEAD' })
  if (!response.ok) throw new Error(`Permission discovery failed with HTTP ${response.status}`)
  return accessControlResourceFromLink(resourceUrl, response.headers.get('Link'))
    ?? { kind: 'acl', url: `${resourceUrl}.acl` }
}

export async function grantPublicReadAccess(
  authFetch: typeof fetch,
  resourceUrl: string,
  ownerWebId: string,
  discoveredAccessControl?: SolidAccessControlResource,
): Promise<SolidAccessControlResource> {
  const accessControl = discoveredAccessControl
    ?? await discoverAccessControlResource(authFetch, resourceUrl)
  const response = await authFetch(accessControl.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: accessControl.kind === 'acr'
      ? publicReadAcr(resourceUrl, ownerWebId)
      : publicReadAcl(resourceUrl, ownerWebId),
  })
  if (!response.ok) {
    throw new Error(`Permission write failed with HTTP ${response.status}`)
  }
  return accessControl
}

export async function removePublicResource(
  authFetch: typeof fetch,
  resourceUrl: string,
  accessControlUrl?: string,
): Promise<void> {
  // Delete the public payload first. Permission resources are then cleaned up
  // independently so one failed ACL/ACR request cannot leave content exposed.
  const urls = new Set([resourceUrl, accessControlUrl, `${resourceUrl}.acl`, `${resourceUrl}.acr`])
  let firstError: Error | undefined
  for (const url of urls) {
    if (!url) continue
    try {
      const response = await authFetch(url, { method: 'DELETE' })
      if (!response.ok && response.status !== 404 && !firstError) {
        firstError = new Error(`Resource revoke failed with HTTP ${response.status}`)
      }
    } catch (error) {
      if (!firstError) {
        firstError = error instanceof Error ? error : new Error('Resource revoke failed')
      }
    }
  }
  if (firstError) throw firstError
}
