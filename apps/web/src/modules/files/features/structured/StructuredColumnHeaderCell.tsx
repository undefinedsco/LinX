import type { ReactNode } from 'react'
import { Check, ListFilter } from 'lucide-react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import type { StructuredColumnFilter } from '../../domain/structured/structured-column-filter'
import {
  projectStructuredColumnHeaderMenu,
  type StructuredColumnHeaderMenuItemId,
  type StructuredColumnSortState,
} from './structured-column-header-menu-model'
import { StructuredColumnFilterMenuEntry } from './StructuredColumnFilterSubmenu'
import { StructuredPredicateTypeIcon } from './StructuredTableCellPrimitives'

/** What a column's menu can do. A missing handler turns its item off. */
export type StructuredColumnHeaderActions = {
  filter?: StructuredColumnFilter
  /** Values the column holds now (and its known options), for the option filter. */
  filterValues: string[]
  onFilterChange: (filter: StructuredColumnFilter | null) => void
  onSort: (direction: 'asc' | 'desc' | null) => void
  /** Opens the dialog for a text, number or date column's filter. */
  onOpenFilterDialog: () => void
  /** These open a dialog, which is kept outside the header (see useStructuredColumnMenuController). */
  onRename?: () => void
  onChangeType?: () => void
  onHide?: () => void
  onRemove?: () => void
  onOpenDefinition?: () => void
}

export function StructuredColumnHeaderCell({
  actions,
  description,
  editable,
  isNameColumn = false,
  label,
  predicate,
  sort,
  sortIcon,
  termIsEditable,
  typeLabel,
}: {
  actions: StructuredColumnHeaderActions
  description?: string
  editable: boolean
  isNameColumn?: boolean
  label: string
  predicate: string
  sort: StructuredColumnSortState
  sortIcon?: ReactNode
  termIsEditable: boolean
  typeLabel: string
}) {
  const menu = projectStructuredColumnHeaderMenu({
    description,
    editable,
    filter: actions.filter,
    isNameColumn,
    label,
    sort,
    termIsEditable: termIsEditable && !!actions.onChangeType,
    typeLabel,
  })
  const itemDisabled = (id: StructuredColumnHeaderMenuItemId) => {
    const item = menu.items.find((candidate) => candidate.id === id)
    if (!item) return true
    if (id === 'rename') return !actions.onRename
    if (id === 'hide') return !actions.onHide
    if (id === 'remove') return !actions.onRemove
    if (id === 'openDefinition') return !actions.onOpenDefinition
    return item.disabled
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 items-center gap-1 hover:text-foreground"
            aria-label={`${label} 列菜单`}
            data-column-menu-trigger={predicate}
          >
            {isNameColumn ? null : <StructuredPredicateTypeIcon typeLabel={typeLabel} />}
            <span className="min-w-0 truncate">{label}</span>
            {sortIcon}
            {menu.filterActive ? <ListFilter aria-hidden="true" className="h-3 w-3 shrink-0 text-primary" /> : null}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60" data-column-menu="true">
          <div className="px-2 py-1.5">
            <p className="truncate text-sm font-semibold text-foreground">{menu.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">{menu.typeCaption}</p>
            {menu.description ? (
              <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{menu.description}</p>
            ) : null}
          </div>
          <DropdownMenuSeparator />
          {menu.items.map((item) => {
            if (item.id === 'sort') {
              return (
                <DropdownMenuSub key={item.id}>
                  <DropdownMenuSubTrigger>{item.label}</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {menu.sortChoices.map((choice) => (
                      <DropdownMenuItem key={choice.direction} onSelect={() => actions.onSort(choice.direction)}>
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                          {choice.checked ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                        </span>
                        {choice.label}
                      </DropdownMenuItem>
                    ))}
                    {menu.canClearSort ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => actions.onSort(null)}>取消排序</DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )
            }
            if (item.id === 'filter') {
              return (
                <StructuredColumnFilterMenuEntry
                  key={item.id}
                  filter={actions.filter}
                  label={item.label}
                  predicate={predicate}
                  values={actions.filterValues}
                  valueKind={menu.valueKind}
                  onChange={actions.onFilterChange}
                  onOpenDialog={actions.onOpenFilterDialog}
                />
              )
            }
            const separatorBefore = item.id === 'remove'
            return (
              <div key={item.id}>
                {separatorBefore ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  disabled={itemDisabled(item.id)}
                  title={item.disabledReason}
                  onSelect={() => {
                    if (item.id === 'rename') actions.onRename?.()
                    else if (item.id === 'changeType') actions.onChangeType?.()
                    else if (item.id === 'remove') actions.onRemove?.()
                    else if (item.id === 'hide') actions.onHide?.()
                    else if (item.id === 'openDefinition') actions.onOpenDefinition?.()
                  }}
                >
                  {item.label}
                </DropdownMenuItem>
              </div>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
