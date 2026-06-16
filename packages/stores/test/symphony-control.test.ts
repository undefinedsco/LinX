import test from 'node:test'
import assert from 'node:assert/strict'
import {
  completeSymphonyWorkerRun,
  createRunPlan,
  recordSymphonyWorkerRuntimeEvent,
  startSymphonyWorkerRun,
  type SymphonyRunPlan,
} from '@linx/agent-runtime/symphony'
import { normalizeCodexAppServerInteractionRequest } from '@linx/agent-runtime/auto-mode'
import {
  approvalResource,
  chatResource,
  contactResource,
  deliveryResource,
  evidenceResource,
  inboxNotificationResource,
  inputRequestResource,
  issueResource,
  messageResource,
  reportResource,
  runResource,
  runStepResource,
  sessionResource,
  taskResource,
  threadResource,
} from '@undefineds.co/models'
import {
  buildSymphonyControlRows,
  buildSymphonyInteractionRequestRows,
  listOpenSymphonyIssuesFromControlState,
  listRecentSymphonyReportsFromControlState,
  listRunningSymphonyWorkersFromControlState,
  persistSymphonyWorkerDelivery,
  persistSymphonyInteractionRequest,
  persistSymphonyControlState,
  SYMPHONY_POLICY_VERSION,
  SYMPHONY_RUNTIME_REQUEST_POLICY_VERSION,
} from '../src/symphony-control.ts'

const webId = 'https://alice.example/profile/card#me'
const chat = 'https://alice.example/.data/chat/chat-1/index.ttl#this'
const thread = 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1'

function createRunningPlan(): SymphonyRunPlan {
  const plan = createRunPlan({
    objective: 'Verify Web-started worker visibility.',
    acceptanceCriteria: ['CLI can see running worker from Pod Session rows'],
    workspacePath: '/tmp/linx',
    workspaceKind: 'worktree',
    repository: 'https://github.com/undefinedsco/linx.git',
    branch: 'main',
    worktree: '/tmp/linx-worktree',
    container: 'urn:undefineds:workspace:linx-test',
    baseRevision: 'abc123',
    backend: 'codex',
    mode: 'off',
    chat,
    thread,
    now: new Date('2026-04-02T00:00:00.000Z'),
    randomId: 'stores',
  })
  const worker = startSymphonyWorkerRun({
    worker: plan.workers[0]!,
    now: new Date('2026-04-02T00:00:30.000Z'),
    randomId: 'stores-running',
    payload: { heartbeat: true },
  })
  return {
    ...plan,
    task: worker.task,
    taskRecord: worker.taskRecord,
    delivery: worker.delivery,
    session: worker.session,
    workers: [worker],
  }
}

test('buildSymphonyControlRows creates shared worker control rows for Web and CLI', () => {
  const plan = createRunningPlan()
  const rows = buildSymphonyControlRows({
    plan,
    webId,
    stage: 'running',
    stages: ['planned', 'running'],
  })

  assert.equal(rows.issue.source, undefined)
  assert.equal(rows.issue.id, 'issue_2026-04-02T00-00-00-000Z_stores')
  assert.equal(rows.issue.chat, chat)
  assert.equal(rows.issue.thread, thread)
  assert.equal(rows.tasks.length, 1)
  assert.equal(rows.contacts.length, 2)
  assert.equal(rows.chats.length, 1)
  assert.equal(rows.threads.length, 1)
  assert.equal(rows.messages.length, 2)
  assert.equal(rows.deliveries.length, 1)
  assert.equal(rows.sessions.length, 1)
  assert.equal(rows.runs.length, 1)
  assert.equal(rows.runSteps.length, 3)
  assert.equal(rows.contacts[0]?.about, 'https://alice.example/agents/__secretary__/')
  assert.equal(rows.chats[0]?.participants?.includes('https://alice.example/agents/__secretary__/'), true)
  assert.equal(rows.threads[0]?.parent, chat)
  assert.equal(rows.messages[0]?.thread, thread)
  assert.equal(rows.messages[1]?.content.includes('Symphony workers are active'), true)

  const task = rows.tasks[0]!
  assert.equal(task.issue, 'https://alice.example/.data/issues/issue_2026-04-02T00-00-00-000Z_stores.ttl')
  assert.equal(task.thread, thread)
  assert.equal(task.status, 'active')
  assert.equal(task.metadata?.workspace?.path, '/tmp/linx')
  assert.equal(task.metadata?.workspace?.container, 'urn:undefineds:workspace:linx-test')
  assert.equal(task.metadata?.spaceContract?.workspace?.allocation, 'thread')
  assert.equal(task.metadata?.podAccessPolicy?.version, 'linx-symphony-worker-pod-access/v1')
  assert.ok(task.metadata?.podAccessPolicy?.writeScope.includes('runStep'))

  const session = rows.sessions[0]!
  assert.equal(session.status, 'active')
  assert.equal(session.tool, 'symphony:codex')
  assert.equal(session.policyVersion, SYMPHONY_POLICY_VERSION)
  assert.equal(session.metadata?.kind, 'symphony-run')
  assert.equal(session.metadata?.workers?.[0]?.status, 'running')
  assert.equal(session.metadata?.workers?.[0]?.podAccessPolicy?.assigned?.session, 'https://alice.example/.data/sessions/2026/04/02/session_2026-04-02T00-00-00-000Z_stores.ttl')

  const run = rows.runs[0]!
  assert.equal(run.status, 'running')
  assert.equal(run.metadata?.podAccessPolicy?.noPodFallback, 'return-structured-report-for-secretary-to-persist')

  assert.deepEqual(rows.runSteps.map((row) => row.stepType), ['run.created', 'run.started', 'run.started'])
  assert.ok(rows.runSteps.every((row) => !String(row.id).startsWith('https://')))
  assert.ok(rows.runSteps.every((row) => row.payload?.surface === 'symphony'))
  assert.ok(rows.runSteps.every((row) => !('data' in row)))
})

