import { describe, expect, it } from 'vitest'
import { shouldAutoTitleChat, summarizeConversationTitle } from './conversation-title'

describe('conversation title', () => {
  it('summarizes the first meaningful sentence', () => {
    expect(summarizeConversationTitle('  请帮我修复聊天图片丢失的问题。后面还有说明。  '))
      .toBe('请帮我修复聊天图片丢失的问题')
  })

  it('keeps titles compact', () => {
    expect(summarizeConversationTitle('这是一个非常长的聊天内容，希望系统能够自动生成一个容易识别的标题'))
      .toBe('这是一个非常长的聊天内容，希望系统能够自动生成一…')
  })

  it('only replaces known placeholder titles', () => {
    expect(shouldAutoTitleChat('AI Secretary')).toBe(true)
    expect(shouldAutoTitleChat('Default Chat')).toBe(true)
    expect(shouldAutoTitleChat('用户手动命名')).toBe(false)
  })
})
