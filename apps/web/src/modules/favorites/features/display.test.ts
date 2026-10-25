import { describe, expect, it } from 'vitest'
import { resolveFavoriteDisplay } from './display'

describe('resolveFavoriteDisplay', () => {
  it('shows a legacy .data file favorite as 数据', () => {
    expect(resolveFavoriteDisplay({ sourceModule: 'files', title: '.data' }).title).toBe('数据')
    expect(resolveFavoriteDisplay({ sourceModule: 'chat', title: '.data' }).title).toBe('.data')
  })

  it('shows the own raw account label as 我 and leaves others', () => {
    const webId = 'http://localhost:42140/test/profile/card#me'
    expect(resolveFavoriteDisplay({ snapshotAuthor: 'test@localhost:42140' }, webId).snapshotAuthor).toBe('我')
    expect(resolveFavoriteDisplay({ snapshotAuthor: '小王' }, webId).snapshotAuthor).toBe('小王')
  })
})
