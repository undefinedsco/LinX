/** Rules behind the column dialogs (R6 K6d): what they start from and what they hand back. */
import {
  classifyStructuredColumnValueKind,
  type StructuredColumnFilter,
  type StructuredColumnValueKind,
} from '../../domain/structured/structured-column-filter'

export type StructuredColumnFilterDialogMode = 'contains' | 'range' | 'empty' | 'filled'

export type StructuredColumnFilterDialogDraft = {
  mode: StructuredColumnFilterDialogMode
  text: string
  min: string
  max: string
}

export function projectStructuredColumnFilterDialogDraft(
  filter: StructuredColumnFilter | undefined,
  valueKind: StructuredColumnValueKind,
): StructuredColumnFilterDialogDraft {
  const blank: StructuredColumnFilterDialogDraft = {
    mode: valueKind === 'number' || valueKind === 'date' ? 'range' : 'contains',
    text: '',
    min: '',
    max: '',
  }
  if (!filter) return blank
  if (filter.kind === 'contains') return { ...blank, mode: 'contains', text: filter.text }
  if (filter.kind === 'range') return { ...blank, mode: 'range', min: filter.min ?? '', max: filter.max ?? '' }
  if (filter.kind === 'empty') return { ...blank, mode: filter.empty ? 'empty' : 'filled' }
  return blank
}

/** A draft that would hide nothing hands back `null`, which clears the column's filter. */
export function planStructuredColumnFilterDialogSubmit(
  draft: StructuredColumnFilterDialogDraft,
  predicate: string,
): StructuredColumnFilter | null {
  if (draft.mode === 'empty') return { predicate, kind: 'empty', empty: true }
  if (draft.mode === 'filled') return { predicate, kind: 'empty', empty: false }
  if (draft.mode === 'range') {
    const min = draft.min.trim() || null
    const max = draft.max.trim() || null
    return min === null && max === null ? null : { predicate, kind: 'range', min, max }
  }
  const text = draft.text.trim()
  return text ? { predicate, kind: 'contains', text } : null
}

/** The type option (`PREDICATE_VALUE_TYPE_OPTIONS` value) a column's stored value type stands for. */
export function projectStructuredColumnTypeDialogCurrent(valueType: string): string {
  const normalized = valueType.trim().toLowerCase()
  if (['text', 'number', 'date', 'boolean', 'enum', 'contact', 'relation', 'url'].includes(normalized)) return normalized
  const kind: StructuredColumnValueKind = classifyStructuredColumnValueKind(normalized)
  if (kind === 'choice') return 'enum'
  return kind
}