test('buildSymphonyControlRows creates modeled Report and Evidence rows for terminal workers', () => {
  const running = createRunningPlan()
  const completed = completeSymphonyWorkerRun({
    issue: running.issue,
    worker: running.workers[0]!,
    status: 'completed',
    exitCode: 0,
    reportText: [
      'Implemented worker task.',
      '',
      '```json',
      JSON.stringify({
        symphonyFinal: true,
        summary: 'Worker finished with reusable evidence.',
        evidence: ['stores test passed'],
        commands: ['node --test packages/stores/test/symphony-control.test.ts'],
        changedFiles: ['packages/stores/src/symphony-control.ts'],
        risks: ['live Pod write not run in this unit test'],
      }),
      '```',
    ].join('\n'),
    now: new Date('2026-04-02T00:02:00.000Z'),
    randomId: 'stores-complete',
  })
  const plan: SymphonyRunPlan = {
    ...running,
    issue: {
      ...running.issue,
      status: 'resolved',
      updatedAt: '2026-04-02T00:02:00.000Z',
    },
    task: completed.worker.task,
    taskRecord: completed.worker.taskRecord,
    delivery: completed.worker.delivery,
    session: completed.worker.session,
    workers: [completed.worker],
    followUpIssues: completed.followUpIssues,
  }

  const rows = buildSymphonyControlRows({
    plan,
    webId,
    stage: 'completed',
  })

  expectTerminalRows(rows)
})

