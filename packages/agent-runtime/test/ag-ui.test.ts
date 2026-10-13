import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  LINX_A2UI_CATALOG_ID,
  LinxAgUiMapper,
  acpOptionKindToChoice,
  buildLinxCardSurface,
  readLinxCardSurface,
  readLinxProgress,
  selectAcpOptionId,
  type AgUiEvent,
} from '../src/ag-ui.ts'

const THREAD = 'https://alice.example/.data/chat/c1/index.ttl#t1'
const RUN = `${THREAD}-run-1`
const MESSAGE = 'https://alice.example/.data/chat/c1/2026/10/11/messages.ttl#m1'

function types(events: AgUiEvent[]): string[] {
  return events.map((event) => event.type)
}

/** The ordering rules @ag-ui/client enforces on every stream. */
function assertWellFormed(events: AgUiEvent[]) {
  assert.equal(events[0]?.type, 'RUN_STARTED')
  const terminal = events.filter((event) => event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR')
  assert.equal(terminal.length, 1)
  assert.equal(events.at(-1), terminal[0])
  const openText = new Set<string>()
  const openTools = new Set<string>()
  for (const event of events) {
    if (event.type === 'TEXT_MESSAGE_START') {
      assert.ok(!openText.has(event.messageId), 'text started twice')
      openText.add(event.messageId)
    }
    if (event.type === 'TEXT_MESSAGE_CONTENT') assert.ok(openText.has(event.messageId), 'content before start')
    if (event.type === 'TEXT_MESSAGE_END') openText.delete(event.messageId)
    if (event.type === 'TOOL_CALL_START') openTools.add(event.toolCallId)
    if (event.type === 'TOOL_CALL_END') openTools.delete(event.toolCallId)
  }
  assert.equal(openText.size, 0)
  assert.equal(openTools.size, 0)
}

describe('LinX AG-UI mapping', () => {
  it('streams text under the Pod message URI and closes the run', () => {
    const mapper = new LinxAgUiMapper({ threadId: THREAD, runId: RUN })
    const events = [
      ...mapper.map({ type: 'message.started', payload: { messageId: MESSAGE } }),
      ...mapper.map({ endpoint: 'linx', type: 'message.delta', payload: { text: '你好' } }),
      ...mapper.map({ endpoint: 'linx', type: 'message.delta', payload: { text: '，林' } }),
      ...mapper.map({ endpoint: 'linx', type: 'message.completed', payload: { text: '你好，林。' } }),
      ...mapper.map({ endpoint: 'linx', type: 'session.completed', payload: {} }),
    ]
    assertWellFormed(events)
    assert.deepEqual(types(events), [
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])
    assert.deepEqual(events[0], { type: 'RUN_STARTED', threadId: THREAD, runId: RUN })
    const contents = events.filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
    assert.equal(contents.map((event) => 'delta' in event ? event.delta : '').join(''), '你好，林。')
    assert.ok(events.every((event) => !('messageId' in event) || event.messageId === MESSAGE))
  })

  it('turns an approval into a card bound to the Approval URI and an interrupt with the same id', () => {
    const approvalUri = 'https://alice.example/.data/approvals/2026/10/11.ttl#a1'
    const mapper = new LinxAgUiMapper({ threadId: THREAD, runId: RUN })
    const events = [
      ...mapper.map({ endpoint: 'linx', type: 'message.delta', payload: { messageId: MESSAGE, text: '要发邀请吗？' } }),
      ...mapper.map({
        endpoint: 'linx',
        type: 'approval.required',
        payload: { approvalUri, message: '发送排班日历邀请？', toolCallId: 'call-1' },
      }),
      ...mapper.finish(),
    ]
    assertWellFormed(events)
    const card = events.find((event) => event.type === 'ACTIVITY_SNAPSHOT')
    assert.ok(card && card.type === 'ACTIVITY_SNAPSHOT')
    assert.equal(card.activityType, 'a2ui-surface')
    const surface = readLinxCardSurface(card.content.a2ui_operations)
    assert.deepEqual(surface, { card: 'approval', resource: approvalUri, fallbackText: '发送排班日历邀请？', hints: {} })
    const finished = events.at(-1)
    assert.ok(finished && finished.type === 'RUN_FINISHED')
    assert.deepEqual(finished.outcome, {
      type: 'interrupt',
      interrupts: [{ id: approvalUri, reason: 'tool_call', message: '发送排班日历邀请？', toolCallId: 'call-1' }],
    })
  })

  it('uses the command-permission card for ACP endpoints and the login card for login input requests', () => {
    const mapper = new LinxAgUiMapper({ threadId: THREAD, runId: RUN })
    const events = [
      ...mapper.map({ endpoint: 'acp:claude', type: 'approval.required', payload: { endpoint: 'acp:claude', approvalUri: 'urn:a', message: '运行测试？' } }),
      ...mapper.map({ endpoint: 'linx', type: 'input.required', payload: { inputRequestUri: 'urn:i', kind: 'login', message: '需要登录书店日历' } }),
      ...mapper.finish(),
    ]
    const cards = events.flatMap((event) => event.type === 'ACTIVITY_SNAPSHOT' && event.activityType === 'a2ui-surface'
      ? [readLinxCardSurface(event.content.a2ui_operations)?.card]
      : [])
    assert.deepEqual(cards, ['command-permission', 'login'])
  })

  it('collapses progress into one activity per run and marks it done at the end', () => {
    const mapper = new LinxAgUiMapper({ threadId: THREAD, runId: RUN })
    const events = [
      ...mapper.map({ type: 'step.progress', payload: { title: '读了志愿者名单' } }),
      ...mapper.map({ type: 'step.progress', payload: { title: '对比维护负担' } }),
      ...mapper.finish(),
    ]
    assertWellFormed(events)
    const snapshots = events.filter((event) => event.type === 'ACTIVITY_SNAPSHOT')
    assert.equal(new Set(snapshots.map((event) => 'messageId' in event ? event.messageId : '')).size, 1)
    const last = snapshots.at(-1)
    assert.ok(last && last.type === 'ACTIVITY_SNAPSHOT')
    assert.deepEqual(readLinxProgress(last.content), {
      phase: 'done',
      steps: [
        { title: '读了志愿者名单', status: 'done' },
        { title: '对比维护负担', status: 'done' },
      ],
    })
  })

  it('closes an open message before a run error and reports a cancelled stop', () => {
    const failed = new LinxAgUiMapper({ threadId: THREAD, runId: RUN })
    const failure = [
      ...failed.map({ endpoint: 'linx', type: 'message.delta', payload: { messageId: MESSAGE, text: '一半' } }),
      ...failed.map({ endpoint: 'linx', type: 'session.error', payload: { message: '网络断了' } }),
    ]
    assertWellFormed(failure)
    assert.deepEqual(failure.at(-1), { type: 'RUN_ERROR', message: '网络断了' })

    const stopped = new LinxAgUiMapper({ threadId: THREAD, runId: RUN })
    const stop = [
      ...stopped.map({ endpoint: 'linx', type: 'message.delta', payload: { messageId: MESSAGE, text: '一半' } }),
      ...stopped.map({ type: 'session.cancelled' }),
    ]
    assertWellFormed(stop)
    const terminal = stop.at(-1)
    assert.ok(terminal && terminal.type === 'RUN_FINISHED')
    assert.deepEqual(terminal.outcome, { type: 'cancelled' })
    assert.deepEqual(stopped.map({ endpoint: 'linx', type: 'message.delta', payload: { text: 'late' } }), [])
  })

  it('round-trips card surfaces and ignores other catalogs', () => {
    const operations = buildLinxCardSurface({ card: 'file', resource: 'https://alice.example/files/a.md', fallbackText: 'a.md', hints: { name: 'a.md' } })
    assert.equal((operations[0] as { createSurface: { catalogId: string } }).createSurface.catalogId, LINX_A2UI_CATALOG_ID)
    assert.deepEqual(readLinxCardSurface(operations), {
      card: 'file',
      resource: 'https://alice.example/files/a.md',
      fallbackText: 'a.md',
      hints: { name: 'a.md' },
    })
    assert.equal(readLinxCardSurface([{ version: 'v0.9', createSurface: { surfaceId: 's', catalogId: 'other' } }]), null)
    assert.equal(readLinxCardSurface('nope'), null)
  })

  it('maps ACP permission options to the R6 choices', () => {
    assert.equal(acpOptionKindToChoice('allow_once'), 'allow-once')
    assert.equal(acpOptionKindToChoice('allow_always'), 'delegate')
    assert.equal(acpOptionKindToChoice('reject_once'), 'reject')
    assert.equal(acpOptionKindToChoice('mystery'), null)
    const options = [
      { optionId: 'yes', kind: 'allow_once' },
      { optionId: 'always', kind: 'allow_always' },
      { optionId: 'no', kind: 'reject_once' },
    ]
    assert.equal(selectAcpOptionId(options, 'allow-once'), 'yes')
    assert.equal(selectAcpOptionId(options, 'delegate'), 'always')
    assert.equal(selectAcpOptionId(options, 'reject'), 'no')
    assert.equal(selectAcpOptionId([{ optionId: 'yes', kind: 'allow_once' }], 'delegate'), 'yes')
  })
})
