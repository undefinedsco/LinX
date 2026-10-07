import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  createStructuredCellEditorState,
  planStructuredCellActivationEffect,
  planStructuredCellKeyDownAction,
  planStructuredCellOutsidePointerAction,
  projectStructuredCellEditorState,
} from './structured-cell-edit-workflow-model'
import * as cellEditWorkflowModel from './structured-cell-edit-workflow-model'

const modelPath = 'src/modules/files/features/structured/structured-cell-edit-workflow-model.ts'
const controllerPath = 'src/modules/files/features/structured/useStructuredCellEditWorkflowController.ts'
const editorControllerPath = 'src/modules/files/features/structured/useStructuredCellEditorController.ts'

describe('structured cell edit workflow model', () => {
  it('keeps keyboard and outside-pointer edit decisions in the workflow model', () => {
    expect(existsSync(modelPath)).toBe(true)
    expect(existsSync(controllerPath)).toBe(true)
    if (!existsSync(modelPath) || !existsSync(controllerPath)) return

    const modelSource = readFileSync(modelPath, 'utf8')
    const controllerSource = readFileSync(controllerPath, 'utf8')
    const editorControllerSource = readFileSync(editorControllerPath, 'utf8')

    expect(modelSource).toContain('export function planStructuredCellActivationEffect')
    expect(modelSource).toContain('export function planStructuredCellKeyDownAction')
    expect(modelSource).toContain('export function planStructuredCellOutsidePointerAction')
    expect(modelSource).toContain('export type StructuredCellEditorState')
    expect(modelSource).toContain('export function createStructuredCellEditorState')
    expect(modelSource).toContain('export function projectStructuredCellEditorState')
    expect(modelSource).not.toContain('useState')
    expect(modelSource).not.toContain('useEffect')
    expect(controllerSource).toContain('planStructuredCellActivationEffect')
    expect(controllerSource).toContain('planStructuredCellKeyDownAction')
    expect(controllerSource).toContain('planStructuredCellOutsidePointerAction')
    expect(controllerSource).not.toContain("event.key === 'Enter'")
    expect(controllerSource).not.toContain("event.key === 'Escape'")
    expect(controllerSource).not.toContain("event.key === ' '")
    expect(controllerSource).not.toContain('activeTextCell?.subject ===')
    expect(modelSource).toContain('export function projectStructuredActiveCellClearedForTarget')
    expect(modelSource).toContain('export function projectStructuredActiveCellValue')
    expect(editorControllerSource).toContain('createStructuredCellEditorState')
    expect(editorControllerSource).toContain('projectStructuredCellEditorState')
    expect(editorControllerSource).not.toContain('projectStructuredActiveCellClearedForTarget')
    expect(editorControllerSource).not.toContain('projectStructuredActiveCellValue')
    expect(editorControllerSource).not.toContain('{ ...current, value }')
    expect(editorControllerSource).not.toContain('sameActiveCell')
  })

  it('projects active editor state transitions as a single model-owned state', () => {
    const commit = (next: string) => `"${next}"`
    const initial = createStructuredCellEditorState()
    expect(initial).toEqual({
      activeEnumCell: null,
      activeRelationCell: null,
      activeTextCell: null,
      enumSearch: '',
    })

    const enumOpen = projectStructuredCellEditorState(initial, {
      type: 'open-enum',
      cell: { subject: '#Task', predicate: 'status' },
    })
    expect(enumOpen).toEqual({
      activeEnumCell: { subject: '#Task', predicate: 'status' },
      activeRelationCell: null,
      activeTextCell: null,
      enumSearch: '',
    })

    const enumSearched = projectStructuredCellEditorState(enumOpen, {
      type: 'update-enum-search',
      value: 'rev',
    })
    expect(enumSearched.enumSearch).toBe('rev')

    const relationOpen = projectStructuredCellEditorState(enumSearched, {
      type: 'open-relation',
      cell: { subject: '#Task', predicate: 'owner', value: 'https://pod.example/alice' },
    })
    expect(relationOpen).toMatchObject({
      activeEnumCell: null,
      activeRelationCell: { subject: '#Task', predicate: 'owner', value: 'https://pod.example/alice' },
      activeTextCell: null,
      enumSearch: 'rev',
    })
    expect(projectStructuredCellEditorState(relationOpen, {
      type: 'update-relation-value',
      value: 'https://pod.example/bob',
    }).activeRelationCell).toMatchObject({
      value: 'https://pod.example/bob',
    })

    const textOpen = projectStructuredCellEditorState(relationOpen, {
      type: 'open-text',
      cell: {
        subject: '#Task',
        predicate: 'title',
        value: 'Draft',
        kind: 'text',
        commit,
      },
    })
    expect(textOpen).toMatchObject({
      activeEnumCell: null,
      activeRelationCell: null,
      activeTextCell: { subject: '#Task', predicate: 'title', value: 'Draft', kind: 'text' },
    })
    expect(projectStructuredCellEditorState(textOpen, {
      type: 'update-text-value',
      value: 'Updated',
    }).activeTextCell).toMatchObject({
      value: 'Updated',
    })
    expect(projectStructuredCellEditorState(textOpen, {
      type: 'clear-target',
      target: { subject: '#Task', predicate: 'title' },
    })).toEqual({
      activeEnumCell: null,
      activeRelationCell: null,
      activeTextCell: null,
      enumSearch: '',
    })
    expect(projectStructuredCellEditorState(enumSearched, { type: 'close-popover' })).toEqual(initial)
    expect(projectStructuredCellEditorState(textOpen, { type: 'reset' })).toEqual(initial)
  })

  it('normalizes activation plans into controller effects', () => {
    expect(planStructuredCellActivationEffect({ kind: 'none' })).toEqual({ kind: 'none' })
    expect(planStructuredCellActivationEffect({
      kind: 'open-enum',
      subject: '#Task',
      predicate: 'status',
    })).toEqual({
      kind: 'open-enum',
      cell: { subject: '#Task', predicate: 'status' },
    })
    expect(planStructuredCellActivationEffect({
      kind: 'toggle-boolean',
      subject: '#Task',
      predicate: 'done',
      nextValues: ['true'],
    })).toEqual({
      kind: 'stage-cell-write',
      clearPopover: true,
      subject: '#Task',
      predicate: 'done',
      nextValues: ['true'],
    })
    expect(planStructuredCellActivationEffect({
      kind: 'open-relation',
      subject: '#Task',
      predicate: 'link',
      value: 'https://pod.example/report.md',
    })).toEqual({
      kind: 'open-relation',
      cell: {
        subject: '#Task',
        predicate: 'link',
        value: 'https://pod.example/report.md',
      },
    })

    const commit = (next: string) => `"${next}"`
    expect(planStructuredCellActivationEffect({
      kind: 'open-scalar',
      subject: '#Task',
      predicate: 'title',
      value: 'Draft',
      scalarKind: 'text',
      commit,
    })).toEqual({
      kind: 'open-text',
      cell: {
        subject: '#Task',
        predicate: 'title',
        value: 'Draft',
        kind: 'text',
        commit,
      },
    })
  })

  it('plans keydown handling for active text cells and table activation keys', () => {
    const activeTextCell = {
      subject: '#Task',
      predicate: 'title',
      value: 'Draft',
      commit: (next: string) => `"${next}"`,
    }

    expect(planStructuredCellKeyDownAction({
      key: 'Enter',
      rowSubject: '#Task',
      predicate: 'title',
      targetValue: 'Updated',
      activeTextCell,
    })).toEqual({ kind: 'commit-text', nextValue: 'Updated', preventDefault: true })
    expect(planStructuredCellKeyDownAction({
      key: 'Escape',
      rowSubject: '#Task',
      predicate: 'title',
      targetValue: 'Updated',
      activeTextCell,
    })).toEqual({ kind: 'discard-draft', preventDefault: true })
    expect(planStructuredCellKeyDownAction({
      key: 'Enter',
      rowSubject: '#Other',
      predicate: 'title',
      targetValue: 'Updated',
      activeTextCell,
    })).toEqual({ kind: 'start-edit', preventDefault: true })
    expect(planStructuredCellKeyDownAction({
      key: ' ',
      rowSubject: '#Other',
      predicate: 'title',
      targetValue: '',
      activeTextCell: null,
    })).toEqual({ kind: 'start-edit', preventDefault: true })
    expect(planStructuredCellKeyDownAction({
      key: 'Tab',
      rowSubject: '#Task',
      predicate: 'title',
      targetValue: '',
      activeTextCell: null,
    })).toEqual({ kind: 'none', preventDefault: false })
  })

  it('plans outside pointer behavior without DOM access in the model', () => {
    expect(planStructuredCellOutsidePointerAction({
      hasActiveEnumCell: false,
      activeRelationValue: null,
      targetInsideInteractiveLayer: false,
    })).toEqual({ kind: 'none' })
    expect(planStructuredCellOutsidePointerAction({
      hasActiveEnumCell: true,
      activeRelationValue: null,
      targetInsideInteractiveLayer: true,
    })).toEqual({ kind: 'none' })
    expect(planStructuredCellOutsidePointerAction({
      hasActiveEnumCell: true,
      activeRelationValue: null,
      targetInsideInteractiveLayer: false,
    })).toEqual({ kind: 'close-popover' })
    expect(planStructuredCellOutsidePointerAction({
      hasActiveEnumCell: false,
      activeRelationValue: 'https://pod.example/report.md',
      targetInsideInteractiveLayer: false,
    })).toEqual({ kind: 'commit-relation', nextValue: 'https://pod.example/report.md' })
  })

  it('projects active cell draft value updates without React state access', () => {
    const projectStructuredActiveCellValue = (
      cellEditWorkflowModel as typeof cellEditWorkflowModel & {
        projectStructuredActiveCellValue?: <T extends { value: string }>(current: T | null, value: string) => T | null
      }
    ).projectStructuredActiveCellValue

    expect(projectStructuredActiveCellValue).toBeTypeOf('function')
    if (!projectStructuredActiveCellValue) return

    const commit = (next: string) => `"${next}"`
    const textCell = {
      subject: '#Task',
      predicate: 'title',
      value: 'Draft',
      kind: 'text' as const,
      commit,
    }

    expect(projectStructuredActiveCellValue(textCell, 'Updated')).toEqual({
      subject: '#Task',
      predicate: 'title',
      value: 'Updated',
      kind: 'text',
      commit,
    })
    expect(projectStructuredActiveCellValue(null, 'Updated')).toBeNull()
  })

  it('projects target-scoped active cell clearing without leaking match logic into controllers', () => {
    const projectStructuredActiveCellClearedForTarget = (
      cellEditWorkflowModel as typeof cellEditWorkflowModel & {
        projectStructuredActiveCellClearedForTarget?: <T extends { subject: string; predicate: string }>(
          current: T | null,
          target: { subject: string; predicate: string },
        ) => T | null
      }
    ).projectStructuredActiveCellClearedForTarget

    expect(projectStructuredActiveCellClearedForTarget).toBeTypeOf('function')
    if (!projectStructuredActiveCellClearedForTarget) return

    const activeCell = {
      subject: '#Task',
      predicate: 'status',
    }

    expect(projectStructuredActiveCellClearedForTarget(activeCell, {
      subject: '#Task',
      predicate: 'status',
    })).toBeNull()
    expect(projectStructuredActiveCellClearedForTarget(activeCell, {
      subject: '#Other',
      predicate: 'status',
    })).toBe(activeCell)
    expect(projectStructuredActiveCellClearedForTarget(null, {
      subject: '#Task',
      predicate: 'status',
    })).toBeNull()
  })
})
