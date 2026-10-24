import { ConfirmDialog } from '@/components/ui/confirm-dialog'

import type {
  StructuredColumnFilter,
  StructuredColumnValueKind,
} from '../../domain/structured/structured-column-filter'
import {
  StructuredColumnFilterDialog,
  StructuredColumnRenameDialog,
  StructuredColumnTypeDialog,
} from './StructuredColumnDialogs'

export type StructuredColumnDialogKind = 'rename' | 'type' | 'filter' | 'remove'

/** The column a dialog is about, with what the dialog starts from. */
export type StructuredColumnDialogModel = {
  kind: StructuredColumnDialogKind
  predicate: string
  /** The name shown in this table. */
  label: string
  /** The name the column has everywhere else, which an empty rename puts back. */
  originalLabel: string
  filter?: StructuredColumnFilter
  typeLabel: string
  valueKind: StructuredColumnValueKind
}

/**
 * The dialogs behind the column menu (R6 K6d). They are rendered here, beside the table, because a
 * column header is rebuilt along with the columns and would take an open dialog with it.
 */
export function StructuredColumnDialogHost({
  dialog,
  onChangeType,
  onClose,
  onFilterChange,
  onRemove,
  onRename,
}: {
  dialog: StructuredColumnDialogModel | null
  onChangeType: (predicate: string, valueType: string) => Promise<boolean> | boolean
  onClose: () => void
  onFilterChange: (predicate: string, filter: StructuredColumnFilter | null) => void
  onRemove: (predicate: string, label: string) => void
  onRename: (predicate: string, label: string) => void
}) {
  if (!dialog) return null
  const closeWhenDismissed = (open: boolean) => {
    if (!open) onClose()
  }
  if (dialog.kind === 'rename') {
    return (
      <StructuredColumnRenameDialog
        open
        currentLabel={dialog.label}
        originalLabel={dialog.originalLabel}
        onOpenChange={closeWhenDismissed}
        onRename={(label) => onRename(dialog.predicate, label)}
      />
    )
  }
  if (dialog.kind === 'type') {
    return (
      <StructuredColumnTypeDialog
        open
        columnLabel={dialog.label}
        currentType={dialog.typeLabel}
        onChangeType={(valueType) => onChangeType(dialog.predicate, valueType)}
        onOpenChange={closeWhenDismissed}
      />
    )
  }
  if (dialog.kind === 'filter') {
    return (
      <StructuredColumnFilterDialog
        open
        columnLabel={dialog.label}
        filter={dialog.filter}
        predicate={dialog.predicate}
        valueKind={dialog.valueKind}
        onApply={(filter) => onFilterChange(dialog.predicate, filter)}
        onOpenChange={closeWhenDismissed}
      />
    )
  }
  return (
    <ConfirmDialog
      open
      title={`从这张表去掉“${dialog.label}”？`}
      description="只是这张表不再显示这一列，卡片上的值都保留。要彻底删掉这个属性，去“词表 › 属性”。"
      confirmLabel="去掉"
      onOpenChange={closeWhenDismissed}
      onConfirm={() => {
        onRemove(dialog.predicate, dialog.label)
        onClose()
      }}
    />
  )
}
