import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'

import type {
  StructuredColumnFilter,
  StructuredColumnValueKind,
} from '../../domain/structured/structured-column-filter'
import { structuredBooleanFilterLabel } from './structured-column-header-menu-model'

/**
 * 按它筛选 as a menu entry, shared by the column header menu and the toolbar's 筛选 menu.
 * A column with a short list of options (选项, 是 / 否) is filtered right here by ticking values;
 * text, numbers and dates open a small dialog instead.
 */
export function StructuredColumnFilterMenuEntry({
  filter,
  label,
  onChange,
  onOpenDialog,
  predicate,
  values,
  valueKind,
}: {
  filter?: StructuredColumnFilter
  label: string
  onChange: (filter: StructuredColumnFilter | null) => void
  onOpenDialog: () => void
  predicate: string
  /** What the column holds now (and its known options). */
  values: readonly string[]
  valueKind: StructuredColumnValueKind
}) {
  if (valueKind !== 'choice' && valueKind !== 'boolean') {
    return (
      <DropdownMenuItem data-column-filter-entry={predicate} onSelect={onOpenDialog}>
        {label}
      </DropdownMenuItem>
    )
  }
  const options = valueKind === 'boolean' ? ['true', 'false'] : values
  const selected = filter?.kind === 'values' ? filter.values : []
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger data-column-filter-entry={predicate}>{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
        {options.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">还没有可以选的值</div>
        ) : options.map((value) => (
          <DropdownMenuCheckboxItem
            key={value}
            checked={selected.includes(value)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) => {
              const next = checked === true ? [...selected, value] : selected.filter((entry) => entry !== value)
              onChange(next.length > 0 ? { predicate, kind: 'values', values: next } : null)
            }}
          >
            {valueKind === 'boolean' ? structuredBooleanFilterLabel(value) : value}
          </DropdownMenuCheckboxItem>
        ))}
        {filter ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(null)}>清除筛选</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
