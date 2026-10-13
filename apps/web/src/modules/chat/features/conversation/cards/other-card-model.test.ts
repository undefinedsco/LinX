import { describe, expect, it } from 'vitest'
import { describeSchedule, fileKindLabel, formatFileSize, nameFromUri } from './other-card-model'

describe('card display helpers', () => {
  it('names a file from its address without showing the address', () => {
    expect(nameFromUri('https://alice.example/chat-files/%E5%AF%B9%E6%AF%94%E8%A1%A8.md')).toBe('对比表.md')
  })

  it('sizes and kinds like the artboards ("文档 · 4 KB")', () => {
    expect(formatFileSize(4096)).toBe('4 KB')
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
    expect(fileKindLabel('text/markdown', 'a.md')).toBe('文档')
    expect(fileKindLabel(null, '排班表.xlsx')).toBe('表格')
    expect(fileKindLabel('image/png', '海报.png')).toBe('图片')
  })

  it('reads simple schedules in plain words', () => {
    const now = new Date('2026-10-12T08:00:00')
    expect(describeSchedule({ scheduleKind: 'cron', cron: '0 9 * * 1' }, now).repeat).toBe('每周一 9:00')
    expect(describeSchedule({ scheduleKind: 'cron', cron: '30 18 * * *' }, now).repeat).toBe('每天 18:30')
    expect(describeSchedule({ scheduleKind: 'interval', intervalSeconds: 7200 }, now).repeat).toBe('每 2 小时')
    expect(describeSchedule({ scheduleKind: 'cron', cron: '*/5 * * * *' }, now).repeat).toBe('按计划重复')
    expect(describeSchedule({ scheduleKind: 'once', nextRunAt: new Date('2026-10-12T09:00:00') }, now).repeat).toBe('今天 9:00 运行一次')
  })
})