test('shared control-state readers list open Issues, running workers, and recent Reports', async () => {
  const running = createRunningPlan()
  const runningRows = buildSymphonyControlRows({
    plan: running,
    webId,
    stage: 'running',
  })
  const completed = completeSymphonyWorkerRun({
    issue: running.issue,
    worker: running.workers[0]!,
    status: 'completed',
    exitCode: 0,
    reportText: [
      'Implemented worker task.',
      '',
      '```json',
      JSON.stringify({
        symphonyFinal: true,
        summary: 'Worker finished with shared status readers.',
        evidence: ['shared reader unit test passed'],
      }),
      '```',
    ].join('\n'),
    now: new Date('2026-04-02T00:02:00.000Z'),
    randomId: 'stores-read-complete',
  })
  const completedRows = buildSymphonyControlRows({
    plan: {
      ...running,
      issue: {
        ...running.issue,
        status: 'resolved',
        updatedAt: '2026-04-02T00:02:00.000Z',
      },
      task: completed.worker.task,
      taskRecord: completed.worker.taskRecord,
      delivery: completed.worker.delivery,
      session: completed.worker.session,
      workers: [completed.worker],
    },
    webId,
    stage: 'completed',
  })
  const rowsByResource = new Map<unknown, unknown[]>([
    [issueResource, [
      {
        ...runningRows.issue,
        source: 'web',
      },
      {
        ...runningRows.issue,
        id: 'issue_closed',
        title: 'Closed Symphony issue',
        status: 'resolved',
      },
    ]],
    [sessionResource, runningRows.sessions],
    [reportResource, completedRows.reports],
    [deliveryResource, []],
  ])
  const fakeDb = {
    async init() {
      // no-op
    },
    select() {
      return {
        from(resource: unknown) {
          return {
            async execute() {
              return rowsByResource.get(resource) ?? []
            },
          }
        },
      }
    },
  }

  const issues = await listOpenSymphonyIssuesFromControlState({
    db: fakeDb as never,
    webId,
  })
  assert.equal(issues.length, 1)
  assert.equal(issues[0]?.source, 'web')
  assert.equal(issues[0]?.status, 'open')

  const workers = await listRunningSymphonyWorkersFromControlState({
    db: fakeDb as never,
  })
  assert.deepEqual(workers, [{
    status: 'running',
    backend: 'codex',
    mode: 'off',
    cwd: '/tmp/linx',
    autoModeSessionId: undefined,
    target: {
      label: 'Verify Web-started worker visibility.',
      agent: 'codex-worker',
      chat,
    },
  }])

  const reports = await listRecentSymphonyReportsFromControlState({
    db: fakeDb as never,
  })
  assert.equal(reports.length, 1)
  assert.equal(reports[0]?.backend, 'codex')
  assert.equal(reports[0]?.summary, 'Worker finished with shared status readers.')
  assert.equal(reports[0]?.task, completedRows.reports[0]?.task)
  assert.equal(reports[0]?.delivery, completedRows.reports[0]?.delivery)
})

test('buildSymphonyControlRows records failed attempts as implementation change request Evidence', () => {
  const running = createRunningPlan()
  const attempted = recordSymphonyWorkerRuntimeEvent({
    worker: running.workers[0]!,
    stepType: 'run.step',
    message: 'First attempt failed with a repeatable adapter error.',
    payload: {
      command: 'node --test packages/stores/test/symphony-control.test.ts',
      result: 'failed',
      errorSummary: 'adapter contract missing',
    },
    now: new Date('2026-04-02T00:01:30.000Z'),
    randomId: 'stores-failed-attempt',
  })
  const failed = completeSymphonyWorkerRun({
    issue: running.issue,
    worker: attempted,
    status: 'failed',
    exitCode: 1,
    reportText: [
      'The worker failed.',
      '',
      '```json',
      JSON.stringify({
        symphonyFinal: true,
        summary: 'Worker failed because the shared runtime adapter contract is missing.',
        evidence: ['adapter test failed'],
        risks: ['retrying the same task will fail again'],
      }),
      '```',
    ].join('\n'),
    now: new Date('2026-04-02T00:02:00.000Z'),
    randomId: 'stores-failed-complete',
  })
  const plan: SymphonyRunPlan = {
    ...running,
    task: failed.worker.task,
    taskRecord: failed.worker.taskRecord,
    delivery: failed.worker.delivery,
    session: failed.worker.session,
    workers: [failed.worker],
  }

  const rows = buildSymphonyControlRows({
    plan,
    webId,
    stage: 'failed',
  })

  assert.equal(rows.tasks.length, 1)
  assert.equal(rows.tasks[0]?.id, 'index.ttl#task_2026-04-02T00-00-00-000Z_stores')
  assert.deepEqual(rows.runSteps.map((row) => row.stepType), ['run.failed', 'run.started', 'run.step', 'run.failed'])
  assert.equal(rows.evidence.length, 2)
  const changeRequest = rows.evidence.find((row) => row.metadata?.recordKind === 'implementation_change_request')
  assert.ok(changeRequest)
  assert.equal(changeRequest.evidenceKind, 'review_finding')
  assert.equal(changeRequest.task, 'https://alice.example/.data/task/index.ttl#task_2026-04-02T00-00-00-000Z_stores')
  assert.equal(changeRequest.metadata?.implementationChangeRequest?.trigger, 'worker_failed')
  assert.equal(changeRequest.metadata?.implementationChangeRequest?.task, failed.worker.task)
  assert.ok(changeRequest.metadata?.basedOnRunSteps?.includes(attempted.runSteps?.[1]?.uri))
  assert.ok(changeRequest.metadata?.sourceRunSteps?.length >= 3)
  assert.ok(changeRequest.metadata?.sourceRunSteps?.every((iri: string) => iri.includes('/runs.ttl#runStep_')))

  assert.equal(rows.reports.length, 1)
  assert.equal(rows.reports[0]?.evidence?.length, 2)
})

