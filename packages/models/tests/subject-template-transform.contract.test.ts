import { describe, expect, it } from 'vitest'
import { id, podTable, string, timestamp, uri } from '@undefineds.co/drizzle-solid'
import { UriResolverImpl } from '../../../node_modules/@undefineds.co/drizzle-solid/dist/esm/core/uri/resolver.js'
import { DocumentResourceResolver } from '../../../node_modules/@undefineds.co/drizzle-solid/dist/esm/core/resource-resolver/document-resolver.js'

import { DCTerms, SCHEMA, SIOC, UDFS, WF } from '../src/namespaces'

const chatTable = podTable(
  'subject_chat_demo',
  {
    id: id('id'),
  },
  {
    base: '/.data/chat/',
    type: SCHEMA.CreativeWork,
    namespace: UDFS,
    subjectTemplate: '{id}/index.ttl#this',
  },
)

const messageArchiveTable = podTable(
  'subject_message_archive_demo',
  {
    id: id('id'),
    chat: uri('chat').predicate(WF.message).notNull().link(chatTable),
    thread: uri('thread').predicate(SIOC.term('has_container')).notNull(),
    createdAt: timestamp('createdAt').predicate(DCTerms.created).notNull(),
  },
  {
    base: '/.data/chat/',
    type: SCHEMA.CreativeWork,
    namespace: UDFS,
    subjectTemplate: '{chat|id}/{yyyy}/{MM}/{dd}/messages.ttl#{id}',
  },
)

const slugTable = podTable(
  'subject_slug_demo',
  {
    id: id('id'),
    title: string('title').predicate(SCHEMA.name).notNull(),
  },
  {
    base: '/.data/slug-demo/',
    type: SCHEMA.CreativeWork,
    namespace: UDFS,
    subjectTemplate: '{title|slug}/index.ttl#{id}',
  },
)

describe('subjectTemplate transforms', () => {
  it('derives message archive path from linked chat URI with chat|id', () => {
    const resolver = new UriResolverImpl('https://pod.example')
    const subject = resolver.resolveSubject(messageArchiveTable, {
      id: 'message-1',
      chat: 'https://pod.example/.data/chat/chat-1/index.ttl#this',
      thread: 'https://pod.example/.data/chat/chat-1/index.ttl#thread-1',
      createdAt: new Date(Date.UTC(2024, 0, 2, 3, 4, 5)),
    })

    expect(subject).toBe('https://pod.example/.data/chat/chat-1/2024/01/02/messages.ttl#message-1')
    expect(resolver.extractId(subject, messageArchiveTable)).toBe('message-1')
  })

  it('supports slug transform in subject resolution and exact-target narrowing', async () => {
    const resolver = new UriResolverImpl('https://pod.example')
    const subject = resolver.resolveSubject(slugTable, {
      id: 'entry-1',
      title: 'Hello LinX / 世界',
    })

    expect(subject).toBe('https://pod.example/.data/slug-demo/hello-linx-世界/index.ttl#entry-1')

    const documentResolver = new DocumentResourceResolver('https://pod.example/')
    const sources = await documentResolver.resolveSelectSources(
      slugTable,
      '',
      { id: 'entry-1', title: 'Hello LinX / 世界' } as any,
    )

    expect(sources).toEqual([
      'https://pod.example/.data/slug-demo/hello-linx-世界/index.ttl',
    ])
  })
})
