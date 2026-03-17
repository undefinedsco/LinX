import { describe, expect, it } from 'vitest'
import {
  getBuiltinDefaultModel,
  getBuiltinModel,
  getBuiltinModels,
  getBuiltinProvider,
} from '../src/discovery'

describe('discovery shared metadata', () => {
  it('normalizes provider aliases for builtin provider lookups', () => {
    expect(getBuiltinProvider('claude')?.slug).toBe('anthropic')
    expect(getBuiltinProvider('codex')?.slug).toBe('openai')
    expect(getBuiltinProvider('xai')?.slug).toBe('x-ai')
  })

  it('keeps provider base urls aligned with shared runtime defaults', () => {
    expect(getBuiltinProvider('anthropic')?.baseUrl).toBe('https://api.anthropic.com/v1')
    expect(getBuiltinProvider('google')?.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta')
    expect(getBuiltinProvider('ollama')).toMatchObject({
      slug: 'ollama',
      baseUrl: 'http://localhost:11434/v1',
      authType: 'none',
    })
  })

  it('normalizes provider ids when querying builtin models', () => {
    const defaultClaudeModel = getBuiltinDefaultModel('claude')

    expect(getBuiltinModels('claude').every((model) => model.provider === 'anthropic')).toBe(true)
    expect(defaultClaudeModel?.provider).toBe('anthropic')
    expect(defaultClaudeModel && getBuiltinModel('claude', defaultClaudeModel.id)?.provider).toBe('anthropic')
    expect(getBuiltinDefaultModel('xai')?.provider).toBe('x-ai')
  })
})
