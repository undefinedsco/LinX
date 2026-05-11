import { describe, expect, it } from 'vitest'
import { buildRuntimeToolResponse } from './collections'

describe('buildRuntimeToolResponse', () => {
  it('emits approve_pattern command when approved with grant pattern', () => {
    expect(buildRuntimeToolResponse('approved', '  ok  ', ' shell:git status ')).toBe(JSON.stringify({
      decision: 'approved',
      reason: 'ok',
      command: 'approve_pattern',
      pattern: 'shell:git status',
      source: 'linx-inbox',
    }))
  })

  it('omits grant command when rejected or empty pattern', () => {
    expect(buildRuntimeToolResponse('rejected', '  no  ', ' shell:git status ')).toBe(JSON.stringify({
      decision: 'rejected',
      reason: 'no',
      source: 'linx-inbox',
    }))

    expect(buildRuntimeToolResponse('approved', undefined, '   ')).toBe(JSON.stringify({
      decision: 'approved',
      reason: null,
      source: 'linx-inbox',
    }))
  })
})
