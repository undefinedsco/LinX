import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildInboxControlEventFromSubscription,
  prepareInboxSubscriptionForClient,
} from '../src/client-inbox-subscription'
import { reconcileThreadEvent } from '../src/reconciler'

test('builds a Thread control event from a Pod Inbox subscription envelope', () => {
  const event = buildInboxControlEventFromSubscription({
    id: 'evt-1',
    type: 'inbox.notification.created',
    inboxNotification: 'https://pod.example/inbox/notice-1.ttl',
    controlResource: 'https://pod.example/.data/approvals/2026/06/12.ttl#approval-1',
    chat: 'chat:main',
    thread: 'thread:main',
    status: 'pending',
    requestKind: 'approval.required',
    sourceThread: 'thread:worker',
    sourceRun: 'run:worker',
    sourceTask: 'task:worker',
    shortSummary: 'worker needs approval',
  })

  assert.equal(event.type, 'inbox.notification.created')
  assert.equal(event.resource, 'https://pod.example/.data/approvals/2026/06/12.ttl#approval-1')
  assert.equal(event.data?.inboxNotification, 'https://pod.example/inbox/notice-1.ttl')
  assert.equal(event.actor?.role, 'runtime')
  assert.equal(event.actor?.id, 'pod-subscription')
  assert.equal(event.data?.status, 'pending')
  assert.equal(event.data?.requestKind, 'approval.required')
  assert.equal(event.data?.sourceThread, 'thread:worker')
})

test('prepares a claimed client context that lets Reconciler wake local Secretary', async () => {
  const prepared = await prepareInboxSubscriptionForClient({
    event: {
      id: 'evt-claimed',
      type: 'inbox.notification.created',
      controlResource: 'https://pod.example/.data/approvals/2026/06/12.ttl#approval-claimed',
      status: 'pending',
      requestKind: 'approval.required',
      sourceThread: 'thread:worker',
      shortSummary: 'worker needs approval',
    },
    client: {
      clientId: 'client:desktop',
      agentCapable: true,
      secretaryRuntimeAvailable: true,
      focusState: 'focused',
    },
    claimControlResource: ({ clientId, controlResource }) => ({
      status: 'claimed',
      controlResource,
      leaseOwner: clientId,
      leaseExpiresAt: '2026-06-12T00:05:00.000Z',
    }),
  })

  assert.equal(prepared.client.controlResourceClaim?.status, 'claimed')
  assert.equal(prepared.wakeContext.controlResource, 'https://pod.example/.data/approvals/2026/06/12.ttl#approval-claimed')
  assert.equal(prepared.wakeContext.shortSummary, 'worker needs approval')

  const decision = reconcileThreadEvent({
    policy: 'symphony',
    event: prepared.event,
    client: prepared.client,
    now: new Date('2026-06-12T00:00:00.000Z'),
    randomId: 'client-claimed',
  })

  assert.equal(decision.wakeJobs.length, 1)
  assert.equal(decision.wakeJobs[0].targetRole, 'secretary')
  assert.equal(decision.notificationEvents?.[0]?.sourceResource, 'https://pod.example/.data/approvals/2026/06/12.ttl#approval-claimed')
})

test('prepares display-only context when a client cannot or does not claim', async () => {
  let claimCalls = 0
  const prepared = await prepareInboxSubscriptionForClient({
    event: {
      id: 'evt-display',
      type: 'inbox.notification.created',
      controlResource: 'https://pod.example/.data/input-requests/2026/06/12.ttl#input-display',
      status: 'pending',
      requestKind: 'input.required',
    },
    client: {
      clientId: 'client:web',
      agentCapable: false,
      focusState: 'focused',
    },
    claimControlResource: () => {
      claimCalls += 1
      return { status: 'claimed', controlResource: 'https://pod.example/.data/input-requests/2026/06/12.ttl#input-display', leaseOwner: 'client:web' }
    },
  })

  assert.equal(claimCalls, 0)
  assert.equal(prepared.client.controlResourceClaim?.status, 'display_only')

  const decision = reconcileThreadEvent({
    policy: 'auto',
    event: prepared.event,
    client: prepared.client,
    now: new Date('2026-06-12T00:00:00.000Z'),
    randomId: 'client-display',
  })

  assert.equal(decision.wakeJobs.length, 0)
  assert.equal(decision.notificationEvents?.length, 1)
  assert.match(decision.skippedReason ?? '', /display-only|display_only/)
})

test('resolved Inbox subscription is display-only and does not attempt claim', async () => {
  let claimCalls = 0
  const prepared = await prepareInboxSubscriptionForClient({
    event: {
      type: 'inbox.notification.updated',
      controlResource: 'https://pod.example/.data/approvals/2026/06/12.ttl#approval-resolved',
      status: 'resolved',
    },
    client: {
      clientId: 'client:cli',
      agentCapable: true,
      secretaryRuntimeAvailable: true,
      focusState: 'focused',
    },
    claimControlResource: () => {
      claimCalls += 1
      return { status: 'claimed', controlResource: 'https://pod.example/.data/approvals/2026/06/12.ttl#approval-resolved', leaseOwner: 'client:cli' }
    },
  })

  assert.equal(claimCalls, 0)
  assert.equal(prepared.client.controlResourceClaim?.status, 'display_only')

  const decision = reconcileThreadEvent({
    policy: 'symphony',
    event: prepared.event,
    client: prepared.client,
    now: new Date('2026-06-12T00:00:00.000Z'),
    randomId: 'client-resolved',
  })

  assert.equal(decision.wakeJobs.length, 0)
  assert.equal(decision.notificationEvents, undefined)
})
