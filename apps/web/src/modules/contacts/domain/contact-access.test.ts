import { describe, expect, it } from 'vitest'
import { describeAccessModes, summarizeContactAccess } from './contact-access'

describe('contact access summary', () => {
  it('says "查不到" instead of guessing when nothing could be read', () => {
    const summary = summarizeContactAccess({
      items: [
        { place: 'space', url: 'https://me.example/', agent: null, public: null },
        { place: 'profile', url: 'https://me.example/profile/card', agent: null, public: null },
      ],
    })

    expect(summary.known).toBe(false)
    expect(summary.canDoText).toBe('查不到')
    expect(summary.sharedText).toBe('暂时看不到')
    expect(summary.sharedWithThem).toEqual([])
  })

  it('words what a person can do from the access that was read', () => {
    const summary = summarizeContactAccess({
      items: [
        { place: 'space', url: 'https://me.example/', agent: { read: true, write: true }, public: {} },
        { place: 'profile', url: 'https://me.example/profile/card', agent: {}, public: { read: true } },
      ],
    })

    expect(summary.known).toBe(true)
    expect(summary.canDoText).toBe('看公开资料、改你的空间')
    expect(summary.canDo).toContainEqual({ label: '看你的公开资料', value: '所有人都能' })
    expect(summary.sharedWithThem).toEqual([
      { place: 'space', label: '你的整个空间', value: '可以编辑', url: 'https://me.example/' },
    ])
    expect(summary.sharedText).toBe('1 项')
  })

  it('describes access modes in plain words', () => {
    expect(describeAccessModes({ read: true })).toBe('可以查看')
    expect(describeAccessModes({ append: true })).toBe('可以添加')
    expect(describeAccessModes({ read: true, append: true })).toBe('可以查看和添加')
    expect(describeAccessModes({ write: true, controlWrite: true })).toBe('可以管理')
    expect(describeAccessModes({})).toBeNull()
  })
})
