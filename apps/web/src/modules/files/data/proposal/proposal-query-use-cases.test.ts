import { describe, expect, it, vi } from 'vitest'

vi.mock('../pod-adapter', () => ({
  readRawTextResource: vi.fn(async (_db: unknown, uri: string) => ({ uri, content: uri })),
}))

import { proposalQueryUseCases } from './proposal-query-use-cases'

describe('pending proposal order', () => {
  it('returns proposals oldest first, whatever order the Pod lists approvals in', async () => {
    const approval = (name: string, createdAt: Date) => ({
      status: 'pending', toolName: 't', action: 'a', target: `https://pod.example/.data/proposals/${name}.ttl`, createdAt,
    })
    const result = await proposalQueryUseCases.fetchPendingProposals({} as any, {
      toolName: 't',
      action: 'a',
      parse: (_source, uri) => uri.split('/').pop(),
      isMatch: () => true,
      // 金额 was entered last, 状态 first; the Pod hands them back newest first.
      fetchApprovals: async () => [
        approval('金额', new Date('2026-01-01T00:00:03Z')),
        approval('截止', new Date('2026-01-01T00:00:02Z')),
        approval('状态', new Date('2026-01-01T00:00:01Z')),
      ],
    })
    expect(result).toEqual(['状态.ttl', '截止.ttl', '金额.ttl'])
  })
})
