import { describe, expect, it } from 'vitest'
import { BodyIndex, projectBodyCoverageNote, tokenizeBody, type BodyDoc } from './body-index'
import { bodyStamp, hashBodyText, isBodyReadable, normalizeBodyText } from './body-text'

function doc(uri: string, text: string, stamp = '1'): BodyDoc {
  return { uri, title: uri.split('/').pop() ?? uri, text, hash: hashBodyText(text), stamp }
}

describe('body text', () => {
  it('only reads cheap text files', () => {
    const base = { kind: 'resource', semanticKind: 'file', name: 'a.md', mimeType: 'text/markdown', size: 100 }
    expect(isBodyReadable(base)).toBe(true)
    expect(isBodyReadable({ ...base, name: 'b.txt', mimeType: null })).toBe(true)
    expect(isBodyReadable({ ...base, name: 'c.pdf', mimeType: 'application/pdf' })).toBe(false)
    expect(isBodyReadable({ ...base, size: 5_000_000 })).toBe(false)
    expect(isBodyReadable({ ...base, semanticKind: 'meta-sidecar' })).toBe(false)
    expect(isBodyReadable({ ...base, kind: 'container' })).toBe(false)
  })

  it('drops source-block markers but keeps line numbers', () => {
    const text = normalizeBodyText('<!-- linx-source-block id="chunk:1" hash="x" origin="source" -->\n# 标题\r\n正文')
    expect(text.split('\n')).toEqual(['', '# 标题', '正文'])
  })

  it('stamps by modified time and size', () => {
    expect(bodyStamp({ modifiedAt: 't', size: 3 })).toBe('t|3')
  })
})

describe('tokenizeBody', () => {
  it('splits latin into words and CJK into characters', () => {
    expect(tokenizeBody('Hello, World')).toEqual(['hello', 'world'])
    expect(tokenizeBody('志愿者排班')).toEqual(['志', '愿', '者', '排', '班'])
    expect(tokenizeBody('排班2024表')).toEqual(['排', '班', '2024', '表'])
  })
})

describe('BodyIndex', () => {
  it('finds Chinese body text with snippet, line and reason', () => {
    const index = new BodyIndex()
    index.upsert(doc('pod/a.md', '# 活动\n\n给志愿者排班时只设每月上限，不设最低次数。\n其他'))
    index.upsert(doc('pod/b.md', '预算表，没有相关内容'))
    const hits = index.search('排班')
    expect(hits.map((hit) => hit.uri)).toEqual(['pod/a.md'])
    expect(hits[0].line).toBe(3)
    expect(hits[0].reason).toBe('正文里有 “排班”')
    expect(hits[0].snippet).toContain('排班时只设每月上限')
    expect(hits[0].quote).toContain('排班')
  })

  it('shows snippets as plain words, without markdown marks', () => {
    const index = new BodyIndex()
    index.upsert(doc('pod/a.md', '# 维护成本太高，先不自己做\n\n- **预算**不够'))
    const [hit] = index.search('维护成本')
    expect(hit.snippet).toBe('维护成本太高，先不自己做')
    expect(hit.quote).toBe('维护成本太高，先不自己做')
    expect(hit.line).toBe(1)
    expect(index.search('预算')[0].snippet).toBe('预算不够')
  })

  it('matches a single character and multi-word latin queries (all words)', () => {
    const index = new BodyIndex()
    index.upsert(doc('a', '志愿者排班'))
    index.upsert(doc('b', 'Volunteer rota for the spring fair'))
    index.upsert(doc('c', 'Volunteer budget'))
    expect(index.search('班').map((hit) => hit.uri)).toEqual(['a'])
    expect(index.search('volunteer rota').map((hit) => hit.uri)).toEqual(['b'])
  })

  it('does not match characters that are far apart', () => {
    const index = new BodyIndex()
    index.upsert(doc('far', '排队等候，然后上班'))
    index.upsert(doc('near', '本周排班已发'))
    expect(index.search('排班').map((hit) => hit.uri)).toEqual(['near'])
  })

  it('ranks the document that mentions the term more, and shorter, first', () => {
    const index = new BodyIndex()
    index.upsert(doc('weak', `${'其他内容 '.repeat(50)}排班`))
    index.upsert(doc('strong', '排班规则：排班每月一次，排班由组长负责'))
    expect(index.search('排班').map((hit) => hit.uri)).toEqual(['strong', 'weak'])
  })

  it('is incremental: same hash is unchanged, new text replaces the old', () => {
    const index = new BodyIndex()
    expect(index.upsert(doc('a', '苹果'))).toBe('added')
    expect(index.upsert(doc('a', '苹果', '2'))).toBe('unchanged')
    expect(index.get('a')?.stamp).toBe('2')
    expect(index.upsert(doc('a', '香蕉'))).toBe('updated')
    expect(index.search('苹果')).toEqual([])
    expect(index.search('香蕉')).toHaveLength(1)
    expect(index.remove('a')).toBe(true)
    expect(index.search('香蕉')).toEqual([])
    expect(index.size).toBe(0)
  })

  it('round-trips through snapshot and restore', () => {
    const index = new BodyIndex()
    index.upsert(doc('a', '会议纪要：押金 500 元'))
    const copy = new BodyIndex()
    copy.restore(index.snapshot())
    expect(copy.search('押金')[0].uri).toBe('a')
    expect(copy.totalChars).toBe(index.totalChars)
  })

  it('applies a filter before ranking', () => {
    const index = new BodyIndex()
    index.upsert(doc('a', '排班'))
    index.upsert(doc('b', '排班'))
    expect(index.search('排班', { filter: (uri) => uri === 'b' }).map((hit) => hit.uri)).toEqual(['b'])
  })
})

describe('projectBodyCoverageNote', () => {
  it('says nothing when everything is indexed', () => {
    expect(projectBodyCoverageNote({ totalFiles: 3, indexedFiles: 3, indexing: false })).toBeNull()
  })
  it('counts files that are only found by name', () => {
    expect(projectBodyCoverageNote({ totalFiles: 10, indexedFiles: 4, indexing: false }))
      .toBe('还有 6 个文件的正文没建索引，只按名字找')
  })
  it('says the index is still being built', () => {
    expect(projectBodyCoverageNote({ totalFiles: 10, indexedFiles: 1, indexing: true }))
      .toBe('文件正文还在建立索引，部分文件只按标题搜索')
  })
})
