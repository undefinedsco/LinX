import { describe, expect, it } from 'vitest'
import { ContactClass, ContactGender, ContactType, type ContactRow } from '@undefineds.co/models'
import {
  buildContactListProjection,
  buildRecentFriends,
  getContactInitial,
  formatModelLabel,
  projectContact,
  projectContactDetail,
} from './contact-projection'

function contact(overrides: Partial<ContactRow> & Pick<ContactRow, 'id' | 'name'>): ContactRow {
  return {
    contactType: ContactType.SOLID,
    createdAt: new Date('2026-07-12T00:00:00Z'),
    updatedAt: new Date('2026-07-12T00:00:00Z'),
    ...overrides,
  } as ContactRow
}

describe('contact projections', () => {
  it('projects model-backed classification, labels, initials, and normalized gender', () => {
    const projected = projectContact(contact({
      id: 'agent-1',
      name: 'Assistant',
      alias: 'Builder',
      rdfType: ContactClass.AGENT,
      contactType: ContactType.AGENT,
      gender: null,
      avatarUrl: 'https://example.com/avatar.png',
    }))

    expect(projected).toMatchObject({
      id: 'agent-1',
      displayName: 'Builder',
      displayAvatar: 'https://example.com/avatar.png',
      initial: 'B',
      sourceType: 'agent',
      gender: ContactGender.BOT,
    })
  })

  it('mixes people and assistants into one A–Z list and keeps groups behind 群聊', () => {
    const contacts = [
      contact({ id: 'z', name: 'Zed' }),
      contact({ id: 'chen', name: '陈一' }),
      contact({ id: 'agent', name: 'Helper', contactType: ContactType.AGENT, rdfType: ContactClass.AGENT }),
      contact({ id: 'zhou', name: '周禾', starred: true }),
      contact({ id: 'group', name: 'Team', rdfType: ContactClass.GROUP }),
    ]
    const groupInfoById = new Map([
      ['group', { memberCount: 2, isOwner: true, memberPreview: ['Alice', 'Zed'] }],
    ])

    const projection = buildContactListProjection(contacts, { groupInfoById })

    expect(projection.sections.map((section) => section.title)).toEqual(['C', 'H', 'Z'])
    expect(projection.letters).toEqual(['C', 'H', 'Z'])
    expect(projection.sections[2]?.items.map((item) => item.id)).toEqual(['z', 'zhou'])
    expect(projection.sections[1]?.items[0]?.sourceType).toBe('agent')
    expect(projection.groups.map((group) => group.id)).toEqual(['group'])
    expect(projection.groups[0]?.groupInfo).toEqual(groupInfoById.get('group'))
  })

  it('files Chinese names under their pinyin letter and everything else under #', () => {
    expect(getContactInitial('陈一')).toBe('C')
    expect(getContactInitial('宋青')).toBe('S')
    expect(getContactInitial('许安')).toBe('X')
    expect(getContactInitial('周禾')).toBe('Z')
    expect(getContactInitial('alice')).toBe('A')
    expect(getContactInitial('1password')).toBe('#')
  })

  it('lists recently added people as 新的朋友 and leaves out assistants, groups and old contacts', () => {
    const now = new Date('2026-07-20T00:00:00Z')
    const recent = buildRecentFriends([
      contact({ id: 'new', name: 'New', createdAt: new Date('2026-07-18T00:00:00Z') }),
      contact({ id: 'old', name: 'Old', createdAt: new Date('2026-01-01T00:00:00Z') }),
      contact({ id: 'agent', name: 'Bot', contactType: ContactType.AGENT, rdfType: ContactClass.AGENT }),
      contact({ id: 'group', name: 'Team', rdfType: ContactClass.GROUP }),
    ], now)

    expect(recent.map((friend) => friend.id)).toEqual(['new'])
  })

  it('projects detail data without redefining shared contact or agent rows', () => {
    const projected = projectContactDetail(
      contact({ id: 'agent-1', name: 'Assistant', contactType: ContactType.AGENT }),
      { id: 'agents/agent-1/', model: 'gpt-5', instructions: 'Help', tools: ['search'] },
    )

    expect(projected.agentConfig).toMatchObject({
      id: 'agents/agent-1/',
      model: 'gpt-5',
      instructions: 'Help',
      tools: ['search'],
    })
  })
})

describe('formatModelLabel', () => {
  it('shows the model name instead of its provider resource IRI', () => {
    expect(formatModelLabel('http://localhost:44180/test/settings/providers/undefineds.ttl#linx-lite')).toBe('linx-lite')
    expect(formatModelLabel('https://pod.example/settings/models/gpt-4o')).toBe('gpt-4o')
    expect(formatModelLabel('openai/gpt-4o')).toBe('openai/gpt-4o')
    expect(formatModelLabel('')).toBeNull()
    expect(formatModelLabel(undefined)).toBeNull()
  })
})
