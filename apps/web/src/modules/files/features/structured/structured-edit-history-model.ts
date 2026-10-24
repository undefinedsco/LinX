import {
  displayRdfValue,
  expandRdfIri,
  isRdfLiteralToken,
  localRdfName,
  type RdfPrefixes,
} from '../../domain/card/rdf-term-tokens'

/**
 * R6 K6: the table toolbar's 撤销 / 重做 for the person's own edits in this session.
 * The history is in memory, per table document, and holds at most {@link STRUCTURED_EDIT_HISTORY_LIMIT} steps.
 */
export const STRUCTURED_EDIT_HISTORY_LIMIT = 50

export type StructuredEditChange = {
  subject: string
  predicate: string
  previousValues: string[]
  nextValues: string[]
}

/** One step: a cell change, or several written together (a new card on a board, a bulk delete). */
export type StructuredEditEntry = {
  id: string
  /** Names a multi-change step, e.g. 添加「周禾」; a single cell change is described from the change itself. */
  title?: string
  changes: StructuredEditChange[]
}

export type StructuredEditHistory = {
  undo: StructuredEditEntry[]
  redo: StructuredEditEntry[]
}

export type StructuredEditDirection = 'undo' | 'redo'

export function createStructuredEditHistory(): StructuredEditHistory {
  return { undo: [], redo: [] }
}

export type StructuredEditValueCanonicalizer = (token: string) => string

/**
 * One spelling for a value: a literal is its text, a resource its absolute IRI. The Pod rewrites a
 * document when it patches it, so `udfs:Task`, `<https://undefineds.co/vocab/Task>` and `#row` can all
 * name the same value.
 */
export function createStructuredEditValueCanonicalizer(input: {
  documentUri: string
  prefixes?: RdfPrefixes
}): StructuredEditValueCanonicalizer {
  return (token) => (
    isRdfLiteralToken(token) ? displayRdfValue(token) : expandRdfIri(token, input.documentUri, input.prefixes)
  )
}

/**
 * What the table holds in a cell now. A change names its row and column as the person's edit spelled
 * them (`#Omega`, `rdf:type`); the projection may spell them as absolute IRIs.
 */
export function readStructuredEditCellValues(input: {
  rows: readonly { subject: string; cells: readonly { predicate: string; values: readonly string[] }[] }[]
  documentUri: string
  prefixes?: RdfPrefixes
  subject: string
  predicate: string
}): readonly string[] {
  const expand = (token: string) => expandRdfIri(token, input.documentUri, input.prefixes)
  const subject = expand(input.subject)
  const predicate = expand(input.predicate)
  const row = input.rows.find((candidate) => expand(candidate.subject) === subject)
  return row?.cells.find((cell) => expand(cell.predicate) === predicate)?.values ?? []
}

function normalizedValues(values: readonly string[], canonicalize: StructuredEditValueCanonicalizer) {
  return values.map((value) => canonicalize(value)).sort()
}

/** Compares cell values by what they say, not by how the token is quoted. */
export function sameStructuredEditValues(
  left: readonly string[],
  right: readonly string[],
  canonicalize: StructuredEditValueCanonicalizer = displayRdfValue,
) {
  const a = normalizedValues(left, canonicalize)
  const b = normalizedValues(right, canonicalize)
  return a.length === b.length && a.every((value, index) => value === b[index])
}

export function recordStructuredEdit(
  history: StructuredEditHistory,
  entry: StructuredEditEntry,
  limit = STRUCTURED_EDIT_HISTORY_LIMIT,
): StructuredEditHistory {
  const changes = entry.changes.filter((change) => !sameStructuredEditValues(change.previousValues, change.nextValues))
  if (changes.length === 0) return history
  // A new edit starts a new line of history: what was undone can no longer be redone.
  return { undo: [...history.undo, { ...entry, changes }].slice(-limit), redo: [] }
}

export function peekStructuredEdit(history: StructuredEditHistory, direction: StructuredEditDirection) {
  const stack = history[direction]
  return stack[stack.length - 1] ?? null
}

