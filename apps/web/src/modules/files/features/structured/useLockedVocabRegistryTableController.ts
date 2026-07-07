import { useMemo, useState } from 'react'

import type { LockedVocabRegistryKind, LockedVocabRegistryRow } from '../../domain/structured/structured-table'
import { projectLockedVocabRegistryTableModel } from './locked-vocab-registry-table-model'

export function useLockedVocabRegistryTableController({
  rows,
  registryKind,
}: {
  rows: LockedVocabRegistryRow[]
  registryKind: LockedVocabRegistryKind
}) {
  const [searchText, setSearchText] = useState('')
  const {
    chrome,
    columns,
    displayRows,
    filteredRows,
    hasFilteredRows,
  } = useMemo(() => projectLockedVocabRegistryTableModel({
    registryKind,
    rows,
    searchText,
  }), [registryKind, rows, searchText])

  return {
    chrome,
    columns,
    displayRows,
    filteredRows,
    hasFilteredRows,
    searchText,
    setSearchText,
  }
}
