/**
 * The menu behind a column title (R6 K6d "点表头：这一列的菜单"). Items and wording follow the
 * artboard; this model only decides which ones the person can use right now.
 */
import {
  classifyStructuredColumnValueKind,
  type StructuredColumnFilter,
  type StructuredColumnValueKind,
} from '../../domain/structured/structured-column-filter'

export type StructuredColumnSortState = 'asc' | 'desc' | null

export type StructuredColumnHeaderMenuItemId =
  | 'rename'
  | 'changeType'
  | 'sort'
  | 'filter'
  | 'hide'
  | 'openDefinition'
  | 'remove'

export type StructuredColumnHeaderMenuItem = {
  id: StructuredColumnHeaderMenuItemId
  label: string
  disabled: boolean
  /** Why an item is off, shown as its tooltip. */
  disabledReason?: string
}

export type StructuredColumnHeaderMenuModel = {
  title: string
  /** The kind of value in plain words, shown under the title. */
  typeCaption: string
  description: string
  valueKind: StructuredColumnValueKind
  /** Options a 选项 / 是否 column can be filtered by; other columns use a small dialog. */
  filterStyle: 'values' | 'dialog'
  sortChoices: Array<{ direction: 'asc' | 'desc'; label: string; checked: boolean }>
  canClearSort: boolean
  filterActive: boolean
  items: StructuredColumnHeaderMenuItem[]
}

const VALUE_KIND_CAPTIONS: Record<StructuredColumnValueKind, string> = {
  text: '文字',
  number: '数字',
  date: '日期',
  boolean: '是 / 否',
  choice: '选项',
  relation: '联系人或卡片',
}

export function structuredColumnValueKindCaption(kind: StructuredColumnValueKind): string {
  return VALUE_KIND_CAPTIONS[kind]
}

/** Sort direction words fit the kind of value: 数字 小→大, 日期 早→晚, 文字 A→Z. */
export function structuredColumnSortChoiceLabels(kind: StructuredColumnValueKind): { asc: string; desc: string } {
  if (kind === 'number') return { asc: '升序（小到大）', desc: '降序（大到小）' }
  if (kind === 'date') return { asc: '升序（早到晚）', desc: '降序（晚到早）' }
  return { asc: '升序', desc: '降序' }
}

export function projectStructuredColumnHeaderMenu({
  description = '',
  editable,
  filter,
  isNameColumn = false,
  label,
  sort,
  termIsEditable,
  typeLabel,
}: {
  description?: string
  /** Whether this table can be changed at all (read-only tables keep view-only items). */
  editable: boolean
  filter?: StructuredColumnFilter
  /** The 名称 column: always there, so it cannot be hidden, retyped or removed. */
  isNameColumn?: boolean
  label: string
  sort: StructuredColumnSortState
  /** The property lives in the person's own vocabulary, so its type can be changed. */
  termIsEditable: boolean
  typeLabel: string
}): StructuredColumnHeaderMenuModel {
  const valueKind = isNameColumn ? 'text' : classifyStructuredColumnValueKind(typeLabel)
  const choices = structuredColumnSortChoiceLabels(valueKind)
  const items: StructuredColumnHeaderMenuItem[] = isNameColumn
    ? [
        { id: 'sort', label: '按它排序', disabled: false },
        { id: 'filter', label: '按它筛选', disabled: false },
      ]
    : [
        { id: 'rename', label: '改显示的名字', disabled: false },
        {
          id: 'changeType',
          label: '改值的类型…',
          disabled: !editable || !termIsEditable,
          ...(!editable
            ? { disabledReason: '这张表现在只能看' }
            : !termIsEditable
              ? { disabledReason: '这个属性来自共享词表，不能改' }
              : {}),
        },
        { id: 'sort', label: '按它排序', disabled: false },
        { id: 'filter', label: '按它筛选', disabled: false },
        { id: 'hide', label: '隐藏这一列', disabled: false },
        { id: 'openDefinition', label: '在词表里查看', disabled: false },
        { id: 'remove', label: '从这张表去掉…', disabled: false },
      ]

  return {
    title: label,
    typeCaption: isNameColumn ? '每张表都有' : structuredColumnValueKindCaption(valueKind),
    description,
    valueKind,
    filterStyle: valueKind === 'choice' || valueKind === 'boolean' ? 'values' : 'dialog',
    sortChoices: [
      { direction: 'asc', label: choices.asc, checked: sort === 'asc' },
      { direction: 'desc', label: choices.desc, checked: sort === 'desc' },
    ],
    canClearSort: sort !== null,
    filterActive: !!filter,
    items,
  }
}

/** Yes / no columns store `true` / `false`; people read 是 / 否. */
export function structuredBooleanFilterLabel(value: string): string {
  if (value === 'true') return '是'
  if (value === 'false') return '否'
  return value
}
