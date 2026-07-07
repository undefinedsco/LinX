import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { LockedVocabRegistryRow } from '../../domain/structured/structured-table'
import { useLockedVocabRegistryTableController } from './useLockedVocabRegistryTableController'

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

describe('useLockedVocabRegistryTableController', () => {
  it('owns the locked vocab columns and filters visible terms across column values', () => {
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

    const { result } = renderHook(() => useLockedVocabRegistryTableController({
      rows,
      registryKind: 'terms',
    }))

    expect(result.current.columns.map((column) => column.label)).toEqual([
      '术语 URI',
      '名称',
      '说明',
      '类型',
      '值类型',
      '状态',
      'Shape',
    ])
    expect(result.current.searchText).toBe('')
    expect(result.current.chrome).toEqual({
      searchField: { placeholder: '搜索定义' },
      emptyState: { label: '没有匹配的定义' },
      fallbackCell: { label: '—' },
    })
    expect(result.current.filteredRows).toBe(rows)
    expect(result.current.hasFilteredRows).toBe(true)

    act(() => result.current.setSearchText('approval'))

    expect(result.current.filteredRows.map((row) => row.label)).toEqual(['Review status'])
    expect(result.current.hasFilteredRows).toBe(true)

    act(() => result.current.setSearchText('enum'))

    expect(result.current.filteredRows.map((row) => row.label)).toEqual(['Review status'])

    act(() => result.current.setSearchText('missing'))

    expect(result.current.filteredRows).toEqual([])
    expect(result.current.hasFilteredRows).toBe(false)
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

    const { result, rerender } = renderHook(
      ({ registryKind }: { registryKind: 'terms' | 'shapes' | 'namespaces' }) => (
        useLockedVocabRegistryTableController({ rows, registryKind })
      ),
      { initialProps: { registryKind: 'terms' } },
    )

    expect(result.current.columns[0].label).toBe('术语 URI')

    rerender({ registryKind: 'namespaces' })

    expect(result.current.columns.map((column) => column.label)).toEqual([
      '前缀',
      '命名空间',
      'URI',
      '状态',
      '说明',
    ])

    act(() => result.current.setSearchText('udfs'))

    expect(result.current.filteredRows.map((row) => row.prefix)).toEqual(['udfs'])
  })
})
