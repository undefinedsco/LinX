import { describe, expect, it } from 'vitest'
import {
  canOpenFavoriteSource,
  canShowFavoriteSnapshot,
  classifyFavoriteSourceResponse,
  isCheckableFavoriteTarget,
  splitFavoriteTarget,
} from './source-status'

describe('favorite source status', () => {
  it('only checks targets that are real web resources', () => {
    expect(isCheckableFavoriteTarget('https://pod.example/chats/a.ttl#m1')).toBe(true)
    expect(isCheckableFavoriteTarget('chat-1')).toBe(false)
    expect(isCheckableFavoriteTarget(null)).toBe(false)
  })

  it('splits the document from the fragment', () => {
    expect(splitFavoriteTarget('https://pod.example/a.ttl#m1')).toEqual({ documentUrl: 'https://pod.example/a.ttl', fragment: 'm1' })
    expect(splitFavoriteTarget('https://pod.example/a.ttl')).toEqual({ documentUrl: 'https://pod.example/a.ttl', fragment: null })
  })

  it('separates deleted, withdrawn and temporarily unreachable originals', () => {
    expect(classifyFavoriteSourceResponse({ status: 404, body: null, fragment: null })).toBe('deleted')
    expect(classifyFavoriteSourceResponse({ status: 410, body: null, fragment: null })).toBe('deleted')
    expect(classifyFavoriteSourceResponse({ status: 403, body: null, fragment: null })).toBe('forbidden')
    expect(classifyFavoriteSourceResponse({ status: 401, body: null, fragment: null })).toBe('forbidden')
    expect(classifyFavoriteSourceResponse({ status: 503, body: null, fragment: null })).toBe('unreachable')
  })

  it('treats a message missing from a surviving document as deleted', () => {
    expect(classifyFavoriteSourceResponse({ status: 200, body: '<#m2> a :Message .', fragment: 'm1' })).toBe('deleted')
    expect(classifyFavoriteSourceResponse({ status: 200, body: '<#m1> a :Message .', fragment: 'm1' })).toBe('available')
    expect(classifyFavoriteSourceResponse({ status: 200, body: null, fragment: null })).toBe('available')
  })

  it('never shows content for deleted or withdrawn originals', () => {
    expect(canShowFavoriteSnapshot('deleted')).toBe(false)
    expect(canShowFavoriteSnapshot('forbidden')).toBe(false)
    expect(canShowFavoriteSnapshot('checking')).toBe(false)
    expect(canShowFavoriteSnapshot('offline')).toBe(true)
    expect(canShowFavoriteSnapshot('available')).toBe(true)
    expect(canOpenFavoriteSource('offline')).toBe(false)
    expect(canOpenFavoriteSource('available')).toBe(true)
  })
})
