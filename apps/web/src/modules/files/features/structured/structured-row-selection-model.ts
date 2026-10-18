/**
 * Where a table view keeps its hand-dragged row order (R6 K6). The view metadata already has a
 * map of subject lists (it holds the kanban card order); a table keeps its row order under this
 * reserved key so no new field is needed. Real kanban columns never use it.
 */
export const STRUCTURED_TABLE_ROW_ORDER_KEY = '__table-rows__'

/** Rows in the saved order; rows the order has never seen go last, in their original order. */
export function applyStructuredRowOrder<T extends { subject: string }>(
  rows: readonly T[],
  order: readonly string[] | undefined,
): T[] {
  if (!order || order.length === 0) return [...rows]
  const position = new Map(order.map((subject, index) => [subject, index]))
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftPosition = position.get(left.row.subject)
      const rightPosition = position.get(right.row.subject)
      if (leftPosition === undefined && rightPosition === undefined) return left.index - right.index
      if (leftPosition === undefined) return 1
      if (rightPosition === undefined) return -1
      return leftPosition - rightPosition
    })
    .map(({ row }) => row)
}

/** The whole list after one row is dropped onto another; null when nothing moved. */
export function moveStructuredRow(
  subjects: readonly string[],
  activeSubject: string,
  overSubject: string,
): string[] | null {
  const from = subjects.indexOf(activeSubject)
  const to = subjects.indexOf(overSubject)
  if (from < 0 || to < 0 || from === to) return null
  const next = [...subjects]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}

/** Selected rows that still exist, in table order. */
export function projectStructuredSelectedSubjects(
  rows: readonly { subject: string }[],
  selected: ReadonlySet<string>,
): string[] {
  return rows.filter((row) => selected.has(row.subject)).map((row) => row.subject)
}

export interface StructuredBulkBarModel {
  label: string
  openLabel: string
  deleteLabel: string
  moveLabel: string
  clearLabel: string
  confirmTitle: string
  confirmDescription: string
  confirmLabel: string
}

export function projectStructuredBulkBar(count: number): StructuredBulkBarModel {
  return {
    label: `已选 ${count} 张卡片`,
    openLabel: '打开',
    deleteLabel: '删除…',
    moveLabel: '移到…',
    clearLabel: '取消选择',
    confirmTitle: `删除 ${count} 张卡片？`,
    confirmDescription: '这些卡片上的内容会一起清除。',
    confirmLabel: '删除',
  }
}
