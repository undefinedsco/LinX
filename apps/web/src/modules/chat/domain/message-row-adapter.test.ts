import { describe, expect, it } from 'vitest'
import { projectMessageRow, projectMessageRows, readMessageBranchMetadata } from './message-row-adapter'

describe('message row adapter', () => {
  it('projects Pod roles, content, rich content, and status without changing ids', () => {
    const result = projectMessageRow({
      id: 'message-1', role: 'assistant', content: 'hello', richContent: '{"blocks":[]}',
      status: 'sent', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:01:00.000Z',
    } as any)
    expect(result).toMatchObject({ id: 'message-1', role: 'assistant', content: 'hello', richContent: '{"blocks":[]}', status: 'sent' })
  })

  it('normalizes unknown roles to user and preserves ordering', () => {
    expect(projectMessageRows([{ id: 'a', role: 'unknown' }, { id: 'b', role: 'system' }] as any).map((row) => [row.id, row.role]))
      .toEqual([['a', 'user'], ['b', 'system']])
  })

  it('reads branch metadata from persisted rich content without failing on legacy rows', () => {
    expect(readMessageBranchMetadata({ richContent: JSON.stringify({ parent_item_id: 'm-1', branch_id: 'branch-1', supersedes: 'm-1' }) } as any))
      .toEqual({ parentItemId: 'm-1', branchId: 'branch-1', supersedes: 'm-1' })
    expect(readMessageBranchMetadata({ richContent: 'legacy text' } as any)).toEqual({})
  })
})
