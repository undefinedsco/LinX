import { describe, expect, it } from 'vitest'
import {
  normalizeMessageCitation,
  renderCitedSourceBlock,
  setComposerCitation,
  takeComposerCitation,
  withCitedSource,
} from './message-citation'

describe('message citation', () => {
  it('keeps source and locator, drops junk', () => {
    expect(normalizeMessageCitation({ sourceUri: ' https://p/a.pdf ', title: 'a', locator: { page: 2, quote: '原文', x: 1, line: 'no' } }))
      .toEqual({ sourceUri: 'https://p/a.pdf', title: 'a', locator: { page: 2, quote: '原文' } })
    expect(normalizeMessageCitation({ title: 'no source' })).toBeNull()
    expect(normalizeMessageCitation('x')).toBeNull()
  })

  it('renders a cited source block after the text for the model', () => {
    const citation = { sourceUri: 'https://p/a.pdf', locator: { page: 3, quote: '第三条' } }
    const text = withCitedSource('这是什么意思', citation)
    expect(text).toBe(`这是什么意思\n\n${renderCitedSourceBlock(citation)}`)
    expect(text).toContain('uri: https://p/a.pdf')
    expect(text).toContain('page: 3')
    expect(text).toContain('quote: 第三条')
    expect(withCitedSource('hi', undefined)).toBe('hi')
  })

  it('hands the composer citation to one send only', () => {
    setComposerCitation({ sourceUri: 'https://p/a.pdf' })
    expect(takeComposerCitation()).toEqual({ sourceUri: 'https://p/a.pdf' })
    expect(takeComposerCitation()).toBeNull()
  })
})
