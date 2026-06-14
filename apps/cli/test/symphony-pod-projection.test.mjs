import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAutoModeModule } from './auto-mode-test-bundle.mjs'

let projectionModule
let cleanup

function createPlan(overrides = {}) {
  const now = '2026-04-02T00:00:00.000Z'
  return {
    issue: {
      uri: 'urn:undefineds:linx:issue:issue_2026-04-02T00-00-00-000Z_projection',
      title: 'Verify Symphony Pod projection',
      description: 'make app see running process',
      status: 'open',
      priority: 'medium',
      source: 'cli',
      tasks: ['urn:undefineds:linx:task:task_2026-04-02T00-00-00-000Z_projection'],
      createdAt: now,
      updatedAt: now,
      ...overrides.issue,
    },
    task: 'urn:undefineds:linx:task:task_2026-04-02T00-00-00-000Z_projection',
    taskRecord: {
      uri: 'urn:undefineds:linx:task:task_2026-04-02T00-00-00-000Z_projection',
      issue: 'urn:undefineds:linx:issue:issue_2026-04-02T00-00-00-000Z_projection',
      title: 'Verify Symphony Pod projection',
      objective: 'make app see running process',
      acceptanceCriteria: ['projection is visible'],
      status: 'running',
      target: {
        source: 'ai-contact',
        backend: 'codex',
        agent: 'codex-worker',
        chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
        thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
        messages: ['https://alice.example/.data/chat/chat-1/2026/04/02/messages.ttl#message-1'],
      },
      backend: 'codex',
      agent: 'codex-worker',
      delivery: 'urn:undefineds:linx:delivery:delivery_2026-04-02T00-00-00-000Z_projection',
      session: 'urn:undefineds:linx:session:session_2026-04-02T00-00-00-000Z_projection',
      createdAt: now,
      updatedAt: '2026-04-02T00:00:03.000Z',
      ...overrides.taskRecord,
    },
    delivery: {
      uri: 'urn:undefineds:linx:delivery:delivery_2026-04-02T00-00-00-000Z_projection',
      issue: 'urn:undefineds:linx:issue:issue_2026-04-02T00-00-00-000Z_projection',
      task: 'urn:undefineds:linx:task:task_2026-04-02T00-00-00-000Z_projection',
      type: 'task_dispatch',
      status: 'pending',
      sourceAgent: '__secretary__',
      targetBackend: 'codex',
      targetAgent: 'codex-worker',
      target: {
        source: 'ai-contact',
        backend: 'codex',
        agent: 'codex-worker',
        chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
        thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
        messages: ['https://alice.example/.data/chat/chat-1/2026/04/02/messages.ttl#message-1'],
      },
      projection: {
        runtimeRole: 'user',
        prompt: '# LinX Symphony Task\n\nObjective',
      },
      session: 'urn:undefineds:linx:session:session_2026-04-02T00-00-00-000Z_projection',
      createdAt: now,
      updatedAt: now,
      ...overrides.delivery,
    },
    session: {
      uri: 'urn:undefineds:linx:session:session_2026-04-02T00-00-00-000Z_projection',
      issue: 'urn:undefineds:linx:issue:issue_2026-04-02T00-00-00-000Z_projection',
      task: 'urn:undefineds:linx:task:task_2026-04-02T00-00-00-000Z_projection',
      delivery: 'urn:undefineds:linx:delivery:delivery_2026-04-02T00-00-00-000Z_projection',
      backend: 'codex',
      mode: 'auto',
      status: 'running',
      cwd: '/tmp/linx',
      workspace: {
        path: '/tmp/linx',
        kind: 'git',
        repository: 'https://github.com/undefineds/linx.git',
        branch: 'main',
        worktree: '/tmp/linx',
        container: 'urn:undefineds:workspace:local-linx',
        baseRevision: 'abc123',
        environment: {
          kind: 'local-shell',
          id: 'host-a',
          label: 'Local LinX checkout',
          runtime: 'codex',
        },
      },
      target: {
        source: 'ai-contact',
        backend: 'codex',
        agent: 'codex-worker',
        chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
        thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
        messages: ['https://alice.example/.data/chat/chat-1/2026/04/02/messages.ttl#message-1'],
      },
      model: 'gpt-5.4-mini',
      createdAt: now,
      updatedAt: '2026-04-02T00:00:03.000Z',
      ...overrides.session,
    },
  }
}

function createFakeRuntime(options = {}) {
  const inserts = []
  const updates = []
  const findIds = []
  const findIris = []
  const findResources = []
  const resources = {
    chat: { name: 'chat' },
    thread: { name: 'thread' },
    message: { name: 'message' },
    session: { name: 'session' },
    idea: { name: 'idea' },
    issue: {
      name: 'issue',
      mapping: {
        type: 'https://undefineds.co/ns#Issue',
        columns: {
          id: { predicate: '@id', kind: 'datatype' },
          title: { predicate: 'http://purl.org/dc/terms/title', kind: 'datatype' },
          status: { predicate: 'https://undefineds.co/ns#status', kind: 'datatype' },
          tasks: { predicate: 'https://undefineds.co/ns#task', kind: 'object', isArray: true },
        },
      },
      columns: {
        id: { dataType: 'string', options: { predicate: '@id' } },
        title: { dataType: 'string', options: { predicate: 'http://purl.org/dc/terms/title' } },
        status: { dataType: 'string', options: { predicate: 'https://undefineds.co/ns#status' } },
        tasks: { dataType: 'uri', options: { predicate: 'https://undefineds.co/ns#task', isArray: true } },
      },
    },
    task: { name: 'task' },
    delivery: { name: 'delivery' },
    run: { name: 'run' },
    runStep: { name: 'run_step' },
    agent: {
      name: 'agent',
      buildId: ({ id }) => `${id}/`,
    },
    contact: { name: 'contact' },
    audit: { name: 'audit' },
    inbox: { name: 'inbox_notification' },
  }
  const db = {
    init: async () => undefined,
    select() {
      return {
        from(resource) {
          return {
            execute: async () => options.rowsByResource?.[resource.name] ?? [],
          }
        },
      }
    },
    resolveLocatorIri: (resource, locator) => {
      if (typeof locator?.id === 'string' && /^https?:\/\//u.test(locator.id)) {
        throw new Error(`resolveLocatorIri does not accept a full IRI in locator.id: ${locator.id}`)
      }
      return `${resource.name}:${JSON.stringify(locator)}`
    },
    findByIri: async (_resource, iri) => {
      findIris.push(iri)
      return options.rowsByIri?.[iri] ?? null
    },
    findById: async (_resource, id) => {
      findIds.push(id)
      return null
    },
    findByResource: async (resource, target) => {
      findResources.push({ resource, target })
      const key = `${resource.name}:${typeof target === 'string' ? target : JSON.stringify(target)}`
      return options.rowsByResourceTarget?.[key] ?? null
    },
    updateByIri: async (resource, iri, value) => {
      updates.push({ resource, iri, value })
      return value
    },
    updateById: async (resource, id, value) => {
      updates.push({ resource, id, value })
      return value
    },
    updateByResource: async (resource, target, value) => {
      updates.push({ resource, target, value })
      return value
    },
    insert(resource) {
      return {
        values(value) {
          inserts.push({ resource, value })
          return {
            execute: async () => value,
          }
        },
      }
    },
  }

  return {
    inserts,
    updates,
    findIds,
    findIris,
    findResources,
    resources,
    runtime: {
      getPodDataSession: async () => ({
        webId: 'https://alice.example/profile/card#me',
        podUrl: 'https://alice.example/',
        solidSession: { fetch },
      }),
      createDb: () => db,
      chatResource: resources.chat,
      threadResource: resources.thread,
      messageResource: resources.message,
      sessionResource: resources.session,
      ideaResource: resources.idea,
      issueResource: resources.issue,
      taskResource: resources.task,
      deliveryResource: resources.delivery,
      runResource: resources.run,
      runStepResource: resources.runStep,
      agentResource: resources.agent,
      contactResource: resources.contact,
      auditResource: resources.audit,
      inboxNotificationResource: resources.inbox,
    },
  }
}

