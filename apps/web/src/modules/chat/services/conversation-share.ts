import {
  conversationShareRepository,
  conversationShareResourceId,
  removeConversationShare,
  type ConversationShareRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import { renderConversationHtml, type ConversationExportMessage, type ConversationExportOptions } from '../domain/conversation-export'

export interface ConversationShareRecord {
  id: string
  url: string
  createdAt: string
  includeToolDetails: boolean
  excludedMessageIds: string[]
}

function toRecord(row: ConversationShareRow): ConversationShareRecord {
  return {
    id: row.id,
    url: row.resourceUrl,
    createdAt: new Date(row.createdAt).toISOString(),
    includeToolDetails: row.includeToolDetails === true,
    excludedMessageIds: row.excludedMessageIds ?? [],
  }
}

function publicReadAcl(resourceUrl: string, ownerWebId: string): string {
  return `@prefix acl: <http://www.w3.org/ns/auth/acl#> .\n@prefix foaf: <http://xmlns.com/foaf/0.1/> .\n\n<#owner> a acl:Authorization; acl:accessTo <${resourceUrl}>; acl:agent <${ownerWebId}>; acl:mode acl:Read, acl:Write, acl:Control .\n<#public> a acl:Authorization; acl:accessTo <${resourceUrl}>; acl:agentClass foaf:Agent; acl:mode acl:Read .\n`
}

function publicReadAcr(resourceUrl: string, ownerWebId: string): string {
  return `@prefix acp: <http://www.w3.org/ns/solid/acp#> .\n@prefix acl: <http://www.w3.org/ns/auth/acl#> .\n\n<#root> a acp:AccessControlResource; acp:resource <${resourceUrl}>; acp:accessControl <#ownerAccess>, <#publicReadAccess> .\n<#ownerAccess> a acp:AccessControl; acp:apply <#ownerPolicy> .\n<#ownerPolicy> a acp:Policy; acp:allow acl:Read, acl:Write, acl:Control; acp:anyOf <#ownerMatcher> .\n<#ownerMatcher> a acp:Matcher; acp:agent <${ownerWebId}> .\n<#publicReadAccess> a acp:AccessControl; acp:apply <#publicReadPolicy> .\n<#publicReadPolicy> a acp:Policy; acp:allow acl:Read; acp:anyOf <#publicMatcher> .\n<#publicMatcher> a acp:Matcher; acp:agent acp:PublicAgent .\n`
}

interface AccessControlResource {
  kind: 'acl' | 'acr'
  url: string
}

function accessControlResourceFromLink(resourceUrl: string, linkHeader: string | null): AccessControlResource | null {
  if (!linkHeader) return null
  for (const entry of linkHeader.split(/,(?=\s*<)/u)) {
    const match = entry.match(/<([^>]+)>\s*;[\s\S]*?rel\s*=\s*"?([^";,]+)"?/iu)
    if (!match) continue
    const relation = match[2].trim()
    if (relation !== 'acl' && !relation.includes('accessControl')) continue
    const url = new URL(match[1], resourceUrl).href
    return { kind: new URL(url).pathname.endsWith('.acr') ? 'acr' : 'acl', url }
  }
  return null
}

async function discoverAccessControlResource(
  authFetch: typeof fetch,
  resourceUrl: string,
): Promise<AccessControlResource> {
  const response = await authFetch(resourceUrl, { method: 'HEAD' })
  if (!response.ok) throw new Error(`Share permission discovery failed with HTTP ${response.status}`)
  return accessControlResourceFromLink(resourceUrl, response.headers.get('Link'))
    ?? { kind: 'acl', url: `${resourceUrl}.acl` }
}

async function removeShareResources(
  authFetch: typeof fetch,
  resourceUrl: string,
  accessControlUrl?: string,
): Promise<void> {
  const urls = new Set([accessControlUrl, `${resourceUrl}.acl`, `${resourceUrl}.acr`, resourceUrl])
  for (const url of urls) {
    if (!url) continue
    const response = await authFetch(url, { method: 'DELETE' })
    if (!response.ok && response.status !== 404) throw new Error(`Share revoke failed with HTTP ${response.status}`)
  }
}

export async function listConversationShares(input: {
  db: SolidDatabase
  threadUri: string
}): Promise<ConversationShareRecord[]> {
  return (await conversationShareRepository.list(input.db, { thread: input.threadUri }))
    .filter((row) => !row.revokedAt)
    .map(toRecord)
}

export async function createConversationShare(input: {
  db: SolidDatabase
  authFetch: typeof fetch
  podBaseUrl: string
  ownerWebId: string
  threadUri: string
  messages: ConversationExportMessage[]
  options: ConversationExportOptions
}): Promise<ConversationShareRecord> {
  const shareKey = crypto.randomUUID()
  const id = conversationShareResourceId(shareKey)
  const root = input.podBaseUrl.replace(/\/+$/u, '')
  const url = `${root}/public/linx-chat-${shareKey}.html`
  const htmlResponse = await input.authFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: renderConversationHtml(input.messages, input.options),
  })
  if (!htmlResponse.ok) throw new Error(`Share write failed with HTTP ${htmlResponse.status}`)
  const accessControl = await discoverAccessControlResource(input.authFetch, url).catch(async (error) => {
    await input.authFetch(url, { method: 'DELETE' }).catch(() => undefined)
    throw error
  })
  const permissionResponse = await input.authFetch(accessControl.url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/turtle' },
    body: accessControl.kind === 'acr'
      ? publicReadAcr(url, input.ownerWebId)
      : publicReadAcl(url, input.ownerWebId),
  })
  if (!permissionResponse.ok) {
    await removeShareResources(input.authFetch, url, accessControl.url).catch(() => undefined)
    throw new Error(`Share permission write failed with HTTP ${permissionResponse.status}`)
  }

  try {
    const row = await conversationShareRepository.create!(input.db, {
      id,
      thread: input.threadUri,
      resourceUrl: url,
      includeToolDetails: input.options.includeToolDetails === true,
      excludedMessageIds: [...(input.options.excludedMessageIds ?? [])],
      createdAt: new Date(),
    })
    return toRecord(row)
  } catch (error) {
    await removeShareResources(input.authFetch, url, accessControl.url).catch(() => undefined)
    throw error
  }
}

export async function revokeConversationShare(input: {
  db: SolidDatabase
  authFetch: typeof fetch
  share: ConversationShareRecord
}): Promise<void> {
  const accessControl = await discoverAccessControlResource(input.authFetch, input.share.url).catch(() => undefined)
  await removeShareResources(input.authFetch, input.share.url, accessControl?.url)
  await removeConversationShare(input.db, input.share.id)
}
