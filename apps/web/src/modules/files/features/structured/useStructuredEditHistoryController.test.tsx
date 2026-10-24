import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { STRUCTURED_EDIT_HISTORY_LIMIT, type StructuredEditChange } from './structured-edit-history-model'
import { useStructuredEditHistoryController } from './useStructuredEditHistoryController'

const writeChange = vi.fn<(change: StructuredEditChange, options?: { expectedEtag?: string | null }) => Promise<void>>()
const notify = vi.fn()
const label = (predicate: string) => (predicate === 'stage' ? '状态' : predicate)

const statusChange = (previous: string, next: string, subject = '#a'): StructuredEditChange => ({
  subject,
  predicate: 'stage',
  previousValues: previous ? [`"${previous}"`] : [],
  nextValues: next ? [`"${next}"`] : [],
})

const latest = (values: string[], etag: string | null = '"e1"') => async () => ({ read: () => values, etag })

function setup(props: Partial<Parameters<typeof useStructuredEditHistoryController>[0]> = {}) {
  return renderHook((hookProps: { documentUri: string }) => useStructuredEditHistoryController({
    documentUri: hookProps.documentUri,
    notify,
    predicateLabel: label,
    writeChange,
    ...props,
  }), { initialProps: { documentUri: 'https://pod.example/.data/tasks.ttl' } })
}

