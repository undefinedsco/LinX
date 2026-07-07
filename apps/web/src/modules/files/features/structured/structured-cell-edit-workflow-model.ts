import type {
  StructuredCellEditorPredicateDefinition,
  StructuredCellScalarEditorKind,
} from '../../domain/structured/structured-cell-editor-plan'
import {
  quoteStructuredCellResourceValue,
  resolveStructuredCellEditorPlan,
} from '../../domain/structured/structured-cell-editor-plan'
import { sameStructuredCellValues } from '../../domain/structured/structured-table-cell-model'
import type { StructuredProjectionTableRow } from './structured-projection-table-model'

export type StructuredCellActivationPlan =
  | { kind: 'none' }
  | { kind: 'open-enum'; subject: string; predicate: string }
  | { kind: 'toggle-boolean'; subject: string; predicate: string; nextValues: string[] }
  | { kind: 'open-relation'; subject: string; predicate: string; value: string }
  | {
      kind: 'open-scalar'
      subject: string
      predicate: string
      value: string
      scalarKind: StructuredCellScalarEditorKind
      commit: (next: string) => string
    }

type StructuredTextCommitCellInput = {
  subject: string
  predicate: string
  value: string
  commit: (next: string) => string
}

type StructuredRelationCommitCellInput = {
  subject: string
  predicate: string
  value: string
}

type StructuredActiveCellTarget = {
  subject: string
  predicate: string
}

type StructuredActiveCellWithValue = {
  value: string
}

export type StructuredCellEditorActiveCell = StructuredActiveCellTarget

export type StructuredCellEditorActiveTextCell = StructuredCellEditorActiveCell & {
  value: string
  kind: StructuredCellScalarEditorKind
  commit: (next: string) => string
}

export type StructuredCellEditorActiveRelationCell = StructuredCellEditorActiveCell & {
  value: string
}

export type StructuredCellCommitPlan =
  | { kind: 'none' }
  | { kind: 'cell-write'; subject: string; predicate: string; nextValues: string[] }

export type StructuredCellActivationEffect =
  | { kind: 'none' }
  | { kind: 'open-enum'; cell: { subject: string; predicate: string } }
  | { kind: 'stage-cell-write'; subject: string; predicate: string; nextValues: string[]; clearPopover: boolean }
  | { kind: 'open-relation'; cell: { subject: string; predicate: string; value: string } }
  | {
    kind: 'open-text'
    cell: {
      subject: string
      predicate: string
      value: string
      kind: StructuredCellScalarEditorKind
      commit: (next: string) => string
    }
  }

export type StructuredCellKeyDownAction =
  | { kind: 'none'; preventDefault: false }
  | { kind: 'start-edit'; preventDefault: true }
  | { kind: 'commit-text'; nextValue: string; preventDefault: true }
  | { kind: 'discard-draft'; preventDefault: true }

export type StructuredCellOutsidePointerAction =
  | { kind: 'none' }
  | { kind: 'close-popover' }
  | { kind: 'commit-relation'; nextValue: string }

export type StructuredCellEditorState = {
  activeEnumCell: StructuredCellEditorActiveCell | null
  activeRelationCell: StructuredCellEditorActiveRelationCell | null
  activeTextCell: StructuredCellEditorActiveTextCell | null
  enumSearch: string
}

export type StructuredCellEditorStateAction =
  | { type: 'reset' }
  | { type: 'close-popover' }
  | { type: 'clear-text' }
  | { type: 'clear-enum' }
  | { type: 'clear-relation' }
  | { type: 'open-enum'; cell: StructuredCellEditorActiveCell }
  | { type: 'open-relation'; cell: StructuredCellEditorActiveRelationCell }
  | { type: 'open-text'; cell: StructuredCellEditorActiveTextCell }
  | { type: 'update-text-value'; value: string }
  | { type: 'update-relation-value'; value: string }
  | { type: 'update-enum-search'; value: string }
  | { type: 'clear-target'; target: StructuredActiveCellTarget }

