import { describe, expect, it, vi } from 'vitest'
import { renderConversationHtml, renderConversationMarkdown } from './conversation-export'

describe('conversation export', () => {
  it('exports user and assistant messages while excluding selected messages and tool internals by default', () => {
    vi.setSystemTime(new Date('2026-08-11T00:00:00.000Z'))
    const messages = [
      { id: 'u1', role: 'user', content: 'hello' },
      { id: 'a1', role: 'assistant', content: 'secret answer' },
      { id: 't1', role: 'tool', content: 'tool output', richContent: '{"apiKey":"sk-private"}' },
    ]
    const markdown = renderConversationMarkdown(messages, { title: 'Demo', excludedMessageIds: new Set(['a1']) })

    expect(markdown).toContain('# Demo')
    expect(markdown).toContain('hello')
    expect(markdown).not.toContain('secret answer')
    expect(markdown).not.toContain('tool output')
    expect(markdown).not.toContain('sk-private')
  })

  it('redacts sensitive keys when structured tool activity is explicitly included', () => {
    const html = renderConversationHtml([
      { id: 't1', role: 'tool', content: 'completed', richContent: '{"token":"private","result":"ok"}' },
    ], { title: '<Unsafe>', includeToolDetails: true })

    expect(html).toContain('&lt;Unsafe&gt;')
    expect(html).toContain('[已排除敏感值]')
    expect(html).toContain('&quot;result&quot;')
    expect(html).not.toContain('private')
    expect(html).toContain("default-src 'none'")
  })

  it('does not publish legacy runtime diagnostics stored as assistant text', () => {
    const messages = [{
      id: 'a1',
      role: 'assistant',
      content: 'ACP process exited before response (id=1) at /Users/private/runtime.ts:42',
    }]

    const markdown = renderConversationMarkdown(messages, { title: 'Safe export' })
    const html = renderConversationHtml(messages, { title: 'Safe export' })

    expect(markdown).toContain('消息生成失败。请稍后重试。')
    expect(html).toContain('消息生成失败。请稍后重试。')
    expect(`${markdown}${html}`).not.toMatch(/ACP process|\/Users\/|runtime\.ts/iu)
  })

  it('preserves legitimate technical answers that mention errors and source locations', () => {
    const content = 'The public API may return `Error: invalid input`; inspect parser.ts:42 and request id=7.'
    const messages = [{ id: 'a1', role: 'assistant', content }]

    expect(renderConversationMarkdown(messages, { title: 'Technical export' })).toContain(content)
    expect(renderConversationHtml(messages, { title: 'Technical export' })).toContain(content)
  })
})
