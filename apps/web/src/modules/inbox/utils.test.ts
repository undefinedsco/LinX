import { describe, expect, it } from 'vitest'
import { countActionableInboxItems, filterInboxItems, isActionableInboxItem } from './utils'

const approvalPending = {
  id: 'approval:1',
  kind: 'approval' as const,
  category: 'approval' as const,
  status: 'pending',
}

const approvalResolved = {
  id: 'approval:2',
  kind: 'approval' as const,
  category: 'approval' as const,
  status: 'approved',
}

const authRequired = {
  id: 'audit:1',
  kind: 'audit' as const,
  category: 'auth_required' as const,
  status: 'pending',
}

const authResolved = {
  id: 'audit:1-resolved',
  kind: 'audit' as const,
  category: 'auth_required' as const,
  status: 'resolved',
}

const auditOnly = {
  id: 'audit:2',
  kind: 'audit' as const,
  category: 'audit' as const,
}

describe('inbox utils', () => {
  it('treats pending approval and auth-required as actionable', () => {
    expect(isActionableInboxItem(approvalPending)).toBe(true)
    expect(isActionableInboxItem(authRequired)).toBe(true)
    expect(isActionableInboxItem(authResolved)).toBe(false)
    expect(isActionableInboxItem(approvalResolved)).toBe(false)
    expect(isActionableInboxItem(auditOnly)).toBe(false)
  })

  it('filters pending view to actionable items only', () => {
    const items = [approvalPending, approvalResolved, authRequired, authResolved, auditOnly]

    expect(filterInboxItems(items, 'pending')).toEqual([approvalPending, authRequired])
    expect(filterInboxItems(items, 'audit')).toEqual([authRequired, authResolved, auditOnly])
    expect(filterInboxItems(items, 'all')).toEqual(items)
  })

  it('counts actionable items for inbox badges', () => {
    expect(countActionableInboxItems([approvalPending, approvalResolved, authRequired, authResolved, auditOnly])).toBe(2)
  })
})
