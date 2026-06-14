import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createRunPlan,
  createSymphonyDeliveryUri,
  createSymphonyIdeaUri,
  createSymphonyIssueUri,
  createSymphonySessionUri,
  createTaskUri,
  getSymphonyArchiveRelativePaths,
  renderSymphonyRuntimePrompt,
  SYMPHONY_DELIVERIES_DIRNAME,
  SYMPHONY_DELIVERY_FILE_NAME,
  SYMPHONY_HOME_DIRNAME,
  SYMPHONY_IDEAS_DIRNAME,
  SYMPHONY_IDEA_FILE_NAME,
  SYMPHONY_ISSUES_DIRNAME,
  SYMPHONY_ISSUE_FILE_NAME,
  SYMPHONY_SESSIONS_DIRNAME,
  SYMPHONY_SESSION_FILE_NAME,
} from '../src/symphony'

test('symphony runtime contract stays storage-agnostic', () => {
  const source = readFileSync(new URL('../src/symphony.ts', import.meta.url), 'utf-8')

  assert.doesNotMatch(source, /from ['"]node:child_process['"]/u)
  assert.doesNotMatch(source, /\b(?:spawn|spawnSync|exec|execFile|execSync|execFileSync)\s*\(/u)
  assert.doesNotMatch(source, /['"]@undefineds\.co\/(?:models|drizzle-solid)['"]/u)
  assert.doesNotMatch(source, /\bdrizzle\s*\(/u)
  assert.doesNotMatch(source, /\bxpod\b/iu)
})

test('creates stable symphony URIs from timestamp and random id', () => {
  const options = {
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'abcd1234efgh',
  }

  assert.equal(createSymphonyIssueUri(options), 'urn:undefineds:linx:issue:issue_2026-04-01T02-03-04-005Z_abcd1234efgh')
  assert.equal(createSymphonyIdeaUri(options), 'urn:undefineds:linx:idea:idea_2026-04-01T02-03-04-005Z_abcd1234efgh')
  assert.equal(createTaskUri(options), 'urn:undefineds:linx:task:task_2026-04-01T02-03-04-005Z_abcd1234efgh')
  assert.equal(createSymphonyDeliveryUri(options), 'urn:undefineds:linx:delivery:delivery_2026-04-01T02-03-04-005Z_abcd1234efgh')
  assert.equal(createSymphonySessionUri(options), 'urn:undefineds:linx:session:session_2026-04-01T02-03-04-005Z_abcd1234efgh')
})

test('returns the shared archive file layout for symphony resources', () => {
  assert.equal(SYMPHONY_HOME_DIRNAME, 'symphony')
  assert.equal(SYMPHONY_IDEAS_DIRNAME, 'ideas')
  assert.equal(SYMPHONY_ISSUES_DIRNAME, 'issues')
  assert.equal(SYMPHONY_DELIVERIES_DIRNAME, 'deliveries')
  assert.equal(SYMPHONY_SESSIONS_DIRNAME, 'sessions')
  assert.equal(SYMPHONY_IDEA_FILE_NAME, 'idea.json')
  assert.equal(SYMPHONY_ISSUE_FILE_NAME, 'issue.json')
  assert.equal(SYMPHONY_DELIVERY_FILE_NAME, 'delivery.json')
  assert.equal(SYMPHONY_SESSION_FILE_NAME, 'session.json')

  assert.deepEqual(getSymphonyArchiveRelativePaths('urn:undefineds:linx:idea:idea_demo', 'idea'), {
    dir: 'ideas/idea_demo',
    file: 'ideas/idea_demo/idea.json',
  })
  assert.deepEqual(getSymphonyArchiveRelativePaths('urn:undefineds:linx:issue:issue_demo', 'issue'), {
    dir: 'issues/issue_demo',
    file: 'issues/issue_demo/issue.json',
  })
  assert.deepEqual(getSymphonyArchiveRelativePaths('urn:undefineds:linx:delivery:delivery_demo', 'delivery'), {
    dir: 'deliveries/delivery_demo',
    file: 'deliveries/delivery_demo/delivery.json',
  })
  assert.deepEqual(getSymphonyArchiveRelativePaths('urn:undefineds:linx:session:session_demo', 'session'), {
    dir: 'sessions/session_demo',
    file: 'sessions/session_demo/session.json',
  })
})

test('creates a task delivery session run plan with URI relations and workspace metadata', () => {
  const thread = 'https://alice.example/.data/chat/chat-1/index.ttl#thread-1'
  const chat = 'https://alice.example/.data/chat/chat-1/index.ttl#this'
  const messages = ['https://alice.example/.data/chat/chat-1/2026/04/01/messages.ttl#message-1']
  const plan = createRunPlan({
    objective: 'Inspect the repository and report the next implementation slice.',
    title: 'Inspect repo',
    acceptanceCriteria: ['Find the next slice', 'Report verification evidence'],
    workspacePath: '/tmp/linx',
    workspaceKind: 'git',
    repository: 'https://github.com/undefineds/linx.git',
    branch: 'main',
    worktree: '/tmp/linx-worktree',
    workspaceUri: 'urn:undefineds:workspace:local-linx',
    baseRevision: 'abc123',
    environment: {
      kind: 'local-shell',
      id: 'host-a',
      label: 'Local LinX checkout',
    },
    backend: 'codex',
    mode: 'off',
    secretaryAutoEnabled: true,
    model: 'gpt-5.5',
    chat,
    thread,
    messages,
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'plan-id',
  })

  assert.equal(plan.issue.uri, 'urn:undefineds:linx:issue:issue_2026-04-01T02-03-04-005Z_plan-id')
  assert.equal(plan.task, 'urn:undefineds:linx:task:task_2026-04-01T02-03-04-005Z_plan-id')
  assert.equal(plan.delivery.uri, 'urn:undefineds:linx:delivery:delivery_2026-04-01T02-03-04-005Z_plan-id')
  assert.equal(plan.session.uri, 'urn:undefineds:linx:session:session_2026-04-01T02-03-04-005Z_plan-id')
  assert.deepEqual(plan.issue.tasks, [plan.task])
  assert.deepEqual(plan.issue.deliveries, [plan.delivery.uri])
  assert.deepEqual(plan.issue.sessions, [plan.session.uri])
  assert.equal(plan.issue.issuer.source, 'user')
  assert.equal(plan.issue.issuer.chat, chat)
  assert.equal(plan.delivery.issue, plan.issue.uri)
  assert.equal(plan.session.issue, plan.issue.uri)
  assert.equal(plan.session.delivery, plan.delivery.uri)
  assert.equal(plan.delivery.task, plan.task)
  assert.equal(plan.session.task, plan.task)
  assert.equal(plan.delivery.session, plan.session.uri)
  assert.equal(plan.issue.chat, chat)
  assert.equal(plan.delivery.chat, chat)
  assert.equal(plan.session.chat, chat)
  assert.equal(plan.issue.thread, thread)
  assert.equal(plan.delivery.thread, thread)
  assert.equal(plan.session.thread, thread)
  assert.deepEqual(plan.issue.messages, messages)
  assert.deepEqual(plan.delivery.messages, messages)
  assert.deepEqual(plan.session.messages, messages)
  assert.equal(plan.delivery.projection.runtimeRole, 'user')
  assert.equal(plan.delivery.targetBackend, 'codex')
  assert.equal(plan.session.target.backend, 'codex')
  assert.equal(plan.delivery.target.backend, 'codex')
  assert.equal(plan.session.target.contact, 'codex')
  assert.equal(plan.delivery.target.contact, 'codex')
  assert.equal(plan.delivery.reconciler?.decisions.length, 1)
  assert.equal(plan.delivery.reconciler?.decisions[0].policyKind, 'symphony')
  assert.equal(plan.delivery.reconciler?.decisions[0].eventType, 'delivery.submitted')
  assert.equal(plan.delivery.reconciler?.decisions[0].thread, thread)
  assert.equal(plan.delivery.reconciler?.decisions[0].wakeJobs[0].targetAgent, 'codex')
  assert.equal(plan.delivery.reconciler?.decisions[0].wakeJobs[0].targetRole, 'worker')
  assert.equal(plan.session.reconciler?.decisions[0].id, plan.delivery.reconciler?.decisions[0].id)
  assert.equal(plan.session.target.source, 'active-session')
  assert.equal(plan.session.mode, 'off')
  assert.equal(plan.session.secretaryAutoEnabled, true)
  assert.equal(plan.session.model, 'gpt-5.5')
  assert.equal(plan.session.workspace?.path, '/tmp/linx')
  assert.equal(plan.session.workspace?.workspaceUri, 'urn:undefineds:workspace:local-linx')
  assert.equal(plan.session.workspace?.baseRevision, 'abc123')
  assert.equal(plan.session.workspace?.environment?.kind, 'local-shell')
  assert.equal(plan.session.workspace?.environment?.runtime, 'codex')
  assert.equal(plan.workers.length, 1)
  assert.equal(plan.workers[0].delivery.uri, plan.delivery.uri)
  assert.match(plan.delivery.projection.prompt, /Workspace: \/tmp\/linx/)
  assert.match(plan.delivery.projection.prompt, /Workspace kind: git/)
  assert.match(plan.delivery.projection.prompt, /Workspace URI: urn:undefineds:workspace:local-linx/)
  assert.match(plan.delivery.projection.prompt, /Workspace base revision: abc123/)
  assert.match(plan.delivery.projection.prompt, /Workspace environment: local-shell runtime=codex id=host-a label=Local LinX checkout/)
  assert.match(plan.delivery.projection.prompt, /Target chat:/)
  assert.match(plan.delivery.projection.prompt, /Target thread:/)
  assert.match(plan.delivery.projection.prompt, /Target contact: codex/)
})

test('creates worker model and supervisor policy separately from the secretary model', () => {
  const plan = createRunPlan({
    objective: 'Implement a bounded Symphony worker slice.',
    acceptanceCriteria: ['Worker receives the cheap model', 'Secretary supervises on an interval'],
    workspacePath: '/tmp/linx',
    backend: 'linx',
    mode: 'off',
    secretaryAutoEnabled: true,
    model: 'gpt-5.5',
    workerModel: 'deepseek-v4',
    workerSupervisorIntervalMs: 600000,
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'worker-model',
  })

  assert.equal(plan.session.backend, 'linx')
  assert.equal(plan.session.target.backend, 'linx')
  assert.equal(plan.session.secretaryAutoEnabled, true)
  assert.equal(plan.session.model, 'deepseek-v4')
  assert.equal(plan.session.supervisor?.strategy, 'interval')
  assert.equal(plan.session.supervisor?.intervalMs, 600000)
  assert.deepEqual(plan.session.supervisor?.immediateWakeKinds, ['approval', 'question', 'blocked', 'failed', 'completed'])
})

test('renders delegated runtime prompt with objective criteria session and workspace', () => {
  const plan = createRunPlan({
    objective: 'Fix the login regression.',
    acceptanceCriteria: ['Login succeeds', 'Regression test passes'],
    workspacePath: '/tmp/linx',
    backend: 'claude',
    mode: 'off',
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'prompt-id',
  })

  const prompt = renderSymphonyRuntimePrompt({
    task: plan.task,
    objective: 'Fix the login regression.',
    acceptanceCriteria: ['Login succeeds', 'Regression test passes'],
    workspace: { path: '/tmp/linx', kind: 'folder' },
    backend: 'claude',
    mode: 'off',
    session: plan.session.uri,
  })

  assert.match(prompt, /# LinX Symphony Task/)
  assert.doesNotMatch(prompt, /Issue URI:/)
  assert.match(prompt, new RegExp(plan.task))
  assert.match(prompt, new RegExp(plan.session.uri))
  assert.match(prompt, /Backend: claude/)
  assert.match(prompt, /Worker mode: off/)
  assert.match(prompt, /Secretary auto: off/)
  assert.match(prompt, /Workspace: \/tmp\/linx/)
  assert.match(prompt, /Fix the login regression\./)
  assert.match(prompt, /1\. Login succeeds/)
  assert.match(prompt, /2\. Regression test passes/)
  assert.match(prompt, /AI Secretary/)
  assert.match(prompt, /## Runtime Space Contract/)
  assert.match(prompt, /Explicit session topology/)
  assert.match(prompt, /Thread reconciliation/)
  assert.match(prompt, /Reconciler\/Scheduler wakes Secretary or workers/)
  assert.match(prompt, /do not infer topology from workspace sharing/)
  assert.match(prompt, /Thread workspace/)
  assert.match(prompt, /same Thread in the same environment should normally share this workspace/)
  assert.match(prompt, /## Pod And Control Record Boundary/)
  assert.match(prompt, /read only the assigned Issue document\/meta, Task, Delivery, Run/)
  assert.match(prompt, /Write only execution facts/)
  assert.match(prompt, /Do not close Issues/)
  assert.match(prompt, /structured report so AI Secretary can persist them/)
  assert.match(prompt, /explicitly list follow-up candidates separately from assigned-work evidence/)
  assert.match(prompt, /Secretary classifies these; do not create or close Issues yourself/)
  assert.match(prompt, /workspace path is local to this worker environment/)
  assert.match(prompt, /repo-relative paths plus base revision/)
  assert.match(prompt, /patch or artifact references/)
  assert.match(prompt, /## Documentation Authority/)
  assert.match(prompt, /Pod Issue files plus meta, Spec files, and Task control records are the authority/)
  assert.match(prompt, /Repository docs are the implementation authority/)
  assert.match(prompt, /reference the Pod Issue\/Spec\/Task URI/)
  assert.match(prompt, /Implementation Change Request/)
  assert.match(prompt, /Same-Thread workers in this environment may share it/)

  const promptWithIssue = renderSymphonyRuntimePrompt({
    issue: plan.issue,
    task: plan.task,
    objective: 'Fix the login regression.',
    acceptanceCriteria: ['Login succeeds', 'Regression test passes'],
    workspace: { path: '/tmp/linx', kind: 'folder' },
    backend: 'claude',
    mode: 'off',
    session: plan.session.uri,
  })
  assert.match(promptWithIssue, new RegExp(plan.issue.uri))
})

test('renders delegated runtime prompt with inferred acceptance when criteria are omitted', () => {
  const prompt = renderSymphonyRuntimePrompt({
    task: 'urn:undefineds:linx:task:task_inferred',
    objective: 'Investigate the flaky auto mode handoff.',
    workspace: { path: '/tmp/linx', kind: 'folder' },
    backend: 'codex',
    mode: 'off',
    secretaryAutoEnabled: true,
    session: 'urn:undefineds:linx:session:session_inferred',
  })

  assert.match(prompt, /Worker mode: off/)
  assert.match(prompt, /Secretary auto: on/)
  assert.match(prompt, /Infer concrete acceptance criteria/)
  assert.match(prompt, /report the blocker to AI Secretary/)
  assert.match(prompt, /report concrete verification evidence/)
})

test('creates issuer-aware multi-worker symphony plans', () => {
  const plan = createRunPlan({
    objective: 'Split implementation and verification across workers.',
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'off',
    secretaryAutoEnabled: true,
    issuer: {
      source: 'user',
      webId: 'https://alice.example/profile/card#me',
      chat: 'https://alice.example/.data/chat/main/index.ttl#this',
      thread: 'https://alice.example/.data/chat/main/index.ttl#thread-main',
    },
    workers: [
      {
        backend: 'codex',
        agent: 'codex-builder',
        label: 'Builder',
        objective: 'Implement the change.',
        acceptanceCriteria: ['Patch is applied'],
      },
      {
        backend: 'claude',
        agent: 'claude-reviewer',
        label: 'Reviewer',
        objective: 'Review the implementation.',
        acceptanceCriteria: ['Findings are reported'],
      },
    ],
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'multi',
  })

  assert.equal(plan.issue.issuer.webId, 'https://alice.example/profile/card#me')
  assert.equal(plan.workers.length, 2)
  assert.deepEqual(plan.issue.tasks, plan.workers.map((worker) => worker.task))
  assert.deepEqual(plan.issue.deliveries, plan.workers.map((worker) => worker.delivery.uri))
  assert.deepEqual(plan.issue.sessions, plan.workers.map((worker) => worker.session.uri))
  assert.equal(plan.workers[0].session.backend, 'codex')
  assert.equal(plan.workers[1].session.backend, 'claude')
  assert.equal(plan.workers[0].session.cwd, '/tmp/linx')
  assert.equal(plan.workers[1].session.cwd, '/tmp/linx')
  assert.equal(plan.workers[0].session.workspace?.path, '/tmp/linx')
  assert.equal(plan.workers[1].session.workspace?.path, '/tmp/linx')
  assert.ok(plan.workers.every((worker) => worker.session.mode === 'off'))
  assert.ok(plan.workers.every((worker) => worker.session.secretaryAutoEnabled === true))
  assert.equal(plan.workers[0].session.target.agent, 'codex-builder')
  assert.equal(plan.workers[0].session.target.contact, 'codex-builder')
  assert.equal(plan.workers[1].session.target.agent, 'claude-reviewer')
  assert.equal(plan.workers[1].session.target.contact, 'claude-reviewer')
  assert.equal(plan.workers[0].taskRecord.objective, 'Implement the change.')
  assert.equal(plan.workers[1].taskRecord.objective, 'Review the implementation.')
  assert.deepEqual(plan.workers[0].taskRecord.acceptanceCriteria, ['Patch is applied'])
  assert.deepEqual(plan.workers[1].taskRecord.acceptanceCriteria, ['Findings are reported'])
  assert.equal(plan.task, plan.workers[0].task)
  assert.equal(plan.taskRecord.uri, plan.workers[0].task)
  assert.match(plan.workers[0].delivery.projection.prompt, /Worker: 1\/2/)
  assert.match(plan.workers[1].delivery.projection.prompt, /Worker: 2\/2/)
  assert.match(plan.workers[0].delivery.projection.prompt, /Implement the change\./)
  assert.match(plan.workers[1].delivery.projection.prompt, /Review the implementation\./)
  assert.match(plan.workers[0].delivery.projection.prompt, /Issuer WebID: https:\/\/alice.example\/profile\/card#me/)
})

test('keeps shared workspace by default and honors explicit worker workspace overrides', () => {
  const plan = createRunPlan({
    objective: 'Coordinate workers across environment-scoped workspaces.',
    workspacePath: '/tmp/linx',
    workspaceKind: 'git',
    repository: 'https://github.com/undefineds/linx.git',
    branch: 'main',
    baseRevision: 'base-a',
    backend: 'codex',
    mode: 'off',
    workers: [
      {
        backend: 'codex',
        agent: 'codex-local',
        objective: 'Use the shared local checkout.',
      },
      {
        backend: 'claude',
        agent: 'claude-container',
        objective: 'Use the container checkout.',
        workspace: {
          path: '/workspace/linx',
          kind: 'git',
          workspaceUri: 'urn:undefineds:workspace:container-linx',
          baseRevision: 'base-b',
          environment: {
            kind: 'remote-container',
            id: 'container-a',
            label: 'Container LinX checkout',
            runtime: 'claude',
          },
        },
      },
    ],
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'workspace',
  })

  assert.equal(plan.workers[0].session.cwd, '/tmp/linx')
  assert.equal(plan.workers[0].session.workspace?.path, '/tmp/linx')
  assert.equal(plan.workers[0].session.workspace?.baseRevision, 'base-a')
  assert.equal(plan.workers[0].session.workspace?.environment?.kind, 'backend-runtime')
  assert.equal(plan.workers[1].session.cwd, '/workspace/linx')
  assert.equal(plan.workers[1].session.workspace?.path, '/workspace/linx')
  assert.equal(plan.workers[1].session.workspace?.workspaceUri, 'urn:undefineds:workspace:container-linx')
  assert.equal(plan.workers[1].session.workspace?.baseRevision, 'base-b')
  assert.equal(plan.workers[1].session.workspace?.environment?.kind, 'remote-container')
  assert.equal(plan.workers[1].session.workspace?.environment?.id, 'container-a')
  assert.match(plan.workers[1].delivery.projection.prompt, /Workspace: \/workspace\/linx/)
  assert.match(plan.workers[1].delivery.projection.prompt, /Workspace environment: remote-container runtime=claude id=container-a label=Container LinX checkout/)
  assert.match(plan.workers[1].delivery.projection.prompt, /Same-Thread workers in this environment may share it/)
})
