import {
  addUrl,
  buildThing,
  createAclFromFallbackAcl,
  createThing,
  getResourceAcl,
  getSolidDataset,
  getSolidDatasetWithAcl,
  getThingAll,
  getUrlAll,
  hasFallbackAcl,
  hasResourceAcl,
  saveAclFor,
  saveSolidDatasetAt,
  solidDatasetAsTurtle,
  setAgentDefaultAccess,
  setAgentResourceAccess,
  setThing,
  type AclDataset,
} from '@inrupt/solid-client'

/**
 * Generic Solid resource grant through the access-control mechanism the Pod
 * actually advertises: ACP/ACR when linked, WAC handled by the caller through
 * `universalAccess`. Extracted from the ChatKit AI-service grant so room
 * sharing uses the same capability instead of a second WAC-only stack.
 *
 * No AI identity, provider resource, or Pod-root scope is implied here.
 */

const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
const ACP = 'http://www.w3.org/ns/solid/acp#'
const ACL = 'http://www.w3.org/ns/auth/acl#'
const ACP_ACCESS_CONTROL_RESOURCE = `${ACP}AccessControlResource`
const ACP_ACCESS_CONTROL_LINK = `${ACP}accessControl`
const ACP_MEMBER_ACCESS_CONTROL = `${ACP}memberAccessControl`
const ACP_ACCESS_CONTROL = `${ACP}AccessControl`
const ACP_APPLY = `${ACP}apply`
const ACP_POLICY = `${ACP}Policy`
const ACP_ALLOW = `${ACP}allow`
const ACP_ANY_OF = `${ACP}anyOf`
const ACP_MATCHER = `${ACP}Matcher`
const ACP_AGENT = `${ACP}agent`
const ACL_READ = `${ACL}Read`
const ACL_APPEND = `${ACL}Append`
const ACL_WRITE = `${ACL}Write`

export interface ResourceAgentAccess {
  read: true
  append: true
  write: true
}

export type AdvertisedAcrLink = 'access' | 'member' | 'both'

/**
 * Collision-resistant, stable fragment key for a full WebID. Callers must not
 * truncate identities into a short suffix: different WebIDs may share a suffix.
 */
export async function advertisedAcrControlKey(prefix: string, webId: string): Promise<string> {
  const digest = await sha256Hex(`${prefix}\n${webId}`)
  return `${prefix}-${digest.slice(0, 32)}`
}

async function sha256Hex(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) throw new Error('浏览器不支持安全摘要，无法生成授权标识。')
  const bytes = await subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export interface AdvertisedAcrGrantInput {
  resourceUrl: string
  ownerWebId: string
  agentWebId: string
  access: ResourceAgentAccess
  /** Which container links to add for the agent's access control. */
  links: AdvertisedAcrLink
  authFetch: typeof fetch
  /** Fragment prefix for the agent's access/policy/matcher, e.g. `linxMatrixEditor`. */
  controlPrefix: string
  /** Human label used in error messages, never secret. */
  label?: string
}

