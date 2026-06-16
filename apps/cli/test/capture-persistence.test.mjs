import assert from 'node:assert/strict'
import test from 'node:test'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

function createCaptureDb() {
  const rows = []
  const calls = []
  return {
    rows,
    calls,
    select() {
      return {
        from(resource) {
          calls.push({ op: 'select', resource: resource.config?.name })
          return {
            async execute() {
              return rows.filter((row) => row.__resource === resource.config?.name)
            },
          }
        },
      }
    },
    insert(resource) {
      return {
        values(row) {
          calls.push({ op: 'insert', resource: resource.config?.name, row })
          return {
            async execute() {
              rows.push({ ...row, __resource: resource.config?.name })
            },
          }
        },
      }
    },
    async updateById(resource, id, patch) {
      calls.push({ op: 'updateById', resource: resource.config?.name, id, patch })
      const row = rows.find((item) => item.__resource === resource.config?.name && item.id === id)
      if (!row) return null
      Object.assign(row, patch)
      return row
    },
  }
}

test('capture coordinator writes observed content as candidate and event', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/persistence.ts')
  t.after(() => cleanup())

  const db = createCaptureDb()
  const result = await module.persistObservedCapture({ db }, {
    id: 'candidate_1',
    eventId: 'event_1',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_1',
    summary: 'Capture design should use ApprovalRequest for review state.',
    suggestedType: 'https://undefineds.co/ns#Idea',
    suggestedTarget: 'https://alice.example/.data/projects/linx/',
    confidence: 'high',
    reason: 'The user corrected the capture approval boundary.',
    actor: 'https://alice.example/agents/__secretary__/',
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
  })

  assert.equal(result.status, 'created')
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_candidate').length, 1)
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_event').length, 1)
  const candidate = db.rows.find((row) => row.__resource === 'capture_candidate')
  assert.equal(candidate.id, 'candidates/2026/06/16.ttl#candidate_1')
  assert.equal(candidate.source, 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_1')
  assert.equal(candidate.status, 'candidate')
  const event = db.rows.find((row) => row.__resource === 'capture_event')
  assert.equal(event.id, 'events/2026/06/16.ttl#event_1')
  assert.equal(event.decision, 'candidate_created')
  assert.equal(event.captureCandidate, result.candidateIri)
})

test('capture coordinator records duplicate event without rewriting candidate', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/persistence.ts')
  t.after(() => cleanup())

  const db = createCaptureDb()
  db.rows.push({
    __resource: 'capture_event',
    id: 'events/2026/06/16.ttl#existing',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_1',
    decision: 'candidate_created',
  })

  const result = await module.persistObservedCapture({ db }, {
    id: 'candidate_2',
    eventId: 'event_duplicate',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_1',
    summary: 'Duplicate source should not create another candidate.',
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
  })

  assert.equal(result.status, 'duplicate')
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_candidate').length, 0)
  const eventInserts = db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_event')
  assert.equal(eventInserts.length, 1)
  assert.equal(eventInserts[0].row.decision, 'duplicate')
})

test('capture coordinator records direct commit without creating a candidate', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/persistence.ts')
  t.after(() => cleanup())

  const db = createCaptureDb()
  const result = await module.recordCaptureCommit({ db }, {
    eventId: 'event_direct',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_2',
    targetResource: 'https://alice.example/.data/ideas/2026/06/16.ttl#idea_1',
    decision: 'direct_commit',
    suggestedType: 'https://undefineds.co/ns#Idea',
    suggestedTarget: 'https://alice.example/.data/projects/linx/',
    confidence: 'high',
    reason: 'The user explicitly asked to save this as a LinX idea.',
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
  })

  assert.equal(result.status, 'recorded')
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_candidate').length, 0)
  const eventInserts = db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_event')
  assert.equal(eventInserts.length, 1)
  assert.equal(eventInserts[0].row.decision, 'direct_commit')
  assert.equal(eventInserts[0].row.targetResource, 'https://alice.example/.data/ideas/2026/06/16.ttl#idea_1')
})

