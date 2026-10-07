import { describe, expect, it } from 'vitest'
import {
  inferMarkdownLinkAnnotations,
  mergeChatKitAnnotations,
  normalizeModelAnnotations,
} from '../model-annotations'

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
    expect(normalizeModelAnnotations([
      { type: 'url_citation', url: '' },
      { type: 'url_citation', url: 'javascript:alert(1)' },
      { type: 'url_citation', url: 'data:text/html,unsafe' },
      { source: {} },
    ], 3)).toEqual([])
  })

  it('preserves citation descriptions and accepts direct Responses API fields', () => {
    expect(normalizeModelAnnotations([{
      type: 'url_citation',
      url: 'https://example.com/report',
      title: 'Report',
      description: 'Primary evidence',
      end_index: 12,
    }], 4)).toEqual([{
      index: 12,
      source: {
        type: 'url',
        url: 'https://example.com/report',
        title: 'Report',
        description: 'Primary evidence',
      },
    }])
  })

  it('infers safe Markdown sources for explicit search responses', () => {
    const text = '查看 [OpenAI Models](https://developers.openai.com/api/docs/models)。'
    expect(inferMarkdownLinkAnnotations(text)).toEqual([{
      index: text.indexOf(')') + 1,
      source: {
        type: 'url',
        url: 'https://developers.openai.com/api/docs/models',
        title: 'OpenAI Models',
      },
    }])
  })

  it('does not infer unsafe or bare URLs as citations', () => {
    expect(inferMarkdownLinkAnnotations('[bad](javascript:alert(1)) https://example.com')).toEqual([])
  })
})
