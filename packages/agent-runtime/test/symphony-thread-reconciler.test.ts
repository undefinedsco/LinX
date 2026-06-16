import test from 'node:test'
import assert from 'node:assert/strict'
import {
  reconcileSymphonyThreadEvents,
} from '../src/symphony.ts'

test('Symphony thread reconciler core routes Codex worker deliveries to Secretary without MCP-specific logic', () => {
  const result = reconcileSymphonyThreadEvents({
    chat: 'codex://chat/symphony',
    thread: 'codex://thread/symphony-root',
    randomId: 'codex-core-delivery',
    events: [{
      type: 'delivery.submitted',
      resource: 'urn:undefineds:linx:symphony/deliveries/codex-worker',
      actor: { role: 'worker', id: 'codex-worker' },
      content: 'Codex worker submitted a delivery for Secretary review.',
      data: {
        status: 'completed',
        reportSummary: 'Codex core reconciler smoke report',
      },
    }],
  })

  assert.equal(result.policyKind, 'symphony')
  assert.equal(result.thread, 'codex://thread/symphony-root')
  assert.equal(result.eventCount, 1)
  assert.equal(result.nextAction, 'wake_secretary')
  assert.equal(result.decisions.length, 1)
  assert.equal(result.decisions[0].eventType, 'delivery.submitted')
  assert.equal(result.decisions[0].wakeJobs[0].targetAgent, '__secretary__')
  assert.equal(result.decisions[0].wakeJobs[0].targetRole, 'secretary')
})

test('Symphony thread reconciler core normalizes Codex hook events into thread events', () => {
  const result = reconcileSymphonyThreadEvents({
    chat: 'codex://chat/symphony',
    thread: 'codex://thread/symphony-root',
    randomId: 'codex-hook-stop',
    events: [{
      symphonyHookEvent: true,
      hookEventName: 'Stop',
      sessionId: 'sess_codex_hook',
      createdAt: '2026-06-16T01:02:03.000Z',
    }],
  })

  assert.equal(result.eventCount, 1)
  assert.equal(result.decisions[0].eventType, 'run.updated')
  assert.equal(result.decisions[0].wakeJobs[0].targetAgent, '__secretary__')
  assert.equal(result.decisions[0].wakeJobs[0].targetRole, 'secretary')
})
