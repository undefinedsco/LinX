import type { ColumnSizingState } from '@tanstack/react-table'

export const MIN_STRUCTURED_COLUMN_WIDTH = 48

export type StructuredColumnSizingUpdater = ColumnSizingState | ((old: ColumnSizingState) => ColumnSizingState)

export function projectStructuredColumnSizingFromInput(
  columnSizing?: ColumnSizingState,
): ColumnSizingState {
  return columnSizing ?? {}
}

export function projectStructuredColumnSizingUpdate({
  current,
  updater,
}: {
  current: ColumnSizingState
  updater: StructuredColumnSizingUpdater
}): ColumnSizingState {
  return typeof updater === 'function' ? updater(current) : updater
}

export function projectStructuredColumnResizeSize({
  currentClientX,
  startClientX,
  startSize,
}: {
  currentClientX: number
  startClientX: number
  startSize: number
}) {
  return Math.max(MIN_STRUCTURED_COLUMN_WIDTH, Math.round(startSize + currentClientX - startClientX))
}

export function projectStructuredColumnSizingColumnSize({
  columnId,
  current,
  nextSize,
}: {
  columnId: string
  current: ColumnSizingState
  nextSize: number
}): ColumnSizingState {
  return {
    ...current,
    [columnId]: nextSize,
  }
}
