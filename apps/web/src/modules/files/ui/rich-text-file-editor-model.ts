export type RichTextEditorSaveStatus = 'saved' | 'dirty' | 'saving' | 'error'

export type RichTextEditorSaveState = {
  isDirty: boolean
  status: RichTextEditorSaveStatus
}

export type RichTextEditorDocumentSummary = {
  title: string | null
  links: string[]
}

export function createRichTextEditorSaveState(): RichTextEditorSaveState {
  return {
    isDirty: false,
    status: 'saved',
  }
}

export function projectRichTextEditorSaveStateAfterDirtyComparison(hasUnsavedChanges: boolean): RichTextEditorSaveState {
  return {
    isDirty: hasUnsavedChanges,
    status: hasUnsavedChanges ? 'dirty' : 'saved',
  }
}

export function projectRichTextEditorSaveStateBeforeSave(current: RichTextEditorSaveState): RichTextEditorSaveState {
  return {
    isDirty: current.isDirty,
    status: 'saving',
  }
}

export function projectRichTextEditorSaveStateAfterSaveSuccess(): RichTextEditorSaveState {
  return createRichTextEditorSaveState()
}

export function projectRichTextEditorSaveStateAfterSaveError(): RichTextEditorSaveState {
  return {
    isDirty: true,
    status: 'error',
  }
}

export function getRichTextEditorSaveStatusLabel(status: RichTextEditorSaveStatus): string {
  switch (status) {
    case 'saved':
      return '已保存'
    case 'saving':
      return '正在保存'
    case 'error':
      return '保存失败'
    case 'dirty':
      return '未保存'
  }
}
