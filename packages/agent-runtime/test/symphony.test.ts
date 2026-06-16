import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  classifySymphonyFollowUpCandidate,
  completeSymphonyWorkerRun,
  createRunPlan,
  createSymphonyDeliveryUri,
  createSymphonyIdeaUri,
  createSymphonyIssueUri,
  createSymphonyRunStepRecord,
  createSymphonyRunStepUri,
  createSymphonyAcceptanceReview,
  createSymphonySessionUri,
  createTaskUri,
  finalizeSymphonyRunPlanAfterWorkers,
  getSymphonyArchiveRelativePaths,
  parseSymphonyFinalReportEnvelope,
  parseSymphonyRuntimeDeliveryResult,
  reconcileSymphonyWorkerDelivery,
  recordSymphonyWorkerRuntimeEvent,
  renderSymphonyRuntimePrompt,
  startSymphonyWorkerRun,
  withSymphonyWorkerRunStep,
  withSymphonyWorkerRuntimeStep,
  SYMPHONY_DELIVERIES_DIRNAME,
  SYMPHONY_DELIVERY_FILE_NAME,
  SYMPHONY_HOME_DIRNAME,
  SYMPHONY_IDEAS_DIRNAME,
  SYMPHONY_IDEA_FILE_NAME,
  SYMPHONY_ISSUES_DIRNAME,
  SYMPHONY_ISSUE_FILE_NAME,
  SYMPHONY_SESSIONS_DIRNAME,
  SYMPHONY_RUN_STEPS_DIRNAME,
  SYMPHONY_RUN_STEP_FILE_NAME,
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
  assert.equal(createSymphonyRunStepUri(options), 'urn:undefineds:linx:runStep:runStep_2026-04-01T02-03-04-005Z_abcd1234efgh')
})

