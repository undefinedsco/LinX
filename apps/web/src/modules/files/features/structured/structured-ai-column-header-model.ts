import type { AiColumnChange } from '../../domain/proposal/ai-column-change-model'

export interface StructuredAiColumnHeaderChrome {
  /** Dashed border and the 未确认 tag only while nobody has confirmed the column. */
  dashed: boolean
  tag: string | null
  ariaLabel: string
  note: string
  confirmLabel: string
  removeLabel: string
}

/**
 * R6 K6b / K10b words on a column LinX added. Not handed to LinX: a dashed 未确认 column with
 * 保留这列 / 去掉这列. Handed to LinX: an ordinary column, added directly, with 撤销.
 */
export function projectStructuredAiColumnHeaderChrome(change: Pick<AiColumnChange, 'state' | 'label'>): StructuredAiColumnHeaderChrome {
  if (change.state === 'unconfirmed') {
    return {
      dashed: true,
      tag: '未确认',
      ariaLabel: `LinX 加的列 ${change.label}，还没确认`,
      note: 'LinX 加了这一列，你还没确认。',
      confirmLabel: '保留这列',
      removeLabel: '去掉这列',
    }
  }
  return {
    dashed: false,
    tag: null,
    ariaLabel: `LinX 加的列 ${change.label}`,
    note: 'LinX 按你交给它的权限直接加了这一列，也记在收件箱“LinX 替你做的”里。',
    confirmLabel: '知道了',
    removeLabel: '撤销',
  }
}
