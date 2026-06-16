/**
 * Runtime-only Reconciler coordination helpers.
 *
 * Private/group is not a persisted Chat or Session type here. The runtime derives
 * ownership from explicit product policy and, when available, the number of
 * distinct human authorities participating in the surface.
 */
export type ReconcilerOwner = 'client' | 'server'
export type ResourceRef = string

export type WakeAgentReason = 'mention' | 'reconciler_decision' | 'manual'
export type WakeAgentStatus = 'queued' | 'leased' | 'completed' | 'failed'

export interface ReconcilerOwnership {
  reconcilerOwner: ReconcilerOwner
  humanAuthorityCount?: number
}

export interface SharedWakeAgentJob {
  id: string
  thread: ResourceRef
  triggerMessage: ResourceRef
  agent: ResourceRef
  reason: WakeAgentReason
  status: WakeAgentStatus
  createdAt: string
}

export interface WakeAgentLeaseFields {
  priority?: 'low' | 'normal' | 'high'
  leaseOwner?: string
  leaseExpiresAt?: string
}

export interface ClientCapability {
  clientId: string
  kind: 'cli' | 'desktop' | 'mobile' | 'web'
  user: string
  canCoordinateClientOwned: boolean
  canRunAgent: boolean
  workspaceRefs: string[]
  heartbeatAt: string
}

export interface ClientReconcilerLease {
  thread: ResourceRef
  ownerClientId: string
  ownerUser: string
  fencingToken: string
  expiresAt: string
}

export interface ClientReconcilerLeaseGrantOptions {
  thread: ResourceRef
  ownerUser: string
  clients: ClientCapability[]
  previousLease?: ClientReconcilerLease | null
  now?: Date | string | number
  leaseTtlMs?: number
  heartbeatTtlMs?: number
  fencingToken?: string
  randomId?: string
}

export const CLIENT_RECONCILER_LEASE_TTL_MS = 30_000
export const CLIENT_CAPABILITY_HEARTBEAT_TTL_MS = 45_000

const CLIENT_KIND_PRIORITY: Record<ClientCapability['kind'], number> = {
  cli: 40,
  desktop: 30,
  mobile: 20,
  web: 10,
}

export function defaultReconcilerOwnerForPolicyKind(
  policyKind: string | undefined,
): ReconcilerOwner {
  return policyKind === 'open_group' ? 'server' : 'client'
}

export function resolveReconcilerOwnership(input: {
  policyKind?: string
  humanAuthorities?: readonly unknown[]
  humanAuthorityCount?: unknown
  reconcilerOwner?: unknown
} = {}): ReconcilerOwnership {
  const humanAuthorityCount = resolveHumanAuthorityCount(input)
  const owner = input.reconcilerOwner === 'client' || input.reconcilerOwner === 'server'
    ? input.reconcilerOwner
    : humanAuthorityCount !== undefined && humanAuthorityCount > 1
      ? 'server'
      : defaultReconcilerOwnerForPolicyKind(input.policyKind)

  return {
    reconcilerOwner: owner,
    ...(humanAuthorityCount !== undefined ? { humanAuthorityCount } : {}),
  }
}

export function isSingleHumanAuthority(input: {
  humanAuthorities?: readonly unknown[]
  humanAuthorityCount?: unknown
}): boolean {
  return resolveHumanAuthorityCount(input) === 1
}

export function hasMultipleHumanAuthorities(input: {
  humanAuthorities?: readonly unknown[]
  humanAuthorityCount?: unknown
}): boolean {
  const count = resolveHumanAuthorityCount(input)
  return count !== undefined && count > 1
}

export function defaultSharedWakeAgentJobDedupeKey(input: Pick<SharedWakeAgentJob, 'thread' | 'triggerMessage' | 'agent'>): string {
  return [input.thread, input.triggerMessage, input.agent].join('|')
}

export function createSharedWakeAgentJob(input: Omit<SharedWakeAgentJob, 'id'> & { id?: string }): SharedWakeAgentJob {
  const job = {
    ...input,
    id: input.id ?? sharedWakeAgentJobId(input),
  }
  return job
}

export function sharedWakeAgentJobId(input: Pick<SharedWakeAgentJob, 'thread' | 'triggerMessage' | 'agent'>): string {
  return `wake_${hashString(defaultSharedWakeAgentJobDedupeKey(input))}`
}

export function isClientReconcilerLeaseActive(
  lease: ClientReconcilerLease | null | undefined,
  now: Date | string | number = Date.now(),
): lease is ClientReconcilerLease {
  if (!lease?.fencingToken || !lease.thread || !lease.ownerClientId || !lease.ownerUser || !lease.expiresAt) {
    return false
  }
  const expiresAt = Date.parse(lease.expiresAt)
  const nowMs = toEpochMs(now)
  return Number.isFinite(expiresAt) && Number.isFinite(nowMs) && expiresAt > nowMs
}

