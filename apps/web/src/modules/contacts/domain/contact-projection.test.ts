import { describe, expect, it } from 'vitest'
import { ContactClass, ContactGender, ContactType, type ContactRow } from '@undefineds.co/models'
import {
  buildContactListProjection,
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

  it('builds stable starred, group, agent, and alphabetical sections', () => {
    const contacts = [
      contact({ id: 'z', name: 'Zed' }),
      contact({ id: 'star', name: 'Alice', starred: true }),
      contact({ id: 'agent', name: 'Helper', contactType: ContactType.AGENT, rdfType: ContactClass.AGENT }),
      contact({ id: 'group', name: 'Team', rdfType: ContactClass.GROUP }),
    ]
    const groupInfoById = new Map([
      ['group', { memberCount: 2, isOwner: true, memberPreview: ['Alice', 'Zed'] }],
    ])

    const projection = buildContactListProjection(contacts, {
      filter: 'all',
      groupInfoById,
    })

    expect(projection.sections.map((section) => section.title)).toEqual([
      '星标朋友',
      '群组 (1)',
      'AI 助手 (1)',
      'Z',
    ])
    expect(projection.letters).toEqual(['⭐', '群', 'AI', 'Z'])
    expect(projection.sections[1]?.items[0]?.groupInfo).toEqual(groupInfoById.get('group'))
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
