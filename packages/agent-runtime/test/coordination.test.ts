import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canClientCoordinateThread,
  createSharedWakeAgentJob,
  defaultReconcilerOwnerForPolicyKind,
  defaultSharedWakeAgentJobDedupeKey,
  grantClientReconcilerLease,
  hasMultipleHumanAuthorities,
  isSingleHumanAuthority,
  resolveReconcilerOwnership,
  selectClientReconciler,
  sharedWakeAgentJobId,
  type ClientCapability,
} from '../src/coordination'

test('policy and human authority facts resolve Reconciler owner without a chat/session type field', () => {
  assert.deepEqual(resolveReconcilerOwnership({ policyKind: 'direct' }), {
    reconcilerOwner: 'client',
  })
  assert.deepEqual(resolveReconcilerOwnership({ policyKind: 'auto' }), {
    reconcilerOwner: 'client',
  })
  assert.deepEqual(resolveReconcilerOwnership({ policyKind: 'symphony' }), {
    reconcilerOwner: 'client',
  })
  assert.deepEqual(resolveReconcilerOwnership({ policyKind: 'review' }), {
    reconcilerOwner: 'client',
  })
  assert.deepEqual(resolveReconcilerOwnership({ policyKind: 'open_group' }), {
    reconcilerOwner: 'server',
  })
  assert.deepEqual(resolveReconcilerOwnership({ policyKind: 'direct', humanAuthorities: ['user:alice', 'user:bob'] }), {
    reconcilerOwner: 'server',
    humanAuthorityCount: 2,
  })
  assert.deepEqual(resolveReconcilerOwnership({ policyKind: 'open_group', humanAuthorityCount: 1 }), {
    reconcilerOwner: 'server',
    humanAuthorityCount: 1,
  })
  assert.equal(defaultReconcilerOwnerForPolicyKind('open_group'), 'server')
  assert.equal(defaultReconcilerOwnerForPolicyKind('review'), 'client')
  assert.equal(isSingleHumanAuthority({ humanAuthorities: ['user:alice', 'user:alice'] }), true)
  assert.equal(hasMultipleHumanAuthorities({ humanAuthorities: ['user:alice', 'user:bob'] }), true)
})

test('explicit Reconciler owner override is a product decision, not a type alias', () => {
  assert.deepEqual(resolveReconcilerOwnership({ policyKind: 'direct', reconcilerOwner: 'server' }), {
    reconcilerOwner: 'server',
  })
  assert.deepEqual(resolveReconcilerOwnership({ policyKind: 'open_group', reconcilerOwner: 'client' }), {
    reconcilerOwner: 'client',
  })
})

test('shared wake job dedupe uses semantic thread, trigger message, and agent fields', () => {
  const base = {
    thread: 'https://pod.example/.data/chat/group/index.ttl#thread-1',
    triggerMessage: 'https://pod.example/.data/chat/group/2026/06/14/messages.ttl#m1',
    agent: 'https://pod.example/agents/codex/',
  }

  const queued = createSharedWakeAgentJob({
    ...base,
    reason: 'mention',
    status: 'queued',
    createdAt: '2026-06-14T00:00:00.000Z',
  })
  const completed = createSharedWakeAgentJob({
    ...base,
    reason: 'manual',
    status: 'completed',
    createdAt: '2026-06-14T00:01:00.000Z',
  })

  assert.equal(defaultSharedWakeAgentJobDedupeKey(queued), defaultSharedWakeAgentJobDedupeKey(completed))
  assert.equal(queued.id, completed.id)
  assert.equal(queued.id, sharedWakeAgentJobId(base))
  assert.notEqual(
    defaultSharedWakeAgentJobDedupeKey(queued),
    defaultSharedWakeAgentJobDedupeKey({ ...queued, agent: 'https://pod.example/agents/other/' }),
  )
  assert.notEqual(
    defaultSharedWakeAgentJobDedupeKey(queued),
    defaultSharedWakeAgentJobDedupeKey({ ...queued, triggerMessage: 'https://pod.example/.data/chat/group/2026/06/14/messages.ttl#m2' }),
  )
})

test('client-owned Reconciler lease selection prefers native clients and preserves live owner', () => {
  const now = '2026-06-14T00:00:00.000Z'
  const clients: ClientCapability[] = [
    capability('web', 'web-1', '2026-06-13T23:59:55.000Z'),
    capability('desktop', 'desktop-1', '2026-06-13T23:59:50.000Z'),
    capability('mobile', 'mobile-1', '2026-06-13T23:59:59.000Z'),
    capability('cli', 'cli-1', '2026-06-13T23:59:45.000Z'),
  ]

  assert.equal(selectClientReconciler(clients, { ownerUser: 'https://alice.example/#me', now })?.clientId, 'cli-1')

  const previousLease = grantClientReconcilerLease({
    thread: 'thread:single-human',
    ownerUser: 'https://alice.example/#me',
    clients,
    now,
    fencingToken: 'token-old',
  })
  assert.equal(previousLease?.ownerClientId, 'cli-1')

  const renewed = grantClientReconcilerLease({
    thread: 'thread:single-human',
    ownerUser: 'https://alice.example/#me',
    clients: [
      capability('desktop', 'desktop-1', '2026-06-14T00:00:01.000Z'),
      capability('cli', 'cli-1', '2026-06-13T23:59:59.000Z'),
    ],
    previousLease,
    now: '2026-06-14T00:00:02.000Z',
    fencingToken: 'token-renewed',
  })
  assert.equal(renewed?.ownerClientId, 'cli-1')
})

test('client-owned lease validation rejects stale, foreign, and wrong-thread clients', () => {
  const lease = {
    thread: 'thread:single-human',
    ownerClientId: 'cli-1',
    ownerUser: 'https://alice.example/#me',
    fencingToken: 'token',
    expiresAt: '2026-06-14T00:00:30.000Z',
  }

  assert.equal(canClientCoordinateThread({
    clientId: 'cli-1',
    thread: 'thread:single-human',
    lease,
    now: '2026-06-14T00:00:00.000Z',
  }), true)
  assert.equal(canClientCoordinateThread({
    clientId: 'desktop-1',
    thread: 'thread:single-human',
    lease,
    now: '2026-06-14T00:00:00.000Z',
  }), false)
  assert.equal(canClientCoordinateThread({
    clientId: 'cli-1',
    thread: 'thread:other',
    lease,
    now: '2026-06-14T00:00:00.000Z',
  }), false)
  assert.equal(canClientCoordinateThread({
    clientId: 'cli-1',
    thread: 'thread:single-human',
    lease,
    now: '2026-06-14T00:00:31.000Z',
  }), false)
})

test('expired heartbeat clients are ignored by client-owned lease grants', () => {
  const lease = grantClientReconcilerLease({
    thread: 'thread:single-human',
    ownerUser: 'https://alice.example/#me',
    clients: [capability('cli', 'cli-stale', '2026-06-13T23:58:00.000Z')],
    now: '2026-06-14T00:00:00.000Z',
  })
  assert.equal(lease, null)
})

function capability(
  kind: ClientCapability['kind'],
  clientId: string,
  heartbeatAt: string,
  input: Partial<ClientCapability> = {},
): ClientCapability {
  return {
    clientId,
    kind,
    user: 'https://alice.example/#me',
    canCoordinateClientOwned: true,
    canRunAgent: kind !== 'web',
    workspaceRefs: [],
    heartbeatAt,
    ...input,
  }
}
