import { describe, expect, it } from 'vitest'
import { buildRuntimeToolResponse } from './collections'

describe('buildRuntimeToolResponse', () => {
  it('emits an approval decision payload', () => {
    expect(buildRuntimeToolResponse('approved', '  ok  ')).toBe(JSON.stringify({
      decision: 'approved',
      reason: 'ok',
      source: 'linx-inbox',
    }))
  })

  it('emits a rejection decision payload', () => {
    expect(buildRuntimeToolResponse('rejected', '  no  ')).toBe(JSON.stringify({
      decision: 'rejected',
      reason: 'no',
      source: 'linx-inbox',
    }))
  })

  it('normalizes empty reasons to null', () => {
    expect(buildRuntimeToolResponse('approved', undefined)).toBe(JSON.stringify({
      decision: 'approved',
      reason: null,
      source: 'linx-inbox',
    }))
  })
})
