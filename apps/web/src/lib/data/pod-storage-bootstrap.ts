import {
  agentTable,
  approvalResource,
  auditResource,
  chatTable,
  contactTable,
  credentialResource,
  aiModelResource,
  aiProviderResource,
  inboxNotificationTable,
  messageTable,
  settingsTable,
  threadTable,
  type SolidDatabase,
} from '@undefineds.co/models'
import { workspaceTable } from './workspace-model'

const CORE_TABLES = [
  chatTable,
  threadTable,
  workspaceTable,
  messageTable,
  contactTable,
  agentTable,
  credentialResource,
  aiProviderResource,
  aiModelResource,
  settingsTable,
  approvalResource,
  auditResource,
  inboxNotificationTable,
] as const

const LINX_STORAGE_CONTAINERS = [
  '/.data/',
  '/.data/chat/',
  '/.data/contacts/',
  '/agents/',
  '/.data/workspaces/',
  '/.data/approvals/',
  '/.data/audits/',
  '/settings/',
  '/settings/providers/',
  '/inbox/',
] as const

const EMPTY_TURTLE = '@prefix ldp: <http://www.w3.org/ns/ldp#> .\n'
const NON_AUTHORITATIVE_HEAD_STATUSES = new Set([401, 403, 405, 500])

export async function initializeLinxPodStorage(db: SolidDatabase): Promise<void> {
  const connect = (db as unknown as { connect?: () => Promise<void> }).connect
  if (typeof connect === 'function') {
    await connect.call(db)
  }

  const init = (db as unknown as { init?: (tables: unknown[]) => Promise<void> }).init
  if (typeof init === 'function') {
    await init.call(db, [...CORE_TABLES])
  }

  await ensureLinxStorageContainers(db)
}

async function ensureLinxStorageContainers(db: SolidDatabase): Promise<void> {
  const fetch = getAuthenticatedFetch(db)
  const podUrl = getPodUrl(db)

  if (!fetch || !podUrl) {
    throw new Error('Solid database is missing authenticated fetch or Pod URL.')
  }

  for (const containerPath of LINX_STORAGE_CONTAINERS) {
    await ensureContainer(fetch, resolvePodUrl(podUrl, containerPath))
  }
}

function getAuthenticatedFetch(db: SolidDatabase): typeof fetch | null {
  const candidate = (
    (db as any).getDialect?.()?.getAuthenticatedFetch?.()
    ?? (db as any).getSession?.()?.fetch
    ?? (db as any).session?.fetch
  )

  return typeof candidate === 'function' ? candidate.bind((db as any).session) as typeof fetch : null
}

function getPodUrl(db: SolidDatabase): string | null {
  const candidate = (
    (db as any).getDialect?.()?.getPodUrl?.()
    ?? (db as any).getPodUrl?.()
  )

  if (typeof candidate !== 'string' || candidate.length === 0) {
    return null
  }

  return candidate.endsWith('/') ? candidate : `${candidate}/`
}

function resolvePodUrl(podUrl: string, path: string): string {
  return new URL(path.replace(/^\/+/, ''), podUrl).toString()
}

async function ensureContainer(fetch: typeof globalThis.fetch, containerUrl: string): Promise<void> {
  const target = containerUrl.endsWith('/') ? containerUrl : `${containerUrl}/`
  const head = await fetch(target, { method: 'HEAD' })

  if (head.ok || head.status === 409) {
    return
  }

  if (head.status !== 404 && !NON_AUTHORITATIVE_HEAD_STATUSES.has(head.status)) {
    throw new Error(`Failed to check Pod container ${target}: HTTP ${head.status}`)
  }

  const response = await fetch(target, {
    method: 'PUT',
    headers: {
      'Content-Type': 'text/turtle',
      Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"',
    },
    body: EMPTY_TURTLE,
  })

  if (response.ok || response.status === 409) {
    return
  }

  const text = await response.text().catch(() => '')
  throw new Error(`Failed to create Pod container ${target}: HTTP ${response.status}${text ? ` ${text}` : ''}`)
}
