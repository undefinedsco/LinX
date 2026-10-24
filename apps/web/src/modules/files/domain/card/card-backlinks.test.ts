import { describe, expect, it } from 'vitest'

import {
  cardLinkNeedles,
  projectCitingMessages,
  projectRowBacklinks,
  projectTextBacklinks,
  projectWorkUses,
} from './card-backlinks'
import { projectStructuredResourceTable } from '../structured/structured-table'

const NOTE = 'https://pod.example/notes/%E8%AE%A1%E5%88%92.md'

describe('projectTextBacklinks', () => {
  const excerpt = {
    uri: 'https://pod.example/%E6%91%98%E5%BD%95/idea%203-4.md',
    title: 'idea 3-4.md',
    text: `# idea\n\n> 一段话\n\n来源：[计划](${NOTE}#line=3)\n`,
  }

  it('finds a 做成卡片 excerpt through its 来源 line and points at the line', () => {
    expect(projectTextBacklinks({ uri: NOTE, ownDocumentUri: NOTE, docs: [excerpt] })).toEqual([
      { key: `text:${excerpt.uri}`, uri: excerpt.uri, title: 'idea 3-4', hint: '来源', line: 5 },
    ])
  })

  it('recognises the decoded spelling of the address too', () => {
    const decoded = { ...excerpt, text: '见 https://pod.example/notes/计划.md 里的说法' }
    const [link] = projectTextBacklinks({ uri: NOTE, ownDocumentUri: NOTE, docs: [decoded] })
    expect(link?.hint).toBe('链接了它')
  })

  it('does not count the file itself, a longer address, or an unrelated text', () => {
    expect(projectTextBacklinks({
      uri: 'https://pod.example/a.md',
      ownDocumentUri: 'https://pod.example/a.md',
      docs: [
        { uri: 'https://pod.example/a.md', title: 'a.md', text: 'https://pod.example/a.md' },
        { uri: 'https://pod.example/b.md', title: 'b.md', text: '[x](https://pod.example/a.md.bak) https://pod.example/a.mdx' },
        { uri: 'https://pod.example/c.md', title: 'c.md', text: '没有链接' },
        { uri: 'https://pod.example/d.md', title: 'd.md', text: '见 https://pod.example/a.md.' },
      ],
    }).map((link) => link.uri)).toEqual(['https://pod.example/d.md'])
  })

  it('lists the spellings of an address once', () => {
    expect(cardLinkNeedles('https://pod.example/a.md')).toEqual(['https://pod.example/a.md'])
    expect(cardLinkNeedles(NOTE)).toHaveLength(2)
  })
})

describe('projectRowBacklinks', () => {
  const DOC = 'https://pod.example/.data/tasks.ttl'
  const projection = projectStructuredResourceTable({
    uri: DOC,
    mimeType: 'text/turtle',
    source: [
      '@prefix schema: <http://schema.org/> .',
      '<#Alpha> a schema:Thing ; schema:name "Alpha" .',
      '<#Beta> a schema:Thing ; schema:name "Beta" ; schema:isRelatedTo <#Alpha> .',
      '<#Gamma> a schema:Thing ; schema:name "Gamma" ; schema:text "Alpha" .',
    ].join('\n'),
  })

  it('lists rows of the same table whose relation cell points at the card', () => {
    const links = projectRowBacklinks({ projection, documentUri: DOC, subjectIri: `${DOC}#Alpha` })
    expect(links).toHaveLength(1)
    expect(links[0]).toMatchObject({ uri: `${DOC}#Beta`, title: 'Beta' })
    expect(links[0]?.hint.startsWith('属性：')).toBe(true)
  })

  it('has nothing for a card nobody points at', () => {
    expect(projectRowBacklinks({ projection, documentUri: DOC, subjectIri: `${DOC}#Gamma` })).toEqual([])
  })
})

describe('citing messages', () => {
  const cite = (sourceUri: string, quote = '那一段') => JSON.stringify([
    { type: 'text', text: '问' },
    { type: 'user_message', citation: { sourceUri, title: '计划', locator: { line: 3, quote } } },
  ])
  const chat1 = 'https://pod.example/.data/chat/c1/index.ttl#this'
  const messages = [
    { id: 'm1', chat: chat1, thread: 't1', richContent: cite(`${NOTE}#line=3`), createdAt: '2026-10-01T00:00:00Z' },
    { id: 'm2', chat: chat1, thread: 't1', richContent: cite(NOTE, '更晚的'), createdAt: '2026-10-02T00:00:00Z' },
    { id: 'm3', chat: 'https://pod.example/.data/chat/c2/index.ttl#this', thread: 't2', richContent: cite(`${NOTE}.bak`), createdAt: '2026-10-03T00:00:00Z' },
    { id: 'm4', chat: 'https://pod.example/.data/chat/c2/index.ttl#this', thread: 't2', richContent: 'not json sourceUri', createdAt: null },
    { id: 'm5', chat: 'c3', thread: 't3', richContent: null },
  ]

  it('finds messages whose stored citation points at the card, ignoring look-alikes', () => {
    expect(projectCitingMessages(messages, NOTE).map((message) => message.messageId)).toEqual(['m1', 'm2'])
  })

  it('folds them into one line per chat, newest first, with the latest quote', () => {
    expect(projectWorkUses(projectCitingMessages(messages, NOTE))).toEqual([
      { chatRef: chat1, count: 2, quote: '更晚的', lastAt: '2026-10-02T00:00:00Z' },
    ])
  })
})
