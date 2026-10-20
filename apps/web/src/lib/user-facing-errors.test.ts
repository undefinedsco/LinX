import { describe, expect, it } from 'vitest'
import { formatErrorForUser } from './user-facing-errors'

describe('formatErrorForUser model guidance', () => {
  it('points to 设置 → 模型连接 when no model or provider is configured', () => {
    const copy = '还没有连接 AI 模型。请到 设置 → 模型连接 添加一个模型后再试。'
    expect(formatErrorForUser(new Error('Xpod AI runtime error 400: model_not_configured: No AI provider configured.'), '消息生成失败。请稍后重试。')).toBe(copy)
    expect(formatErrorForUser('No AI provider configured.', '消息生成失败。请稍后重试。')).toBe(copy)
  })

  it('keeps the generic fallback for other failures', () => {
    expect(formatErrorForUser(new Error(''), '消息生成失败。请稍后重试。')).toBe('消息生成失败。请稍后重试。')
  })
})