test.before(async () => {
  const loaded = await loadAutoModeModule('lib/symphony/pod-projection.ts')
  projectionModule = loaded.module
  cleanup = loaded.cleanup
})

test.after(() => {
  cleanup?.()
})

test('listOpenSymphonyIssuesFromPod reads open issues from shared Issue TTL projection', async () => {
  const fake = createFakeRuntime({
    rowsByResource: {
      issue: [
        {
          id: 'issue_existing',
          title: 'Fix login redirect bug',
          description: 'redirect drops state after login',
          status: 'open',
          priority: 'high',
          chat: 'https://alice.example/.data/chat/__secretary__/index.ttl#this',
          thread: 'https://alice.example/.data/chat/__secretary__/index.ttl#thread-login',
          tasks: ['https://alice.example/.data/task/index.ttl#task_existing'],
          createdBy: 'https://alice.example/profile/card#me',
          createdAt: new Date('2026-04-02T00:00:00.000Z'),
          updatedAt: new Date('2026-04-02T00:01:00.000Z'),
        },
        {
          id: 'issue_closed',
          title: 'Closed issue',
          status: 'closed',
          createdAt: new Date('2026-04-02T00:00:00.000Z'),
          updatedAt: new Date('2026-04-02T00:02:00.000Z'),
        },
      ],
    },
  })

  const issues = await projectionModule.listOpenSymphonyIssuesFromPod({
    runtime: fake.runtime,
  })

  assert.equal(issues.length, 1)
  assert.equal(issues[0].uri, 'urn:undefineds:linx:issue:issue_existing')
  assert.equal(issues[0].title, 'Fix login redirect bug')
  assert.equal(issues[0].status, 'open')
  assert.equal(issues[0].priority, 'high')
  assert.equal(issues[0].chat, 'https://alice.example/.data/chat/__secretary__/index.ttl#this')
  assert.deepEqual(issues[0].tasks, ['https://alice.example/.data/task/index.ttl#task_existing'])
})

