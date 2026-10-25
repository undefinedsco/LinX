import { describe, expect, it } from 'vitest'

import { projectStructuredClassScope, projectStructuredResourceTable } from '../structured/structured-table'
import {
  cardBodyLeadsWithTitle,
  parseCardPodLink,
  projectCardLineQuote,
  findCardLocatorLines,
  formatCardTimestamp,
  projectCardExcerptNote,
  projectCardLocatorLink,
  projectCardQuotedPrompt,
  projectCardDocumentOverview,
  projectCardSubjectModel,
  projectCardColumns,
  projectCardRowClass,
  planCardColumnWrite,
  parseCardTarget,
  planCardBodyWrite,
  planCardValueWrite,
  projectCardLocatorLabel,
  projectCardMediaKind,
  projectCardMediaSource,
  projectCardSiblingNavigation,
  projectCardUnpreviewableState,
} from './card-dialog-model'

describe('links inside a card body', () => {
  const root = 'https://pod.example/test/'

  it('reads a link into the Pod as a card with the cited line', () => {
    expect(parseCardPodLink('https://pod.example/test/%E4%BC%9A%E8%AE%AE.md#line=3', root)).toEqual({
      uri: 'https://pod.example/test/%E4%BC%9A%E8%AE%AE.md',
      locator: { line: 3 },
    })
    expect(parseCardPodLink('https://pod.example/test/a.pdf#page=2', root)?.locator).toEqual({ page: 2 })
    expect(parseCardPodLink('https://pod.example/test/a.ttl#row1', root)).toEqual({ uri: 'https://pod.example/test/a.ttl#row1' })
  })

  it('leaves other sites, other pods and a missing pod alone', () => {
    expect(parseCardPodLink('https://example.com/test/a.md', root)).toBeNull()
    expect(parseCardPodLink('https://pod.example/other/a.md', root)).toBeNull()
    expect(parseCardPodLink('not a url', root)).toBeNull()
    expect(parseCardPodLink('https://pod.example/test/a.md', null)).toBeNull()
  })

  it('finds the words of a cited line without markdown marks', () => {
    expect(projectCardLineQuote('# 标题\n\n- **维护**成本太高\n', 3)).toBe('维护成本太高')
    expect(projectCardLineQuote('a\nb', 9)).toBeNull()
    expect(projectCardLineQuote('a', undefined)).toBeNull()
  })

  it('knows when the body already starts with the title', () => {
    expect(cardBodyLeadsWithTitle('# 会议纪要\n\n正文', '会议纪要')).toBe(true)
    expect(cardBodyLeadsWithTitle('\n# 维护成本\n> 引用', '维护成本 10-24')).toBe(true)
    expect(cardBodyLeadsWithTitle('# 别的标题\n正文', '会议纪要')).toBe(false)
    expect(cardBodyLeadsWithTitle('正文\n# 会议纪要', '会议纪要')).toBe(false)
    expect(cardBodyLeadsWithTitle('', '会议纪要')).toBe(false)
  })
})

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

describe('projectNewCardMessage', () => {
  it('explains why a new card could not be made', async () => {
    const { projectNewCardMessage } = await import('./card-dialog-model')
    expect(projectNewCardMessage('duplicate')).toBe('已经有同名的卡片了，换个名字吧')
    expect(projectNewCardMessage('empty')).toBe('先给卡片起个名字')
    expect(projectNewCardMessage('unavailable')).toBe('没能创建这张卡片，稍后再试')
  })
})

describe('a card whose address is spelled two ways', () => {
  it('finds the row by either spelling and keeps the address the document uses', async () => {
    const { projectCardSubjectModel } = await import('./card-dialog-model')
    const { projectStructuredResourceTable } = await import('../structured/structured-table')
    const doc = 'https://pod.example/%E6%83%B3%E6%B3%95.ttl'
    const projection = projectStructuredResourceTable({
      uri: doc,
      mimeType: 'text/turtle',
      source: '<https://pod.example/%E6%83%B3%E6%B3%95.ttl#周末读书会> a <http://schema.org/Thing> .',
    })
    for (const requested of [`${doc}#周末读书会`, `${doc}#%E5%91%A8%E6%9C%AB%E8%AF%BB%E4%B9%A6%E4%BC%9A`]) {
      const model = projectCardSubjectModel({ projection, documentUri: doc, subjectIri: requested })
      expect(model?.subjectIri).toBe(`${doc}#周末读书会`)
      expect(model?.title).toBe('周末读书会')
    }
  })
})

