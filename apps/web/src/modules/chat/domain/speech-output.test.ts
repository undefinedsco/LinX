import { describe, expect, it } from 'vitest'
import { markdownToSpeechText, splitSpeechText } from './speech-output'

describe('speech output', () => {
  it('turns message Markdown into concise spoken text without reading raw markup or URLs', () => {
    expect(markdownToSpeechText([
      '# 标题',
      '- 参见 [来源](https://example.com/source)',
      '> `const value = 1`',
      '```ts',
      'privateSecret()',
      '```',
      'https://example.com/raw',
    ].join('\n'))).toBe('标题 参见 来源 const value = 1 代码块已省略。 链接')
  })

  it('splits long answers at natural boundaries for reliable browser speech queues', () => {
    const chunks = splitSpeechText('第一句很短。第二句也很清楚。第三句继续说明上下文。', 12)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe('第一句很短。第二句也很清楚。第三句继续说明上下文。')
    expect(chunks.every((chunk) => chunk.length <= 13)).toBe(true)
  })
})
