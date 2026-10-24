import { describe, expect, it } from 'vitest'

import {
  STRUCTURED_EDIT_HISTORY_LIMIT,
  completeStructuredEditStep,
  createStructuredEditValueCanonicalizer,
  createStructuredEditHistory,
  describeStructuredEdit,
  dropStructuredEditStep,
  findStructuredEditConflict,
  peekStructuredEdit,
  planStructuredEditStep,
  readStructuredEditCellValues,
  recordStructuredEdit,
  type StructuredEditEntry,
} from './structured-edit-history-model'

const cell = (id: string, previous: string[], next: string[], subject = '#a', predicate = 'stage'): StructuredEditEntry => ({
  id,
  changes: [{ subject, predicate, previousValues: previous, nextValues: next }],
})

describe('structured edit history model', () => {
  it('records steps, clears redo on a new edit and ignores no-op changes', () => {
    let history = recordStructuredEdit(createStructuredEditHistory(), cell('1', ['"待办"'], ['"进行中"']))
    history = completeStructuredEditStep(history, 'undo')
    expect(history.redo).toHaveLength(1)
    history = recordStructuredEdit(history, cell('2', ['"待办"'], ['"完成"']))
    expect(history.redo).toHaveLength(0)
    expect(history.undo.map((entry) => entry.id)).toEqual(['2'])
    expect(recordStructuredEdit(history, cell('3', ['"a"'], ['"a"']))).toBe(history)
  })

  it('caps the history and forgets the oldest steps', () => {
    let history = createStructuredEditHistory()
    for (let i = 0; i < STRUCTURED_EDIT_HISTORY_LIMIT + 5; i += 1) {
      history = recordStructuredEdit(history, cell(String(i), ['"a"'], [`"${i}"`]))
    }
    expect(history.undo).toHaveLength(STRUCTURED_EDIT_HISTORY_LIMIT)
    expect(history.undo[0]?.id).toBe('5')
  })

  it('undo plans the inverse in reverse order, redo replays forward', () => {
    const entry: StructuredEditEntry = {
      id: 'g',
      title: '添加「周禾」',
      changes: [
        { subject: '#a', predicate: 'rdf:type', previousValues: [], nextValues: ['<T>'] },
        { subject: '#a', predicate: 'stage', previousValues: [], nextValues: ['"待办"'] },
      ],
    }
    expect(planStructuredEditStep(entry, 'undo')).toEqual([
      { subject: '#a', predicate: 'stage', previousValues: ['"待办"'], nextValues: [] },
      { subject: '#a', predicate: 'rdf:type', previousValues: ['<T>'], nextValues: [] },
    ])
    expect(planStructuredEditStep(entry, 'redo')).toEqual(entry.changes)
  })

  it('moves a step between stacks and drops a step that cannot run', () => {
    let history = recordStructuredEdit(createStructuredEditHistory(), cell('1', ['"a"'], ['"b"']))
    history = completeStructuredEditStep(history, 'undo')
    expect(peekStructuredEdit(history, 'undo')).toBeNull()
    expect(peekStructuredEdit(history, 'redo')?.id).toBe('1')
    history = completeStructuredEditStep(history, 'redo')
    expect(peekStructuredEdit(history, 'undo')?.id).toBe('1')
    history = dropStructuredEditStep(history, 'undo')
    expect(history).toEqual({ undo: [], redo: [] })
    expect(dropStructuredEditStep(history, 'undo')).toBe(history)
  })

  it('finds a conflict when the cell no longer holds what the step expects', () => {
    const plan = planStructuredEditStep(cell('1', ['"待办"'], ['"进行中"']), 'undo')
    expect(findStructuredEditConflict(plan, () => ['"进行中"'])).toBeNull()
    expect(findStructuredEditConflict(plan, () => ['"进行中"^^<http://www.w3.org/2001/XMLSchema#string>'])).toBeNull()
    expect(findStructuredEditConflict(plan, () => ['"完成"'])?.predicate).toBe('stage')
    expect(findStructuredEditConflict(plan, () => [])?.predicate).toBe('stage')
  })

  it('compares resource values by their absolute IRI, whatever way the Pod spelled them', () => {
    const canonicalize = createStructuredEditValueCanonicalizer({
      documentUri: 'https://pod.example/.data/tasks.ttl',
      prefixes: { udfs: 'https://undefineds.co/vocab/' },
    })
    const plan = planStructuredEditStep(cell('1', [], ['udfs:Task'], '#a', 'rdf:type'), 'undo')
    expect(findStructuredEditConflict(plan, () => ['<https://undefineds.co/vocab/Task>'], canonicalize)).toBeNull()
    expect(findStructuredEditConflict(plan, () => ['<https://undefineds.co/vocab/Other>'], canonicalize)).not.toBeNull()
  })

  it('reads a cell by the row and column as the edit spelled them', () => {
    const rows = [{ subject: 'https://pod.example/.data/tasks.ttl#a', cells: [{ predicate: 'rdf:type', values: ['<T>'] }] }]
    const read = (subject: string, predicate: string) => readStructuredEditCellValues({
      rows,
      documentUri: 'https://pod.example/.data/tasks.ttl',
      subject,
      predicate,
    })
    expect(read('#a', 'rdf:type')).toEqual(['<T>'])
    expect(read('#a', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type')).toEqual(['<T>'])
    expect(read('#b', 'rdf:type')).toEqual([])
  })

  it('describes what the step did', () => {
    const label = (predicate: string) => (predicate === 'stage' ? '状态' : predicate)
    expect(describeStructuredEdit(cell('1', ['"待办"'], ['"进行中"']), label)).toBe('把 状态 改成 进行中')
    expect(describeStructuredEdit(cell('1', [], ['"进行中"']), label)).toBe('把 状态 设为 进行中')
    expect(describeStructuredEdit(cell('1', ['"进行中"'], []), label)).toBe('清空 状态')
    expect(describeStructuredEdit(cell('1', [], ['<T>'], '#周禾', 'rdf:type'), label)).toBe('添加「周禾」')
    expect(describeStructuredEdit({ ...cell('1', ['"a"'], []), title: '删除 2 张卡片' }, label)).toBe('删除 2 张卡片')
  })
})