export function createStructuredCellEditorState(): StructuredCellEditorState {
  return {
    activeEnumCell: null,
    activeRelationCell: null,
    activeTextCell: null,
    enumSearch: '',
  }
}

export function projectStructuredCellEditorState(
  current: StructuredCellEditorState,
  action: StructuredCellEditorStateAction,
): StructuredCellEditorState {
  switch (action.type) {
    case 'reset':
      return createStructuredCellEditorState()
    case 'close-popover':
      return {
        ...current,
        activeEnumCell: null,
        activeRelationCell: null,
        enumSearch: '',
      }
    case 'clear-text':
      return {
        ...current,
        activeTextCell: null,
      }
    case 'clear-enum':
      return {
        ...current,
        activeEnumCell: null,
        enumSearch: '',
      }
    case 'clear-relation':
      return {
        ...current,
        activeRelationCell: null,
      }
    case 'open-enum':
      return {
        ...current,
        activeEnumCell: action.cell,
        activeRelationCell: null,
        activeTextCell: null,
        enumSearch: '',
      }
    case 'open-relation':
      return {
        ...current,
        activeEnumCell: null,
        activeRelationCell: action.cell,
        activeTextCell: null,
      }
    case 'open-text':
      return {
        ...current,
        activeEnumCell: null,
        activeRelationCell: null,
        activeTextCell: action.cell,
      }
    case 'update-text-value':
      return {
        ...current,
        activeTextCell: projectStructuredActiveCellValue(current.activeTextCell, action.value),
      }
    case 'update-relation-value':
      return {
        ...current,
        activeRelationCell: projectStructuredActiveCellValue(current.activeRelationCell, action.value),
      }
    case 'update-enum-search':
      return {
        ...current,
        enumSearch: action.value,
      }
    case 'clear-target':
      return {
        activeEnumCell: projectStructuredActiveCellClearedForTarget(current.activeEnumCell, action.target),
        activeRelationCell: projectStructuredActiveCellClearedForTarget(current.activeRelationCell, action.target),
        activeTextCell: projectStructuredActiveCellClearedForTarget(current.activeTextCell, action.target),
        enumSearch: '',
      }
  }
}

export function hasStructuredCellEditPendingProposal(input: {
  hasCellWriteProposal: boolean
  originalValues: readonly string[]
  nextValues: readonly string[]
}): boolean {
  return input.hasCellWriteProposal || !sameStructuredCellValues(input.originalValues, input.nextValues)
}

export function projectStructuredActiveCellValue<TCell extends StructuredActiveCellWithValue>(
  current: TCell | null,
  value: string,
): TCell | null {
  return current ? { ...current, value } : current
}

export function projectStructuredActiveCellClearedForTarget<TCell extends StructuredActiveCellTarget>(
  current: TCell | null,
  target: StructuredActiveCellTarget,
): TCell | null {
  if (!current) return current
  return current.subject === target.subject && current.predicate === target.predicate ? null : current
}

export function planStructuredCellActivation(input: {
  editable: boolean
  row: Pick<StructuredProjectionTableRow, 'subject' | 'pending' | 'cells'>
  predicate: string
  definition?: StructuredCellEditorPredicateDefinition
}): StructuredCellActivationPlan {
  if (!input.editable || input.row.pending) return { kind: 'none' }

  const values = input.row.cells[input.predicate] ?? []
  const editorPlan = resolveStructuredCellEditorPlan(input.definition, values)
  const cell = {
    subject: input.row.subject,
    predicate: input.predicate,
  }

  if (editorPlan.kind === 'enum') return { kind: 'open-enum', ...cell }
  if (editorPlan.kind === 'boolean') {
    return {
      kind: 'toggle-boolean',
      ...cell,
      nextValues: [editorPlan.nextValue],
    }
  }
  if (editorPlan.kind === 'relation') {
    return {
      kind: 'open-relation',
      ...cell,
      value: editorPlan.value,
    }
  }
  if (editorPlan.kind === 'scalar') {
    return {
      kind: 'open-scalar',
      ...cell,
      value: editorPlan.value,
      scalarKind: editorPlan.scalarKind,
      commit: editorPlan.commit,
    }
  }

  return { kind: 'none' }
}

