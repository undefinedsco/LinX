import { describe, expect, it } from 'vitest'

import {
  projectStructuredColumnHeaderMenu,
  structuredBooleanFilterLabel,
  structuredColumnSortChoiceLabels,
} from './structured-column-header-menu-model'

const base = { editable: true, label: '状态', sort: null, termIsEditable: true, typeLabel: 'enum' } as const

describe('projectStructuredColumnHeaderMenu (R6 K6d 点表头)', () => {
  it('lists the artboard items in order, with the artboard wording', () => {
    const menu = projectStructuredColumnHeaderMenu(base)
    expect(menu.items.map((item) => item.label)).toEqual([
      '改显示的名字',
      '改值的类型…',
      '按它排序',
      '按它筛选',
      '隐藏这一列',
      '在词表里查看',
      '从这张表去掉…',
    ])
    expect(menu.items.every((item) => !item.disabled)).toBe(true)
    expect(menu.title).toBe('状态')
    expect(menu.typeCaption).toBe('选项')
  })

  it('keeps default text free of engineering terms', () => {
    const menu = projectStructuredColumnHeaderMenu(base)
    const text = [menu.title, menu.typeCaption, ...menu.items.map((item) => item.label), ...menu.sortChoices.map((choice) => choice.label)].join(' ')
    expect(text).not.toMatch(/predicate|subject|RDF|URI|URL|IRI/i)
  })

  it('turns off 改值的类型 for read-only tables and for properties from a shared vocabulary, saying why', () => {
    const readOnly = projectStructuredColumnHeaderMenu({ ...base, editable: false })
    expect(readOnly.items.find((item) => item.id === 'changeType')).toMatchObject({ disabled: true, disabledReason: '这张表现在只能看' })
    const shared = projectStructuredColumnHeaderMenu({ ...base, termIsEditable: false })
    expect(shared.items.find((item) => item.id === 'changeType')).toMatchObject({ disabled: true, disabledReason: '这个属性来自共享词表，不能改' })
    // Everything else stays usable: sorting, filtering and hiding only change the view.
    expect(shared.items.filter((item) => item.disabled).map((item) => item.id)).toEqual(['changeType'])
  })

  it('offers 升序 / 降序, shows which is on, and 取消排序 only while sorted', () => {
    expect(projectStructuredColumnHeaderMenu(base)).toMatchObject({
      canClearSort: false,
      sortChoices: [
        { direction: 'asc', label: '升序', checked: false },
        { direction: 'desc', label: '降序', checked: false },
      ],
    })
    const sorted = projectStructuredColumnHeaderMenu({ ...base, sort: 'desc' })
    expect(sorted.canClearSort).toBe(true)
    expect(sorted.sortChoices.map((choice) => choice.checked)).toEqual([false, true])
  })

  it('words the sort directions after what the column holds', () => {
    expect(structuredColumnSortChoiceLabels('number')).toEqual({ asc: '升序（小到大）', desc: '降序（大到小）' })
    expect(structuredColumnSortChoiceLabels('date')).toEqual({ asc: '升序（早到晚）', desc: '降序（晚到早）' })
    expect(structuredColumnSortChoiceLabels('text')).toEqual({ asc: '升序', desc: '降序' })
  })

  it('filters option and yes/no columns by ticking values, and everything else in a small dialog', () => {
    expect(projectStructuredColumnHeaderMenu(base).filterStyle).toBe('values')
    expect(projectStructuredColumnHeaderMenu({ ...base, typeLabel: 'boolean' }).filterStyle).toBe('values')
    for (const typeLabel of ['text', 'number', 'date', 'relation', 'observed']) {
      expect(projectStructuredColumnHeaderMenu({ ...base, typeLabel }).filterStyle).toBe('dialog')
    }
  })

  it('marks a column that is being filtered', () => {
    expect(projectStructuredColumnHeaderMenu(base).filterActive).toBe(false)
    expect(projectStructuredColumnHeaderMenu({ ...base, filter: { predicate: 'status', kind: 'values', values: ['进行中'] } }).filterActive).toBe(true)
  })

  it('gives the always-there 名称 column only sorting and filtering', () => {
    const menu = projectStructuredColumnHeaderMenu({ ...base, isNameColumn: true, label: '名称', typeLabel: 'text' })
    expect(menu.items.map((item) => item.id)).toEqual(['sort', 'filter'])
    expect(menu.typeCaption).toBe('每张表都有')
    expect(menu.filterStyle).toBe('dialog')
  })

  it('shows the column description when it has one', () => {
    expect(projectStructuredColumnHeaderMenu({ ...base, description: '任务现在的进展' }).description).toBe('任务现在的进展')
  })

  it('reads yes/no values as 是 / 否', () => {
    expect(structuredBooleanFilterLabel('true')).toBe('是')
    expect(structuredBooleanFilterLabel('false')).toBe('否')
    expect(structuredBooleanFilterLabel('maybe')).toBe('maybe')
  })
})
