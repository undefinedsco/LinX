import { describe, expect, it } from 'vitest'

import {
  createRichTextEditorSaveState,
  getRichTextEditorSaveStatusLabel,
  projectRichTextEditorSaveStateAfterDirtyComparison,
  projectRichTextEditorSaveStateAfterSaveError,
  projectRichTextEditorSaveStateAfterSaveSuccess,
  projectRichTextEditorSaveStateBeforeSave,
} from './rich-text-file-editor-model'

describe('rich text file editor model', () => {
  it('keeps dirty flag and visible save status as one state projection', () => {
    expect(createRichTextEditorSaveState()).toEqual({
      isDirty: false,
      status: 'saved',
    })

    expect(projectRichTextEditorSaveStateAfterDirtyComparison(true)).toEqual({
      isDirty: true,
      status: 'dirty',
    })

    expect(projectRichTextEditorSaveStateAfterDirtyComparison(false)).toEqual({
      isDirty: false,
      status: 'saved',
    })
  })

  it('preserves dirty intent while a save is in flight and rolls back on error', () => {
    const dirtyState = projectRichTextEditorSaveStateAfterDirtyComparison(true)

    expect(projectRichTextEditorSaveStateBeforeSave(dirtyState)).toEqual({
      isDirty: true,
      status: 'saving',
    })

    expect(projectRichTextEditorSaveStateAfterSaveError()).toEqual({
      isDirty: true,
      status: 'error',
    })

    expect(projectRichTextEditorSaveStateAfterSaveSuccess()).toEqual({
      isDirty: false,
      status: 'saved',
    })
  })

  it('keeps save labels generic to the editor surface', () => {
    expect(getRichTextEditorSaveStatusLabel('saved')).toBe('已保存')
    expect(getRichTextEditorSaveStatusLabel('dirty')).toBe('未保存')
    expect(getRichTextEditorSaveStatusLabel('saving')).toBe('正在保存')
    expect(getRichTextEditorSaveStatusLabel('error')).toBe('保存失败')
  })
})
