import { describe, expect, it } from 'vitest'

import type { LockedVocabRegistryRow } from '../../domain/structured/structured-table'
import { projectLockedVocabRegistryTableModel } from './locked-vocab-registry-table-model'

function registryRow(overrides: Partial<LockedVocabRegistryRow>): LockedVocabRegistryRow {
  return {
    registryKind: 'terms',
    uri: '',
    label: '',
    definition: '',
    kind: '',
    range: '',
    status: '',
    shape: '',
    predicate: '',
    term: '',
    classScope: '',
    constraint: '',
    prefix: '',
    namespace: '',
    ...overrides,
  }
}

describe('locked vocab registry table model', () => {
  it('projects locked vocab columns and filters visible terms across column values', () => {
    const rows = [
      registryRow({
        uri: 'https://pod.example/.vocab/terms.ttl#Task',
        label: 'Task',
        definition: 'Work item',
        kind: 'class',
        status: 'defined',
      }),
      registryRow({
        uri: 'https://pod.example/.vocab/terms.ttl#ReviewStatus',
        label: 'Review status',
        definition: 'Approval state',
        kind: 'predicate',
        range: 'enum',
        status: 'pending',
        shape: 'status options',
      }),
    ]

    const emptySearch = projectLockedVocabRegistryTableModel({
      registryKind: 'terms',
      rows,
      searchText: '',
    })
    expect(emptySearch.columns.map((column) => column.label)).toEqual([
      '术语 URI',
      '名称',
      '说明',
      '类型',
      '值类型',
      '状态',
      'Shape',
    ])
    expect(emptySearch.chrome).toEqual({
      searchField: { placeholder: '搜索定义' },
      emptyState: { label: '没有匹配的定义' },
      fallbackCell: { label: '—' },
    })
    expect(emptySearch.filteredRows).toBe(rows)
    expect(emptySearch.hasFilteredRows).toBe(true)

    const approvalSearch = projectLockedVocabRegistryTableModel({
      registryKind: 'terms',
      rows,
      searchText: ' approval ',
    })
    expect(approvalSearch.filteredRows.map((row) => row.label)).toEqual(['Review status'])

    const enumSearch = projectLockedVocabRegistryTableModel({
      registryKind: 'terms',
      rows,
      searchText: 'enum',
    })
    expect(enumSearch.filteredRows.map((row) => row.label)).toEqual(['Review status'])

    const missingSearch = projectLockedVocabRegistryTableModel({
      registryKind: 'terms',
      rows,
      searchText: 'missing',
    })
    expect(missingSearch.filteredRows).toEqual([])
    expect(missingSearch.hasFilteredRows).toBe(false)
  })

  it('switches the column schema and filtering fields with the registry kind', () => {
    const rows = [
      registryRow({
        registryKind: 'namespaces',
        uri: 'https://schema.org/',
        prefix: 'schema',
        namespace: 'https://schema.org/',
        definition: 'Schema.org namespace',
        status: 'defined',
      }),
      registryRow({
        registryKind: 'namespaces',
        uri: 'https://undefineds.co/vocab/',
        prefix: 'udfs',
        namespace: 'https://undefineds.co/vocab/',
        definition: 'Undefined Systems vocabulary',
        status: 'defined',
      }),
    ]

    const terms = projectLockedVocabRegistryTableModel({
      registryKind: 'terms',
      rows,
      searchText: '',
    })
    expect(terms.columns[0].label).toBe('术语 URI')

    const namespaces = projectLockedVocabRegistryTableModel({
      registryKind: 'namespaces',
      rows,
      searchText: 'udfs',
    })
    expect(namespaces.columns.map((column) => column.label)).toEqual([
      '前缀',
      '命名空间',
      'URI',
      '状态',
      '说明',
    ])
    expect(namespaces.filteredRows.map((row) => row.prefix)).toEqual(['udfs'])
  })

  it('projects per-cell open actions instead of leaving column openability to the renderer', () => {
    const rows = [
      registryRow({
        uri: 'https://pod.example/.vocab/terms.ttl#Status',
        label: 'Status',
        definition: 'Workflow state',
      }),
      registryRow({
        uri: '',
        label: 'No URI',
        definition: 'Missing term identity',
      }),
    ]

    const model = projectLockedVocabRegistryTableModel({
      registryKind: 'terms',
      rows,
      searchText: '',
    })

    expect(model.displayRows[0].cells.map((cell) => ({
      accessibleLabel: cell.accessibleLabel,
      key: cell.key,
      text: cell.text,
      openAction: cell.openAction,
    }))).toEqual([
      {
        accessibleLabel: 'https://pod.example/.vocab/terms.ttl#Status',
        key: 'uri',
        text: 'https://pod.example/.vocab/terms.ttl#Status',
        openAction: {
          ariaLabel: 'Open term Status',
          rowUri: 'https://pod.example/.vocab/terms.ttl#Status',
        },
      },
      {
        accessibleLabel: 'Status',
        key: 'label',
        text: 'Status',
        openAction: {
          ariaLabel: 'Open term Status',
          rowUri: 'https://pod.example/.vocab/terms.ttl#Status',
        },
      },
      { accessibleLabel: 'Workflow state', key: 'definition', text: 'Workflow state', openAction: null },
      { accessibleLabel: '—', key: 'kind', text: '', openAction: null },
      { accessibleLabel: '—', key: 'range', text: '', openAction: null },
      { accessibleLabel: '—', key: 'status', text: '', openAction: null },
      { accessibleLabel: '—', key: 'shape', text: '', openAction: null },
    ])
    expect(model.displayRows[1].cells.find((cell) => cell.key === 'label')?.openAction).toBeNull()
  })
})