test('buildSymphonyInteractionRequestRows maps Codex approval into shared request resources', () => {
  const plan = createRunningPlan()
  const request = normalizeCodexAppServerInteractionRequest({
    id: 12,
    method: 'item/commandExecution/requestApproval',
    params: {
      toolCallId: 'tool-call-1',
      command: 'git status --short',
      cwd: '/tmp/linx',
    },
  })
  assert.ok(request)
  assert.notEqual(request.kind, 'user-input')

  const rows = buildSymphonyInteractionRequestRows({
    plan,
    webId,
    request,
    now: new Date('2026-04-02T00:01:00.000Z'),
    randomId: 'approval-1',
    source: 'codex-app-server',
  })

  assert.ok(rows.approval)
  assert.equal(rows.inputRequest, undefined)
  assert.equal(rows.approval.id, 'symphony-command-approval-approval-1')
  assert.equal(rows.approval.session, 'https://alice.example/.data/sessions/2026/04/02/session_2026-04-02T00-00-00-000Z_stores.ttl')
  assert.equal(rows.approval.chat, chat)
  assert.equal(rows.approval.thread, thread)
  assert.equal(rows.approval.toolCallId, 'tool-call-1')
  assert.equal(rows.approval.toolName, 'commandExecution')
  assert.equal(rows.approval.status, 'pending')
  assert.equal(rows.approval.assignedTo, 'https://alice.example/agents/__secretary__/')
  assert.equal(rows.approval.onBehalfOf, webId)
  assert.equal(rows.approval.policyVersion, SYMPHONY_RUNTIME_REQUEST_POLICY_VERSION)
  assert.match(String(rows.approval.context), /secretary-before-human/)
  assert.match(String(rows.approval.context), /secretary-policy-or-human/)
  assert.match(String(rows.approval.context), /runtime-request/)

  assert.equal(rows.inboxNotification.object, 'https://alice.example/.data/approvals/2026/04/02.ttl#symphony-command-approval-approval-1')
  assert.equal(rows.runStep.stepType, 'approval.required')
  assert.equal(rows.runStep.payload?.controlResource, rows.inboxNotification.object)
  assert.equal(rows.runStep.payload?.request?.kind, 'command-approval')
  assert.equal(rows.runStep.payload?.routing?.firstResponder, '__secretary__')
})

test('buildSymphonyInteractionRequestRows maps structured Codex input into InputRequest and Inbox', () => {
  const plan = createRunningPlan()
  const request = normalizeCodexAppServerInteractionRequest({
    id: 13,
    method: 'item/tool/requestUserInput',
    params: {
      questions: [{
        id: 'runtime',
        header: 'Runtime',
        question: 'Choose runtime',
        options: [{ label: 'local' }, { label: 'cloud' }],
      }],
    },
  })
  assert.ok(request)
  assert.equal(request.kind, 'user-input')

  const rows = buildSymphonyInteractionRequestRows({
    plan,
    webId,
    request,
    now: new Date('2026-04-02T00:01:30.000Z'),
    randomId: 'input-1',
    source: 'codex-app-server',
  })

  assert.ok(rows.inputRequest)
  assert.equal(rows.approval, undefined)
  assert.equal(rows.inputRequest.id, 'symphony-user-input-input-1')
  assert.equal(rows.inputRequest.session, 'https://alice.example/.data/sessions/2026/04/02/session_2026-04-02T00-00-00-000Z_stores.ttl')
  assert.equal(rows.inputRequest.run, 'https://alice.example/.data/2026/04/02/runs.ttl#session_2026-04-02T00-00-00-000Z_stores')
  assert.equal(rows.inputRequest.task, 'https://alice.example/.data/task/index.ttl#task_2026-04-02T00-00-00-000Z_stores')
  assert.equal(rows.inputRequest.prompt, 'Codex requests structured user input')
  assert.match(String(rows.inputRequest.inputOptions), /Choose runtime/)
  assert.equal(rows.inputRequest.status, 'pending')
  assert.equal(rows.inputRequest.assignedTo, 'https://alice.example/agents/__secretary__/')
  assert.equal(rows.inputRequest.onBehalfOf, webId)
  assert.equal(rows.inputRequest.metadata?.policyVersion, SYMPHONY_RUNTIME_REQUEST_POLICY_VERSION)
  assert.equal(rows.inputRequest.metadata?.decisionSource, 'secretary-policy-or-human')
  assert.equal(rows.inputRequest.metadata?.valueSource, 'secretary-or-human-response')
  assert.match(String(rows.inputRequest.context), /secretary-policy-or-human/)

  assert.equal(rows.inboxNotification.object, 'https://alice.example/.data/input-requests/2026/04/02.ttl#symphony-user-input-input-1')
  assert.equal(rows.runStep.stepType, 'input.required')
  assert.equal(rows.runStep.payload?.controlResource, rows.inboxNotification.object)
  assert.equal(rows.runStep.payload?.request?.questions?.[0]?.id, 'runtime')
})

