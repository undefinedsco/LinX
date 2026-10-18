import { describe, expect, it } from 'vitest'

import type { StructuredCellWriteProposal } from '../../domain/structured/structured-table'
import {
  createStructuredSaveState,
  projectStructuredSaveFailed,
  projectStructuredSaveFinished,
  projectStructuredSaveLine,
  projectStructuredSaveSettled,
  projectStructuredSaveStarted,
} from './structured-save-state-model'

const proposal = { id: 'p1' } as StructuredCellWriteProposal

describe('structured save state', () => {
  it('says nothing until an edit is sent', () => {
    expect(projectStructuredSaveLine(createStructuredSaveState())).toBeNull()
  })

  it('keeps saying 保存中 until the last edit is done, then 已保存, then goes quiet', () => {
    let state = projectStructuredSaveStarted(projectStructuredSaveStarted(createStructuredSaveState()))
    expect(projectStructuredSaveLine(state)?.text).toBe('保存中…')
    state = projectStructuredSaveFinished(state)
    expect(projectStructuredSaveLine(state)?.text).toBe('保存中…')
    state = projectStructuredSaveFinished(state)
    expect(projectStructuredSaveLine(state)?.text).toBe('已保存')
    expect(projectStructuredSaveLine(projectStructuredSaveSettled(state))).toBeNull()
  })

  it('offers a retry after a failure and keeps the failed edit', () => {
    const state = projectStructuredSaveFailed(projectStructuredSaveStarted(createStructuredSaveState()), proposal)
    expect(projectStructuredSaveLine(state)).toEqual({ text: '没保存成功', retryable: true, tone: 'error' })
    expect(state.failedProposal).toBe(proposal)
    expect(projectStructuredSaveLine(projectStructuredSaveStarted(state))?.text).toBe('保存中…')
  })

  it('does not hide a failure behind a later success', () => {
    const failed = projectStructuredSaveFailed(projectStructuredSaveStarted(projectStructuredSaveStarted(createStructuredSaveState())), proposal)
    expect(projectStructuredSaveLine(projectStructuredSaveFinished(failed))?.retryable).toBe(true)
  })
})