test('capture coordinator commits concrete explicit capture through a formal writer before event ledger', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/persistence.ts')
  t.after(() => cleanup())

  const db = createCaptureDb()
  const writes = []
  const result = await module.commitExplicitCapture({ db }, {
    eventId: 'event_explicit',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_explicit',
    suggestedType: 'https://undefineds.co/ns#Idea',
    reason: 'User explicitly asked to save this as an idea.',
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
    async writeFormalResource() {
      writes.push('formal')
      return {
        targetResource: 'https://alice.example/.data/ideas/2026/06/16.ttl#idea_explicit',
      }
    },
  })

  assert.deepEqual(writes, ['formal'])
  assert.equal(result.status, 'committed')
  assert.equal(result.targetResource, 'https://alice.example/.data/ideas/2026/06/16.ttl#idea_explicit')
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_candidate').length, 0)
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'approval').length, 0)
  const event = db.rows.find((row) => row.__resource === 'capture_event')
  assert.equal(event.decision, 'direct_commit')
  assert.equal(event.targetResource, 'https://alice.example/.data/ideas/2026/06/16.ttl#idea_explicit')
})

test('capture coordinator records optimistic commit with approval link', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/persistence.ts')
  t.after(() => cleanup())

  const db = createCaptureDb()
  await module.recordCaptureCommit({ db }, {
    eventId: 'event_optimistic',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_3',
    targetResource: 'https://alice.example/.data/ideas/2026/06/16.ttl#idea_2',
    decision: 'optimistic_commit',
    approval: 'https://alice.example/.data/approvals/2026/06/16.ttl#approval_capture_1',
    reason: 'The user asked to remember this, but Secretary inferred the target location.',
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
  })

  const event = db.rows.find((row) => row.__resource === 'capture_event')
  assert.equal(event.decision, 'optimistic_commit')
  assert.equal(event.approval, 'https://alice.example/.data/approvals/2026/06/16.ttl#approval_capture_1')
  assert.equal(event.targetResource, 'https://alice.example/.data/ideas/2026/06/16.ttl#idea_2')
})

test('capture coordinator writes optimistic formal resource and links ApprovalRequest as authority gate', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/persistence.ts')
  t.after(() => cleanup())

  const db = createCaptureDb()
  const result = await module.commitOptimisticCapture({ db, webId: 'https://alice.example/profile/card#me' }, {
    eventId: 'event_optimistic_formal',
    approvalId: 'approval_optimistic_formal',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_optimistic',
    session: 'https://alice.example/.data/sessions/2026/06/16/session.ttl',
    toolCallId: 'capture-optimistic-1',
    target: 'https://alice.example/.data/ideas/2026/06/16.ttl#idea_optimistic',
    action: 'https://undefineds.co/ns#commitCapture',
    risk: 'normal',
    reason: 'User asked to remember this but Secretary inferred the target.',
    approvalOptions: JSON.stringify(['approve', 'reject']),
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
    async writeFormalResource() {
      return {
        targetResource: 'https://alice.example/.data/ideas/2026/06/16.ttl#idea_optimistic',
      }
    },
  })

  assert.equal(result.status, 'pending_approval')
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_candidate').length, 0)
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'approval').length, 1)
  const approval = db.rows.find((row) => row.__resource === 'approval')
  assert.equal(approval.id, '2026/06/16.ttl#approval_optimistic_formal')
  assert.equal(approval.target, 'https://alice.example/.data/ideas/2026/06/16.ttl#idea_optimistic')
  const event = db.rows.find((row) => row.__resource === 'capture_event')
  assert.equal(event.decision, 'optimistic_commit')
  assert.equal(event.targetResource, 'https://alice.example/.data/ideas/2026/06/16.ttl#idea_optimistic')
  assert.equal(event.approval, result.approvalIri)
})

