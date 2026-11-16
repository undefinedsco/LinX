export type PendingCellWriteButtonStatus = 'pending' | 'approval-staged' | 'failed'

export type PendingCellWriteButtonChrome =
  | {
      ariaLabel: string
      kind: 'status'
      marker: string
      title: string
    }
  | {
      ariaLabel: string
      kind: 'discard'
      title: string
    }

export function projectPendingCellWriteButtonChrome({
  predicateLabel,
  status,
  subject,
}: {
  predicateLabel: string
  status: PendingCellWriteButtonStatus
  subject: string
}): PendingCellWriteButtonChrome {
  if (status === 'approval-staged') {
    return {
      ariaLabel: `${subject} 的 ${predicateLabel} 待审核`,
      kind: 'status',
      marker: '*',
      title: '修改已提交，等待在收件箱确认；确认前表格内容不变',
    }
  }

  if (status === 'pending') {
    return {
      ariaLabel: `正在提交「${subject}」的「${predicateLabel}」修改`,
      kind: 'status',
      marker: '*',
      title: '正在提交修改；提交完成前表格内容不变',
    }
  }

  return {
    ariaLabel: `放弃 ${subject} 的 ${predicateLabel} 更改`,
    kind: 'discard',
    title: '单元格变更提交失败；可撤回本地改动',
  }
}
