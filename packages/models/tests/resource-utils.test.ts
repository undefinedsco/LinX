import { describe, expect, it } from 'vitest'
import { extractApprovalIdFromApprovalRef } from '../src/approval.schema'

describe('resource reference helpers', () => {
  it('extracts approval ids only from approval resources', () => {
    expect(extractApprovalIdFromApprovalRef('approval-1')).toBe('approval-1')
    expect(extractApprovalIdFromApprovalRef('https://alice.example/.data/approvals/2026/05/12.ttl#approval-1')).toBe('approval-1')

    expect(extractApprovalIdFromApprovalRef('https://alice.example/.data/workspaces/ws-1/output/report.md')).toBeNull()
    expect(extractApprovalIdFromApprovalRef('https://alice.example/.data/audits/2026/05/12.ttl#audit-1')).toBeNull()
  })
})