/** Discover the `.acr` advertised by the resource's Link header, if any. */
export async function discoverAdvertisedAcr(
  resourceUrl: string,
  authFetch: typeof fetch,
): Promise<{ url: string; exists: boolean }> {
  const info = await authFetch(resourceUrl, { method: 'HEAD' })
  if (info.status !== 200 && info.status !== 404) {
    throw new Error(`读取资源授权信息失败（HTTP ${info.status}）。`)
  }
  const match = info.headers.get('Link')?.match(/<([^>]+)>\s*;\s*rel=["']acl["']/iu)
  if (!match?.[1]) throw new Error('资源没有提供访问控制地址，无法授权。')

  const discovered = new URL(match[1], resourceUrl)
  const expected = new URL(`${resourceUrl}.acr`)
  if (discovered.href !== expected.href) {
    throw new Error('资源返回了越界的访问控制地址。')
  }
  const current = await authFetch(discovered.href, { headers: { Accept: 'text/turtle' } })
  if (current.status !== 404 && !current.ok) {
    throw new Error(`读取访问控制文档失败（HTTP ${current.status}）。`)
  }
  return { url: discovered.href, exists: current.ok }
}

/**
 * Create the first ACR for a resource: owner keeps Read/Write/Control, the
 * agent gets Read/Append/Write and (when requested) member access for future
 * descendants. The agent never receives Control.
 */
export function createInitialAdvertisedAcr(input: {
  resourceUrl: string
  ownerWebId: string
  agentWebId: string
  links: AdvertisedAcrLink
  controlPrefix: string
}): string {
  const iri = (value: string) => `<${value.replace(/>/gu, '%3E')}>`
  const links = input.links === 'both'
    ? 'acp:accessControl <#owner>, <#agent>;\n  acp:memberAccessControl <#owner>, <#agent>'
    : input.links === 'member'
      ? 'acp:memberAccessControl <#owner>, <#agent>'
      : 'acp:accessControl <#owner>, <#agent>'
  return [
    '@prefix acp: <http://www.w3.org/ns/solid/acp#>.',
    '@prefix acl: <http://www.w3.org/ns/auth/acl#>.',
    '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.',
    '',
    '<#acr> a acp:AccessControlResource;',
    `  acp:resource ${iri(input.resourceUrl)};`,
    `  ${links}.`,
    '<#owner> a acp:AccessControl; acp:apply <#ownerPolicy>.',
    '<#ownerPolicy> a acp:Policy;',
    '  acp:allow acl:Read, acl:Write, acl:Control; acp:anyOf <#ownerMatcher>.',
    `<#ownerMatcher> a acp:Matcher; acp:agent ${iri(input.ownerWebId)}.`,
    '<#agent> a acp:AccessControl; acp:apply <#agentPolicy>.',
    '<#agentPolicy> a acp:Policy;',
    '  acp:allow acl:Read, acl:Append, acl:Write; acp:anyOf <#agentMatcher>.',
    `<#agentMatcher> a acp:Matcher; acp:agent ${iri(input.agentWebId)}.`,
    '',
  ].join('\n')
}

/**
 * Grant one agent access on a resource through its advertised ACR. Existing
 * policies are preserved; only the agent's own controls are added.
 */
export async function grantAdvertisedAcrAccess(
  input: AdvertisedAcrGrantInput,
): Promise<ResourceAgentAccess> {
  const label = input.label ?? 'resource'
  const state = await discoverAdvertisedAcr(input.resourceUrl, input.authFetch)
  if (!state.exists) {
    const initialized = await input.authFetch(state.url, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/turtle', 'If-None-Match': '*' },
      body: createInitialAdvertisedAcr(input),
    })
    if (initialized.ok) return input.access
    if (initialized.status !== 412) {
      throw new Error(`创建${label}的访问控制失败（HTTP ${initialized.status}）。`)
    }
    // Lost a bootstrap race: another grant created the document. Re-read and
    // merge into it instead of replacing it.
    return await grantAdvertisedAcrAccess(input)
  }

  const acr = await getSolidDataset(state.url, { fetch: input.authFetch })
  const controlKey = await advertisedAcrControlKey(input.controlPrefix, input.agentWebId)
  const merged = await mergeAdvertisedAcrGrant({
    acr,
    acrUrl: state.url,
    agentWebId: input.agentWebId,
    access: input.access,
    links: input.links,
    controlKey,
  })
  await saveAdvertisedAcr(state.url, merged, input.authFetch)
  return input.access
}

/** Discover whether the resource advertises WAC (`.acl`) or ACP (`.acr`). */
export async function discoverAdvertisedAccessControl(
  resourceUrl: string,
  authFetch: typeof fetch,
): Promise<{ kind: 'acp' | 'wac'; url: string }> {
  const info = await authFetch(resourceUrl, { method: 'HEAD' })
  if (info.status !== 200) {
    throw new Error(`读取资源授权信息失败（HTTP ${info.status}）。`)
  }
  const match = info.headers.get('Link')?.match(/<([^>]+)>\s*;\s*rel=["']acl["']/iu)
  if (!match?.[1]) throw new Error('资源没有提供访问控制地址，无法授权。')
  const url = new URL(match[1], resourceUrl).href
  if (url === `${resourceUrl}.acr`) return { kind: 'acp', url }
  if (url === `${resourceUrl}.acl`) return { kind: 'wac', url }
  throw new Error('资源返回了越界的访问控制地址。')
}

/**
 * WAC grant on the resource itself AND its future descendants, preserving any
 * existing resource ACL (or deriving it from the accessible fallback ACL).
 * Resource-only permission is never reported as success.
 */
export async function grantAdvertisedWacAccess(input: {
  resourceUrl: string
  agentWebId: string
  access: ResourceAgentAccess
  authFetch: typeof fetch
}): Promise<ResourceAgentAccess> {
  const resource = await getSolidDatasetWithAcl(input.resourceUrl, { fetch: input.authFetch }) as any
  let acl: AclDataset
  if (hasResourceAcl(resource)) {
    acl = getResourceAcl(resource) as AclDataset
  } else if (hasFallbackAcl(resource)) {
    acl = createAclFromFallbackAcl(resource as any) as AclDataset
  } else {
    throw new Error('资源没有可访问的 WAC 规则，无法在不覆盖现有策略的情况下授权。')
  }
  acl = setAgentResourceAccess(acl, input.agentWebId, input.access as any)
  acl = setAgentDefaultAccess(acl, input.agentWebId, input.access as any)
  await saveAclFor(resource as any, acl, { fetch: input.authFetch })
  return input.access
}

/**
 * Merge one agent grant into an existing ACR dataset. Shared by the AI service
 * access flow and Matrix room sharing. `controlKey` is the caller's stable
 * fragment key; existing things are never removed.
 */
export async function mergeAdvertisedAcrGrant(input: {
  acr: Awaited<ReturnType<typeof getSolidDataset>>
  acrUrl: string
  agentWebId: string
  access: ResourceAgentAccess
  links: AdvertisedAcrLink
  controlKey: string
}): Promise<Awaited<ReturnType<typeof getSolidDataset>>> {
  const root = getThingAll(input.acr).find((thing) => getUrlAll(thing, RDF_TYPE).includes(ACP_ACCESS_CONTROL_RESOURCE))
  if (!root) throw new Error('访问控制文档缺少根资源。')
  const controlUrl = `${input.acrUrl}#${input.controlKey}Access`
  const policyUrl = `${input.acrUrl}#${input.controlKey}Policy`
  const matcherUrl = `${input.acrUrl}#${input.controlKey}Matcher`
  let updatedRoot = root
  if (input.links === 'access' || input.links === 'both') {
    updatedRoot = addUrl(updatedRoot, ACP_ACCESS_CONTROL_LINK, controlUrl)
  }
  if (input.links === 'member' || input.links === 'both') {
    updatedRoot = addUrl(updatedRoot, ACP_MEMBER_ACCESS_CONTROL, controlUrl)
  }
  let acr = setThing(input.acr, updatedRoot)
  acr = setThing(acr, buildThing(createThing({ url: controlUrl }))
    .addUrl(RDF_TYPE, ACP_ACCESS_CONTROL)
    .addUrl(ACP_APPLY, policyUrl)
    .build())
  acr = setThing(acr, buildThing(createThing({ url: policyUrl }))
    .addUrl(RDF_TYPE, ACP_POLICY)
    .addUrl(ACP_ALLOW, ACL_READ)
    .addUrl(ACP_ALLOW, ACL_APPEND)
    .addUrl(ACP_ALLOW, ACL_WRITE)
    .addUrl(ACP_ANY_OF, matcherUrl)
    .build())
  acr = setThing(acr, buildThing(createThing({ url: matcherUrl }))
    .addUrl(RDF_TYPE, ACP_MATCHER)
    .addUrl(ACP_AGENT, input.agentWebId)
    .build())
  return acr
}

/**
 * Save an updated ACR. The primary path is solid-client's incremental
 * saveSolidDatasetAt, which sends only the added/deleted triples and refuses to
 * silently drop a concurrent grant. If the server does not accept that patch,
 * the Turtle replacement is sent with the dataset's ETag as If-Match; a
 * precondition failure is surfaced rather than overwriting the newest policy.
 */
export async function saveAdvertisedAcr(
  acrUrl: string,
  acr: Awaited<ReturnType<typeof getSolidDataset>>,
  authFetch: typeof fetch,
): Promise<void> {
  try {
    await saveSolidDatasetAt(acrUrl, acr, { fetch: authFetch })
    return
  } catch (patchError) {
    const info = await authFetch(acrUrl, { method: 'HEAD' })
    const etag = info.headers.get('ETag')
    const updated = await authFetch(acrUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/turtle',
        ...(etag ? { 'If-Match': etag } : {}),
      },
      body: await solidDatasetAsTurtle(acr),
    })
    if (updated.status === 412) {
      throw new Error('访问控制刚被其他人更新，请重试。')
    }
    if (!updated.ok) {
      throw new Error(`更新访问控制失败（HTTP ${updated.status}）。`)
    }
    void patchError
  }
}
