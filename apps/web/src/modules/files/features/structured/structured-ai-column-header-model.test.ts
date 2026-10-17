import { describe, expect, it } from 'vitest'

import { projectStructuredAiColumnHeaderChrome } from './structured-ai-column-header-model'

describe('structured AI column header chrome', () => {
  it('shows a dashed unconfirmed column with keep / remove', () => {
    const chrome = projectStructuredAiColumnHeaderChrome({ state: 'unconfirmed', label: '擅长' })
    expect(chrome).toMatchObject({ dashed: true, tag: '未确认', confirmLabel: '保留这列', removeLabel: '去掉这列' })
  })

  it('shows a directly added column as ordinary with undo', () => {
    const chrome = projectStructuredAiColumnHeaderChrome({ state: 'added', label: '报名渠道' })
    expect(chrome).toMatchObject({ dashed: false, tag: null, removeLabel: '撤销' })
  })
})
