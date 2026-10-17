import { describe, expect, it } from 'vitest'

import {
  applyStructuredRowOrder,
  moveStructuredRow,
  projectStructuredBulkBar,
  projectStructuredSelectedSubjects,
} from './structured-row-selection-model'

const rows = ['#a', '#b', '#c', '#d'].map((subject) => ({ subject }))

describe('structured row order', () => {
  it('keeps the original order when nothing is saved', () => {
    expect(applyStructuredRowOrder(rows, undefined).map((row) => row.subject)).toEqual(['#a', '#b', '#c', '#d'])
  })

  it('follows the saved order and puts unseen rows last', () => {
    expect(applyStructuredRowOrder(rows, ['#c', '#a', '#gone']).map((row) => row.subject)).toEqual(['#c', '#a', '#b', '#d'])
  })

  it('moves a row onto another and ignores no-ops', () => {
    expect(moveStructuredRow(['#a', '#b', '#c'], '#a', '#c')).toEqual(['#b', '#c', '#a'])
    expect(moveStructuredRow(['#a', '#b'], '#a', '#a')).toBeNull()
    expect(moveStructuredRow(['#a', '#b'], '#a', '#zzz')).toBeNull()
  })
})

describe('structured row selection', () => {
  it('drops selected rows that no longer exist and keeps table order', () => {
    expect(projectStructuredSelectedSubjects(rows, new Set(['#d', '#b', '#gone']))).toEqual(['#b', '#d'])
  })

  it('words the bulk bar and the delete confirm in plain Chinese', () => {
    const bar = projectStructuredBulkBar(3)
    expect(bar.label).toBe('已选 3 张卡片')
    expect([bar.openLabel, bar.deleteLabel, bar.moveLabel]).toEqual(['打开', '删除…', '移到…'])
    expect(bar.confirmTitle).toBe('删除 3 张卡片？')
  })
})