export function planStructuredCellActivationEffect(
  plan: StructuredCellActivationPlan,
): StructuredCellActivationEffect {
  if (plan.kind === 'none') return { kind: 'none' }
  if (plan.kind === 'open-enum') {
    return {
      kind: 'open-enum',
      cell: {
        subject: plan.subject,
        predicate: plan.predicate,
      },
    }
  }
  if (plan.kind === 'toggle-boolean') {
    return {
      kind: 'stage-cell-write',
      clearPopover: true,
      subject: plan.subject,
      predicate: plan.predicate,
      nextValues: plan.nextValues,
    }
  }
  if (plan.kind === 'open-relation') {
    return {
      kind: 'open-relation',
      cell: {
        subject: plan.subject,
        predicate: plan.predicate,
        value: plan.value,
      },
    }
  }
  return {
    kind: 'open-text',
    cell: {
      subject: plan.subject,
      predicate: plan.predicate,
      value: plan.value,
      kind: plan.scalarKind,
      commit: plan.commit,
    },
  }
}

export function planStructuredTextCellCommit(input: {
  activeCell: StructuredTextCommitCellInput | null
  nextValue?: string
}): StructuredCellCommitPlan {
  if (!input.activeCell) return { kind: 'none' }

  const displayValue = input.nextValue ?? input.activeCell.value
  return {
    kind: 'cell-write',
    subject: input.activeCell.subject,
    predicate: input.activeCell.predicate,
    nextValues: displayValue.trim() ? [input.activeCell.commit(displayValue)] : [],
  }
}

export function planStructuredRelationCellCommit(input: {
  activeCell: StructuredRelationCommitCellInput | null
  nextValue?: string
}): StructuredCellCommitPlan {
  if (!input.activeCell) return { kind: 'none' }

  const normalized = (input.nextValue ?? input.activeCell.value).trim()
  return {
    kind: 'cell-write',
    subject: input.activeCell.subject,
    predicate: input.activeCell.predicate,
    nextValues: normalized ? [quoteStructuredCellResourceValue(normalized)] : [],
  }
}

export function planStructuredCellKeyDownAction(input: {
  key: string
  rowSubject: string
  predicate: string
  targetValue: string
  activeTextCell: StructuredTextCommitCellInput | null
}): StructuredCellKeyDownAction {
  const isActiveTextCell = input.activeTextCell?.subject === input.rowSubject
    && input.activeTextCell.predicate === input.predicate

  if (isActiveTextCell) {
    if (input.key === 'Enter') {
      return {
        kind: 'commit-text',
        nextValue: input.targetValue,
        preventDefault: true,
      }
    }
    if (input.key === 'Escape') {
      return { kind: 'discard-draft', preventDefault: true }
    }
    return { kind: 'none', preventDefault: false }
  }

  if (input.key === 'Enter' || input.key === ' ') {
    return { kind: 'start-edit', preventDefault: true }
  }
  return { kind: 'none', preventDefault: false }
}

export function planStructuredCellOutsidePointerAction(input: {
  hasActiveEnumCell: boolean
  activeRelationValue: string | null
  targetInsideInteractiveLayer: boolean
}): StructuredCellOutsidePointerAction {
  if ((!input.hasActiveEnumCell && input.activeRelationValue === null) || input.targetInsideInteractiveLayer) {
    return { kind: 'none' }
  }
  if (input.activeRelationValue !== null) {
    return {
      kind: 'commit-relation',
      nextValue: input.activeRelationValue,
    }
  }
  return { kind: 'close-popover' }
}
