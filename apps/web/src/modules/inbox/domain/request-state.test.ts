import { describe, expect, it } from 'vitest'
import { describeHandledElsewhere, isRequestExpired } from './request-state'

const now = new Date('2026-10-17T10:00:00.000Z')

describe('request availability', () => {
  it('expires only pending requests whose time has passed', () => {
    expect(isRequestExpired({ status: 'pending', expiresAt: '2026-10-17T09:00:00.000Z' }, now)).toBe(true)
    expect(isRequestExpired({ status: 'pending', expiresAt: '2026-10-17T11:00:00.000Z' }, now)).toBe(false)
    expect(isRequestExpired({ status: 'pending' }, now)).toBe(false)
    expect(isRequestExpired({ status: 'approved', expiresAt: '2026-10-17T09:00:00.000Z' }, now)).toBe(false)
  })

  it('says what happened to a request decided elsewhere', () => {
    expect(describeHandledElsewhere({ status: 'pending' })).toBeNull()
    expect(describeHandledElsewhere({ status: 'approved', decisionRole: 'human' })?.title).toBe('已在会话里批准')
    expect(describeHandledElsewhere({ status: 'rejected' })?.title).toBe('已在会话里拒绝')
    expect(describeHandledElsewhere({ status: 'approved', decisionRole: 'secretary' })?.title).toBe('已由 LinX 批准')
  })
})
