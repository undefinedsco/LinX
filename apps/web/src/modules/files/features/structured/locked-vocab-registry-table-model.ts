import type { LockedVocabRegistryKind, LockedVocabRegistryRow } from '../../domain/structured/structured-table'

export interface LockedVocabRegistryColumn {
  key: keyof LockedVocabRegistryRow
  label: string
  className?: string
}

export interface LockedVocabRegistryCellOpenAction {
  ariaLabel: string
  rowUri: string
}

export interface LockedVocabRegistryDisplayCell {
  accessibleLabel: string
  key: keyof LockedVocabRegistryRow
  className?: string
  openAction: LockedVocabRegistryCellOpenAction | null
  text: string
}

export interface LockedVocabRegistryDisplayRow {
  row: LockedVocabRegistryRow
  cells: LockedVocabRegistryDisplayCell[]
}

export const LOCKED_VOCAB_REGISTRY_TABLE_CHROME = {
  searchField: { placeholder: '搜索定义' },
  emptyState: { label: '没有匹配的定义' },
  fallbackCell: { label: '—' },
}

export const LOCKED_VOCAB_REGISTRY_COLUMNS: Record<LockedVocabRegistryKind, LockedVocabRegistryColumn[]> = {
  terms: [
    { key: 'uri', label: '术语 URI', className: 'font-medium text-foreground/80' },
    { key: 'label', label: '名称' },
    { key: 'definition', label: '说明' },
    { key: 'kind', label: '类型' },
    { key: 'range', label: '值类型' },
    { key: 'status', label: '状态' },
    { key: 'shape', label: 'Shape' },
  ],
  shapes: [
    { key: 'uri', label: '规则 URI', className: 'font-medium text-foreground/80' },
    { key: 'label', label: '名称' },
    { key: 'term', label: 'term' },
    { key: 'classScope', label: 'class' },
    { key: 'constraint', label: '约束' },
    { key: 'status', label: '状态' },
  ],
  namespaces: [
    { key: 'prefix', label: '前缀', className: 'font-medium text-foreground/80' },
    { key: 'namespace', label: '命名空间' },
    { key: 'uri', label: 'URI' },
    { key: 'status', label: '状态' },
    { key: 'definition', label: '说明' },
  ],
}

function lockedVocabRegistryOpenNoun(registryKind: LockedVocabRegistryKind) {
  if (registryKind === 'shapes') return 'shape'
  if (registryKind === 'namespaces') return 'namespace'
  return 'term'
}

function lockedVocabRegistryRowOpenLabel(row: LockedVocabRegistryRow) {
  return row.label || row.prefix || row.uri
}

function projectLockedVocabRegistryCellOpenAction(
  registryKind: LockedVocabRegistryKind,
  row: LockedVocabRegistryRow,
  column: LockedVocabRegistryColumn,
): LockedVocabRegistryCellOpenAction | null {
  if (!row.uri || (column.key !== 'uri' && column.key !== 'label')) return null
  const label = lockedVocabRegistryRowOpenLabel(row)
  if (!label) return null

  return {
    ariaLabel: `Open ${lockedVocabRegistryOpenNoun(registryKind)} ${label}`,
    rowUri: row.uri,
  }
}

function projectLockedVocabRegistryDisplayRows(
  registryKind: LockedVocabRegistryKind,
  rows: LockedVocabRegistryRow[],
  columns: LockedVocabRegistryColumn[],
): LockedVocabRegistryDisplayRow[] {
  return rows.map((row) => ({
    row,
    cells: columns.map((column) => ({
      accessibleLabel: String(row[column.key] ?? '') || LOCKED_VOCAB_REGISTRY_TABLE_CHROME.fallbackCell.label,
      key: column.key,
      className: column.className,
      openAction: projectLockedVocabRegistryCellOpenAction(registryKind, row, column),
      text: String(row[column.key] ?? ''),
    })),
  }))
}

export function projectLockedVocabRegistryTableModel({
  registryKind,
  rows,
  searchText,
}: {
  registryKind: LockedVocabRegistryKind
  rows: LockedVocabRegistryRow[]
  searchText: string
}) {
  const columns = LOCKED_VOCAB_REGISTRY_COLUMNS[registryKind]
  const normalizedSearch = searchText.trim().toLowerCase()
  const filteredRows = normalizedSearch
    ? rows.filter((row) => (
        columns.some((column) => String(row[column.key] ?? '').toLowerCase().includes(normalizedSearch))
      ))
    : rows
  const displayRows = projectLockedVocabRegistryDisplayRows(registryKind, filteredRows, columns)

  return {
    chrome: LOCKED_VOCAB_REGISTRY_TABLE_CHROME,
    columns,
    displayRows,
    filteredRows,
    hasFilteredRows: filteredRows.length > 0,
  }
}