describe('a card body is not a table column', () => {
  const uri = 'https://pod.example/cards/t.ttl'
  const source = `@prefix schema: <http://schema.org/>.
@prefix udfs: <https://undefineds.co/vocab/>.
<#a> a schema:Thing; schema:name "旧卡"; schema:text "早先存的正文"; schema:author "我".
<#b> a schema:Thing; schema:name "新卡"; udfs:body "新正文"; schema:author "你".`
  const projection = projectStructuredResourceTable({ uri, mimeType: 'text/turtle', source })

  it('keeps both the current and the earlier body predicate out of the columns', () => {
    const scoped = projectStructuredClassScope(projection, 'schema:Thing')
    expect(scoped.predicates).toContain('schema:author')
    expect(scoped.predicates).not.toContain('schema:text')
    expect(scoped.predicates).not.toContain('udfs:body')
  })

  it('still reads the body from either spelling and writes new bodies to the dedicated predicate', () => {
    expect(projectCardSubjectModel({ projection, documentUri: uri, subjectIri: `${uri}#a` })).toMatchObject({
      bodyPredicate: 'http://schema.org/text',
      bodyText: '早先存的正文',
    })
    expect(projectCardSubjectModel({ projection, documentUri: uri, subjectIri: `${uri}#b` })).toMatchObject({
      bodyPredicate: 'https://undefineds.co/vocab/body',
      bodyText: '新正文',
    })
    const empty = projectStructuredResourceTable({ uri, mimeType: 'text/turtle', source: '<#c> <http://schema.org/name> "空卡".' })
    expect(projectCardSubjectModel({ projection: empty, documentUri: uri, subjectIri: `${uri}#c` })?.bodyPredicate)
      .toBe('https://undefineds.co/vocab/body')
  })

  it('does not list the body among the properties', () => {
    const model = projectCardSubjectModel({ projection, documentUri: uri, subjectIri: `${uri}#b` })
    expect(model?.properties.map((property) => property.label)).not.toContain('正文')
  })
})

describe('the table columns as the card properties', () => {
  const uri = 'https://pod.example/cards/t.ttl'
  const source = `@prefix schema: <http://schema.org/>.
@prefix udfs: <https://undefineds.co/vocab/>.
@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
<#a> a schema:Thing; schema:name "旧卡"; schema:text "正文"; udfs:stage "进行中"; udfs:score 5; udfs:done true; udfs:due "2026-10-01"^^xsd:date; schema:url <https://a.example/>.
<#b> a schema:Thing; schema:name "新卡"; udfs:stage "待办".`
  const projection = projectStructuredResourceTable({ uri, mimeType: 'text/turtle', source })
  const subject = (id: string) => projectCardSubjectModel({ projection, documentUri: uri, subjectIri: `${uri}#${id}` })!
  const columns = (id: string) => projectCardColumns({ projection, documentUri: uri, subject: subject(id) })
  const find = (id: string, suffix: string) => columns(id).find((column) => column.predicate.endsWith(suffix))!

  it('lists every column of the table, also the ones this card has no value for, never the title or body', () => {
    const predicates = columns('b').map((column) => column.predicate)
    expect(predicates).toEqual(expect.arrayContaining([
      'https://undefineds.co/vocab/stage',
      'https://undefineds.co/vocab/score',
      'https://undefineds.co/vocab/due',
      'http://schema.org/url',
    ]))
    expect(predicates).not.toContain('http://schema.org/name')
    expect(predicates).not.toContain('http://schema.org/text')
    expect(predicates).not.toContain('https://undefineds.co/vocab/body')
    expect(find('b', '/score').valueTokens).toEqual([])
  })

  it('picks the table cell editor by the value', () => {
    expect(find('a', '/score')).toMatchObject({ editorKind: 'number', editorValues: ['5'], isResource: false })
    expect(find('a', '/done')).toMatchObject({ editorKind: 'boolean', editorValues: ['true'] })
    expect(find('a', '/due')).toMatchObject({ editorKind: 'date', editorValues: ['2026-10-01'] })
    expect(find('a', '/url')).toMatchObject({ editorKind: 'relation', editorValues: ['https://a.example/'] })
    expect(find('a', '/stage')).toMatchObject({ editorKind: 'text', editorValues: ['进行中'] })
  })

  it('turns what the editor commits into patch tokens, and nothing when unchanged', () => {
    const prefixes = projection.prefixes
    const plan = (suffix: string, nextTokens: string[]) => planCardColumnWrite({ column: find('a', suffix), nextTokens, documentUri: uri, prefixes })
    expect(plan('/score', ['7'])).toEqual({ previousValues: ['5'], nextValues: ['7'] })
    expect(plan('/score', ['5'])).toBeNull()
    expect(plan('/done', ['false'])).toEqual({ previousValues: ['true'], nextValues: ['false'] })
    expect(plan('/due', ['"2026-11-02"^^xsd:date'])?.nextValues).toEqual(['"2026-11-02"^^<http://www.w3.org/2001/XMLSchema#date>'])
    expect(plan('/stage', ['"完成"'])?.nextValues).toEqual(['"完成"'])
    expect(plan('/url', ['<https://b.example/>'])?.nextValues).toEqual(['<https://b.example/>'])
  })

  it('names the class a card is typed with, for the columns it adds', () => {
    expect(projectCardRowClass(projection, uri, `${uri}#a`)).toBe('schema:Thing')
  })
})
