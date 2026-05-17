import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createRunPlan,
  createSymphonyDeliveryUri,
  createSymphonyIssueUri,
  createSymphonySessionUri,
  createTaskUri,
  getSymphonyArchiveRelativePaths,
  renderSymphonyRuntimePrompt,
  SYMPHONY_DELIVERIES_DIRNAME,
  SYMPHONY_DELIVERY_FILE_NAME,
  SYMPHONY_HOME_DIRNAME,
  SYMPHONY_ISSUES_DIRNAME,
  SYMPHONY_ISSUE_FILE_NAME,
  SYMPHONY_SESSIONS_DIRNAME,
  SYMPHONY_SESSION_FILE_NAME,
} from '../src/symphony'

test('creates stable symphony URIs from timestamp and random id', () => {
  const options = {
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'abcd1234efgh',
  }

  assert.equal(createSymphonyIssueUri(options), 'urn:undefineds:linx:issue:issue_2026-04-01T02-03-04-005Z_abcd1234efgh')
  assert.equal(createTaskUri(options), 'urn:undefineds:linx:task:task_2026-04-01T02-03-04-005Z_abcd1234efgh')
  assert.equal(createSymphonyDeliveryUri(options), 'urn:undefineds:linx:delivery:delivery_2026-04-01T02-03-04-005Z_abcd1234efgh')
  assert.equal(createSymphonySessionUri(options), 'urn:undefineds:linx:session:session_2026-04-01T02-03-04-005Z_abcd1234efgh')
})

test('returns the shared archive file layout for symphony resources', () => {
  assert.equal(SYMPHONY_HOME_DIRNAME, 'symphony')
  assert.equal(SYMPHONY_ISSUES_DIRNAME, 'issues')
  assert.equal(SYMPHONY_DELIVERIES_DIRNAME, 'deliveries')
  assert.equal(SYMPHONY_SESSIONS_DIRNAME, 'sessions')
  assert.equal(SYMPHONY_ISSUE_FILE_NAME, 'issue.json')
  assert.equal(SYMPHONY_DELIVERY_FILE_NAME, 'delivery.json')
  assert.equal(SYMPHONY_SESSION_FILE_NAME, 'session.json')

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
    backend: 'codex',
    mode: 'auto',
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
  assert.equal(plan.session.mode, 'auto')
  assert.equal(plan.session.model, 'gpt-5.5')
  assert.match(plan.delivery.projection.prompt, /Workspace: \/tmp\/linx/)
  assert.match(plan.delivery.projection.prompt, /Workspace kind: git/)
})

test('renders delegated runtime prompt with objective criteria session and workspace', () => {
  const plan = createRunPlan({
    objective: 'Fix the login regression.',
    acceptanceCriteria: ['Login succeeds', 'Regression test passes'],
    workspacePath: '/tmp/linx',
    backend: 'claude',
    mode: 'smart',
    now: new Date('2026-04-01T02:03:04.005Z'),
    randomId: 'prompt-id',
  })

  const prompt = renderSymphonyRuntimePrompt({
    task: plan.task,
    objective: 'Fix the login regression.',
    acceptanceCriteria: ['Login succeeds', 'Regression test passes'],
    workspace: { path: '/tmp/linx', kind: 'folder' },
    backend: 'claude',
    mode: 'smart',
    session: plan.session.uri,
  })

  assert.match(prompt, /# LinX Symphony Task/)
  assert.doesNotMatch(prompt, /Issue URI:/)
  assert.match(prompt, new RegExp(plan.task))
  assert.match(prompt, new RegExp(plan.session.uri))
  assert.match(prompt, /Backend: claude/)
  assert.match(prompt, /Mode: smart/)
  assert.match(prompt, /Workspace: \/tmp\/linx/)
  assert.match(prompt, /Fix the login regression\./)
  assert.match(prompt, /1\. Login succeeds/)
  assert.match(prompt, /2\. Regression test passes/)
  assert.match(prompt, /AI Secretary/)

  const promptWithIssue = renderSymphonyRuntimePrompt({
    issue: plan.issue,
    task: plan.task,
    objective: 'Fix the login regression.',
    acceptanceCriteria: ['Login succeeds', 'Regression test passes'],
    workspace: { path: '/tmp/linx', kind: 'folder' },
    backend: 'claude',
    mode: 'smart',
    session: plan.session.uri,
  })
  assert.match(promptWithIssue, new RegExp(plan.issue.uri))
})
