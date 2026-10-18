import { describe, expect, it } from 'vitest'

import { projectStructuredResourceTable } from '../structured/structured-table'
import {
  findCardLocatorLines,
  formatCardTimestamp,
  projectCardExcerptNote,
  projectCardLocatorLink,
  projectCardQuotedPrompt,
  projectCardDocumentOverview,
  projectCardSubjectModel,
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

  it('opens a profile document on the person it is about', () => {
    const uri = 'https://pod.example/profile/card'
    const projection = projectStructuredResourceTable({
      uri,
      mimeType: 'text/turtle',
      source: `@prefix foaf: <http://xmlns.com/foaf/0.1/>.
@prefix vcard: <http://www.w3.org/2006/vcard/ns#>.
<> a foaf:PersonalProfileDocument; foaf:maker <#me>; foaf:primaryTopic <#me>.
<#me> a foaf:Person; foaf:name "小明"; foaf:nick "明明"; vcard:note "你好"; vcard:hasPhoto <https://img.example/a.png>.`,
    })
    const overview = projectCardDocumentOverview({ projection, documentUri: uri })
    expect(overview.mainSubjectIri).toBe(`${uri}#me`)
    const model = projectCardSubjectModel({ projection, documentUri: uri, subjectIri: `${uri}#me` })
    expect(model).toMatchObject({ title: '小明', bodyText: '你好', photoUri: 'https://img.example/a.png' })
    expect(model?.properties.map((property) => property.label)).toContain('昵称')
  })

  it('starts media at the cited moment', () => {
    expect(projectCardMediaSource('blob:x', 'audio', { timeSeconds: 220 })).toBe('blob:x#t=220')
    expect(projectCardMediaSource('blob:x', 'video', { timeSeconds: 0 })).toBe('blob:x')
  })

  it('finds the cited lines in a text file', () => {
    const text = 'a\nb\nc\nd'
    expect(findCardLocatorLines(text, { line: 3 })).toEqual({ start: 3, end: 3 })
    expect(findCardLocatorLines(text, { quote: 'c\nd' })).toEqual({ start: 3, end: 4 })
    expect(findCardLocatorLines(text, { quote: 'zzz' })).toBeNull()
    expect(findCardLocatorLines(text, null)).toBeNull()
  })

  it('builds the selection actions', () => {
    expect(projectCardLocatorLink('https://p/a.pdf', { page: 3 })).toBe('https://p/a.pdf#page=3')
    expect(projectCardQuotedPrompt({ title: '场地合同.pdf', quote: '押金 500 元', locatorLabel: '第 3 页' }))
      .toBe('关于「场地合同.pdf」第 3 页里的这段：\n> 押金 500 元\n\n')
    const note = projectCardExcerptNote({ title: '场地合同.pdf', quote: '押金 500 元', sourceUri: 'https://p/a.pdf#page=3', locatorLabel: '第 3 页', now: new Date(2026, 8, 16) })
    expect(note.fileName).toBe('押金 500 元 9-16.md')
    expect(note.content).toContain('来源：[场地合同.pdf · 第 3 页](https://p/a.pdf#page=3)')
  })
})
