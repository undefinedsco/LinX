import { describe, expect, it } from 'vitest'
import { formatErrorForUser, formatFilesErrorForUser } from './user-facing-errors'

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

describe('formatErrorForUser file writes', () => {
  it('translates structured-cell write refusals and HTTP failures', () => {
    expect(formatErrorForUser(new Error('Refusing to write a structured cell outside editable .data resources.')))
      .toBe('这个位置不能直接修改。请到“数据”里的表格中编辑。')
    expect(formatErrorForUser(new Error('Cannot write structured cell: HTTP 400')))
      .toBe('没能保存这个单元格。请检查填写的内容后重试。')
    expect(formatErrorForUser(new Error('Cannot write structured cell: HTTP 403'))).toBe('你没有修改这里的权限。')
    expect(formatErrorForUser(new Error('Cannot write structured cell: HTTP 503'))).toBe('服务暂时没有响应。请稍后重试。')
  })

  it('explains a bare network failure without mentioning sign-in', () => {
    expect(formatErrorForUser(new TypeError('Failed to fetch')))
      .toBe('网络连接不稳定，操作没有完成。请检查网络后重试。')
  })
})

describe('formatFilesErrorForUser', () => {
  it('describes HTTP failures as what happened to the file', () => {
    expect(formatFilesErrorForUser(new Error('HTTP 409'))).toBe('这里刚被别处改过。请刷新后再试。')
    expect(formatFilesErrorForUser(new Error('HTTP 403'))).toBe('你没有修改这里的权限。')
    expect(formatFilesErrorForUser(new Error('Pod write failed'))).toBe('没有保存成功。请检查网络后重试。')
  })

  it('keeps structured-cell messages and unknown errors on the shared formatter', () => {
    expect(formatFilesErrorForUser(new Error('Cannot write structured cell: HTTP 400')))
      .toBe('没能保存这个单元格。请检查填写的内容后重试。')
    expect(formatFilesErrorForUser(new Error(''), '保存失败')).toBe('保存失败')
  })
})