function expectTerminalRows(rows: ReturnType<typeof buildSymphonyControlRows>) {
  assert.equal(rows.evidence.length, 1)
  assert.equal(rows.reports.length, 1)
  const evidence = rows.evidence[0]!
  const report = rows.reports[0]!
  assert.equal(evidence.evidenceKind, 'runtime_log')
  assert.equal(evidence.outcome, 'accepted')
  assert.equal(evidence.metadata?.evidence?.[0], 'stores test passed')
  assert.equal(report.reportKind, 'handoff')
  assert.equal(report.status, 'published')
  assert.equal(report.outcome, 'accepted')
  assert.equal(report.summary, 'Worker finished with reusable evidence.')
  assert.deepEqual(report.evidence, [
    'https://alice.example/.data/evidence/2026/04/02.ttl#session_2026-04-02T00-00-00-000Z_stores-final',
  ])
}

test('persistSymphonyControlState writes only modeled control resources', async () => {
  const plan = createRunningPlan()
  const calls: { op: string; resource: unknown; target?: unknown; value?: Record<string, unknown> }[] = []
  const fakeDb = {
    async init(resources: unknown[]) {
      calls.push({ op: 'init', resource: resources })
    },
    async findByResource(resource: unknown, target: unknown) {
      calls.push({ op: 'find', resource, target })
      return null
    },
    updateByResource() {
      throw new Error('should insert fresh rows in this test')
    },
    insert(resource: unknown) {
      return {
        values(value: Record<string, unknown>) {
          return {
            async execute() {
              calls.push({ op: 'insert', resource, value })
            },
          }
        },
      }
    },
  }

  const result = await persistSymphonyControlState({
    db: fakeDb as never,
    webId,
    plan,
    stage: 'running',
  })

  assert.equal(result.plan, plan)
  const inserts = calls.filter((call) => call.op === 'insert')
  const expectedResources = [
    contactResource,
    contactResource,
    chatResource,
    threadResource,
    messageResource,
    issueResource,
    taskResource,
    deliveryResource,
    sessionResource,
    runResource,
    runStepResource,
    runStepResource,
  ]
  assert.equal(inserts.length, expectedResources.length)
  expectedResources.forEach((resource, index) => {
    assert.equal(inserts[index]?.resource, resource)
  })
  assert.equal(inserts.find((call) => call.resource === sessionResource)?.value?.tool, 'symphony:codex')
})

