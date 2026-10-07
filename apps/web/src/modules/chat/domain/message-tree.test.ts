import { describe, expect, it } from 'vitest'
import { cycleSibling, findLatestBranchNavigation, groupMessageSiblings, projectActiveMessagePath, selectSiblingIndex } from './message-tree'

describe('message tree', () => {
  it('groups edited answers under the same parent and keeps root messages separate', () => {
    const groups = groupMessageSiblings([
      { id: 'root', createdAt: '2026-01-01' },
      { id: 'answer-a', parentItemId: 'root', branchId: 'a', createdAt: '2026-01-01' },
      { id: 'answer-b', parentItemId: 'root', branchId: 'b', createdAt: '2026-01-02' },
    ])
    expect(groups).toHaveLength(2)
    expect(groups.find((group) => group.parentItemId === 'root')?.items.map((item) => item.id)).toEqual(['answer-a', 'answer-b'])
  })

  it('orders versions by timestamp across calendar boundaries', () => {
    const group = groupMessageSiblings([
      { id: 'february', parentItemId: 'question', createdAt: new Date('2026-02-01T00:00:00Z') },
      { id: 'january', parentItemId: 'question', createdAt: new Date('2026-01-31T23:59:59Z') },
    ]).find((item) => item.parentItemId === 'question')!
    expect(group.items.map((item) => item.id)).toEqual(['january', 'february'])
  })

  it('cycles through sibling versions like ChatGPT 1/2 navigation', () => {
    const group = groupMessageSiblings([
      { id: 'a', parentItemId: 'question', createdAt: '2026-01-01' },
      { id: 'b', parentItemId: 'question', createdAt: '2026-01-02' },
    ]).find((item) => item.parentItemId === 'question')!
    expect(selectSiblingIndex(group, 'b')).toBe(1)
    expect(cycleSibling(group, 'b', 1)).toBe('a')
    expect(cycleSibling(group, 'a', -1)).toBe('b')
  })

  it('projects one visible path through nested message branches', () => {
    const messages = [
      { id: 'question' },
      { id: 'answer-a', parentItemId: 'question' },
      { id: 'answer-b', parentItemId: 'question' },
      { id: 'follow-up', parentItemId: 'answer-b' },
    ]
    expect(projectActiveMessagePath(messages, { question: 'answer-b' }).map((item) => item.id))
      .toEqual(['question', 'answer-b', 'follow-up'])
  })

  it('keeps navigation on the latest branching point without changing the latest edit target', () => {
    const users = [
      { id: 'original', parentItemId: 'branch-root', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'edited', parentItemId: 'branch-root', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'later', createdAt: '2026-01-02T00:00:00Z' },
    ]
    const answers = [
      { id: 'answer-1', parentItemId: 'edited', createdAt: '2026-01-01T00:00:01Z' },
      { id: 'answer-2', parentItemId: 'edited', createdAt: '2026-01-01T00:00:02Z' },
    ]
    const navigation = findLatestBranchNavigation(
      users.map((item) => item.id),
      groupMessageSiblings(users),
      groupMessageSiblings(answers),
      { 'branch-root': 'edited', edited: 'answer-2' },
    )
    expect(navigation?.userId).toBe('edited')
    expect(navigation?.messageGroup?.items).toHaveLength(2)
    expect(navigation?.answerGroup?.items).toHaveLength(2)
    expect(users.at(-1)?.id).toBe('later')
  })
})
