import { describe, expect, it } from 'vitest'
import { projectCodingRunLine, folderDisplayName } from './coding-run'
import { describeScheduleRepeat, buildCron, parseRepeatDraft } from './schedule-label'
import { orderChatListEntries, projectChatListEntry, unreadBadgeText } from './chat-list-model'
import { pickHeadlineTopic, projectTopicStatus } from './topic-status'
import { resolveChatIdentity } from './chat-identity'
import { formatListTime } from './list-time'

describe('coding run line', () => {
  it('offers 暂停 and 停止 while running and names the folder', () => {
    const line = projectCodingRunLine({
      status: 'active', tool: 'claude', folderName: '书店网站',
      activity: { label: '正在改报名表单', tone: 'running' },
    })
    expect(line.toolName).toBe('Claude Code')
    expect(line.text).toBe('在“书店网站”文件夹里')
    expect(line.detail).toBe('正在改报名表单')
    expect(line.actions).toEqual(['pause', 'stop'])
  })
  it('offers 继续 when paused and only copies the log when finished', () => {
    expect(projectCodingRunLine({ status: 'paused', tool: 'codex' }).actions).toEqual(['resume', 'stop'])
    expect(projectCodingRunLine({ status: 'completed', tool: 'codex', wasStopped: true }).text).toBe('已停止')
    expect(projectCodingRunLine({ status: 'error', tool: 'codex' }).actions).toEqual(['copyLog'])
  })
  it('takes the last folder segment', () => {
    expect(folderDisplayName('/Users/a/书店网站/')).toBe('书店网站')
  })
})

describe('schedule label', () => {
  it('says 每周一 9:00 and round-trips through cron', () => {
    expect(describeScheduleRepeat({ scheduleKind: 'cron', cron: '0 9 * * 1' })?.label).toBe('每周一 9:00')
    const draft = parseRepeatDraft('0 9 * * 1')!
    expect(buildCron(draft)).toBe('0 9 * * 1')
  })
})

describe('chat list model', () => {
  it('puts LinX 助手 first, then 标星, then recent', () => {
    const make = (id: string, over: object) => projectChatListEntry({
      id, title: id, kind: 'person', starred: false, muted: false, unreadCount: 0, isProtected: false, ...over,
    })
    const ordered = orderChatListEntries([
      make('old', { lastActiveAt: '2026-01-01' }),
      make('new', { lastActiveAt: '2026-02-01' }),
      make('star', { starred: true, lastActiveAt: '2025-01-01' }),
      make('linx', { isProtected: true }),
    ])
    expect(ordered.map((entry) => entry.id)).toEqual(['linx', 'star', 'new', 'old'])
  })
  it('caps unread badges and protects LinX 助手 from deletion', () => {
    expect(unreadBadgeText(120)).toBe('99+')
    const linx = projectChatListEntry({ id: 'x', title: 'LinX 助手', kind: 'assistant', starred: true, muted: false, unreadCount: 0, isProtected: true })
    expect(linx.canDelete).toBe(false)
    const group = projectChatListEntry({ id: 'g', title: '书店活动组', kind: 'group', starred: false, muted: false, unreadCount: 0, isProtected: false })
    expect(group.canLeave).toBe(true)
  })
  it('shows the latest message as preview, and greets instead of "还没有消息" for LinX 助手', () => {
    const base = { id: 'x', title: 'LinX 助手', kind: 'assistant' as const, starred: true, muted: false, unreadCount: 0, isProtected: true }
    expect(projectChatListEntry({ ...base, preview: '好，以后我叫LinX 助手。想先做点什么？' }).preview).toBe('好，以后我叫LinX 助手。想先做点什么？')
    expect(projectChatListEntry({ ...base, preview: null }).preview).toBe('想先做点什么？')
    expect(projectChatListEntry({ ...base, id: 'p', kind: 'person', isProtected: false }).preview).toBe('还没有消息')
  })
  it('formats 昨天', () => {
    const now = new Date('2026-10-12T10:00:00').getTime()
    expect(formatListTime('2026-10-11T23:00:00', now)).toBe('昨天')
  })
})

describe('topic status', () => {
  it('prefers things waiting on you and picks the headline topic', () => {
    expect(projectTopicStatus({ pendingApprovals: 1, runtime: { status: 'active', tool: 'claude' } })?.label).toBe('等你决定')
    expect(projectTopicStatus({ runtime: { status: 'active', tool: 'claude' } })?.label).toBe('Claude Code 在改')
    const headline = pickHeadlineTopic([
      { status: projectTopicStatus({ runtime: { status: 'active', tool: 'claude' } }), updatedAt: 2 },
      { status: projectTopicStatus({ pendingInputs: 1 }), updatedAt: 1 },
    ])
    expect(headline?.status?.label).toBe('等你回答')
  })
})

describe('chat identity', () => {
  it('is a group with several counterparts and an assistant by its contact', () => {
    const base = { selfWebId: 'me', isSecretary: false, findContact: () => null }
    expect(resolveChatIdentity({ ...base, chat: { id: 'c', title: '书店活动组', participants: ['me', 'a', 'b'] } }).kind).toBe('group')
    const assistant = resolveChatIdentity({
      ...base,
      chat: { id: 'c', title: 'x', participants: ['me', 'a'] },
      findContact: () => ({ id: 'a', name: '活动小助手', isAssistant: true, isGroup: false }),
    })
    expect(assistant.kind).toBe('assistant')
    expect(assistant.name).toBe('活动小助手')
  })
})
