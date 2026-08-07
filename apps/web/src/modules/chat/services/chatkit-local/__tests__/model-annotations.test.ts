import { describe, expect, it } from 'vitest'
import { mergeChatKitAnnotations, normalizeModelAnnotations } from '../model-annotations'

describe('ChatKit model annotations', () => {
  it('normalizes nested OpenAI URL citations for ChatKit', () => {
    expect(normalizeModelAnnotations([{
      type: 'url_citation',
      url_citation: {
        url: 'https://example.com/source',
        title: 'Primary source',
        end_index: 42,
      },
    }], 10)).toEqual([{
      index: 42,
      source: {
        type: 'url',
        url: 'https://example.com/source',
        title: 'Primary source',
      },
    }])
  })

  it('accepts ChatKit source objects and deduplicates streamed repeats', () => {
    const annotation = normalizeModelAnnotations([{
      index: 8,
      source: { type: 'url', url: 'https://example.com', title: 'Example' },
    }], 0)[0]!

    expect(mergeChatKitAnnotations([annotation], [annotation])).toEqual([annotation])
  })

  it('drops malformed annotations instead of exposing invalid links', () => {
    expect(normalizeModelAnnotations([{ type: 'url_citation', url: '' }, { source: {} }], 3)).toEqual([])
  })
})
