import { describe, expect, it } from 'vitest'
import { classifyRuntimeTool } from './runtime-tool-category'

describe('classifyRuntimeTool', () => {
  it.each([
    ['web_search', 'search'],
    ['ReadFile', 'read'],
    ['apply_patch', 'write'],
    ['shell_command', 'execute'],
    ['request_approval', 'other'],
  ] as const)('classifies %s as %s', (name, category) => {
    expect(classifyRuntimeTool(name)).toBe(category)
  })

  it('uses the first matching category for compound tool names', () => {
    expect(classifyRuntimeTool('search_and_read')).toBe('search')
  })
})
