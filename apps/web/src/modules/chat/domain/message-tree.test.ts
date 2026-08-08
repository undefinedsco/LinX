import { describe, expect, it } from 'vitest'
import { cycleSibling, groupMessageSiblings, projectActiveMessagePath, selectSiblingIndex } from './message-tree'

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
})