/**
 * The writes that carry a step out. `previousValues` is what the cell must hold now,
 * `nextValues` what it becomes. Undo runs the step backwards.
 */
export function planStructuredEditStep(
  entry: StructuredEditEntry,
  direction: StructuredEditDirection,
): StructuredEditChange[] {
  if (direction === 'redo') return entry.changes.map((change) => ({ ...change }))
  return [...entry.changes].reverse().map((change) => ({
    subject: change.subject,
    predicate: change.predicate,
    previousValues: change.nextValues,
    nextValues: change.previousValues,
  }))
}

/** The first write whose cell no longer holds what the step expects (it changed elsewhere). */
export function findStructuredEditConflict(
  changes: readonly StructuredEditChange[],
  readCellValues: (subject: string, predicate: string) => readonly string[],
  canonicalize?: StructuredEditValueCanonicalizer,
): StructuredEditChange | null {
  return changes.find((change) => !sameStructuredEditValues(
    readCellValues(change.subject, change.predicate),
    change.previousValues,
    canonicalize,
  )) ?? null
}

/** The step was carried out: it moves to the other stack. */
export function completeStructuredEditStep(
  history: StructuredEditHistory,
  direction: StructuredEditDirection,
  limit = STRUCTURED_EDIT_HISTORY_LIMIT,
): StructuredEditHistory {
  const entry = peekStructuredEdit(history, direction)
  if (!entry) return history
  if (direction === 'undo') {
    return { undo: history.undo.slice(0, -1), redo: [...history.redo, entry].slice(-limit) }
  }
  return { undo: [...history.undo, entry].slice(-limit), redo: history.redo.slice(0, -1) }
}

/** The step cannot be carried out any more: it leaves the history. */
export function dropStructuredEditStep(
  history: StructuredEditHistory,
  direction: StructuredEditDirection,
): StructuredEditHistory {
  if (history[direction].length === 0) return history
  return { ...history, [direction]: history[direction].slice(0, -1) }
}

/** Cmd/Ctrl+Z undoes, Shift+Cmd/Ctrl+Z (or Ctrl+Y) redoes. Not while a text editor has the keyboard. */
export function planStructuredEditHistoryShortcut(input: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey?: boolean
  defaultPrevented?: boolean
  targetIsTextEditor: boolean
}): StructuredEditDirection | null {
  if (input.defaultPrevented || input.targetIsTextEditor || input.altKey) return null
  if (!input.metaKey && !input.ctrlKey) return null
  const key = input.key.toLowerCase()
  if (key === 'z') return input.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && input.ctrlKey && !input.metaKey && !input.shiftKey) return 'redo'
  return null
}

export function isStructuredTextEditorTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  return !!target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="combobox"]')
}

function valueText(values: readonly string[]) {
  return values.map((value) => {
    const text = displayRdfValue(value)
    return /^(?:https?:\/\/|#|\.\/)/.test(text) ? localRdfName(text) : text
  }).join('、')
}

export function isTypePredicate(predicate: string) {
  return predicate === 'rdf:type' || /#type$/.test(predicate)
}

/** What the step did, in the person's words: 把 状态 改成 进行中. */
export function describeStructuredEdit(
  entry: StructuredEditEntry,
  predicateLabel: (predicate: string) => string = (predicate) => predicate,
): string {
  if (entry.title) return entry.title
  const change = entry.changes[0]
  if (!change) return '这一步修改'
  const label = predicateLabel(change.predicate)
  const hasPrevious = change.previousValues.length > 0
  const hasNext = change.nextValues.length > 0
  if (isTypePredicate(change.predicate)) {
    const name = `「${localRdfName(change.subject)}」`
    if (!hasPrevious && hasNext) return `添加${name}`
    if (hasPrevious && !hasNext) return `删除${name}`
  }
  if (!hasNext) return `清空 ${label}`
  if (!hasPrevious) return `把 ${label} 设为 ${valueText(change.nextValues)}`
  return `把 ${label} 改成 ${valueText(change.nextValues)}`
}
