import {
  conversationShareRepository,
  conversationShareResourceId,
  markConversationShareRevoked,
  type ConversationShareRow,
  type SolidDatabase,
} from '@undefineds.co/models'
import { renderConversationHtml, type ConversationExportMessage, type ConversationExportOptions } from '../domain/conversation-export'
import {
  discoverAccessControlResource,
  grantPublicReadAccess,
  removePublicResource,
} from '@/lib/solid/public-resource-access'

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

function httpUrl(value: string, label: string): URL {
  const url = new URL(value)
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) {
    throw new Error(`${label} must be an HTTP(S) URL without embedded credentials`)
  }
  return url
}

function ownedShareUrl(podBaseUrl: string, value: string): URL {
  const base = httpUrl(podBaseUrl, 'Pod base URL')
  const share = httpUrl(value, 'Share URL')
  const basePath = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`
  const relativePath = share.pathname.slice(basePath.length)
  if (
    share.origin !== base.origin
    || !share.pathname.startsWith(basePath)
    || !/^public\/linx-chat-[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.html$/iu.test(relativePath)
    || share.search
    || share.hash
  ) throw new Error('Share URL is outside the selected Pod share container')
  return share
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
  const root = httpUrl(input.podBaseUrl, 'Pod base URL')
  if (!root.pathname.endsWith('/')) root.pathname += '/'
  const url = new URL(`public/linx-chat-${shareKey}.html`, root).href
  const htmlResponse = await input.authFetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: renderConversationHtml(input.messages, input.options),
  })
  if (!htmlResponse.ok) throw new Error(`Share write failed with HTTP ${htmlResponse.status}`)
  const accessControl = await discoverAccessControlResource(input.authFetch, url).catch(async (error) => {
    await removePublicResource(input.authFetch, url).catch(() => undefined)
    throw error
  })
  await grantPublicReadAccess(input.authFetch, url, input.ownerWebId, accessControl).catch(async (error) => {
    await removePublicResource(input.authFetch, url, accessControl.url).catch(() => undefined)
    throw error
  })

  try {
    if (!conversationShareRepository.create) {
      throw new Error('Conversation share repository does not support create')
    }
    const row = await conversationShareRepository.create(input.db, {
      id: conversationShareResourceId(shareKey),
      thread: input.threadUri,
      resourceUrl: url,
      includeToolDetails: input.options.includeToolDetails === true,
      excludedMessageIds: [...(input.options.excludedMessageIds ?? [])],
      createdAt: new Date(),
    })
    return toRecord(row)
  } catch (error) {
    await removePublicResource(input.authFetch, url, accessControl.url).catch(() => undefined)
    throw error
  }
}

export async function revokeConversationShare(input: {
  db: SolidDatabase
  authFetch: typeof fetch
  podBaseUrl: string
  share: ConversationShareRecord
}): Promise<void> {
  const shareUrl = ownedShareUrl(input.podBaseUrl, input.share.url).href
  const accessControl = await discoverAccessControlResource(input.authFetch, shareUrl).catch(() => undefined)
  await removePublicResource(input.authFetch, shareUrl, accessControl?.url)
  await markConversationShareRevoked(input.db, input.share.id)
}
