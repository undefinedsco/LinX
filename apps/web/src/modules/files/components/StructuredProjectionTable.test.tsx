import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StructuredProjectionTable } from './StructuredProjectionTable'
import type { StructuredTableProjection } from '../structured-table'

const unsortedProjection: StructuredTableProjection = {
  prefixes: {},
  predicates: ['title', 'rank'],
  rows: [
    {
      subject: '#b',
      cells: [
        { predicate: 'title', values: ['"Beta"'] },
        { predicate: 'rank', values: ['2'] },
      ],
    },
    {
      subject: '#a',
      cells: [
        { predicate: 'title', values: ['"Alpha"'] },
        { predicate: 'rank', values: ['10'] },
      ],
    },
  ],
  warnings: [],
}

function renderedSubjectOrder() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('td')?.textContent?.trim())
    .filter(Boolean)
}

describe('StructuredProjectionTable', () => {
  it('sorts rows from TanStack table state instead of requiring a pre-sorted projection', () => {
    render(
      <StructuredProjectionTable
        documentUri="https://pod.example/.data/workspaces/ws-1/state.ttl"
        projection={unsortedProjection}
        sortKey="title"
        sortDirection="asc"
      />,
    )

    expect(renderedSubjectOrder()).toEqual(['#a', '#b'])
  })

  it('does not hand TanStack a persisted sort key that is not in the current columns', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      render(
        <StructuredProjectionTable
          documentUri="https://pod.example/.data/workspaces/ws-1/state.ttl"
          projection={{
            prefixes: {},
            predicates: ['status'],
            rows: [
              { subject: '#a', cells: [{ predicate: 'status', values: ['"Ready"'] }] },
            ],
            warnings: [],
          }}
          sortKey="title"
          sortDirection="asc"
        />,
      )

      expect(consoleError).not.toHaveBeenCalledWith(expect.stringContaining("Column with id 'title' does not exist."))
    } finally {
      consoleError.mockRestore()
    }
  })

  it('navigates to a same-pod file subject from Enter instead of reopening the peek', () => {
    const onOpenSubjectResource = vi.fn()
    render(
      <StructuredProjectionTable
        documentUri="https://pod.example/.data/workspaces/ws-1/state.ttl"
        projection={{
          prefixes: {},
          predicates: ['title'],
          rows: [
            {
              subject: 'https://pod.example/public/report.md',
              cells: [{ predicate: 'title', values: ['"Report"'] }],
            },
          ],
          warnings: [],
        }}
        onOpenSubjectResource={onOpenSubjectResource}
      />,
    )

    fireEvent.keyDown(screen.getByRole('button', { name: 'https://pod.example/public/report.md' }), { key: 'Enter' })

    expect(onOpenSubjectResource).toHaveBeenCalledWith(
      'https://pod.example/public/report.md',
      'https://pod.example/public/report.md',
      'resource',
      expect.objectContaining({ navigate: true, rowIndex: 0 }),
    )
  })

  it('opens an existing local source-linked card when the subject is its source URL', () => {
    const onOpenSubjectResource = vi.fn()
    render(
      <StructuredProjectionTable
        documentUri="https://pod.example/.data/workspaces/ws-1/state.ttl"
        projection={{
          prefixes: {},
          predicates: ['rdf:type', 'dcterms:source', 'udfs:bodyResource'],
          rows: [
            {
              subject: 'https://source.example/report.pdf',
              cells: [{ predicate: 'rdf:type', values: ['udfs:ImportedSource'] }],
            },
            {
              subject: 'https://pod.example/.data/research/report.card.ttl#card',
              cells: [
                { predicate: 'rdf:type', values: ['udfs:SourceLinkedCard'] },
                { predicate: 'dcterms:source', values: ['<https://source.example/report.pdf>'] },
                { predicate: 'udfs:bodyResource', values: ['<https://pod.example/.data/research/report.body.md>'] },
              ],
            },
          ],
          warnings: [],
        }}
        onOpenSubjectResource={onOpenSubjectResource}
      />,
    )

    fireEvent.keyDown(screen.getByRole('button', { name: 'https://source.example/report.pdf' }), { key: 'Enter' })

    expect(onOpenSubjectResource).toHaveBeenCalledWith(
      'https://source.example/report.pdf',
      'https://pod.example/.data/research/report.card.ttl',
      'resource',
      expect.objectContaining({ navigate: true, rowIndex: 0 }),
    )
  })

  it('uses card-like value type choices inside the + predicate definition menu', () => {
    render(
      <StructuredProjectionTable
        documentUri="https://pod.example/.data/workspaces/ws-1/state.ttl"
        projection={unsortedProjection}
        classScope="udfs:Workspace"
        editable
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ predicate' }))
    const addPredicateMenu = screen.getByRole('menu')
    expect(within(addPredicateMenu).queryByText('Existing Predicates')).not.toBeInTheDocument()
    expect(within(addPredicateMenu).getByPlaceholderText('选择已有 predicate 或创建')).toBeInTheDocument()
    fireEvent.click(within(addPredicateMenu).getByRole('button', { name: '新建 predicate' }))

    expect(screen.queryByRole('combobox', { name: 'Predicate type' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '类型 text' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '类型 relation' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: '类型 relation' }))
    expect(screen.getByRole('button', { name: '类型 relation' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps the predicate definition and submit action reachable inside the viewport', () => {
    render(
      <StructuredProjectionTable
        documentUri="https://pod.example/.data/workspaces/ws-1/state.ttl"
        projection={unsortedProjection}
        classScope="udfs:Workspace"
        editable
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ predicate' }))
    const addPredicateMenu = screen.getByRole('menu')
    fireEvent.click(within(addPredicateMenu).getByRole('button', { name: '新建 predicate' }))

    expect(addPredicateMenu).toHaveClass('max-h-[calc(100vh-2rem)]')
    expect(addPredicateMenu).toHaveClass('overflow-y-auto')
    expect(screen.getByRole('button', { name: '提交待确认 predicate *' })).toHaveClass('sticky')
  })

  it('renders data cells with quiet borders and compact padding', () => {
    render(
      <StructuredProjectionTable
        documentUri="https://pod.example/.data/workspaces/ws-1/state.ttl"
        projection={unsortedProjection}
      />,
    )

    const titleCell = screen.getByRole('cell', { name: '"Alpha"' })

    expect(titleCell).toHaveClass('border-b')
    expect(titleCell).toHaveClass('border-border/5')
    expect(titleCell).toHaveClass('px-1.5')
    expect(titleCell).toHaveClass('py-0.5')
  })

  it('lists existing predicates before the compact create row in + predicate', () => {
    render(
      <StructuredProjectionTable
        documentUri="https://pod.example/.data/workspaces/ws-1/state.ttl"
        projection={unsortedProjection}
        classScope="udfs:Workspace"
        editable
      />,
    )

    fireEvent.pointerDown(screen.getByRole('button', { name: '+ predicate' }))

    const addPredicateMenu = screen.getByRole('menu')
    const createPredicate = within(addPredicateMenu).getByRole('button', { name: '新建 predicate' })
    const titlePredicate = within(addPredicateMenu).getByRole('button', { name: '选择 predicate title' })
    expect(titlePredicate.compareDocumentPosition(createPredicate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(addPredicateMenu).queryByText('Existing Predicates')).not.toBeInTheDocument()
    expect(screen.queryByText('新增 predicate')).not.toBeInTheDocument()

    fireEvent.change(within(addPredicateMenu).getByPlaceholderText('选择已有 predicate 或创建'), {
      target: { value: 'summary' },
    })
    fireEvent.click(createPredicate)

    expect(screen.getByText('新建 predicate')).toBeInTheDocument()
    expect(screen.getByText('提交后以 * 参与当前表格；审批通过前不改写 vocab。')).toBeInTheDocument()
    expect(screen.getByLabelText('predicate 定义')).toBeInTheDocument()
    expect(screen.getAllByText('term').length).toBeGreaterThan(0)
    expect(screen.getAllByText('value').length).toBeGreaterThan(0)
    expect(screen.getAllByText('shape').length).toBeGreaterThan(0)
    expect(screen.getByText('描述')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '提交待确认 predicate *' })).toBeInTheDocument()
    expect(screen.getByLabelText('predicate term')).toHaveValue('summary')
    expect(screen.getByLabelText('predicate 标签')).toHaveValue('Summary')
  })

  it('opens enum and relation editors as anchored popovers that dismiss on outside click', () => {
    render(
      <StructuredProjectionTable
        documentUri="https://pod.example/.data/workspaces/ws-1/state.ttl"
        projection={{
          prefixes: {},
          predicates: ['status', 'related'],
          rows: [
            {
              subject: '#Workspace',
              cells: [
                { predicate: 'status', values: ['"Draft"'] },
                { predicate: 'related', values: ['<https://pod.example/cards/report.md>'] },
              ],
            },
          ],
          warnings: [],
        }}
        vocabDefinitionIndex={{
          classes: new Map(),
          predicates: new Map([
            ['status', { label: 'status', valueType: 'enum' }],
            ['related', { label: 'related', valueType: 'relation' }],
          ]),
          enumOptionsByPredicate: new Map([
            ['status', [{ label: 'Draft' }, { label: 'Ready' }]],
          ]),
          shapes: new Map(),
          namespaces: new Map(),
        }}
        editable
      />,
    )

    const enumCell = screen.getByRole('cell', { name: /Draft/ })
    fireEvent.click(enumCell)
    const enumPopover = screen
      .getByLabelText('#Workspace 的 status 已选择值')
      .closest('[data-structured-cell-popover="true"]')
    expect(enumPopover).toBeInTheDocument()
    expect(enumPopover).toHaveClass('fixed')
    expect(enumCell).not.toHaveClass('relative')

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('combobox', { name: '编辑 #Workspace 的 status' })).not.toBeInTheDocument()

    const relationCell = screen.getByRole('cell', { name: /report\.md/ })
    fireEvent.click(relationCell)
    const relationPopover = screen
      .getByLabelText('编辑 #Workspace 的 related')
      .closest('[data-structured-cell-popover="true"]')
    expect(relationPopover).toBeInTheDocument()
    expect(relationPopover).toHaveClass('fixed')
    expect(relationCell).not.toHaveClass('relative')

    fireEvent.pointerDown(document.body)
    expect(screen.queryByLabelText('编辑 #Workspace 的 related')).not.toBeInTheDocument()
  })

  it('does not stage a cell proposal when scalar or relation editors close without a value change', () => {
    const onCommitCellWriteProposal = vi.fn()
    render(
      <StructuredProjectionTable
        documentUri="https://pod.example/.data/workspaces/ws-1/state.ttl"
        projection={{
          prefixes: {},
          predicates: ['title', 'related'],
          rows: [
            {
              subject: '#Workspace',
              cells: [
                { predicate: 'title', values: ['"Alpha"'] },
                { predicate: 'related', values: ['<https://pod.example/cards/report.md>'] },
              ],
            },
          ],
          warnings: [],
        }}
        vocabDefinitionIndex={{
          classes: new Map(),
          predicates: new Map([
            ['title', { label: 'title', valueType: 'text' }],
            ['related', { label: 'related', valueType: 'relation' }],
          ]),
          enumOptionsByPredicate: new Map(),
          shapes: new Map(),
          namespaces: new Map(),
        }}
        editable
        onCommitCellWriteProposal={onCommitCellWriteProposal}
      />,
    )

    fireEvent.click(screen.getByRole('cell', { name: /Alpha/ }))
    fireEvent.blur(screen.getByLabelText('编辑 #Workspace 的 title'))
    expect(onCommitCellWriteProposal).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('cell', { name: /report\.md/ }))
    expect(screen.getByLabelText('编辑 #Workspace 的 related')).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByLabelText('编辑 #Workspace 的 related')).not.toBeInTheDocument()
    expect(onCommitCellWriteProposal).not.toHaveBeenCalled()
  })
})