test('capture coordinator creates candidate plus InputRequest when classification is ambiguous', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/persistence.ts')
  t.after(() => cleanup())

  const db = createCaptureDb()
  const result = await module.persistAmbiguousCapture({ db, webId: 'https://alice.example/profile/card#me' }, {
    id: 'candidate_ambiguous',
    eventId: 'event_ambiguous',
    inputRequestId: 'input_capture_type',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_4',
    summary: 'The content may be a decision or an idea.',
    prompt: 'Should this be captured as a Decision or an Idea, and where should it live?',
    inputOptions: JSON.stringify(['Decision', 'Idea', 'Skip']),
    session: 'https://alice.example/.data/sessions/2026/06/16/session.ttl',
    chat: 'https://alice.example/.data/chat/default/index.ttl#this',
    thread: 'https://alice.example/.data/chat/default/index.ttl#thread_1',
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
  })

  assert.equal(result.status, 'waiting_input')
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_candidate').length, 1)
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'input_request').length, 1)
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_event').length, 1)
  const input = db.rows.find((row) => row.__resource === 'input_request')
  assert.equal(input.id, '2026/06/16.ttl#input_capture_type')
  assert.equal(input.requestKind, 'capture-classification')
  assert.equal(input.status, 'pending')
  const event = db.rows.find((row) => row.__resource === 'capture_event')
  assert.equal(event.decision, 'candidate_created')
  assert.equal(event.inputRequest, result.inputRequestIri)
  assert.equal(event.captureCandidate, result.candidateIri)
})

test('capture coordinator requests approval before creating AI-inferred user structure', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/persistence.ts')
  t.after(() => cleanup())

  const db = createCaptureDb()
  const result = await module.requestCaptureApproval({ db, webId: 'https://alice.example/profile/card#me' }, {
    id: 'candidate_folder',
    approvalId: 'approval_capture_folder',
    eventId: 'event_approval',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_5',
    summary: 'Secretary proposes creating a LinX decisions folder for this capture.',
    session: 'https://alice.example/.data/sessions/2026/06/16/session.ttl',
    toolCallId: 'capture-folder-1',
    target: 'https://alice.example/projects/linx/decisions/',
    action: 'https://undefineds.co/ns#createResource',
    risk: 'normal',
    reason: 'Secretary inferred a new user-facing decisions folder.',
    context: 'Do not create user taxonomy silently.',
    approvalOptions: JSON.stringify(['approve', 'reject']),
    suggestedTarget: 'https://alice.example/projects/linx/decisions/',
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
  })

  assert.equal(result.status, 'waiting_approval')
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_candidate').length, 1)
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'approval').length, 1)
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_event').length, 1)
  const approval = db.rows.find((row) => row.__resource === 'approval')
  assert.equal(approval.id, '2026/06/16.ttl#approval_capture_folder')
  assert.equal(approval.status, 'pending')
  assert.equal(approval.toolName, 'capture')
  assert.equal(approval.target, 'https://alice.example/projects/linx/decisions/')
  const event = db.rows.find((row) => row.__resource === 'capture_event')
  assert.equal(event.decision, 'candidate_created')
  assert.equal(event.captureCandidate, result.candidateIri)
  assert.equal(event.approval, result.approvalIri)
  assert.equal(event.suggestedTarget, 'https://alice.example/projects/linx/decisions/')
})

test('capture coordinator records rejection rollback and user correction events', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/persistence.ts')
  t.after(() => cleanup())

  const db = createCaptureDb()
  db.rows.push({
    __resource: 'capture_candidate',
    id: 'candidates/2026/06/16.ttl#candidate_review',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_6',
    summary: 'Review target',
    status: 'candidate',
  })

  await module.recordCaptureReviewEvent({ db }, {
    eventId: 'event_rejected',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_6',
    candidateId: 'candidates/2026/06/16.ttl#candidate_review',
    candidateIri: 'https://alice.example/.data/capture/candidates/2026/06/16.ttl#candidate_review',
    decision: 'rejected',
    reason: 'User rejected this capture.',
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
  })

  await module.recordCaptureReviewEvent({ db }, {
    eventId: 'event_corrected',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_6',
    candidateId: 'candidates/2026/06/16.ttl#candidate_review',
    candidateIri: 'https://alice.example/.data/capture/candidates/2026/06/16.ttl#candidate_review',
    decision: 'corrected',
    userCorrection: 'Classify similar notes as Decision only under the LinX project.',
    suggestedType: 'https://undefineds.co/ns#Decision',
    suggestedTarget: 'https://alice.example/projects/linx/decisions/',
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
  })

  assert.deepEqual(
    db.calls.filter((call) => call.op === 'updateById' && call.resource === 'capture_candidate').map((call) => call.patch),
    [{ status: 'rejected' }],
  )
  const events = db.rows.filter((row) => row.__resource === 'capture_event')
  assert.equal(events.length, 2)
  assert.equal(events[0].decision, 'rejected')
  assert.equal(events[0].captureCandidate, 'https://alice.example/.data/capture/candidates/2026/06/16.ttl#candidate_review')
  assert.equal(events[1].decision, 'corrected')
  assert.equal(events[1].userCorrection, 'Classify similar notes as Decision only under the LinX project.')
})