test('returns the shared archive file layout for symphony resources', () => {
  assert.equal(SYMPHONY_HOME_DIRNAME, 'symphony')
  assert.equal(SYMPHONY_IDEAS_DIRNAME, 'ideas')
  assert.equal(SYMPHONY_ISSUES_DIRNAME, 'issues')
  assert.equal(SYMPHONY_DELIVERIES_DIRNAME, 'deliveries')
  assert.equal(SYMPHONY_SESSIONS_DIRNAME, 'sessions')
  assert.equal(SYMPHONY_RUN_STEPS_DIRNAME, 'run-steps')
  assert.equal(SYMPHONY_IDEA_FILE_NAME, 'idea.json')
  assert.equal(SYMPHONY_ISSUE_FILE_NAME, 'issue.json')
  assert.equal(SYMPHONY_DELIVERY_FILE_NAME, 'delivery.json')
  assert.equal(SYMPHONY_SESSION_FILE_NAME, 'session.json')
  assert.equal(SYMPHONY_RUN_STEP_FILE_NAME, 'run-step.json')

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
  assert.deepEqual(getSymphonyArchiveRelativePaths('urn:undefineds:linx:runStep:run_step_demo', 'runStep'), {
    dir: 'run-steps/run_step_demo',
    file: 'run-steps/run_step_demo/run-step.json',
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
    container: 'urn:undefineds:workspace:local-linx',
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
  assert.equal(plan.delivery.reconciler?.decisions.length, 1)
  assert.equal(plan.delivery.reconciler?.decisions[0].policyKind, 'symphony')
  assert.equal(plan.delivery.reconciler?.decisions[0].eventType, 'delivery.submitted')
  assert.equal(plan.delivery.reconciler?.decisions[0].thread, thread)
  assert.equal(plan.delivery.reconciler?.decisions[0].wakeJobs[0].targetAgent, 'codex-worker')
  assert.equal(plan.delivery.reconciler?.decisions[0].wakeJobs[0].targetRole, 'worker')
  assert.equal(plan.session.reconciler?.decisions[0].id, plan.delivery.reconciler?.decisions[0].id)
  assert.equal(plan.session.target.source, 'active-session')
  assert.equal(plan.session.mode, 'off')
  assert.equal(plan.session.secretaryAutoEnabled, true)
  assert.equal(plan.session.model, 'gpt-5.5')
  assert.equal(plan.session.workspace?.path, '/tmp/linx')
  assert.equal(plan.session.workspace?.container, 'urn:undefineds:workspace:local-linx')
  assert.equal(plan.session.workspace?.baseRevision, 'abc123')
  assert.equal(plan.session.workspace?.environment?.kind, 'local-shell')
  assert.equal(plan.session.workspace?.environment?.runtime, 'codex')
  assert.equal(plan.workers.length, 1)
  assert.equal(plan.workers[0].delivery.uri, plan.delivery.uri)
  assert.match(plan.delivery.projection.prompt, /Workspace: \/tmp\/linx/)
  assert.match(plan.delivery.projection.prompt, /Workspace kind: git/)
  assert.match(plan.delivery.projection.prompt, /Workspace container: urn:undefineds:workspace:local-linx/)
  assert.match(plan.delivery.projection.prompt, /Workspace base revision: abc123/)
  assert.match(plan.delivery.projection.prompt, /Workspace environment: local-shell runtime=codex id=host-a label=Local LinX checkout/)
  assert.match(plan.delivery.projection.prompt, /Target chat:/)
  assert.match(plan.delivery.projection.prompt, /Target thread:/)
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
  assert.match(prompt, /read only the assigned Issue, Task, Delivery, Run/)
  assert.match(prompt, /Write only execution facts/)
  assert.match(prompt, /Do not close Issues/)
  assert.match(prompt, /structured report so AI Secretary can persist them/)
  assert.match(prompt, /workspace path is local to this worker environment/)
  assert.match(prompt, /repo-relative paths plus base revision/)
  assert.match(prompt, /patch or artifact references/)
  assert.match(prompt, /## Documentation Authority/)
  assert.match(prompt, /Pod Issue\/Spec\/Task records are the control authority/)
  assert.match(prompt, /Repository docs are the implementation authority/)
  assert.match(prompt, /reference the Pod Issue\/Spec\/Task URI/)
  assert.match(prompt, /Implementation Change Request/)
  assert.match(prompt, /Same-Thread workers in this environment may share it/)
  assert.match(prompt, /## Final Report And Follow-Up Candidates/)
  assert.match(prompt, /machine-readable envelope/)
  assert.doesNotMatch(prompt, /LINX_SYMPHONY_DELIVERY/)
  assert.doesNotMatch(prompt, /"symphonyDelivery": true/)
  assert.match(prompt, /"symphonyFinal": true/)
  assert.match(prompt, /"followUps"/)
  assert.match(prompt, /same_issue_task, new_issue, idea, evidence_only, or ask_user/)

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
  assert.equal(plan.workers[1].session.target.agent, 'claude-reviewer')
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
          container: 'urn:undefineds:workspace:container-linx',
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
  assert.equal(plan.workers[1].session.workspace?.container, 'urn:undefineds:workspace:container-linx')
  assert.equal(plan.workers[1].session.workspace?.baseRevision, 'base-b')
  assert.equal(plan.workers[1].session.workspace?.environment?.kind, 'remote-container')
  assert.equal(plan.workers[1].session.workspace?.environment?.id, 'container-a')
  assert.match(plan.workers[1].delivery.projection.prompt, /Workspace: \/workspace\/linx/)
  assert.match(plan.workers[1].delivery.projection.prompt, /Workspace environment: remote-container runtime=claude id=container-a label=Container LinX checkout/)
  assert.match(plan.workers[1].delivery.projection.prompt, /Same-Thread workers in this environment may share it/)
})

test('records normalized runtime RunSteps on worker plans', () => {
  const plan = createRunPlan({
    objective: 'Keep a durable heartbeat for a Codex worker.',
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'off',
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'runtime-step',
  })
  const worker = plan.workers[0]
  const step = createSymphonyRunStepRecord({
    worker,
    stepType: 'run.step',
    message: 'Codex worker heartbeat.',
    payload: {
      heartbeat: true,
      omitted: undefined,
    },
    now: new Date('2026-04-01T02:04:00.000Z'),
    randomId: 'heartbeat',
  })

  assert.equal(step.stepType, 'run.step')
  assert.equal(step.issue, plan.issue.uri)
  assert.equal(step.task, worker.task)
  assert.equal(step.delivery, worker.delivery.uri)
  assert.equal(step.session, worker.session.uri)
  assert.equal(step.message, 'Codex worker heartbeat.')
  assert.deepEqual(step.payload, { heartbeat: true })
  assert.equal(step.createdAt, '2026-04-01T02:04:00.000Z')

  const withStep = withSymphonyWorkerRunStep(worker, step)
  assert.equal(withStep.runSteps?.length, 1)
  assert.equal(withSymphonyWorkerRunStep(withStep, step).runSteps?.length, 1)

  const started = withSymphonyWorkerRuntimeStep(worker, {
    stepType: 'run.started',
    now: new Date('2026-04-01T02:04:10.000Z'),
    randomId: 'started',
  })
  assert.equal(started.runSteps?.[0]?.stepType, 'run.started')
  assert.match(started.runSteps?.[0]?.message ?? '', /worker run started/)
})

test('parses Codex-compatible Symphony final report envelopes', () => {
  const report = [
    'Done.',
    '',
    '```json',
    JSON.stringify({
      symphonyFinal: true,
      summary: 'Runtime control state converged.',
      changedFiles: ['packages/agent-runtime/src/symphony.ts'],
      commands: ['yarn workspace @linx/agent-runtime build'],
      evidence: ['agent-runtime build passed'],
      risks: ['Web subscription not manually verified'],
      followUps: [{
        kind: 'missing_shared_abstraction',
        summary: 'Extract duplicated CLI/Web lifecycle decisions into a shared use-case.',
        evidence: ['apps/cli/src/lib/symphony-command.ts'],
        suggestedDisposition: 'new_issue',
        reason: 'Both surfaces need the same worker acceptance logic.',
      }],
    }, null, 2),
    '```',
  ].join('\n')

  const envelope = parseSymphonyFinalReportEnvelope(report)
  assert.ok(envelope)
  assert.equal(envelope.summary, 'Runtime control state converged.')
  assert.deepEqual(envelope.changedFiles, ['packages/agent-runtime/src/symphony.ts'])
  assert.deepEqual(envelope.commands, ['yarn workspace @linx/agent-runtime build'])
  assert.deepEqual(envelope.evidence, ['agent-runtime build passed'])
  assert.deepEqual(envelope.risks, ['Web subscription not manually verified'])
  assert.equal(envelope.followUps?.[0]?.kind, 'missing_shared_abstraction')
  assert.equal(envelope.followUps?.[0]?.suggestedDisposition, 'new_issue')
})

test('parses portable Codex Delivery reports into normalized runtime results', () => {
  const delivery = [
    '```json symphony-delivery',
    JSON.stringify({
      symphonyDelivery: true,
      status: 'completed',
      exitCode: 0,
      autoModeSessionId: 'codex_manual_123',
      events: [{
        stepType: 'run.step',
        message: 'Manual Codex worker wrote a patch.',
        createdAt: '2026-04-01T02:04:00.000Z',
        randomId: 'manual-step',
        payload: {
          command: 'yarn workspace @linx/agent-runtime test',
        },
      }],
      report: {
        summary: 'Manual Codex worker finished.',
        evidence: ['agent-runtime test passed'],
        changedFiles: ['packages/agent-runtime/src/symphony.ts'],
        followUps: [{
          kind: 'shared_runtime_utility',
          summary: 'Reuse the Delivery parser from Web and CLI workers.',
          suggestedDisposition: 'new_issue',
        }],
      },
    }, null, 2),
    '```',
  ].join('\n')

  const result = parseSymphonyRuntimeDeliveryResult(delivery)
  assert.ok(result)
  assert.equal(result.status, 'completed')
  assert.equal(result.exitCode, 0)
  assert.equal(result.autoModeSessionId, 'codex_manual_123')
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0]?.stepType, 'run.step')
  assert.equal(result.events[0]?.createdAt, '2026-04-01T02:04:00.000Z')
  assert.match(result.reportText ?? '', /"symphonyFinal":true/)
  assert.match(result.reportText ?? '', /Manual Codex worker finished/)
  assert.match(result.reportText ?? '', /shared_runtime_utility/)
})

test('classifies reusable worker follow-up as a new issue unless it blocks acceptance', () => {
  const reusable = classifySymphonyFollowUpCandidate({
    kind: 'app_local_glue',
    summary: 'Move duplicated Pod write helper into a shared use-case.',
    evidence: ['apps/cli/src/lib/symphony-command.ts'],
  })
  assert.equal(reusable.disposition, 'new_issue')
  assert.match(reusable.reason, /reusable across surfaces/)

  const blocking = classifySymphonyFollowUpCandidate({
    kind: 'missing_shared_abstraction',
    summary: 'Shared acceptance review must exist before this delivery is safe.',
    requiredBeforeAcceptance: true,
  })
  assert.equal(blocking.disposition, 'same_issue_task')
})

test('records worker acceptance review and creates follow-up issue records', () => {
  const plan = createRunPlan({
    objective: 'Unify Symphony worker completion handling.',
    acceptanceCriteria: ['Final report is parsed', 'Follow-up issue is recorded'],
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'off',
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'acceptance',
  })
  const report = [
    'Implemented worker completion.',
    '',
    '```json',
    JSON.stringify({
      symphonyFinal: true,
      summary: 'Worker completion handling is implemented.',
      evidence: ['tests passed'],
      followUps: [{
        kind: 'missing_shared_abstraction',
        summary: 'Extract reusable worker acceptance review into shared use-case.',
        evidence: ['packages/agent-runtime/src/symphony.ts'],
        suggestedDisposition: 'new_issue',
      }],
    }),
    '```',
  ].join('\n')

  const review = createSymphonyAcceptanceReview({
    issue: plan.issue,
    worker: plan.workers[0],
    status: 'completed',
    exitCode: 0,
    reportText: report,
    now: new Date('2026-04-01T02:05:00.000Z'),
  })
  assert.equal(review.accepted, true)
  assert.equal(review.outcome, 'follow_up')
  assert.equal(review.reusableExtraction.disposition, 'new_issue')
  assert.equal(review.followUps[0].disposition, 'new_issue')

  const reconciled = reconcileSymphonyWorkerDelivery({
    issue: plan.issue,
    worker: plan.workers[0],
    status: 'completed',
    exitCode: 0,
    reportText: report,
    now: new Date('2026-04-01T02:05:00.000Z'),
    randomId: 'acceptance',
  })
  assert.equal(reconciled.worker.taskRecord.acceptanceReview?.reusableExtraction.disposition, 'new_issue')
  assert.equal(reconciled.worker.delivery.acceptanceReview?.outcome, 'follow_up')
  assert.equal(reconciled.worker.session.acceptanceReview?.accepted, true)
  assert.equal(reconciled.followUpIssues.length, 1)
  assert.equal(reconciled.followUpIssues[0].parentIssue, plan.issue.uri)
  assert.deepEqual(reconciled.followUpIssues[0].tasks, [])
  assert.match(reconciled.followUpIssues[0].title, /Extract reusable worker acceptance review/)
  assert.equal(reconciled.worker.taskRecord.acceptanceReview?.followUps[0].issue, reconciled.followUpIssues[0].uri)
  assert.equal(reconciled.worker.runSteps?.at(-1)?.stepType, 'run.completed')
  assert.equal(reconciled.worker.runSteps?.at(-1)?.payload?.acceptanceOutcome, 'follow_up')
})

test('shares worker lifecycle use-cases for dispatch heartbeat and completion', () => {
  const plan = createRunPlan({
    objective: 'Run one shared worker lifecycle.',
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'off',
    now: new Date('2026-04-01T04:20:00.000Z'),
    randomId: 'shared-lifecycle',
  })

  const started = startSymphonyWorkerRun({
    worker: plan.workers[0],
    decision: {
      id: 'decision_shared_lifecycle_dispatch',
      policyKind: 'symphony',
      eventType: 'delivery.submitted',
      thread: 'urn:undefineds:linx:thread:shared-lifecycle',
      wakeJobs: [{
        id: 'wake_shared_lifecycle_worker',
        thread: 'urn:undefineds:linx:thread:shared-lifecycle',
        targetAgent: 'codex-worker',
        targetRole: 'worker',
        trigger: 'delivery.submitted',
        priority: 'high',
        status: 'completed',
        reason: 'dispatch accepted',
        sourceEventType: 'delivery.submitted',
      }],
      createdAt: '2026-04-01T04:20:01.000Z',
    },
    now: new Date('2026-04-01T04:20:01.000Z'),
    randomId: 'shared-lifecycle-started',
  })

  assert.equal(started.taskRecord.status, 'running')
  assert.equal(started.delivery.status, 'dispatched')
  assert.equal(started.session.status, 'running')
  assert.equal(started.runSteps?.[0]?.stepType, 'run.started')
  assert.equal(started.taskRecord.reconciler?.decisions.at(-1)?.wakeJobs[0]?.reason, 'dispatch accepted')

  const heartbeat = recordSymphonyWorkerRuntimeEvent({
    worker: started,
    stepType: 'run.step',
    message: 'worker heartbeat',
    payload: { heartbeat: true },
    now: new Date('2026-04-01T04:20:02.000Z'),
    randomId: 'shared-lifecycle-heartbeat',
  })

  assert.equal(heartbeat.session.status, 'running')
  assert.equal(heartbeat.runSteps?.[1]?.stepType, 'run.step')
  assert.equal(heartbeat.runSteps?.[1]?.payload?.heartbeat, true)

  const completed = completeSymphonyWorkerRun({
    issue: plan.issue,
    worker: heartbeat,
    status: 'completed',
    exitCode: 0,
    autoModeSessionId: 'auto_shared_lifecycle',
    reportText: [
      'Done.',
      '',
      '```json',
      JSON.stringify({
        symphonyFinal: true,
        summary: 'Shared lifecycle completed.',
        evidence: ['unit test'],
      }),
      '```',
    ].join('\n'),
    decision: {
      id: 'decision_shared_lifecycle_complete',
      policyKind: 'symphony',
      eventType: 'delivery.completed',
      thread: 'urn:undefineds:linx:thread:shared-lifecycle',
      wakeJobs: [{
        id: 'wake_shared_lifecycle_secretary',
        thread: 'urn:undefineds:linx:thread:shared-lifecycle',
        targetAgent: '__secretary__',
        targetRole: 'secretary',
        trigger: 'delivery.completed',
        priority: 'high',
        status: 'completed',
        reason: 'completion accepted for Secretary review',
        sourceEventType: 'delivery.completed',
      }],
      createdAt: '2026-04-01T04:20:03.000Z',
    },
    now: new Date('2026-04-01T04:20:03.000Z'),
    randomId: 'shared-lifecycle-complete',
  })

  assert.equal(completed.acceptanceReview.accepted, true)
  assert.equal(completed.worker.taskRecord.status, 'completed')
  assert.equal(completed.worker.delivery.status, 'completed')
  assert.equal(completed.worker.session.status, 'completed')
  assert.equal(completed.worker.session.autoModeSessionId, 'auto_shared_lifecycle')
  assert.equal(completed.worker.runSteps?.at(-1)?.stepType, 'run.completed')
  assert.equal(completed.worker.runSteps?.at(-1)?.payload?.acceptanceOutcome, 'accepted')
})

test('records repeated failed attempts as RunSteps and implementation change request without duplicate tasks', () => {
  const plan = createRunPlan({
    objective: 'Complete a worker task that currently fails.',
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'off',
    now: new Date('2026-04-01T06:00:00.000Z'),
    randomId: 'failed-attempt',
  })
  const started = startSymphonyWorkerRun({
    worker: plan.workers[0],
    now: new Date('2026-04-01T06:00:01.000Z'),
    randomId: 'failed-attempt-start',
  })
  const attempted = recordSymphonyWorkerRuntimeEvent({
    worker: started,
    stepType: 'run.step',
    message: 'First implementation attempt failed: build command exited non-zero.',
    payload: {
      command: 'yarn workspace @linx/agent-runtime test',
      result: 'failed',
      errorSummary: 'TypeScript compile error',
    },
    now: new Date('2026-04-01T06:00:02.000Z'),
    randomId: 'failed-attempt-step-1',
  })

  const reconciled = completeSymphonyWorkerRun({
    issue: plan.issue,
    worker: attempted,
    status: 'failed',
    exitCode: 1,
    reportText: [
      'The plan cannot be completed as written.',
      '',
      '```json',
      JSON.stringify({
        symphonyFinal: true,
        summary: 'Worker failed because the current plan is missing a shared runtime adapter contract.',
        evidence: ['build command exited non-zero'],
        risks: ['retrying without changing the plan will repeat the same failure'],
      }),
      '```',
    ].join('\n'),
    now: new Date('2026-04-01T06:00:03.000Z'),
    randomId: 'failed-attempt-complete',
  })

  assert.equal(reconciled.worker.task, plan.task)
  assert.equal(reconciled.worker.taskRecord.uri, plan.taskRecord.uri)
  assert.equal(reconciled.followUpIssues.length, 0)
  assert.equal(reconciled.worker.runSteps?.map((step) => step.stepType).join(','), 'run.started,run.step,run.failed')
  assert.equal(reconciled.acceptanceReview.accepted, false)
  assert.equal(reconciled.acceptanceReview.outcome, 'blocked')
  assert.equal(reconciled.acceptanceReview.implementationChangeRequest?.task, plan.task)
  assert.equal(reconciled.acceptanceReview.implementationChangeRequest?.delivery, plan.delivery.uri)
  assert.equal(reconciled.acceptanceReview.implementationChangeRequest?.session, plan.session.uri)
  assert.equal(reconciled.acceptanceReview.implementationChangeRequest?.trigger, 'worker_failed')
  assert.match(reconciled.acceptanceReview.implementationChangeRequest?.failedAssumption ?? '', /complete/i)
  assert.ok(reconciled.acceptanceReview.implementationChangeRequest?.basedOnRunSteps.includes(reconciled.worker.runSteps![0]!.uri))
})


test('blocks current worker task when reusable extraction is required before acceptance', () => {
  const plan = createRunPlan({
    objective: 'Ship a worker result only after shared acceptance logic exists.',
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'off',
    now: new Date('2026-04-01T03:00:00.000Z'),
    randomId: 'blocking-acceptance',
  })
  const report = [
    'Implemented most of the worker path.',
    '',
    '```json',
    JSON.stringify({
      symphonyFinal: true,
      summary: 'Worker path still needs shared acceptance logic before closure.',
      evidence: ['partial tests passed'],
      followUps: [{
        kind: 'missing_shared_abstraction',
        summary: 'Extract shared worker acceptance review before accepting this task.',
        evidence: ['apps/cli/src/lib/symphony-command.ts'],
        requiredBeforeAcceptance: true,
      }],
    }),
    '```',
  ].join('\n')

  const reconciled = reconcileSymphonyWorkerDelivery({
    issue: plan.issue,
    worker: plan.workers[0],
    status: 'completed',
    exitCode: 0,
    reportText: report,
    now: new Date('2026-04-01T03:05:00.000Z'),
    randomId: 'blocking-acceptance',
  })

  assert.equal(reconciled.acceptanceReview.accepted, false)
  assert.equal(reconciled.acceptanceReview.outcome, 'blocked')
  assert.equal(reconciled.acceptanceReview.reusableExtraction.disposition, 'same_issue_task')
  assert.equal(reconciled.worker.taskRecord.status, 'blocked')
  assert.equal(reconciled.worker.taskRecord.completedAt, undefined)
  assert.equal(reconciled.followUpIssues.length, 0)
})

test('blocks acceptance when a worker follow-up requires user-owned input', () => {
  const plan = createRunPlan({
    objective: 'Deploy a worker result only after user-owned approval is clear.',
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'off',
    now: new Date('2026-04-01T04:00:00.000Z'),
    randomId: 'ask-user-acceptance',
  })
  const report = [
    'Implementation is ready but needs a user decision.',
    '',
    '```json',
    JSON.stringify({
      symphonyFinal: true,
      summary: 'The worker needs user authority before closure.',
      followUps: [{
        kind: 'other',
        summary: 'User must approve production deployment.',
        userDecisionRequired: true,
      }],
    }),
    '```',
  ].join('\n')

  const review = createSymphonyAcceptanceReview({
    issue: plan.issue,
    worker: plan.workers[0],
    status: 'completed',
    exitCode: 0,
    reportText: report,
    now: new Date('2026-04-01T04:05:00.000Z'),
  })

  assert.equal(review.accepted, false)
  assert.equal(review.outcome, 'blocked')
  assert.equal(review.followUps[0].disposition, 'ask_user')
})

test('finalizes a run plan through the shared worker acceptance use-case', () => {
  const plan = createRunPlan({
    objective: 'Share Symphony completion decisions across CLI and Web adapters.',
    workspacePath: '/tmp/linx',
    backend: 'codex',
    mode: 'off',
    now: new Date('2026-04-01T05:00:00.000Z'),
    randomId: 'shared-finalize',
  })
  const report = [
    'The worker still needs same-issue work.',
    '',
    '```json',
    JSON.stringify({
      symphonyFinal: true,
      summary: 'Shared use-case is not ready for closure.',
      followUps: [{
        kind: 'missing_shared_abstraction',
        summary: 'Move final worker acceptance into the shared control layer.',
        requiredBeforeAcceptance: true,
      }],
    }),
    '```',
  ].join('\n')
  const reconciled = reconcileSymphonyWorkerDelivery({
    issue: plan.issue,
    worker: {
      ...plan.workers[0],
      session: {
        ...plan.workers[0].session,
        status: 'completed',
        exitCode: 0,
      },
      delivery: {
        ...plan.workers[0].delivery,
        status: 'completed',
      },
    },
    status: 'completed',
    exitCode: 0,
    reportText: report,
    now: new Date('2026-04-01T05:05:00.000Z'),
    randomId: 'shared-finalize',
  })

  const finalized = finalizeSymphonyRunPlanAfterWorkers({
    plan,
    workers: [reconciled.worker],
    followUpIssues: reconciled.followUpIssues,
    now: new Date('2026-04-01T05:06:00.000Z'),
  })

  assert.equal(finalized.status, 'completed')
  assert.equal(finalized.issueStatus, 'blocked')
  assert.equal(finalized.blocker?.kind, 'acceptance')
  assert.equal(finalized.plan.issue.status, 'blocked')
  assert.match(finalized.plan.issue.error, /Move final worker acceptance/)
  assert.equal(finalized.plan.taskRecord.status, 'blocked')
  assert.equal(finalized.plan.taskRecord.acceptanceReview?.accepted, false)
})
