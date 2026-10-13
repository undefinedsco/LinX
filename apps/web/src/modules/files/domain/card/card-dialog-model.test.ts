import { describe, expect, it } from 'vitest'

import {
  formatCardTimestamp,
  parseCardTarget,
  planCardBodyWrite,
  planCardValueWrite,
  projectCardLocatorLabel,
  projectCardMediaKind,
  projectCardMediaSource,
  projectCardSiblingNavigation,
  projectCardUnpreviewableState,
} from './card-dialog-model'

describe('card dialog model', () => {
  it('splits a subject uri into document and fragment', () => {
    expect(parseCardTarget('https://pod/a.ttl#row1')).toEqual({
      uri: 'https://pod/a.ttl#row1',
      documentUri: 'https://pod/a.ttl',
      fragment: 'row1',
    })
    expect(parseCardTarget('https://pod/a.md').fragment).toBeNull()
  })

  it('detects media kinds from mime type or extension', () => {
    expect(projectCardMediaKind('audio/mpeg')).toBe('audio')
    expect(projectCardMediaKind(null, 'https://pod/x.PDF')).toBe('pdf')
    expect(projectCardMediaKind('text/plain', 'https://pod/x.txt')).toBeNull()
  })

  it('navigates siblings', () => {
    const nav = projectCardSiblingNavigation('b', ['a', 'b', 'c'])
    expect(nav).toMatchObject({ previousUri: 'a', nextUri: 'c', positionLabel: '2 / 3' })
    expect(projectCardSiblingNavigation('a', ['a']).positionLabel).toBeNull()
  })

  it('labels locators and builds media sources', () => {
    expect(projectCardLocatorLabel({ page: 3 })).toBe('第 3 页')
    expect(projectCardLocatorLabel({ timeSeconds: 75 })).toBe(formatCardTimestamp(75))
    expect(projectCardMediaSource('blob:x', 'pdf', { page: 3 })).toBe('blob:x#page=3')
    expect(projectCardMediaSource('blob:x', 'audio', { page: 3 })).toBe('blob:x')
  })

  it('plans writes only when something changed', () => {
    expect(planCardBodyWrite({ previousValueTokens: [], nextText: '  ' })).toBeNull()
    expect(planCardBodyWrite({ previousValueTokens: [], nextText: 'hi' })?.nextValues).toHaveLength(1)
    expect(planCardValueWrite({ previousValueTokens: [], nextText: '', wasResource: false })).toBeNull()
    expect(planCardValueWrite({ previousValueTokens: ['<https://a.b>'], nextText: 'https://c.d', wasResource: true })?.nextValues)
      .toEqual(['<https://c.d>'])
  })

  it('refuses oversized previews with a download action', () => {
    expect(projectCardUnpreviewableState({ name: 'a.mov', size: 30 * 1024 * 1024, hasSystemOpen: false }).action).toBe('download')
  })
})