test('persistSymphonyProjectionToPod projects Symphony run into shared chat thread messages session agents and contacts', async () => {
  const fake = createFakeRuntime()
  const plan = createPlan()
  const result = await projectionModule.persistSymphonyProjectionToPod(plan, {
    stage: 'running',
    runtime: fake.runtime,
  })

  assert.ok(result)
  assert.equal(result.chat, 'https://alice.example/.data/chat/chat-1/index.ttl#this')
  assert.equal(result.thread, 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1')
  assert.deepEqual(result.messages, [
    'https://alice.example/.data/chat/chat-1/2026/04/02/messages.ttl#session_2026-04-02T00-00-00-000Z_projection-planned',
    'https://alice.example/.data/chat/chat-1/2026/04/02/messages.ttl#session_2026-04-02T00-00-00-000Z_projection-running',
  ])
  assert.equal(result.plan.issue.chat, result.chat)
  assert.equal(result.plan.delivery.thread, result.thread)
  assert.deepEqual(result.plan.session.messages, result.messages)
  assert.equal(fake.findIds.length, 0)
  assert.equal(fake.findIris.length, 0)
  assert.ok(fake.findResources.some((entry) => entry.resource === fake.resources.message && entry.target.chat === result.chat))
  assert.ok(fake.findResources.some((entry) => entry.resource === fake.resources.runStep && entry.target === '2026/04/02/runs.ttl#session_2026-04-02T00-00-00-000Z_projection-planned'))
  assert.ok(fake.findResources.some((entry) => entry.resource === fake.resources.runStep && entry.target === '2026/04/02/runs.ttl#session_2026-04-02T00-00-00-000Z_projection-running'))

  assert.equal(fake.inserts.find((item) => item.resource === fake.resources.chat)?.value, undefined)

  const issue = fake.inserts.find((item) => item.resource === fake.resources.issue)?.value
  assert.equal(issue.id, 'issue_2026-04-02T00-00-00-000Z_projection')
  assert.equal(issue.chat, result.chat)
  assert.equal(issue.thread, result.thread)
  assert.equal(issue.tasks[0], 'https://alice.example/.data/task/index.ttl#task_2026-04-02T00-00-00-000Z_projection')

  const task = fake.inserts.find((item) => item.resource === fake.resources.task)?.value
  assert.equal(task.id, 'index.ttl#task_2026-04-02T00-00-00-000Z_projection')
  assert.equal(task.issue, 'https://alice.example/.data/issues/issue_2026-04-02T00-00-00-000Z_projection.ttl')
  assert.equal(task.status, 'active')
  assert.equal(task.workspace, 'file:///tmp/linx')
  assert.deepEqual(task.metadata.acceptanceCriteria, ['projection is visible'])
  assert.deepEqual(task.metadata.workspace, {
    path: '/tmp/linx',
    kind: 'git',
    container: 'urn:undefineds:workspace:local-linx',
    repository: 'https://github.com/undefineds/linx.git',
    branch: 'main',
    worktree: '/tmp/linx',
    baseRevision: 'abc123',
    environment: {
      kind: 'local-shell',
      id: 'host-a',
      label: 'Local LinX checkout',
      runtime: 'codex',
    },
    pathAuthority: 'worker-environment',
    equivalenceRequires: ['baseRevision', 'checksum-or-etag-or-artifact-uri'],
  })
  assert.equal(task.metadata.podAccessPolicy.version, 'linx-symphony-worker-pod-access/v1')
  assert.equal(task.metadata.podAccessPolicy.authority, '__secretary__-control-lane')
  assert.deepEqual(task.metadata.podAccessPolicy.assigned, {
    issue: 'https://alice.example/.data/issues/issue_2026-04-02T00-00-00-000Z_projection.ttl',
    task: 'https://alice.example/.data/task/index.ttl#task_2026-04-02T00-00-00-000Z_projection',
    delivery: 'https://alice.example/.data/2026/04/02/deliveries.ttl#delivery_2026-04-02T00-00-00-000Z_projection',
    run: 'https://alice.example/.data/2026/04/02/runs.ttl#session_2026-04-02T00-00-00-000Z_projection',
    session: 'https://alice.example/.data/sessions/2026/04/02/session_2026-04-02T00-00-00-000Z_projection.ttl',
    archive: {
      version: 'linx-symphony-archive/v1',
      issue: 'urn:undefineds:linx:issue:issue_2026-04-02T00-00-00-000Z_projection',
      task: 'urn:undefineds:linx:task:task_2026-04-02T00-00-00-000Z_projection',
      delivery: 'urn:undefineds:linx:delivery:delivery_2026-04-02T00-00-00-000Z_projection',
      session: 'urn:undefineds:linx:session:session_2026-04-02T00-00-00-000Z_projection',
    },
  })
  assert.ok(task.metadata.podAccessPolicy.writeScope.includes('runStep'))
  assert.ok(task.metadata.podAccessPolicy.writeScope.includes('implementationChangeRequest'))
  assert.ok(task.metadata.podAccessPolicy.forbiddenScope.includes('issueClosure'))
  assert.ok(task.metadata.podAccessPolicy.forbiddenScope.includes('grant'))
  assert.equal(task.metadata.spaceContract.runtimeSession.relation, 'same-thread-or-room')
  assert.equal(task.metadata.spaceContract.runtimeSession.topologyRule, 'session-topology-is-explicit-not-derived-from-workspace-sharing')
  assert.equal(task.metadata.spaceContract.workspace.allocation, 'thread')
  assert.equal(task.metadata.spaceContract.workspace.thread, 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1')
  assert.equal(task.metadata.spaceContract.workspace.sameThreadSameEnvironmentSharing, 'preferred')
  assert.equal(task.metadata.spaceContract.workspace.independentWorkIsolation, 'separate-worktree-when-needed')
  assert.equal(task.metadata.podAccessPolicy.spaceContract.workspace.allocation, 'thread')
  assert.equal(task.metadata.podAccessPolicy.workspace.pathAuthority, 'worker-environment')
  assert.equal(task.metadata.podAccessPolicy.artifactContract.rule, 'absolute-paths-are-not-cross-environment-identities')
  assert.equal(task.metadata.reconciler.taskDecisions[0].policyKind, 'symphony')
  assert.equal(task.metadata.reconciler.taskDecisions[0].eventType, 'delivery.submitted')
  assert.equal(task.metadata.reconciler.taskDecisions[0].wakeJobs[0].targetAgent, 'codex-worker')
  assert.deepEqual(task.metadata.podAccessPolicy.documentationAuthority, {
    controlRecords: 'pod',
    implementationRecords: 'repository',
    localControlRecords: 'portable-runtime-fallback-or-pod-mirror',
    rule: 'repository-docs-reference-pod-issue-without-becoming-issue-truth',
  })

  const delivery = fake.inserts.find((item) => item.resource === fake.resources.delivery)?.value
  assert.equal(delivery.task, task.issue.replace('/issues/issue_2026-04-02T00-00-00-000Z_projection.ttl', '/task/index.ttl#task_2026-04-02T00-00-00-000Z_projection'))
  assert.equal(delivery.kind, 'task_dispatch')
  assert.equal(delivery.status, 'pending')
  assert.equal(delivery.projectedRole, 'user')
  assert.equal(delivery.payload.workspace.baseRevision, 'abc123')
  assert.equal(delivery.payload.podAccessPolicy.version, 'linx-symphony-worker-pod-access/v1')
  assert.equal(delivery.payload.spaceContract.workspace.sameThreadSameEnvironmentSharing, 'preferred')
  assert.ok(delivery.metadata.podAccessPolicy.readScope.includes('assigned-control-records'))
  assert.equal(delivery.metadata.reconciler.deliveryDecisions[0].eventType, 'delivery.submitted')
  assert.equal(delivery.metadata.reconciler.deliveryDecisions[0].wakeJobs[0].targetRole, 'worker')

  const run = fake.inserts.find((item) => item.resource === fake.resources.run)?.value
  assert.equal(run.task, task.id.startsWith('index.ttl') ? 'https://alice.example/.data/task/index.ttl#task_2026-04-02T00-00-00-000Z_projection' : task.id)
  assert.equal(run.delivery, `https://alice.example/.data/${delivery.id}`)
  assert.equal(run.status, 'running')
  assert.equal(run.runner, 'codex')
  assert.equal(run.metadata.workspace.environment.kind, 'local-shell')
  assert.equal(run.metadata.spaceContract.runtimeSession.relation, 'same-thread-or-room')
  assert.equal(run.metadata.podAccessPolicy.noPodFallback, 'return-structured-report-for-secretary-to-persist')
  assert.equal(run.metadata.reconciler.sessionDecisions[0].policyKind, 'symphony')

  const runSteps = fake.inserts.filter((item) => item.resource === fake.resources.runStep).map((item) => item.value)
  assert.deepEqual(runSteps.map((item) => item.stepType), ['run.created', 'run.started'])
  assert.deepEqual(runSteps.map((item) => item.id), [
    '2026/04/02/runs.ttl#session_2026-04-02T00-00-00-000Z_projection-planned',
    '2026/04/02/runs.ttl#session_2026-04-02T00-00-00-000Z_projection-running',
  ])
  assert.ok(runSteps.every((item) => item.run === 'https://alice.example/.data/2026/04/02/runs.ttl#session_2026-04-02T00-00-00-000Z_projection'))
  assert.ok(runSteps.every((item) => !String(item.id).startsWith('https://')))

  const thread = fake.inserts.find((item) => item.resource === fake.resources.thread)?.value
  assert.equal(thread.id, 'chat/chat-1/index.ttl#thread-1')
  assert.equal(thread.chat, result.chat)
  assert.equal(thread.metadata.kind, 'symphony-run')
  assert.equal(thread.metadata.issue, plan.issue.uri)
  assert.equal(thread.metadata.delivery, plan.delivery.uri)
  assert.equal(thread.metadata.workers[0].title, 'Verify Symphony Pod projection')
  assert.equal(thread.metadata.workers[0].objective, 'make app see running process')
  assert.deepEqual(thread.metadata.workers[0].acceptanceCriteria, ['projection is visible'])
  assert.equal(thread.metadata.workers[0].workspace.baseRevision, 'abc123')
  assert.equal(thread.metadata.workers[0].podAccessPolicy.version, 'linx-symphony-worker-pod-access/v1')
  assert.equal(thread.metadata.workers[0].reconciler.latest.eventType, 'delivery.submitted')

  const session = fake.inserts.find((item) => item.resource === fake.resources.session)?.value
  assert.equal(session.id, 'session_2026-04-02T00-00-00-000Z_projection')
  assert.equal(session.chat, result.chat)
  assert.equal(session.thread, result.thread)
  assert.equal(session.status, 'active')
  assert.equal(session.tool, 'symphony:codex')
  assert.deepEqual(session.messages, result.messages)
  assert.equal(session.metadata.autoModeSessionId, undefined)
  assert.equal(session.metadata.worker.podAccessPolicy.assigned.session, 'https://alice.example/.data/sessions/2026/04/02/session_2026-04-02T00-00-00-000Z_projection.ttl')
  assert.equal(session.metadata.reconciler.sessionDecisions[0].eventType, 'delivery.submitted')
  assert.deepEqual(result.plan.session.target, {
    source: 'ai-contact',
    backend: 'codex',
    agent: 'codex-worker',
    chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
    thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
    messages: result.messages,
  })

  const messages = fake.inserts.filter((item) => item.resource === fake.resources.message).map((item) => item.value)
  assert.equal(messages.length, 2)
  assert.deepEqual(messages.map((item) => item.id), [
    'session_2026-04-02T00-00-00-000Z_projection-planned',
    'session_2026-04-02T00-00-00-000Z_projection-running',
  ])
  assert.equal(messages[0].chat, result.chat)
  assert.equal(messages[0].thread, result.thread)
  assert.equal(messages[0].maker, 'https://alice.example/agents/__secretary__/')
  assert.equal(messages[0].senderName, 'AI Secretary')
  assert.match(messages[0].richContent, /task_progress/)
  assert.match(messages[1].content, /Symphony workers are active/)

  const agentIds = fake.inserts
    .filter((item) => item.resource === fake.resources.agent)
    .map((item) => item.value.id)
    .sort()
  assert.deepEqual(agentIds, ['__secretary__/', 'symphony-codex-worker/'])

  const contacts = fake.inserts.filter((item) => item.resource === fake.resources.contact).map((item) => item.value)
  assert.deepEqual(contacts.map((item) => item.contactType), ['agent', 'agent'])
  assert.deepEqual(contacts.map((item) => item.about).sort(), [
    'https://alice.example/agents/__secretary__/',
    'https://alice.example/agents/symphony-codex-worker/',
  ])
  assert.equal(session.metadata.workers[0].taskStatus, 'running')
  assert.deepEqual(session.metadata.workers[0].acceptanceCriteria, ['projection is visible'])
  assert.equal(session.metadata.workspace.pathAuthority, 'worker-environment')
  assert.equal(session.metadata.workers[0].workspace.container, 'urn:undefineds:workspace:local-linx')
  assert.equal(session.metadata.workers[0].podAccessPolicy.version, 'linx-symphony-worker-pod-access/v1')
  assert.deepEqual(session.metadata.target, {
    source: 'ai-contact',
    backend: 'codex',
    agent: 'codex-worker',
    chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
    thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
    messages: [
      'https://alice.example/.data/chat/chat-1/2026/04/02/messages.ttl#session_2026-04-02T00-00-00-000Z_projection-planned',
      'https://alice.example/.data/chat/chat-1/2026/04/02/messages.ttl#session_2026-04-02T00-00-00-000Z_projection-running',
    ],
  })
  const audits = fake.inserts.filter((item) => item.resource === fake.resources.audit).map((item) => item.value)
  assert.equal(audits.length, 2)
  assert.deepEqual(audits.map((item) => item.action), ['symphony.planned', 'symphony.dispatched'])
  assert.ok(audits.every((item) => item.actor === 'https://alice.example/agents/__secretary__/'))
  assert.ok(audits.every((item) => item.actorRole === 'secretary'))
  assert.ok(audits.every((item) => item.onBehalfOf === 'https://alice.example/profile/card#me'))
  assert.ok(audits.every((item) => item.session === 'https://alice.example/.data/sessions/2026/04/02/session_2026-04-02T00-00-00-000Z_projection.ttl'))
  assert.deepEqual(audits.map((item) => item.entry), result.messages)
  assert.ok(audits.every((item) => item.policyVersion === 'linx-symphony-session/v1'))
})

test('persistSymphonyProjectionToPod preserves existing Issue task links when merging follow-up work', async () => {
  const fake = createFakeRuntime()
  const existingTask = 'https://alice.example/.data/task/index.ttl#task_existing'
  const plan = createPlan({
    issue: {
      tasks: [
        existingTask,
        'urn:undefineds:linx:task:task_2026-04-02T00-00-00-000Z_projection',
      ],
    },
  })

  await projectionModule.persistSymphonyProjectionToPod(plan, {
    stage: 'planned',
    runtime: fake.runtime,
  })

  const issue = fake.inserts.find((item) => item.resource === fake.resources.issue)?.value
  assert.ok(issue.tasks.includes(existingTask))
  assert.ok(issue.tasks.includes('https://alice.example/.data/task/index.ttl#task_2026-04-02T00-00-00-000Z_projection'))
})

test('mirrorSymphonyProjectionJsonLdFromPod materializes JSON-LD through ORM rows', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'linx-symphony-jsonld-mirror-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))

  const issueIri = 'https://alice.example/.data/issues/issue_existing.ttl'
  const fake = createFakeRuntime({
    rowsByIri: {
      [issueIri]: {
        id: 'issue_existing',
        title: 'Fix login redirect bug',
        status: 'open',
        tasks: ['https://alice.example/.data/task/index.ttl#task_existing'],
      },
    },
  })
  fake.runtime.getPodDataSession = async () => ({
    webId: 'https://alice.example/profile/card#me',
    podUrl: 'https://alice.example/',
    fetch: async () => {
      throw new Error('JSON-LD mirror must use the ORM instead of raw Pod fetch')
    },
    solidSession: {
      fetch: async () => {
        throw new Error('JSON-LD mirror must use the ORM instead of raw Pod fetch')
      },
    },
  })

  const result = await projectionModule.mirrorSymphonyProjectionJsonLdFromPod({
    plan: createPlan(),
    chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
    thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
    messages: [],
    resources: [{ kind: 'issue', uri: issueIri, document: issueIri }],
  }, {
    runtime: fake.runtime,
    dir,
  })

  assert.ok(result)
  assert.deepEqual(fake.findIris, [issueIri])
  const mirrored = JSON.parse(readFileSync(result.files[0].path, 'utf-8'))
  assert.equal(mirrored['@id'], issueIri)
  assert.equal(mirrored['@type'], 'https://undefineds.co/ns#Issue')
  assert.equal(mirrored.title, 'Fix login redirect bug')
  assert.equal(mirrored.status, 'open')
  assert.deepEqual(mirrored.tasks, ['https://alice.example/.data/task/index.ttl#task_existing'])
  assert.deepEqual(mirrored['@context'].tasks, {
    '@id': 'https://undefineds.co/ns#task',
    '@type': '@id',
    '@container': '@set',
  })
})

test('listRunningSymphonyWorkersFromPod reads Symphony worker status from shared Session TTL projection', async () => {
  const fake = createFakeRuntime()
  const sessionRows = [
    {
      id: 'session-running',
      status: 'active',
      tool: 'symphony:codex',
      policyVersion: 'linx-symphony-session/v1',
      updatedAt: new Date('2026-04-02T00:03:00.000Z'),
      metadata: {
        kind: 'symphony-run',
        mode: 'auto',
        workspacePath: '/tmp/linx',
        workers: [
          {
            status: 'running',
            backend: 'codex',
            agent: 'codex-worker',
            title: 'Codex worker',
            autoModeSessionId: 'auto-worker-a',
            target: {
              chat: 'https://alice.example/.data/chat/codex-worker/index.ttl#this',
            },
          },
          {
            status: 'completed',
            backend: 'claude',
            agent: 'claude-worker',
            title: 'Completed worker',
          },
        ],
      },
    },
    {
      id: 'ordinary-session',
      status: 'active',
      tool: 'linx',
      metadata: {
        kind: 'ordinary',
      },
    },
  ]
  fake.runtime.createDb = () => ({
    init: async () => undefined,
    select() {
      return {
        from(resource) {
          assert.equal(resource, fake.resources.session)
          return {
            execute: async () => sessionRows,
          }
        },
      }
    },
    insert() {
      throw new Error('status read must not write')
    },
  })

  const workers = await projectionModule.listRunningSymphonyWorkersFromPod({
    runtime: fake.runtime,
  })

  assert.deepEqual(workers, [
    {
      status: 'running',
      backend: 'codex',
      mode: 'auto',
      cwd: '/tmp/linx',
      autoModeSessionId: 'auto-worker-a',
      target: {
        label: 'Codex worker',
        agent: 'codex-worker',
        chat: 'https://alice.example/.data/chat/codex-worker/index.ttl#this',
      },
    },
  ])
})

test('listRecentSymphonyReportsFromPod reads worker completion reports from Delivery TTL projection', async () => {
  const fake = createFakeRuntime({
    rowsByResource: {
      delivery: [
        {
          id: 'task-dispatch',
          kind: 'task_dispatch',
          status: 'completed',
          updatedAt: new Date('2026-04-02T00:04:00.000Z'),
        },
        {
          id: 'report-old',
          kind: 'report',
          status: 'completed',
          task: 'https://alice.example/.data/task/index.ttl#task-old',
          chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
          thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
          object: 'https://alice.example/.data/task/task-old/2026/04/02/runs.ttl#run-old',
          objective: 'Old worker completed.',
          payload: {
            kind: 'symphony_report',
            outcome: 'completed',
            summary: 'Old worker completed.',
            backend: 'codex',
            agent: 'codex-worker',
            autoModeSessionId: 'auto-old',
          },
          completedAt: new Date('2026-04-02T00:03:00.000Z'),
          updatedAt: new Date('2026-04-02T00:03:00.000Z'),
        },
        {
          id: 'report-new',
          kind: 'report',
          status: 'completed',
          task: 'https://alice.example/.data/task/index.ttl#task-new',
          chat: 'https://alice.example/.data/chat/chat-2/index.ttl#this',
          thread: 'https://alice.example/.data/chat/chat-2/index.ttl#thread-2',
          object: 'https://alice.example/.data/task/task-new/2026/04/02/runs.ttl#run-new',
          objective: 'Review worker failed.',
          payload: {
            kind: 'symphony_report',
            outcome: 'failed',
            summary: 'Review worker failed.',
            backend: 'claude',
            agent: 'claude-reviewer',
            delivery: 'https://alice.example/.data/task/task-new/2026/04/02/deliveries.ttl#delivery-new',
            reportDelivery: 'https://alice.example/.data/task/task-new/2026/04/02/deliveries.ttl#report-new',
            run: 'https://alice.example/.data/task/task-new/2026/04/02/runs.ttl#run-new',
            autoModeSessionId: 'auto-new',
            error: 'tests failed',
          },
          completedAt: new Date('2026-04-02T00:05:00.000Z'),
          updatedAt: new Date('2026-04-02T00:05:00.000Z'),
        },
      ],
    },
  })

  const reports = await projectionModule.listRecentSymphonyReportsFromPod({
    runtime: fake.runtime,
    limit: 2,
  })

  assert.deepEqual(reports, [
    {
      status: 'failed',
      backend: 'claude',
      agent: 'claude-reviewer',
      title: 'Review worker failed.',
      summary: 'Review worker failed.',
      task: 'https://alice.example/.data/task/index.ttl#task-new',
      delivery: 'https://alice.example/.data/task/task-new/2026/04/02/deliveries.ttl#delivery-new',
      reportDelivery: 'https://alice.example/.data/task/task-new/2026/04/02/deliveries.ttl#report-new',
      run: 'https://alice.example/.data/task/task-new/2026/04/02/runs.ttl#run-new',
      chat: 'https://alice.example/.data/chat/chat-2/index.ttl#this',
      thread: 'https://alice.example/.data/chat/chat-2/index.ttl#thread-2',
      autoModeSessionId: 'auto-new',
      error: 'tests failed',
      completedAt: '2026-04-02T00:05:00.000Z',
      updatedAt: '2026-04-02T00:05:00.000Z',
    },
    {
      status: 'completed',
      backend: 'codex',
      agent: 'codex-worker',
      title: 'Old worker completed.',
      summary: 'Old worker completed.',
      task: 'https://alice.example/.data/task/index.ttl#task-old',
      reportDelivery: 'report-old',
      run: 'https://alice.example/.data/task/task-old/2026/04/02/runs.ttl#run-old',
      chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
      thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
      autoModeSessionId: 'auto-old',
      completedAt: '2026-04-02T00:03:00.000Z',
      updatedAt: '2026-04-02T00:03:00.000Z',
    },
  ])
})

test('persistSymphonyIdeaToPod writes captured ideas as shared TTL resources', async () => {
  const fake = createFakeRuntime()
  const idea = {
    uri: 'urn:undefineds:linx:idea:idea_2026-04-02T00-00-00-000Z_capture',
    summary: 'Capture uncommitted Symphony direction',
    input: '我觉得先记录成 Idea，不要直接派工。',
    status: 'captured',
    commitment: 'thought',
    source: 'cli',
    affectedArea: 'symphony',
    currentUnderstanding: 'Idea is a pre-work buffer.',
    openQuestions: ['When should it promote?'],
    relatedRecords: ['https://alice.example/.data/issues/existing.ttl'],
    conflicts: [],
    nextStep: 'Compare with active records.',
    chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
    thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
    messages: ['https://alice.example/.data/chat/chat-1/2026/04/02/messages.ttl#message-1'],
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
  }

  const result = await projectionModule.persistSymphonyIdeaToPod(idea, {
    runtime: fake.runtime,
  })

  assert.equal(result.uri, idea.uri)
  const row = fake.inserts.find((item) => item.resource === fake.resources.idea)?.value
  assert.equal(row.id, 'idea_2026-04-02T00-00-00-000Z_capture')
  assert.equal(row.summary, idea.summary)
  assert.equal(row.status, 'captured')
  assert.equal(row.commitment, 'thought')
  assert.equal(row.chat, idea.chat)
  assert.deepEqual(row.sourceMessages, idea.messages)
  assert.deepEqual(row.related, idea.relatedRecords)
})

test('completed Symphony projection includes completion message and archived session status', async () => {
  const fake = createFakeRuntime()
  const plan = createPlan({
    session: {
      status: 'completed',
      autoModeSessionId: 'auto_symphony_done',
      exitCode: 0,
      updatedAt: '2026-04-02T00:02:00.000Z',
      completedAt: '2026-04-02T00:02:00.000Z',
    },
  })
  const result = await projectionModule.persistSymphonyProjectionToPod(plan, {
    stage: 'completed',
    runtime: fake.runtime,
  })

  assert.ok(result)
  assert.equal(result.messages.length, 3)
  const session = fake.inserts.find((item) => item.resource === fake.resources.session)?.value
  assert.equal(session.status, 'completed')
  assert.equal(session.archivedAt.toISOString(), '2026-04-02T00:02:00.000Z')
  assert.equal(session.metadata.autoModeSessionId, 'auto_symphony_done')

  const completed = fake.inserts
    .filter((item) => item.resource === fake.resources.message)
    .map((item) => item.value)
    .find((item) => item.id.endsWith('-completed'))
  assert.match(completed.content, /Symphony issue completed/)
  assert.match(completed.richContent, /auto_symphony_done/)

  const audits = fake.inserts.filter((item) => item.resource === fake.resources.audit).map((item) => item.value)
  assert.equal(audits.length, 3)
  assert.deepEqual(audits.map((item) => item.action), ['symphony.planned', 'symphony.dispatched', 'symphony.completed'])

  const report = fake.inserts
    .filter((item) => item.resource === fake.resources.delivery)
    .map((item) => item.value)
    .find((item) => item.kind === 'report')
  assert.ok(report)
  assert.equal(report.status, 'completed')
  assert.equal(report.task, 'https://alice.example/.data/task/index.ttl#task_2026-04-02T00-00-00-000Z_projection')
  assert.equal(report.source, 'https://alice.example/agents/symphony-codex-worker/')
  assert.equal(report.target, 'https://alice.example/agents/__secretary__/')
  assert.equal(report.targetSession, 'https://alice.example/.data/sessions/2026/04/02/session_2026-04-02T00-00-00-000Z_projection.ttl')
  assert.equal(report.payload.outcome, 'completed')
  assert.equal(report.payload.delivery, 'https://alice.example/.data/2026/04/02/deliveries.ttl#delivery_2026-04-02T00-00-00-000Z_projection')
  assert.match(report.payload.summary, /Verify Symphony Pod projection completed/)
  assert.match(report.payload.evidence.statusMessage, /projection-completed$/)

  const inbox = fake.inserts.find((item) => item.resource === fake.resources.inbox)?.value
  assert.ok(inbox)
  assert.equal(inbox.actor, 'https://alice.example/agents/symphony-codex-worker/')
  assert.equal(inbox.object, `https://alice.example/.data/${report.id}`)
})

test('persistSymphonyProjectionToPod derives chat from target thread when chat is omitted', async () => {
  const fake = createFakeRuntime()
  const plan = createPlan({
    session: {
      target: {
        source: 'explicit-backend',
        backend: 'codex',
        agent: 'codex-worker',
        thread: 'https://alice.example/.data/chat/chat-2/index.ttl#thread-2',
        messages: ['https://alice.example/.data/chat/chat-2/2026/04/02/messages.ttl#message-1'],
      },
    },
  })

  const result = await projectionModule.persistSymphonyProjectionToPod(plan, {
    stage: 'planned',
    runtime: fake.runtime,
  })

  assert.ok(result)
  assert.equal(result.chat, 'https://alice.example/.data/chat/chat-2/index.ttl#this')
  assert.equal(result.thread, 'https://alice.example/.data/chat/chat-2/index.ttl#thread-2')
  assert.equal(fake.inserts.find((item) => item.resource === fake.resources.chat)?.value.id, 'chat-2')
  assert.equal(fake.inserts.find((item) => item.resource === fake.resources.thread)?.value.id, 'chat/chat-2/index.ttl#thread-2')
})

test('persistSymphonyProjectionToPod can target a group chat without rewriting the chat resource', async () => {
  const fake = createFakeRuntime()
  const plan = createPlan({
    session: {
      target: {
        source: 'group-chat',
        backend: 'codex',
        agent: 'codex-worker',
        chat: 'https://alice.example/.data/chat/group-design/index.ttl#this',
        thread: 'https://alice.example/.data/chat/group-design/index.ttl#thread-group',
        messages: ['https://alice.example/.data/chat/group-design/2026/04/02/messages.ttl#message-1'],
      },
    },
  })

  const result = await projectionModule.persistSymphonyProjectionToPod(plan, {
    stage: 'planned',
    runtime: fake.runtime,
  })

  assert.ok(result)
  assert.equal(result.chat, 'https://alice.example/.data/chat/group-design/index.ttl#this')
  assert.equal(result.thread, 'https://alice.example/.data/chat/group-design/index.ttl#thread-group')
  assert.equal(fake.inserts.find((item) => item.resource === fake.resources.chat)?.value, undefined)
  assert.equal(fake.inserts.find((item) => item.resource === fake.resources.thread)?.value.chat, result.chat)
  assert.equal(fake.inserts.find((item) => item.resource === fake.resources.message)?.value.chat, result.chat)
})

test('persistSymphonyProjectionToPod records multiple worker agents tasks and participants', async () => {
  const fake = createFakeRuntime()
  const base = createPlan()
  const secondTask = 'urn:undefineds:linx:task:task_2026-04-02T00-00-00-000Z_projection-w2'
  const secondDelivery = 'urn:undefineds:linx:delivery:delivery_2026-04-02T00-00-00-000Z_projection-w2'
  const secondSession = 'urn:undefineds:linx:session:session_2026-04-02T00-00-00-000Z_projection-w2'
  const plan = {
    ...base,
    issue: {
      ...base.issue,
      tasks: [base.task, secondTask],
      deliveries: [base.delivery.uri, secondDelivery],
      sessions: [base.session.uri, secondSession],
    },
    workers: [
      {
        task: base.task,
        taskRecord: base.taskRecord,
        delivery: base.delivery,
        session: base.session,
      },
      {
        task: secondTask,
        taskRecord: {
          ...base.taskRecord,
          uri: secondTask,
          title: 'Review worker',
          objective: 'Review the implementation',
          acceptanceCriteria: ['review is complete'],
          backend: 'claude',
          agent: 'claude-reviewer',
          delivery: secondDelivery,
          session: secondSession,
          target: {
            source: 'ai-contact',
            backend: 'claude',
            agent: 'claude-reviewer',
            label: 'Claude reviewer',
            chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
            thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
          },
        },
        delivery: {
          ...base.delivery,
          uri: secondDelivery,
          task: secondTask,
          targetBackend: 'claude',
          targetAgent: 'claude-reviewer',
          session: secondSession,
          target: {
            source: 'ai-contact',
            backend: 'claude',
            agent: 'claude-reviewer',
            label: 'Claude reviewer',
            chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
            thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
          },
        },
        session: {
          ...base.session,
          uri: secondSession,
          task: secondTask,
          delivery: secondDelivery,
          backend: 'claude',
          status: 'planned',
          target: {
            source: 'ai-contact',
            backend: 'claude',
            agent: 'claude-reviewer',
            label: 'Claude reviewer',
            chat: 'https://alice.example/.data/chat/chat-1/index.ttl#this',
            thread: 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1',
          },
        },
      },
    ],
  }

  const result = await projectionModule.persistSymphonyProjectionToPod(plan, {
    stage: 'running',
    runtime: fake.runtime,
  })

  assert.ok(result)
  const agentIds = fake.inserts
    .filter((item) => item.resource === fake.resources.agent)
    .map((item) => item.value.id)
    .sort()
  assert.deepEqual(agentIds, [
    '__secretary__/',
    'symphony-claude-reviewer/',
    'symphony-codex-worker/',
  ])

  const thread = fake.inserts.find((item) => item.resource === fake.resources.thread)?.value
  assert.equal(thread.metadata.workers.length, 2)
  assert.equal(thread.metadata.workers[1].title, 'Review worker')
  assert.equal(thread.metadata.workers[1].objective, 'Review the implementation')

  const sessions = fake.inserts.filter((item) => item.resource === fake.resources.session).map((item) => item.value)
  assert.equal(sessions.length, 2)
  assert.ok(sessions.every((session) => session.thread === result.thread))
  assert.deepEqual(sessions.map((session) => session.metadata.workers.length), [1, 1])
  assert.deepEqual(sessions.map((session) => session.metadata.worker.backend), ['codex', 'claude'])
  assert.deepEqual(sessions.map((session) => session.metadata.worker.thread), [result.thread, result.thread])
})

test('persistSymphonyProjectionToPod preserves each worker Thread Session and workspace when targets differ', async () => {
  const fake = createFakeRuntime()
  const base = createPlan()
  const secondTask = 'urn:undefineds:linx:task:task_2026-04-02T00-00-00-000Z_projection-w2'
  const secondDelivery = 'urn:undefineds:linx:delivery:delivery_2026-04-02T00-00-00-000Z_projection-w2'
  const secondSession = 'urn:undefineds:linx:session:session_2026-04-02T00-00-00-000Z_projection-w2'
  const secondChat = 'https://alice.example/.data/chat/chat-2/index.ttl#this'
  const secondThread = 'https://alice.example/.data/chat/chat-2/index.ttl#thread-2'
  const secondWorkspace = {
    path: '/tmp/linx-review',
    kind: 'git',
    repository: 'https://github.com/undefineds/linx.git',
    branch: 'review',
    worktree: '/tmp/linx-review',
    container: 'urn:undefineds:workspace:review-linx',
    baseRevision: 'def456',
    environment: {
      kind: 'local-shell',
      id: 'host-a',
      label: 'Local review checkout',
      runtime: 'claude',
    },
  }
  const secondTarget = {
    source: 'ai-contact',
    backend: 'claude',
    agent: 'claude-reviewer',
    label: 'Claude reviewer',
    chat: secondChat,
    thread: secondThread,
  }
  const plan = {
    ...base,
    issue: {
      ...base.issue,
      tasks: [base.task, secondTask],
      deliveries: [base.delivery.uri, secondDelivery],
      sessions: [base.session.uri, secondSession],
    },
    workers: [
      {
        task: base.task,
        taskRecord: base.taskRecord,
        delivery: base.delivery,
        session: base.session,
      },
      {
        task: secondTask,
        taskRecord: {
          ...base.taskRecord,
          uri: secondTask,
          title: 'Review worker',
          objective: 'Review the implementation',
          acceptanceCriteria: ['review is complete'],
          backend: 'claude',
          agent: 'claude-reviewer',
          delivery: secondDelivery,
          session: secondSession,
          target: secondTarget,
          chat: secondChat,
          thread: secondThread,
        },
        delivery: {
          ...base.delivery,
          uri: secondDelivery,
          task: secondTask,
          targetBackend: 'claude',
          targetAgent: 'claude-reviewer',
          session: secondSession,
          target: secondTarget,
          chat: secondChat,
          thread: secondThread,
        },
        session: {
          ...base.session,
          uri: secondSession,
          task: secondTask,
          delivery: secondDelivery,
          backend: 'claude',
          cwd: secondWorkspace.path,
          workspace: secondWorkspace,
          status: 'planned',
          target: secondTarget,
          chat: secondChat,
          thread: secondThread,
        },
      },
    ],
  }

  const result = await projectionModule.persistSymphonyProjectionToPod(plan, {
    stage: 'running',
    runtime: fake.runtime,
  })

  assert.ok(result)
  assert.equal(result.thread, 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1')
  assert.equal(result.plan.workers[1].session.thread, secondThread)
  assert.equal(result.plan.workers[1].session.target.thread, secondThread)
  assert.deepEqual(result.plan.workers[1].session.messages, [])

  const threads = fake.inserts.filter((item) => item.resource === fake.resources.thread).map((item) => item.value)
  assert.equal(threads.length, 2)
  assert.deepEqual(threads.map((thread) => thread.id).sort(), ['chat/chat-1/index.ttl#thread-1', 'chat/chat-2/index.ttl#thread-2'])
  const reviewThread = threads.find((thread) => thread.id === 'chat/chat-2/index.ttl#thread-2')
  assert.equal(reviewThread.chat, secondChat)
  assert.equal(reviewThread.workspace, 'file:///tmp/linx-review')
  assert.equal(reviewThread.metadata.workers.length, 1)
  assert.equal(reviewThread.metadata.workers[0].thread, secondThread)
  assert.equal(reviewThread.metadata.workers[0].workspace.container, 'urn:undefineds:workspace:review-linx')

  const sessions = fake.inserts.filter((item) => item.resource === fake.resources.session).map((item) => item.value)
  assert.equal(sessions.length, 2)
  const reviewSession = sessions.find((session) => session.id === 'session_2026-04-02T00-00-00-000Z_projection-w2')
  assert.equal(reviewSession.chat, secondChat)
  assert.equal(reviewSession.thread, secondThread)
  assert.equal(reviewSession.tool, 'symphony:claude')
  assert.equal(reviewSession.metadata.worker.backend, 'claude')
  assert.equal(reviewSession.metadata.worker.workspace.path, '/tmp/linx-review')
  assert.equal(
    reviewSession.metadata.worker.podAccessPolicy.assigned.session,
    'https://alice.example/.data/sessions/2026/04/02/session_2026-04-02T00-00-00-000Z_projection-w2.ttl',
  )

  const task = fake.inserts
    .filter((item) => item.resource === fake.resources.task)
    .map((item) => item.value)
    .find((item) => item.title === 'Review worker')
  assert.equal(task.thread, secondThread)
  assert.equal(task.workspace, 'file:///tmp/linx-review')
  assert.equal(task.metadata.spaceContract.workspace.thread, secondThread)

  const delivery = fake.inserts
    .filter((item) => item.resource === fake.resources.delivery)
    .map((item) => item.value)
    .find((item) => item.target === 'https://alice.example/agents/symphony-claude-reviewer/')
  assert.equal(delivery.chat, secondChat)
  assert.equal(delivery.thread, secondThread)
  assert.equal(delivery.targetThread, secondThread)
  assert.equal(delivery.payload.workspace.path, '/tmp/linx-review')

  const run = fake.inserts
    .filter((item) => item.resource === fake.resources.run)
    .map((item) => item.value)
    .find((item) => item.runner === 'claude')
  assert.equal(run.thread, secondThread)
  assert.equal(run.workspace, 'file:///tmp/linx-review')
  assert.equal(run.metadata.podAccessPolicy.assigned.session, reviewSession.metadata.worker.podAccessPolicy.assigned.session)
})

test('persistSymphonyProjectionToPod writes the default Symphony control surface when no explicit target is provided', async () => {
  const fake = createFakeRuntime()
  const plan = createPlan({
    session: {
      target: {
        source: 'default',
        backend: 'codex',
        agent: 'codex-worker',
      },
    },
  })

  const result = await projectionModule.persistSymphonyProjectionToPod(plan, {
    stage: 'planned',
    runtime: fake.runtime,
  })

  assert.ok(result)
  const chat = fake.inserts.find((item) => item.resource === fake.resources.chat)?.value
  assert.equal(chat.id, 'symphony')
  assert.equal(chat.metadata.kind, 'symphony-control-room')
  assert.equal(result.chat, 'https://alice.example/.data/chat/symphony/index.ttl#this')
  assert.equal(result.thread, `https://alice.example/.data/chat/symphony/index.ttl#${encodeURIComponent('session_2026-04-02T00-00-00-000Z_projection')}`)
  assert.equal(fake.inserts.find((item) => item.resource === fake.resources.audit)?.value.session, 'https://alice.example/.data/sessions/2026/04/02/session_2026-04-02T00-00-00-000Z_projection.ttl')
})

test('Symphony audit projection is idempotent for already written stages', async () => {
  const fake = createFakeRuntime()
  fake.runtime.createDb = () => ({
    init: async () => undefined,
    findByResource: async (resource, target) => {
      fake.findResources.push({ resource, target })
      return resource === fake.resources.audit ? { id: 'existing-audit' } : null
    },
    updateByResource: async (resource, target, value) => {
      fake.updates.push({ resource, target, value })
      return value
    },
    insert(resource) {
      return {
        values(value) {
          fake.inserts.push({ resource, value })
          return {
            execute: async () => value,
          }
        },
      }
    },
  })

  await projectionModule.persistSymphonyProjectionToPod(createPlan(), {
    stage: 'running',
    runtime: fake.runtime,
  })

  const audits = fake.inserts.filter((item) => item.resource === fake.resources.audit)
  assert.equal(audits.length, 0)
})