test('persistSymphonyWorkerDelivery ingests manual Codex reports through shared control state', async () => {
  const plan = createRunPlan({
    objective: 'Ingest a manually launched Codex worker report.',
    acceptanceCriteria: ['Delivery report becomes modeled Symphony control rows'],
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'off',
    chat,
    thread,
    now: new Date('2026-04-02T01:00:00.000Z'),
    randomId: 'delivery',
  })
  const calls: { op: string; resource: unknown; target?: unknown; value?: Record<string, unknown> }[] = []
  const fakeDb = {
    async init(resources: unknown[]) {
      calls.push({ op: 'init', resource: resources })
    },
    async findByResource(resource: unknown, target: unknown) {
      calls.push({ op: 'find', resource, target })
      return null
    },
    updateByResource() {
      throw new Error('should insert fresh rows in this test')
    },
    insert(resource: unknown) {
      return {
        values(value: Record<string, unknown>) {
          return {
            async execute() {
              calls.push({ op: 'insert', resource, value })
            },
          }
        },
      }
    },
  }

  const result = await persistSymphonyWorkerDelivery({
    db: fakeDb as never,
    webId,
    plan,
    delivery: {
      symphonyDelivery: true,
      status: 'completed',
      exitCode: 0,
      autoModeSessionId: 'codex_manual_delivery_1',
      events: [{
        stepType: 'run.step',
        message: 'Manual Codex worker produced the final patch.',
        createdAt: '2026-04-02T01:01:00.000Z',
        payload: {
          command: 'node --test packages/stores/test/symphony-control.test.ts',
        },
      }],
      report: {
        summary: 'Manual Codex Delivery was ingested.',
        evidence: ['stores Delivery ingestion test passed'],
        changedFiles: ['packages/stores/src/symphony-control.ts'],
        followUps: [{
          kind: 'missing_shared_abstraction',
          summary: 'Package the Delivery bridge as an installable Codex ingress.',
          suggestedDisposition: 'new_issue',
          evidence: ['docs/secretary/symphony-worker-goal-control-spec.md'],
        }],
      },
    },
    now: new Date('2026-04-02T01:02:00.000Z'),
    randomId: 'delivery-ingest',
  })

  assert.equal(result.status, 'completed')
  assert.equal(result.autoModeSessionId, 'codex_manual_delivery_1')
  assert.equal(result.worker.runSteps?.map((step) => step.stepType).join(','), 'run.started,run.step,run.completed')
  assert.equal(result.worker.runSteps?.[1]?.createdAt, '2026-04-02T01:01:00.000Z')
  assert.equal(result.plan.followUpIssues?.length, 1)
  assert.equal(result.plan.followUpIssues?.[0]?.parentIssue, plan.issue.uri)
  assert.equal(result.worker.taskRecord.acceptanceReview?.reusableExtraction.disposition, 'new_issue')

  const inserts = calls.filter((call) => call.op === 'insert')
  assert.ok(inserts.some((call) => call.resource === reportResource && call.value?.summary === 'Manual Codex Delivery was ingested.'))
  assert.ok(inserts.some((call) => call.resource === evidenceResource && call.value?.metadata?.acceptanceReview?.reusableExtraction?.disposition === 'new_issue'))
  assert.ok(inserts.some((call) => call.resource === issueResource && call.value?.parentIssue === 'https://alice.example/.data/issues/issue_2026-04-02T01-00-00-000Z_delivery.ttl'))
  assert.ok(inserts.some((call) => call.resource === runStepResource && call.value?.stepType === 'run.step'))
})

test('persistSymphonyInteractionRequest writes request, inbox notification, and RunStep rows', async () => {
  const plan = createRunningPlan()
  const request = normalizeCodexAppServerInteractionRequest({
    method: 'item/commandExecution/requestApproval',
    params: {
      command: 'pwd',
      cwd: '/tmp/linx',
    },
  })
  assert.ok(request)

  const calls: { op: string; resource: unknown; target?: unknown; value?: Record<string, unknown> }[] = []
  const fakeDb = {
    async init(resources: unknown[]) {
      calls.push({ op: 'init', resource: resources })
    },
    async findByResource(resource: unknown, target: unknown) {
      calls.push({ op: 'find', resource, target })
      return null
    },
    updateByResource() {
      throw new Error('should insert fresh rows in this test')
    },
    insert(resource: unknown) {
      return {
        values(value: Record<string, unknown>) {
          return {
            async execute() {
              calls.push({ op: 'insert', resource, value })
            },
          }
        },
      }
    },
  }

  const result = await persistSymphonyInteractionRequest({
    db: fakeDb as never,
    webId,
    plan,
    request,
    now: new Date('2026-04-02T00:01:00.000Z'),
    randomId: 'approval-persist',
  })

  assert.equal(result.plan, plan)
  const inserts = calls.filter((call) => call.op === 'insert')
  const expectedResources = [
    approvalResource,
    inboxNotificationResource,
    runStepResource,
  ]
  assert.equal(inserts.length, expectedResources.length)
  expectedResources.forEach((resource, index) => {
    assert.equal(inserts[index]?.resource, resource)
  })
  assert.equal(inserts.find((call) => call.resource === approvalResource)?.value?.assignedTo, 'https://alice.example/agents/__secretary__/')
  assert.equal(inserts.find((call) => call.resource === runStepResource)?.value?.stepType, 'approval.required')
  assert.equal(
    inserts.find((call) => call.resource === inboxNotificationResource)?.value?.object,
    'https://alice.example/.data/approvals/2026/04/02.ttl#symphony-command-approval-approval-persist',
  )

  assert.ok(calls.some((call) => call.op === 'init'
    && Array.isArray(call.resource)
    && call.resource.includes(inputRequestResource)))
})
