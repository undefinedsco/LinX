import { describe, expect, it } from 'vitest'

import { projectPendingCellWriteButtonChrome } from './structured-pending-cell-write-button-model'

describe('structured pending cell write button model', () => {
  it('projects approval-staged pending write status chrome', () => {
    expect(projectPendingCellWriteButtonChrome({
      predicateLabel: 'title',
      status: 'approval-staged',
      subject: '#Workspace',
    })).toEqual({
      ariaLabel: '#Workspace 的 title 待审核',
      kind: 'status',
      marker: '*',
      title: '修改已提交，等待在收件箱确认；确认前表格内容不变',
    })
  })

  it('projects submitting pending write status chrome', () => {
    expect(projectPendingCellWriteButtonChrome({
      predicateLabel: 'title',
      status: 'pending',
      subject: '#Workspace',
    })).toEqual({
      ariaLabel: '正在提交「#Workspace」的「title」修改',
      kind: 'status',
      marker: '*',
      title: '正在提交修改；提交完成前表格内容不变',
    })
  })

  it('projects failed pending write discard chrome', () => {
    expect(projectPendingCellWriteButtonChrome({
      predicateLabel: 'title',
      status: 'failed',
      subject: '#Workspace',
    })).toEqual({
      ariaLabel: '放弃 #Workspace 的 title 更改',
      kind: 'discard',
      title: '单元格变更提交失败；可撤回本地改动',
    })
  })
})
