import { describe, expect, it } from 'vitest'
import type { ThreadItem, ThreadStreamEvent } from '@/lib/vendor/xpod-chatkit'
import { itemsToAgUiMessages } from './history'
import { ThreadEventTranslator } from './thread-events'

const THREAD = 'https://alice.example/.data/chat/c1/index.ttl#t1'
const MESSAGE = 'https://alice.example/.data/chat/c1/2026/10/11/messages.ttl#m2'

function assistant(text: string, annotations?: unknown[]): ThreadItem {
  return {
    id: 'item-2',
    thread_id: 't1',
    type: 'assistant_message',
    content: [{ type: 'output_text', text, annotations: annotations as never }],
    created_at: 1,
  }
}

function translate(events: ThreadStreamEvent[], resolve = (id: string) => (id === 'item-2' ? MESSAGE : id)) {
  const translator = new ThreadEventTranslator({ threadUri: THREAD, runId: `${THREAD}-run-1`, resolveItemUri: resolve })
  const out = [...translator.start()]
  for (const event of events) out.push(...translator.push(event))
  out.push(...translator.end())
  return out
}

describe('ChatKit stream → AG-UI', () => {
  it('streams an answer under the Pod message URI', () => {
    const events = translate([
      { type: 'thread.item.added', item: assistant('') },
      { type: 'thread.item.updated', item_id: 'item-2', update: { type: 'assistant_message.content_part.text_delta', delta: '你好' } },
      { type: 'thread.item.done', item: assistant('你好') },
    ])
    expect(events.map((event) => event.type)).toEqual([
      'RUN_STARTED', 'TEXT_MESSAGE_START', 'TEXT_MESSAGE_CONTENT', 'TEXT_MESSAGE_END', 'RUN_FINISHED',
    ])
    const start = events[1] as { messageId: string }
    expect(start.messageId).toBe(MESSAGE)
  })

  it('turns progress updates into the process line and keeps one terminal event', () => {
    const events = translate([
      { type: 'progress_update', text: '正在搜索网络并整理来源…' } as ThreadStreamEvent,
      { type: 'thread.item.added', item: assistant('') },
      { type: 'thread.item.done', item: assistant('好了') },
    ])
    const progress = events.filter((event) => event.type === 'ACTIVITY_SNAPSHOT')
    expect(progress.length).toBeGreaterThan(0)
    expect(events.filter((event) => event.type === 'RUN_FINISHED' || event.type === 'RUN_ERROR')).toHaveLength(1)
  })

  it('reports citations as a sources activity of the answer', () => {
    const events = translate([
      { type: 'thread.item.added', item: assistant('') },
      {
        type: 'thread.item.done',
        item: assistant('依据', [{ index: 0, source: { type: 'url', url: 'https://example.com/a', title: '示例' } }]),
      },
    ])
    const sources = events.find((event) => event.type === 'ACTIVITY_SNAPSHOT' && (event as { activityType: string }).activityType === 'linx-sources') as {
      messageId: string
      content: { sources: Array<{ uri: string }> }
    }
    expect(sources.messageId).toBe(`${MESSAGE}#sources`)
    expect(sources.content.sources[0].uri).toBe('https://example.com/a')
  })

  it('ends with a run error when the stream reports one', () => {
    const translator = new ThreadEventTranslator({ threadUri: THREAD, runId: 'r', resolveItemUri: (id) => id })
    const out = [...translator.start(), ...translator.push({ type: 'error', error: { code: 'x', message: '没连上' } } as ThreadStreamEvent)]
    expect(out.at(-1)).toMatchObject({ type: 'RUN_ERROR', message: '没连上' })
    expect(translator.finished).toBe(true)
  })

  it('confirms a stop with a cancelled outcome', () => {
    const translator = new ThreadEventTranslator({ threadUri: THREAD, runId: 'r', resolveItemUri: (id) => id })
    translator.start()
    const out = translator.stop()
    expect(out.at(-1)).toMatchObject({ type: 'RUN_FINISHED', outcome: { type: 'cancelled' } })
  })
})

describe('Pod items → AG-UI history', () => {
  it('uses message URIs as ids and carries attachments as media parts', () => {
    const messages = itemsToAgUiMessages([
      {
        uri: 'https://alice.example/m1',
        item: {
          id: 'item-1', thread_id: 't1', type: 'user_message', created_at: 0,
          content: [{ type: 'input_text', text: '帮我比较' }],
          attachments: [{ id: 'a1', type: 'file', name: '名单.xlsx', mime_type: 'application/vnd.ms-excel', download_url: 'blob:x' }],
        },
      },
      { uri: MESSAGE, item: assistant('好的') },
    ])
    expect(messages.map((message) => message.id)).toEqual(['https://alice.example/m1', MESSAGE])
    expect(messages[0]).toMatchObject({ role: 'user', content: [{ type: 'text' }, { type: 'document', metadata: { filename: '名单.xlsx' } }] })
  })
})
