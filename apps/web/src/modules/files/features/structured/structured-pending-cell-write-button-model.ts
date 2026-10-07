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
      ariaLabel: `Pending approval for ${predicateLabel} on ${subject}`,
      kind: 'status',
      marker: '*',
      title: '单元格变更已提交；等待 Inbox 审批，canonical 数据未变更',
    }
  }

  if (status === 'pending') {
    return {
      ariaLabel: `正在提交 ${predicateLabel} on ${subject} 的单元格变更`,
      kind: 'status',
      marker: '*',
      title: '单元格变更正在提交；canonical 数据未变更',
    }
  }

  return {
    ariaLabel: `Discard pending write for ${predicateLabel} on ${subject}`,
    kind: 'discard',
    title: '单元格变更提交失败；可撤回本地改动',
  }
}