describe('useStructuredEditHistoryController', () => {
  beforeEach(() => {
    writeChange.mockReset().mockResolvedValue(undefined)
    notify.mockReset()
  })

  it('starts disabled and says what each button will do once there is something to do', () => {
    const { result } = setup()
    expect(result.current).toMatchObject({ canUndo: false, canRedo: false, undoTitle: '撤销', redoTitle: '重做' })

    act(() => result.current.recordChange(statusChange('待办', '进行中')))
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.undoTitle).toBe('撤销：把 状态 改成 进行中')
  })

  it('undo writes the inverse change, redo writes it again', async () => {
    const { result } = setup()
    act(() => result.current.recordChange(statusChange('待办', '进行中')))

    await act(async () => { await result.current.undo() })
    expect(writeChange).toHaveBeenLastCalledWith(statusChange('进行中', '待办'))
    expect(result.current).toMatchObject({ canUndo: false, canRedo: true, redoTitle: '重做：把 状态 改成 进行中' })

    await act(async () => { await result.current.redo() })
    expect(writeChange).toHaveBeenLastCalledWith(statusChange('待办', '进行中'))
    expect(result.current).toMatchObject({ canUndo: true, canRedo: false })
    expect(notify).not.toHaveBeenCalled()
  })

  it('a new edit after an undo clears redo', async () => {
    const { result } = setup()
    act(() => result.current.recordChange(statusChange('待办', '进行中')))
    await act(async () => { await result.current.undo() })
    act(() => result.current.recordChange(statusChange('待办', '完成')))
    expect(result.current.canRedo).toBe(false)
  })

  it('does not overwrite a cell that changed elsewhere: tells the person and drops the step', async () => {
    const { result } = setup({ readLatest: latest(['"完成"']) })
    act(() => result.current.recordChange(statusChange('待办', '进行中')))

    await act(async () => { await result.current.undo() })

    expect(writeChange).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('「状态」刚被别处改过，没法撤销了。这一步已从记录里去掉。', { destructive: true })
    expect(result.current).toMatchObject({ canUndo: false, canRedo: false })
  })

  it('goes ahead when the cell still holds what the step expects, however the value is quoted', async () => {
    const { result } = setup({ readLatest: latest(['"进行中"^^<http://www.w3.org/2001/XMLSchema#string>']) })
    act(() => result.current.recordChange(statusChange('待办', '进行中')))
    await act(async () => { await result.current.undo() })
    expect(writeChange).toHaveBeenCalledTimes(1)
  })

  it('compares with the document read again, and checks the first write against the version it read', async () => {
    const { result } = setup({ readLatest: latest(['"进行中"'], '"v7"') })
    await act(async () => {
      await result.current.recordGroup('添加「周禾」', async () => {
        result.current.recordChange({ subject: '#周禾', predicate: 'rdf:type', previousValues: [], nextValues: ['"进行中"'] })
        result.current.recordChange({ subject: '#周禾', predicate: 'stage', previousValues: [], nextValues: ['"进行中"'] })
      })
    })
    await act(async () => { await result.current.undo() })
    expect(writeChange.mock.calls.map(([, options]) => options)).toEqual([{ expectedEtag: '"v7"' }, { expectedEtag: null }])
  })

  it('keeps the step when the latest document cannot be read', async () => {
    const { result } = setup({ readLatest: async () => null })
    act(() => result.current.recordChange(statusChange('待办', '进行中')))
    await act(async () => { await result.current.undo() })
    expect(writeChange).not.toHaveBeenCalled()
    expect(notify).toHaveBeenCalledWith('没能读到最新内容，撤销没有成功，请稍后再试。', { destructive: true })
    expect(result.current.canUndo).toBe(true)
  })

  it('drops the step when the Pod refuses the write because the version moved on', async () => {
    const conflict = Object.assign(new Error('这个单元格刚被别处改过，请刷新后再改。'), { name: 'StructuredCellWriteConflictError' })
    writeChange.mockRejectedValueOnce(conflict)
    const { result } = setup()
    act(() => result.current.recordChange(statusChange('待办', '进行中')))

    await act(async () => { await result.current.undo() })

    expect(notify).toHaveBeenCalledWith('这里刚被别处改过，没法撤销了。这一步已从记录里去掉。', { destructive: true })
    expect(result.current).toMatchObject({ canUndo: false, canRedo: false })
  })

  it('keeps the step when the write failed for another reason, so it can be retried', async () => {
    writeChange.mockRejectedValueOnce(new Error('network down'))
    const { result } = setup()
    act(() => result.current.recordChange(statusChange('待办', '进行中')))

    await act(async () => { await result.current.undo() })
    expect(notify).toHaveBeenCalledWith('撤销没有成功，请重试。', { destructive: true })
    expect(result.current.canUndo).toBe(true)

    await act(async () => { await result.current.undo() })
    expect(result.current).toMatchObject({ canUndo: false, canRedo: true })
  })

  it('undoes a group (a new card and its lane) as one step, in reverse order', async () => {
    const { result } = setup()
    await act(async () => {
      await result.current.recordGroup('添加「周禾」', async () => {
        result.current.recordChange({ subject: '#周禾', predicate: 'rdf:type', previousValues: [], nextValues: ['<T>'] })
        result.current.recordChange({ subject: '#周禾', predicate: 'stage', previousValues: [], nextValues: ['"待办"'] })
      })
    })
    expect(result.current.undoTitle).toBe('撤销：添加「周禾」')

    await act(async () => { await result.current.undo() })

    expect(writeChange.mock.calls.map(([change]) => change.predicate)).toEqual(['stage', 'rdf:type'])
    expect(result.current.canUndo).toBe(false)
  })

  it('caps the history', () => {
    const { result } = setup()
    act(() => {
      for (let i = 0; i < STRUCTURED_EDIT_HISTORY_LIMIT + 10; i += 1) {
        result.current.recordChange(statusChange(`v${i}`, `v${i + 1}`))
      }
    })
    expect(result.current.undoTitle).toBe(`撤销：把 状态 改成 v${STRUCTURED_EDIT_HISTORY_LIMIT + 10}`)
  })

  it('forgets the history when another table opens', () => {
    const { result, rerender } = setup()
    act(() => result.current.recordChange(statusChange('待办', '进行中')))
    rerender({ documentUri: 'https://pod.example/.data/other.ttl' })
    expect(result.current.canUndo).toBe(false)
  })

  it('ignores a second click while a step is being written', async () => {
    let release: () => void = () => {}
    writeChange.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve }))
    const { result } = setup()
    act(() => result.current.recordChange(statusChange('待办', '进行中')))

    let first: Promise<boolean> = Promise.resolve(false)
    act(() => { first = result.current.undo() })
    expect(result.current.canUndo).toBe(false)
    await act(async () => { await result.current.undo() })
    expect(writeChange).toHaveBeenCalledTimes(1)

    await act(async () => { release(); await first })
    expect(result.current.canRedo).toBe(true)
  })
})
