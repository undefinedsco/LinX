import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createLinxSymphonyDeliveryId,
  createLinxSymphonyRunPlan,
  createLinxSymphonySessionId,
  createLinxSymphonyTaskId,
  getLinxSymphonyArchiveRelativePaths,
  LINX_SYMPHONY_DELIVERIES_DIRNAME,
  LINX_SYMPHONY_DELIVERY_FILE_NAME,
  LINX_SYMPHONY_HOME_DIRNAME,
  LINX_SYMPHONY_SESSIONS_DIRNAME,
  LINX_SYMPHONY_SESSION_FILE_NAME,
  LINX_SYMPHONY_TASKS_DIRNAME,
  LINX_SYMPHONY_TASK_FILE_NAME,
  renderLinxSymphonyRuntimePrompt,
} from '../src/symphony'

test('creates stable symphony ids from timestamp and random id', () => {
  const options = {
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'abcd1234efgh',
  }

  assert.equal(createLinxSymphonyTaskId(options), 'sym_task_2026-04-01T02-03-04-005Z_abcd1234efgh')
  assert.equal(createLinxSymphonyDeliveryId(options), 'sym_delivery_2026-04-01T02-03-04-005Z_abcd1234efgh')
  assert.equal(createLinxSymphonySessionId(options), 'sym_session_2026-04-01T02-03-04-005Z_abcd1234efgh')
})

test('returns the shared archive file layout for symphony resources', () => {
  assert.equal(LINX_SYMPHONY_HOME_DIRNAME, 'symphony')
  assert.equal(LINX_SYMPHONY_TASKS_DIRNAME, 'tasks')
  assert.equal(LINX_SYMPHONY_DELIVERIES_DIRNAME, 'deliveries')
  assert.equal(LINX_SYMPHONY_SESSIONS_DIRNAME, 'sessions')
  assert.equal(LINX_SYMPHONY_TASK_FILE_NAME, 'task.json')
  assert.equal(LINX_SYMPHONY_DELIVERY_FILE_NAME, 'delivery.json')
  assert.equal(LINX_SYMPHONY_SESSION_FILE_NAME, 'session.json')

  assert.deepEqual(getLinxSymphonyArchiveRelativePaths('sym_task_demo', 'task'), {
    dir: 'tasks/sym_task_demo',
    file: 'tasks/sym_task_demo/task.json',
  })
  assert.deepEqual(getLinxSymphonyArchiveRelativePaths('sym_delivery_demo', 'delivery'), {
    dir: 'deliveries/sym_delivery_demo',
    file: 'deliveries/sym_delivery_demo/delivery.json',
  })
  assert.deepEqual(getLinxSymphonyArchiveRelativePaths('sym_session_demo', 'session'), {
    dir: 'sessions/sym_session_demo',
    file: 'sessions/sym_session_demo/session.json',
  })
})

test('creates a task delivery session run plan with shared ids and workspace metadata', () => {
  const plan = createLinxSymphonyRunPlan({
    objective: 'Inspect the repository and report the next implementation slice.',
    title: 'Inspect repo',
    acceptanceCriteria: ['Find the next slice', 'Report verification evidence'],
    workspacePath: '/tmp/linx',
    workspaceKind: 'git',
    repository: 'https://github.com/undefineds/linx.git',
    branch: 'main',
    worktree: '/tmp/linx-worktree',
    backend: 'codex',
    mode: 'auto',
    model: 'gpt-5.5',
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'plan-id',
  })

  assert.equal(plan.task.id, 'sym_task_2026-04-01T02-03-04-005Z_plan-id')
  assert.equal(plan.delivery.id, 'sym_delivery_2026-04-01T02-03-04-005Z_plan-id')
  assert.equal(plan.session.id, 'sym_session_2026-04-01T02-03-04-005Z_plan-id')
  assert.equal(plan.session.deliveryId, plan.delivery.id)
  assert.deepEqual(plan.task.deliveryIds, [plan.delivery.id])
  assert.deepEqual(plan.task.sessionIds, [plan.session.id])
  assert.equal(plan.delivery.sessionId, plan.session.id)
  assert.equal(plan.delivery.projection.runtimeRole, 'user')
  assert.equal(plan.delivery.targetBackend, 'codex')
  assert.equal(plan.session.mode, 'auto')
  assert.equal(plan.session.model, 'gpt-5.5')
  assert.deepEqual(plan.task.workspace, {
    path: '/tmp/linx',
    kind: 'git',
    repository: 'https://github.com/undefineds/linx.git',
    branch: 'main',
    worktree: '/tmp/linx-worktree',
  })
})

test('renders delegated runtime prompt with objective criteria session and workspace', () => {
  const plan = createLinxSymphonyRunPlan({
    objective: 'Fix the login regression.',
    acceptanceCriteria: ['Login succeeds', 'Regression test passes'],
    workspacePath: '/tmp/linx',
    backend: 'claude',
    mode: 'smart',
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'prompt-id',
  })

  const prompt = renderLinxSymphonyRuntimePrompt({
    task: plan.task,
    backend: 'claude',
    mode: 'smart',
    sessionId: plan.session.id,
  })

  assert.match(prompt, /# LinX Symphony Task/)
  assert.match(prompt, new RegExp(plan.task.id))
  assert.match(prompt, new RegExp(plan.session.id))
  assert.match(prompt, /Backend: claude/)
  assert.match(prompt, /Mode: smart/)
  assert.match(prompt, /Workspace: \/tmp\/linx/)
  assert.match(prompt, /Fix the login regression\./)
  assert.match(prompt, /1\. Login succeeds/)
  assert.match(prompt, /2\. Regression test passes/)
  assert.match(prompt, /AI Secretary/)
})