export function canClientCoordinateThread(input: {
  clientId?: string | null
  thread: ResourceRef
  lease?: ClientReconcilerLease | null
  now?: Date | string | number
}): boolean {
  const clientId = normalizeText(input.clientId)
  if (!clientId || !input.thread || !isClientReconcilerLeaseActive(input.lease, input.now)) {
    return false
  }
  return input.lease.thread === input.thread && input.lease.ownerClientId === clientId
}

export function isClientCapabilityAlive(
  client: ClientCapability,
  now: Date | string | number = Date.now(),
  heartbeatTtlMs: number = CLIENT_CAPABILITY_HEARTBEAT_TTL_MS,
): boolean {
  const heartbeatAt = Date.parse(client.heartbeatAt)
  const nowMs = toEpochMs(now)
  return Number.isFinite(heartbeatAt) && Number.isFinite(nowMs) && nowMs - heartbeatAt <= heartbeatTtlMs
}

export function selectClientReconciler(
  clients: ClientCapability[],
  options: {
    ownerUser?: string
    now?: Date | string | number
    heartbeatTtlMs?: number
  } = {},
): ClientCapability | null {
  const now = options.now ?? Date.now()
  const eligible = clients
    .filter((client) => client.canCoordinateClientOwned)
    .filter((client) => !options.ownerUser || client.user === options.ownerUser)
    .filter((client) => isClientCapabilityAlive(client, now, options.heartbeatTtlMs))
    .sort(compareClientCapabilityForCoordination)
  return eligible[0] ?? null
}

export function grantClientReconcilerLease(
  options: ClientReconcilerLeaseGrantOptions,
): ClientReconcilerLease | null {
  const now = options.now ?? Date.now()
  const ttl = options.leaseTtlMs ?? CLIENT_RECONCILER_LEASE_TTL_MS
  const previousOwner = options.previousLease && isClientReconcilerLeaseActive(options.previousLease, now)
    ? options.clients.find((client) => (
      client.clientId === options.previousLease?.ownerClientId
      && client.user === options.ownerUser
      && client.canCoordinateClientOwned
      && isClientCapabilityAlive(client, now, options.heartbeatTtlMs)
    ))
    : undefined
  const selected = previousOwner ?? selectClientReconciler(options.clients, {
    ownerUser: options.ownerUser,
    now,
    heartbeatTtlMs: options.heartbeatTtlMs,
  })
  if (!selected) {
    return null
  }

  const nowMs = toEpochMs(now)
  const expiresAt = new Date(nowMs + ttl).toISOString()
  return {
    thread: options.thread,
    ownerClientId: selected.clientId,
    ownerUser: selected.user,
    fencingToken: options.fencingToken ?? createClientReconcilerFencingToken(options.thread, selected.clientId, nowMs, options.randomId),
    expiresAt,
  }
}

export function createClientReconcilerFencingToken(
  thread: ResourceRef,
  clientId: string,
  now: Date | string | number = Date.now(),
  randomId?: string,
): string {
  const epoch = toEpochMs(now)
  const entropy = normalizeText(randomId) ?? Math.random().toString(36).slice(2, 10)
  return `client_${hashString(`${thread}|${clientId}|${epoch}|${entropy}`)}`
}

function compareClientCapabilityForCoordination(a: ClientCapability, b: ClientCapability): number {
  const priority = CLIENT_KIND_PRIORITY[b.kind] - CLIENT_KIND_PRIORITY[a.kind]
  if (priority !== 0) return priority
  const heartbeat = Date.parse(b.heartbeatAt) - Date.parse(a.heartbeatAt)
  if (heartbeat !== 0) return heartbeat
  return a.clientId.localeCompare(b.clientId)
}

function resolveHumanAuthorityCount(input: {
  humanAuthorities?: readonly unknown[]
  humanAuthorityCount?: unknown
}): number | undefined {
  if (typeof input.humanAuthorityCount === 'number' && Number.isFinite(input.humanAuthorityCount)) {
    return Math.max(0, Math.floor(input.humanAuthorityCount))
  }
  if (!input.humanAuthorities) return undefined
  const unique = new Set<string>()
  for (const value of input.humanAuthorities) {
    const normalized = normalizeText(value)
    if (normalized) unique.add(normalized)
  }
  return unique.size
}

function toEpochMs(value: Date | string | number): number {
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  return Date.parse(value)
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function hashString(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}