test('capture coordinator records ignored events without creating candidate or formal resource', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/persistence.ts')
  t.after(() => cleanup())

  const db = createCaptureDb()
  const result = await module.recordCaptureReviewEvent({ db }, {
    eventId: 'event_ignored',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_ignored',
    decision: 'ignored',
    reason: 'Mentioned in passing and not useful enough for durable memory.',
    createdAt: new Date('2026-06-16T00:00:00.000Z'),
  })

  assert.equal(result.status, 'recorded')
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_candidate').length, 0)
  assert.equal(db.calls.filter((call) => call.op === 'updateById').length, 0)
  const event = db.rows.find((row) => row.__resource === 'capture_event')
  assert.equal(event.decision, 'ignored')
  assert.equal(event.reason, 'Mentioned in passing and not useful enough for durable memory.')
})

test('capture runtime tool persists an observed candidate through the active Pod database', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/tool.ts')
  t.after(() => cleanup())

  const db = createCaptureDb()
  const tool = module.createLinxCaptureTool({
    async getPodDataSession() {
      return {
        webId: 'https://alice.example/profile/card#me',
        podUrl: 'https://alice.example/',
      }
    },
    createDb() {
      return db
    },
  })

  const result = await tool.execute('capture_call_1', {
    operation: 'observed_candidate',
    id: 'candidate_tool',
    eventId: 'event_tool',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_tool',
    summary: 'Runtime tool should persist capture candidates through models.',
    suggestedType: 'https://undefineds.co/ns#Idea',
    confidence: 'high',
    reason: 'The content is a durable implementation boundary.',
    createdAt: '2026-06-16T00:00:00.000Z',
  })

  assert.equal(result.isError, undefined)
  assert.equal(result.details.operation, 'observed_candidate')
  assert.equal(result.details.result.status, 'created')
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_candidate').length, 1)
  assert.equal(db.calls.filter((call) => call.op === 'insert' && call.resource === 'capture_event').length, 1)
})

test('capture runtime tool reports missing Pod login without fabricating local state', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/tool.ts')
  t.after(() => cleanup())

  const tool = module.createLinxCaptureTool({
    async getPodDataSession() {
      return null
    },
    createDb() {
      throw new Error('should not create db without Pod session')
    },
  })

  const result = await tool.execute('capture_call_no_login', {
    operation: 'observed_candidate',
    id: 'candidate_no_login',
    eventId: 'event_no_login',
    source: 'https://alice.example/.data/chat/default/2026/06/16/messages.ttl#msg_no_login',
    summary: 'No Pod login should not write local fallback capture data.',
  })

  assert.equal(result.isError, true)
  assert.match(result.content[0].text, /No active LinX Pod session/)
})

test('capture runtime tool schema accepts ignored review events', async (t) => {
  const { module, cleanup } = await loadAutoModeModule('lib/capture/tool.ts')
  t.after(() => cleanup())

  const tool = module.createLinxCaptureTool()
  const decisionSchema = tool.parameters.properties.decision
  const decisionValues = decisionSchema.anyOf.map((entry) => entry.const)

  assert.ok(decisionValues.includes('ignored'))
})
