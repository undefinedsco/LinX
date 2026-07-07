import { describe, expect, it } from 'vitest'

import { projectPendingCellWriteButtonChrome } from './structured-pending-cell-write-button-model'

describe('structured pending cell write button model', () => {
  it('projects approval-staged pending write status chrome', () => {
    expect(projectPendingCellWriteButtonChrome({
      predicateLabel: 'title',
      status: 'approval-staged',
      subject: '#Workspace',
    })).toEqual({
      ariaLabel: 'Pending approval for title on #Workspace',
      kind: 'status',
      marker: '*',
      title: '单元格变更已提交；等待 Inbox 审批，canonical 数据未变更',
    })
  })

  it('projects submitting pending write status chrome', () => {
    expect(projectPendingCellWriteButtonChrome({
      predicateLabel: 'title',
      status: 'pending',
      subject: '#Workspace',
    })).toEqual({
      ariaLabel: '正在提交 title on #Workspace 的单元格变更',
      kind: 'status',
      marker: '*',
      title: '单元格变更正在提交；canonical 数据未变更',
    })
  })

  it('projects failed pending write discard chrome', () => {
    expect(projectPendingCellWriteButtonChrome({
      predicateLabel: 'title',
      status: 'failed',
      subject: '#Workspace',
    })).toEqual({
      ariaLabel: 'Discard pending write for title on #Workspace',
      kind: 'discard',
      title: '单元格变更提交失败；可撤回本地改动',
    })
  })
})
