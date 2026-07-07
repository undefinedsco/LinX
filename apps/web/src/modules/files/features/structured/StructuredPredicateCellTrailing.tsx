import type { StructuredPredicateCellChrome } from './structured-projection-cell-chrome'
import {
  PendingCellWriteButton,
  ShapeWarningIndicator,
} from './StructuredTableCellPrimitives'

type StructuredPredicateCellShapeWarningModel = NonNullable<StructuredPredicateCellChrome['shapeWarning']>
type StructuredPredicateCellPendingWriteModel = NonNullable<StructuredPredicateCellChrome['pendingWrite']>

export function StructuredPredicateCellShapeWarning({
  warning,
}: {
  warning?: StructuredPredicateCellShapeWarningModel | null
}) {
  return warning ? (
    <ShapeWarningIndicator
      ariaLabel={warning.ariaLabel}
      title={warning.title}
    />
  ) : null
}

export function StructuredPredicateCellPendingWriteControl({
  enabled = true,
  fallbackPredicateLabel,
  fallbackSubject,
  onDiscardPendingWrite,
  pendingWrite,
}: {
  enabled?: boolean
  fallbackPredicateLabel?: string
  fallbackSubject?: string
  onDiscardPendingWrite?: () => void
  pendingWrite?: StructuredPredicateCellPendingWriteModel | null
}) {
  if (!enabled) return null
  const predicateLabel = pendingWrite?.predicateLabel ?? fallbackPredicateLabel
  const subject = pendingWrite?.subject ?? fallbackSubject
  if (!predicateLabel || !subject) return null
  return (
    <PendingCellWriteButton
      predicateLabel={predicateLabel}
      subject={subject}
      status={pendingWrite?.status}
      onDiscard={pendingWrite?.discardable ? onDiscardPendingWrite : undefined}
    />
  )
}

export function StructuredPredicateCellTrailing({
  onDiscardPendingWrite,
  pendingWrite,
  shapeWarning,
}: {
  onDiscardPendingWrite?: () => void
  pendingWrite?: StructuredPredicateCellPendingWriteModel | null
  shapeWarning?: StructuredPredicateCellShapeWarningModel | null
}) {
  return (
    <>
      <StructuredPredicateCellShapeWarning warning={shapeWarning} />
      <StructuredPredicateCellPendingWriteControl
        pendingWrite={pendingWrite}
        onDiscardPendingWrite={onDiscardPendingWrite}
      />
    </>
  )
}
