import { describe, expect, it } from 'vitest'

import {
  createRichTextEditorBlockMoveMenuState,
  createRichTextEditorSaveState,
  getRichTextEditorSaveStatusLabel,
  createRichTextEditorBlockCommandMenuState,
  createRichTextEditorLinkMenuState,
  projectRichTextEditorBlockCommandMenuActiveIndexSet,
  projectRichTextEditorBlockCommandMenuClosed,
  projectRichTextEditorBlockCommandMenuMoved,
  projectRichTextEditorBlockCommandMenuOpened,
  projectRichTextEditorBlockMoveMenuClosed,
  projectRichTextEditorBlockMoveMenuToggled,
  projectRichTextEditorLinkMenuAfterApply,
  projectRichTextEditorLinkMenuHrefPatch,
  projectRichTextEditorLinkMenuToggled,
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

  it('keeps link menu open state and href draft as one state projection', () => {
    const opened = projectRichTextEditorLinkMenuToggled(createRichTextEditorLinkMenuState())
    const typed = projectRichTextEditorLinkMenuHrefPatch(opened, 'https://source.example/report.pdf')
    const closedByToggle = projectRichTextEditorLinkMenuToggled(typed)

    expect(opened).toEqual({
      open: true,
      href: '',
    })
    expect(typed).toEqual({
      open: true,
      href: 'https://source.example/report.pdf',
    })
    expect(closedByToggle).toEqual({
      open: false,
      href: 'https://source.example/report.pdf',
    })
    expect(projectRichTextEditorLinkMenuToggled(closedByToggle)).toEqual({
      open: true,
      href: 'https://source.example/report.pdf',
    })
  })

  it('clears link menu draft after applying a link', () => {
    const state = projectRichTextEditorLinkMenuHrefPatch(
      projectRichTextEditorLinkMenuToggled(createRichTextEditorLinkMenuState()),
      'https://source.example/report.pdf',
    )

    expect(projectRichTextEditorLinkMenuAfterApply(state)).toEqual({
      open: false,
      href: '',
    })
  })

  it('keeps slash block command menu open state and active index together', () => {
    const opened = projectRichTextEditorBlockCommandMenuOpened()
    const moved = projectRichTextEditorBlockCommandMenuMoved(opened, 1, 5)
    const wrapped = projectRichTextEditorBlockCommandMenuMoved(moved, -2, 5)

    expect(createRichTextEditorBlockCommandMenuState()).toEqual({
      open: false,
      activeIndex: 0,
    })
    expect(opened).toEqual({
      open: true,
      activeIndex: 0,
    })
    expect(moved).toEqual({
      open: true,
      activeIndex: 1,
    })
    expect(wrapped).toEqual({
      open: true,
      activeIndex: 4,
    })
  })

  it('preserves slash block active index when closing and clamps pointer activation', () => {
    const active = projectRichTextEditorBlockCommandMenuActiveIndexSet(
      projectRichTextEditorBlockCommandMenuOpened(),
      99,
      5,
    )

    expect(active).toEqual({
      open: true,
      activeIndex: 4,
    })
    expect(projectRichTextEditorBlockCommandMenuClosed(active)).toEqual({
      open: false,
      activeIndex: 4,
    })
  })

  it('keeps block move menu open state in a projector', () => {
    const initial = createRichTextEditorBlockMoveMenuState()
    const opened = projectRichTextEditorBlockMoveMenuToggled(initial)
    const closedByToggle = projectRichTextEditorBlockMoveMenuToggled(opened)

    expect(initial).toEqual({ open: false })
    expect(opened).toEqual({ open: true })
    expect(closedByToggle).toEqual({ open: false })
    expect(projectRichTextEditorBlockMoveMenuClosed(opened)).toEqual({ open: false })
  })
})
