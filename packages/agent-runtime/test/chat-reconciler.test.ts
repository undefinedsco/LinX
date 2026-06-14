import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendChatReconcilerMetadata,
  reconcileChatAppend,
} from '../src/chat-reconciler.ts'

test('chat append helper routes direct user messages through Thread Reconciler', () => {
  const { event, summary } = reconcileChatAppend({
    chat: 'https://pod.example/.data/chat/default/index.ttl#this',
    thread: 'https://pod.example/.data/chat/default/index.ttl#thread',
    resource: 'https://pod.example/.data/chat/default/2026/06/14/messages.ttl#msg_1',
    role: 'user',
    content: 'hello',
    actor: { id: 'https://pod.example/profile/card#me', role: 'user' },
    source: 'web-chat',
    createdAt: '2026-06-14T00:00:00.000Z',
    randomId: 'msg_1',
  })

  assert.equal(event.type, 'message.appended')
  assert.equal(event.data?.role, 'user')
  assert.equal(summary.policyKind, 'direct')
  assert.equal(summary.eventType, 'message.appended')
  assert.equal(summary.thread, 'https://pod.example/.data/chat/default/index.ttl#thread')
  assert.equal(summary.chat, 'https://pod.example/.data/chat/default/index.ttl#this')
  assert.equal(summary.wakeJobs.length, 1)
  assert.equal(summary.wakeJobs[0].targetRole, 'primary-agent')
  assert.equal(summary.wakeJobs[0].sourceResource, 'https://pod.example/.data/chat/default/2026/06/14/messages.ttl#msg_1')
})

test('chat append helper records assistant messages as reconciled even when no wake is needed', () => {
  const { summary } = reconcileChatAppend({
    thread: 'thread-1',
    role: 'assistant',
    content: 'done',
    source: 'primary-agent',
    randomId: 'msg_2',
  })

  assert.equal(summary.policyKind, 'direct')
  assert.equal(summary.wakeJobs.length, 0)
  assert.match(summary.skippedReason ?? '', /does not wake an agent/)
})

test('chat reconciler metadata appends decisions without overwriting existing metadata', () => {
  const { summary } = reconcileChatAppend({
    thread: 'thread-1',
    role: 'user',
    content: 'ping',
    randomId: 'msg_3',
  })
  const metadata = appendChatReconcilerMetadata({ protocol: 'matrix' }, summary)

  assert.equal(metadata.protocol, 'matrix')
  assert.equal((metadata.reconciler as any).version, 1)
  assert.equal((metadata.reconciler as any).latest.id, summary.id)
  assert.equal((metadata.reconciler as any).decisions.length, 1)
})

test('auto chat append routes user messages to Secretary', () => {
  const { summary } = reconcileChatAppend({
    thread: 'thread-1',
    role: 'user',
    content: 'please handle it',
    autoEnabled: true,
    randomId: 'msg_4',
  })

  assert.equal(summary.policyKind, 'auto')
  assert.equal(summary.wakeJobs.length, 1)
  assert.equal(summary.wakeJobs[0].targetAgent, '__secretary__')
  assert.equal(summary.wakeJobs[0].targetRole, 'secretary')
})
