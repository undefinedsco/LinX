import { describe, expect, it } from 'vitest'
import { parseMethodSections, serializeMethodSections } from './method'

describe('method sections', () => {
  it('keeps older free-form text whole under 补充说明', () => {
    expect(parseMethodSections('你是一个精通 12 国语言的翻译专家。')).toEqual({
      goal: '',
      criteria: [],
      exceptions: '',
      notes: '你是一个精通 12 国语言的翻译专家。',
    })
  })

  it('reads and writes the structured sections', () => {
    const sections = {
      goal: '帮书店两个人把活动和日常运营做好。',
      criteria: ['先找现成的工具和办法', '对外发布的东西，先给周禾过目'],
      exceptions: '活动前一天的紧急变化，可以直接在群里通知。',
      notes: '',
    }
    const text = serializeMethodSections(sections)
    expect(text).toBe([
      '## 目标',
      '帮书店两个人把活动和日常运营做好。',
      '',
      '## 判断标准',
      '- 先找现成的工具和办法',
      '- 对外发布的东西，先给周禾过目',
      '',
      '## 例外',
      '活动前一天的紧急变化，可以直接在群里通知。',
    ].join('\n'))
    expect(parseMethodSections(text)).toEqual(sections)
  })

  it('keeps text that sits before the first section', () => {
    const parsed = parseMethodSections('旧的说明\n\n## 目标\n省时间')
    expect(parsed.goal).toBe('省时间')
    expect(parsed.notes).toBe('旧的说明')
  })

  it('drops empty sections and empty criteria', () => {
    expect(serializeMethodSections({ goal: ' ', criteria: ['', ' a '], exceptions: '', notes: '' })).toBe('## 判断标准\n- a')
  })
})
