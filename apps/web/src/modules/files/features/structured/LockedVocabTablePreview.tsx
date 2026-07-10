import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import type { LockedVocabRegistryKind, LockedVocabRegistryRow } from '../../domain/structured/structured-table'
import type { FilesDetail } from '../../domain/resource/resource-model'
import { StructuredSubjectPeekDrawer } from './StructuredSubjectPeek'
import { StructuredSubjectPeekActions } from './StructuredSubjectPeekActions'
import { useLockedVocabPreviewController } from './useLockedVocabPreviewController'
import { useLockedVocabRegistryTableController } from './useLockedVocabRegistryTableController'

function LockedVocabRegistryTable({
  rows,
  registryKind,
  onOpenTerm,
}: {
  rows: LockedVocabRegistryRow[]
  registryKind: LockedVocabRegistryKind
  onOpenTerm?: (row: LockedVocabRegistryRow) => void
}) {
  const table = useLockedVocabRegistryTableController({ rows, registryKind })

  return (
    <div className="space-y-2">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={table.searchText}
          onChange={(event) => table.setSearchText(event.target.value)}
          placeholder={table.chrome.searchField.placeholder}
          className="h-7 rounded-md border-border/40 bg-background pl-7 text-xs"
        />
      </div>
      <div className="overflow-auto rounded-md border border-border/40 bg-background">
        <table className="min-w-full border-collapse text-left text-[11px]">
          <thead className="bg-background/70 text-muted-foreground">
            <tr>
              {table.columns.map((column) => (
                <th key={column.key} className="border-b border-border/40 px-2 py-1 font-medium">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.displayRows.map((displayRow) => (
              <tr key={displayRow.row.uri} className="odd:bg-muted/20">
                {displayRow.cells.map((cell) => (
                  <td
                    key={cell.key}
                    aria-label={cell.accessibleLabel}
                    className={cn('max-w-[220px] border-b border-border/20 px-2 py-1 text-foreground/70', cell.className)}
                  >
                    {onOpenTerm && cell.openAction ? (
                      <button
                        type="button"
                        className="block max-w-full truncate text-left text-primary underline-offset-2 hover:underline"
                        aria-label={cell.openAction.ariaLabel}
                        title={cell.text}
                        onClick={() => onOpenTerm(displayRow.row)}
                      >
                        {cell.text}
                      </button>
                    ) : (
                      <span className="block truncate" title={cell.text || table.chrome.fallbackCell.label}>
                        {cell.text || table.chrome.fallbackCell.label}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {!table.hasFilteredRows ? (
              <tr>
                <td colSpan={table.columns.length} className="px-2 py-5 text-center text-xs text-muted-foreground">
                  {table.chrome.emptyState.label}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function LockedVocabTablePreview({ file }: { file: FilesDetail }) {
  const lockedVocab = useLockedVocabPreviewController(file)
  const registryKind = lockedVocab.registryKind
  const registryRows = lockedVocab.registryRows

  return (
    <div aria-label={lockedVocab.chrome.viewport.ariaLabel} className="relative min-h-full space-y-3 bg-background px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{lockedVocab.chrome.header.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{lockedVocab.chrome.header.countLabel}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {lockedVocab.chrome.header.readOnlyNote}
          </p>
        </div>
        <span className="rounded-md border border-border/40 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground">
          {lockedVocab.chrome.header.badge.label}
        </span>
      </div>
      <div>
        <LockedVocabRegistryTable rows={registryRows} registryKind={registryKind} onOpenTerm={lockedVocab.openTerm} />
      </div>
      {lockedVocab.primaryProjectionWarning ? (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {lockedVocab.primaryProjectionWarning}
        </div>
      ) : null}
      <StructuredSubjectPeekDrawer
        peek={lockedVocab.termPeek}
        onClose={lockedVocab.closeTermPeek}
      >
        <StructuredSubjectPeekActions
          peek={lockedVocab.termPeek}
          targetIsCurrentFile={lockedVocab.termPeekTargetsCurrentFile}
          onClose={lockedVocab.closeTermPeek}
          onOpenSubjectResource={lockedVocab.openPeekedTermResource}
        />
      </StructuredSubjectPeekDrawer>
    </div>
  )
}
