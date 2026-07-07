import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import {
  PendingCellWriteButton,
  ShapeWarningIndicator,
  StructuredBooleanCellToggle,
  StructuredEnumValueChips,
  StructuredEnumCellSelector,
  StructuredPendingPredicateHeaderCell,
  StructuredPredicateHeaderCell,
  StructuredPredicateValueEditor,
  StructuredPredicateValueLinks,
  StructuredPredicateCellEditor,
  StructuredScalarCellEditor,
  StructuredScalarValueDisplay,
  StructuredSubjectCell,
} from './StructuredTableCellPrimitives'
import {
  projectStructuredDefinedPredicateHeaderChrome,
  projectStructuredPendingPredicateHeaderChrome,
} from '../features/structured/structured-predicate-column-header-model'

describe('StructuredTableCellPrimitives', () => {
  it('keeps pending cell write button copy and mode in a model', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).toContain("from './structured-pending-cell-write-button-model'")
    expect(source).toContain('projectPendingCellWriteButtonChrome')
    expect(source).not.toContain('Pending approval for ${predicateLabel} on ${subject}')
    expect(source).not.toContain('正在提交 ${predicateLabel} on ${subject} 的单元格变更')
    expect(source).not.toContain('Discard pending write for ${predicateLabel} on ${subject}')
    expect(source).not.toContain('单元格变更已提交；等待 Inbox 审批，canonical 数据未变更')
    expect(source).not.toContain('单元格变更正在提交；canonical 数据未变更')
    expect(source).not.toContain('单元格变更提交失败；可撤回本地改动')
  })

  it('keeps subject open hint copy in subject cell chrome', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).toContain('openAffordance')
    expect(source).not.toContain('openHintText')
    expect(source).not.toContain('openTitle')
    expect(source).not.toContain('单击打开预览；Enter 或双击打开资源。')
    expect(source).not.toContain('单击打开预览；在预览中选择打开动作。')
    expect(source).not.toContain('replace(/。$/,')
  })

  it('keeps subject pending marker copy in subject cell chrome', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).toContain('pendingMarker')
    expect(source).not.toContain('待确认 subject')
    expect(source).not.toContain('{displayLabel}*')
  })

  it('keeps shape warning accessible copy in cell chrome', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).not.toContain('Shape warning for ${predicateLabel} on ${subject}')
    expect(source).not.toMatch(/aria-label=\{`Shape warning for/)
  })

  it('keeps boolean toggle accessible copy in static cell model', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).not.toContain('切换布尔值 ${normalizedValue}')
    expect(source).not.toContain('normalizedValue')
  })

  it('keeps predicate value open action copy in relation value models', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).not.toContain('Open URL ${value}')
    expect(source).not.toContain('Open predicate ${value}')
    expect(source).not.toContain('Open URL ${predicateValue}')
    expect(source).not.toContain('Open predicate ${predicateValue}')
  })

  it('keeps predicate value open payload in relation value models', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).toContain('onOpenValue(openAction.value, openAction.external)')
    expect(source).not.toContain('onOpenValue(value, external)')
    expect(source).not.toContain('onOpenValue(predicateValue, external)')
  })

  it('keeps predicate editor clear action copy in active cell models', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).not.toContain('Clear ${ariaLabel.replace')
    expect(source).not.toContain('replace(/^Edit')
  })

  it('keeps multi-select selected chip copy in predicate value editor chrome', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).not.toContain('已选择值 ${value}')
    expect(source).not.toContain('移除值 ${value}')
  })

  it('keeps multi-select selected chip remove payload in predicate value editor chrome', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).toContain('editor.removeMultiValue(removeAction.value)')
    expect(source).not.toContain('editor.removeMultiValue(value)')
  })

  it('keeps enum selector selected chip copy in enum selector chrome', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).not.toContain('Selected ${value} for')
    expect(source).not.toContain('Remove ${value} from')
  })

  it('keeps enum option pending display labels in enum selector chrome', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).not.toContain("option.pending ? '*'")
    expect(source).not.toContain('const displayLabel = `${option.label}')
  })

  it('keeps enum selector input keyboard action planning in the enum workflow model', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).toContain('planStructuredEnumSelectorInputKeyAction')
    expect(source).not.toContain("event.key === 'Enter' && normalizedSearch")
    expect(source).not.toContain('onAddOption(exactSearchOptionLabel ?? normalizedSearch)')
  })

  it('keeps enum selector option keyboard action planning in the enum workflow model', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).toContain('planStructuredEnumSelectorOptionKeyAction')
    expect(source).not.toContain("event.key === 'Enter' || event.key === ' '")
  })

  it('keeps enum selector create-option action payload in selector chrome', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).toContain('const createOption = selectorChrome.createOption')
    expect(source).toContain('createOption.addAction.value')
    expect(source).not.toContain('onAddOption(normalizedSearch)')
  })

  it('keeps enum option row select payload in option menu chrome', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).toContain('optionMenu.selectAction.value')
    expect(source).not.toContain('onAddOption(option.label)')
    expect(source).not.toContain('optionLabel: option.label')
  })

  it('keeps enum selected chip remove payload in selector chrome', () => {
    const source = readFileSync('src/modules/files/features/structured/StructuredTableCellPrimitives.tsx', 'utf8')

    expect(source).toContain('removeAction.value')
    expect(source).not.toContain('onRemoveOption(value)')
  })

  it('renders shape warning as a compact accessible icon', () => {
    render(
      <ShapeWarningIndicator
        ariaLabel="Shape warning for tags on #Workspace"
        title="#Workspace tags has 2 values; maxCount is 1."
      />,
    )

    const warning = screen.getByLabelText('Shape warning for tags on #Workspace')
    expect(warning).toHaveAttribute('role', 'img')
    expect(warning).toHaveAttribute('title', '#Workspace tags has 2 values; maxCount is 1.')
  })

  it('renders nothing when shape warning message is absent', () => {
    const { container } = render(
      <ShapeWarningIndicator ariaLabel="" title="" />,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('keeps pending write discard as an icon-only cell action that does not activate the cell', () => {
    const onDiscard = vi.fn()
    const onCellClick = vi.fn()

    render(
      <div onClick={onCellClick}>
        <PendingCellWriteButton
          predicateLabel="title"
          subject="#Workspace"
          onDiscard={onDiscard}
        />
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Discard pending write for title on #Workspace' }))

    expect(onDiscard).toHaveBeenCalledTimes(1)
    expect(onCellClick).not.toHaveBeenCalled()
  })

  it('shows approval-staged writes as non-discardable pending status', () => {
    render(
      <PendingCellWriteButton
        predicateLabel="title"
        subject="#Workspace"
        status="approval-staged"
      />,
    )

    expect(screen.getByRole('status', { name: 'Pending approval for title on #Workspace' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Pending approval for title on #Workspace' }))
      .toHaveAttribute('title', '单元格变更已提交；等待 Inbox 审批，canonical 数据未变更')
    expect(screen.queryByRole('button', { name: 'Discard pending write for title on #Workspace' })).not.toBeInTheDocument()
  })

  it('shows submitting writes without exposing cell proposal implementation copy', () => {
    render(
      <PendingCellWriteButton
        predicateLabel="title"
        subject="#Workspace"
        status="pending"
      />,
    )

    expect(screen.getByRole('status', { name: '正在提交 title on #Workspace 的单元格变更' }))
      .toHaveAttribute('title', '单元格变更正在提交；canonical 数据未变更')
  })

  it('commits multi-value enum selections as literal RDF values from a searchable create control', () => {
    const onCommit = vi.fn()

    render(
      <StructuredPredicateValueEditor
        kind="multi-select"
        ariaLabel="Card tags predicate"
        values={['source-linked', 'finance']}
        options={['source-linked', 'finance', 'audited']}
        onCommit={onCommit}
      />,
    )

    expect(screen.getByLabelText('已选择值 source-linked')).toBeInTheDocument()
    expect(screen.getByLabelText('已选择值 finance')).toBeInTheDocument()

    const search = screen.getByRole('combobox', { name: 'Card tags predicate' })
    fireEvent.change(search, { target: { value: 'verified' } })
    expect(screen.getByRole('option', { name: '新增值 verified' })).toBeInTheDocument()
    expect(screen.getByText('新增 verified*')).toBeInTheDocument()
    fireEvent.keyDown(search, { key: 'Enter' })

    expect(onCommit).toHaveBeenCalledWith(['"source-linked"', '"finance"', '"verified"'])
    expect(screen.getByLabelText('已选择值 verified')).toBeInTheDocument()
  })

  it('commits enum, boolean, scalar, and linked predicate values with table-compatible RDF serialization', () => {
    const onEnumCommit = vi.fn()
    const onBooleanCommit = vi.fn()
    const onNumberCommit = vi.fn()
    const onDateCommit = vi.fn()
    const onLinkedPredicateCommit = vi.fn()

    render(
      <div>
        <StructuredPredicateValueEditor
          kind="enum"
          ariaLabel="Card review status predicate"
          values={['Needs review']}
          options={['Draft', 'Ready', 'Published']}
          onCommit={onEnumCommit}
        />
        <StructuredPredicateValueEditor
          kind="boolean"
          ariaLabel="Published meta predicate"
          values={['true']}
          onCommit={onBooleanCommit}
        />
        <StructuredPredicateValueEditor
          kind="number"
          ariaLabel="Progress predicate"
          values={['42']}
          onCommit={onNumberCommit}
        />
        <StructuredPredicateValueEditor
          kind="date"
          ariaLabel="Due predicate"
          values={['2026-06-20']}
          onCommit={onDateCommit}
        />
        <StructuredPredicateValueEditor
          kind="relation"
          ariaLabel="Card linked predicate"
          values={['https://pod.example/cards/report.md']}
          onCommit={onLinkedPredicateCommit}
        />
      </div>,
    )

    const status = screen.getByRole('combobox', { name: 'Card review status predicate' })
    fireEvent.change(status, { target: { value: 'Ready' } })
    fireEvent.keyDown(status, { key: 'Enter' })
    expect(onEnumCommit).toHaveBeenCalledWith(['"Ready"'])

    fireEvent.click(screen.getByRole('button', { name: '切换 Published meta predicate' }))
    expect(onBooleanCommit).toHaveBeenCalledWith(['false'])

    const progress = screen.getByLabelText('Progress predicate')
    fireEvent.change(progress, { target: { value: '57' } })
    fireEvent.blur(progress)
    expect(onNumberCommit).toHaveBeenCalledWith(['57'])

    const due = screen.getByLabelText('Due predicate')
    fireEvent.change(due, { target: { value: '2026-07-01' } })
    fireEvent.blur(due)
    expect(onDateCommit).toHaveBeenCalledWith(['"2026-07-01"^^xsd:date'])

    const relation = screen.getByLabelText('Card linked predicate')
    fireEvent.change(relation, { target: { value: 'https://pod.example/cards/revised.md' } })
    fireEvent.blur(relation)
    expect(onLinkedPredicateCommit).toHaveBeenCalledWith(['<https://pod.example/cards/revised.md>'])
  })

  it('renders enum value chips as a compact cell primitive with pending markers', () => {
    render(
      <StructuredEnumValueChips
        labels={['Draft', 'Needs review*']}
        trailing={<span data-testid="enum-trailing">tail</span>}
      />,
    )

    expect(screen.getByLabelText('Draft Needs review*')).toBeInTheDocument()
    expect(screen.getByText('Draft')).toHaveAttribute('title', 'Draft')
    expect(screen.getByText('Needs review*')).toHaveAttribute('title', 'Needs review*')
    expect(screen.getByTestId('enum-trailing')).toBeInTheDocument()
  })

  it('toggles boolean cells as a compact inline action without activating the parent cell', () => {
    const onToggle = vi.fn()
    const onCellClick = vi.fn()

    render(
      <div onClick={onCellClick}>
        <StructuredBooleanCellToggle
          ariaLabel="切换布尔值 true"
          pressed
          title="true"
          trailing={<span data-testid="boolean-trailing">tail</span>}
          onToggle={onToggle}
        />
      </div>,
    )

    const toggle = screen.getByRole('button', { name: '切换布尔值 true' })
    expect(toggle).not.toHaveTextContent(/true|false/i)

    fireEvent.click(toggle)

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onCellClick).not.toHaveBeenCalled()
    expect(screen.getByTestId('boolean-trailing')).toBeInTheDocument()
  })

  it('renders scalar display cells with compact empty state and trailing actions', () => {
    const { rerender } = render(
      <StructuredScalarValueDisplay
        labels={['Draft', 'Ready*']}
        trailing={<span data-testid="scalar-display-tail">tail</span>}
      />,
    )

    expect(screen.getByText('Draft, Ready*')).toHaveAttribute('title', 'Draft, Ready*')
    expect(screen.getByTestId('scalar-display-tail')).toBeInTheDocument()

    rerender(
      <StructuredScalarValueDisplay
        labels={[]}
        trailing={<span data-testid="scalar-empty-tail">empty-tail</span>}
      />,
    )

    expect(screen.getByText('—')).toHaveClass('text-muted-foreground/50')
    expect(screen.getByTestId('scalar-empty-tail')).toBeInTheDocument()
  })

  it('renders subject cells with pending state, plain text fallback, and route restoration markers', () => {
    const onOpenSubject = vi.fn()
    const onParentKeyDown = vi.fn()

    const { rerender } = render(
      <StructuredSubjectCell
        subject="#NewSubject"
        displayLabel="#NewSubject"
        rowIndex={0}
        pending
        pendingMarker={{
          displayLabel: '#NewSubject*',
          label: '待确认 subject',
        }}
      />,
    )

    expect(screen.getByText('#NewSubject*')).toBeInTheDocument()
    expect(screen.getByText('待确认 subject')).toBeInTheDocument()

    rerender(
      <StructuredSubjectCell
        subject="#Task"
        displayLabel="#Task"
        rowIndex={1}
      />,
    )

    expect(screen.getByText('#Task')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '#Task' })).not.toBeInTheDocument()

    rerender(
      <div onKeyDown={onParentKeyDown}>
        <StructuredSubjectCell
          subject="#Task"
          displayLabel="#Task"
          rowIndex={3}
          openTarget={{
            targetUri: 'https://pod.example/.data/tasks.ttl#Task',
            kind: 'resource',
            canNavigateDirectly: true,
          }}
          openAffordance={{
            ariaDescription: '单击打开预览；Enter 或双击打开资源。',
            title: 'https://pod.example/.data/tasks.ttl#Task\n单击打开预览；Enter 或双击打开资源',
          }}
          onOpenSubject={onOpenSubject}
        />
      </div>,
    )

    const subjectButton = screen.getByRole('button', { name: '#Task' })
    expect(subjectButton).toHaveAttribute('data-structured-subject-open', '#Task')
    expect(subjectButton).toHaveAttribute('data-structured-row-index', '3')
    expect(subjectButton).toHaveAttribute(
      'title',
      'https://pod.example/.data/tasks.ttl#Task\n单击打开预览；Enter 或双击打开资源',
    )
    expect(subjectButton).toHaveAttribute('aria-description', '单击打开预览；Enter 或双击打开资源。')
    expect(subjectButton).toHaveClass('text-foreground/80')
    expect(subjectButton).toHaveClass('hover:bg-muted/50')
    expect(subjectButton).not.toHaveClass('text-primary')

    fireEvent.click(subjectButton)
    expect(onOpenSubject).toHaveBeenLastCalledWith(
      '#Task',
      'https://pod.example/.data/tasks.ttl#Task',
      'resource',
      { navigate: false, rowIndex: 3 },
    )

    fireEvent.doubleClick(subjectButton)
    expect(onOpenSubject).toHaveBeenLastCalledWith(
      '#Task',
      'https://pod.example/.data/tasks.ttl#Task',
      'resource',
      { navigate: true, rowIndex: 3 },
    )

    fireEvent.keyDown(subjectButton, { key: 'Enter' })
    expect(onOpenSubject).toHaveBeenLastCalledWith(
      '#Task',
      'https://pod.example/.data/tasks.ttl#Task',
      'resource',
      { navigate: true, rowIndex: 3 },
    )
    expect(onParentKeyDown).not.toHaveBeenCalled()

    rerender(
      <StructuredSubjectCell
        subject="https://pod.example/.data/repositories/repository.ttl#Repository"
        displayLabel="#Repository"
        rowIndex={4}
        openTarget={{
          targetUri: 'https://pod.example/.data/repositories/repository.ttl#Repository',
          kind: 'resource',
          canNavigateDirectly: true,
        }}
        openAffordance={{
          ariaDescription: '单击打开预览；Enter 或双击打开资源。',
          title: 'https://pod.example/.data/repositories/repository.ttl#Repository\n单击打开预览；Enter 或双击打开资源',
        }}
        onOpenSubject={onOpenSubject}
      />,
    )

    const absoluteSubjectButton = screen.getByRole('button', { name: '#Repository' })
    expect(absoluteSubjectButton).toHaveAttribute(
      'data-structured-subject-open',
      'https://pod.example/.data/repositories/repository.ttl#Repository',
    )
    expect(absoluteSubjectButton).toHaveAttribute('data-structured-row-index', '4')

    fireEvent.click(absoluteSubjectButton)
    expect(onOpenSubject).toHaveBeenLastCalledWith(
      'https://pod.example/.data/repositories/repository.ttl#Repository',
      'https://pod.example/.data/repositories/repository.ttl#Repository',
      'resource',
      { navigate: false, rowIndex: 4 },
    )
  })

  it('passes the containing structured viewport scroll when opening a subject', () => {
    const onOpenSubject = vi.fn()

    render(
      <div data-structured-resource-viewport="true">
        <StructuredSubjectCell
          subject="#Task"
          displayLabel="#Task"
          rowIndex={2}
          openTarget={{
            targetUri: 'https://pod.example/.data/tasks.ttl#Task',
            kind: 'resource',
            canNavigateDirectly: true,
          }}
          openAffordance={{
            ariaDescription: '单击打开预览；Enter 或双击打开资源。',
            title: 'https://pod.example/.data/tasks.ttl#Task\n单击打开预览；Enter 或双击打开资源',
          }}
          onOpenSubject={onOpenSubject}
        />
      </div>,
    )

    const viewport = screen.getByRole('button', { name: '#Task' }).closest('[data-structured-resource-viewport="true"]') as HTMLElement
    viewport.scrollTop = 184
    fireEvent.click(screen.getByRole('button', { name: '#Task' }))

    expect(onOpenSubject).toHaveBeenCalledWith(
      '#Task',
      'https://pod.example/.data/tasks.ttl#Task',
      'resource',
      { navigate: false, rowIndex: 2, scrollTop: 184 },
    )
  })

  it('renders linked predicate values as readable links without activating the parent cell', () => {
    const onOpenValue = vi.fn()
    const onCellClick = vi.fn()

    render(
      <div onClick={onCellClick}>
        <StructuredPredicateValueLinks
          values={[
            {
              value: 'https://pod.example/cards/report.md',
              displayLabel: 'Report card',
              external: false,
              openAction: {
                ariaLabel: 'Open predicate https://pod.example/cards/report.md',
                external: false,
                title: 'https://pod.example/cards/report.md',
                value: 'https://pod.example/cards/report.md',
              },
            },
            {
              value: 'https://example.com/source',
              displayLabel: 'Source page',
              external: true,
              openAction: {
                ariaLabel: 'Open URL https://example.com/source',
                external: true,
                title: 'https://example.com/source',
                value: 'https://example.com/source',
              },
            },
          ]}
          trailing={<span data-testid="predicate-trailing">tail</span>}
          onOpenValue={onOpenValue}
        />
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Open predicate https://pod.example/cards/report.md' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open URL https://example.com/source' }))

    expect(onOpenValue).toHaveBeenNthCalledWith(1, 'https://pod.example/cards/report.md', false)
    expect(onOpenValue).toHaveBeenNthCalledWith(2, 'https://example.com/source', true)
    expect(onCellClick).not.toHaveBeenCalled()
    expect(screen.getByTestId('predicate-trailing')).toBeInTheDocument()
    expect(screen.getByText('Report card')).toBeInTheDocument()
    expect(screen.getByText('Source page')).toBeInTheDocument()
  })

  it('edits linked predicate cells inline with compact predicate actions', () => {
    const onOpenValue = vi.fn()
    const onCommit = vi.fn()
    const onCancel = vi.fn()
    const onParentClick = vi.fn()
    const onParentKeyDown = vi.fn()

    function Harness() {
      const [value, setValue] = useState('https://pod.example/cards/report.md')
      return (
        <div onClick={onParentClick} onKeyDown={onParentKeyDown}>
          <StructuredPredicateCellEditor
            ariaLabel="编辑 #Workspace 的 related"
            clearAction={{
              ariaLabel: '清空 #Workspace 的 related',
            }}
            value={value}
            values={[
              {
                value: 'https://pod.example/cards/report.md',
                external: false,
                openAction: {
                  ariaLabel: 'Open predicate https://pod.example/cards/report.md',
                  external: false,
                  title: 'https://pod.example/cards/report.md',
                  value: 'https://pod.example/cards/report.md',
                },
              },
              {
                value: 'https://example.com/source',
                external: true,
                openAction: {
                  ariaLabel: 'Open URL https://example.com/source',
                  external: true,
                  title: 'https://example.com/source',
                  value: 'https://example.com/source',
                },
              },
            ]}
            trailing={<span data-testid="predicate-editor-tail">tail</span>}
            onValueChange={setValue}
            onOpenValue={onOpenValue}
            onCommit={onCommit}
            onCancel={onCancel}
          />
        </div>
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Open predicate https://pod.example/cards/report.md' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open URL https://example.com/source' }))
    expect(onOpenValue).toHaveBeenNthCalledWith(1, 'https://pod.example/cards/report.md', false)
    expect(onOpenValue).toHaveBeenNthCalledWith(2, 'https://example.com/source', true)

    const input = screen.getByLabelText('编辑 #Workspace 的 related')
    fireEvent.click(input)
    fireEvent.change(input, { target: { value: 'https://pod.example/cards/revised.md' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledWith('https://pod.example/cards/revised.md')

    fireEvent.click(screen.getByRole('button', { name: '清空 #Workspace 的 related' }))
    expect(onCommit).toHaveBeenCalledWith('')

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onParentClick).not.toHaveBeenCalled()
    expect(onParentKeyDown).not.toHaveBeenCalled()
    expect(screen.getByTestId('predicate-editor-tail')).toBeInTheDocument()
  })

  it('selects, creates, removes, and describes enum values in one compact cell selector', () => {
    const onAddOption = vi.fn()
    const onRemoveOption = vi.fn()
    const onOpenDefinition = vi.fn()
    const onOpenProposal = vi.fn()
    const onDiscardProposal = vi.fn()
    const onCancel = vi.fn()
    const onParentClick = vi.fn()
    const onParentKeyDown = vi.fn()

    function Harness() {
      const [search, setSearch] = useState('')
      return (
        <div onClick={onParentClick} onKeyDown={onParentKeyDown}>
          <StructuredEnumCellSelector
            ariaLabel="编辑 #Workspace 的 status"
            listboxId="status-options"
            selectedValues={['Draft']}
            options={[
              {
                label: 'Ready',
                termUri: 'https://pod.example/.vocab/terms.ttl#Ready',
                status: '已定义或已观察',
              },
              {
                label: 'Needs review',
                pending: true,
                termUri: 'https://pod.example/.vocab/terms.ttl#NeedsReview',
                status: '词表变更待确认',
                proposalResourceUri: 'https://pod.example/.data/proposals/vocab/needs-review.ttl',
                targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
              },
            ]}
            search={search}
            trailing={<span data-testid="enum-selector-tail">tail</span>}
            onSearchChange={setSearch}
            onAddOption={onAddOption}
            onRemoveOption={onRemoveOption}
            onOpenDefinition={onOpenDefinition}
            onOpenProposal={onOpenProposal}
            onDiscardProposal={onDiscardProposal}
            onCancel={onCancel}
          />
        </div>
      )
    }

    render(<Harness />)

    expect(screen.getByLabelText('编辑 #Workspace 的 status 已选择值')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '从 编辑 #Workspace 的 status 移除 Draft' }))
    expect(onRemoveOption).toHaveBeenCalledWith('Draft')

    fireEvent.click(screen.getByRole('option', { name: 'Ready' }))
    expect(onAddOption).toHaveBeenCalledWith('Ready')
    expect(screen.getByRole('option', { name: 'Needs review*' })).toBeInTheDocument()

    const search = screen.getByRole('combobox', { name: '编辑 #Workspace 的 status' })
    fireEvent.change(search, { target: { value: 'Later' } })
    expect(screen.getByRole('option', { name: '新增选项 Later' })).toBeInTheDocument()
    expect(screen.getByText('新增 Later*')).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Ready' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Needs review*' })).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'ready' } })
    expect(screen.getByRole('option', { name: 'Ready' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '新增选项 ready' })).not.toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'Needs' } })
    fireEvent.pointerDown(screen.getByRole('button', { name: '选项定义 Needs review' }))
    expect(screen.getByText('选项定义')).toBeInTheDocument()
    expect(screen.getAllByText('Needs review*').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('词表变更待确认')).toBeInTheDocument()
    expect(screen.getByText('审批记录已准备')).toBeInTheDocument()
    expect(screen.queryByText('predicate：status')).not.toBeInTheDocument()
    expect(screen.queryByText('https://pod.example/.vocab/terms.ttl#NeedsReview')).not.toBeInTheDocument()
    expect(screen.queryByText('https://pod.example/.data/proposals/vocab/needs-review.ttl')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: '打开选项链接' }))
    expect(onOpenDefinition).toHaveBeenCalledWith(expect.objectContaining({ label: 'Needs review' }))

    fireEvent.pointerDown(screen.getByRole('button', { name: '选项定义 Needs review' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '打开审批记录' }))
    expect(onOpenProposal).toHaveBeenCalledWith(expect.objectContaining({ label: 'Needs review' }))

    fireEvent.pointerDown(screen.getByRole('button', { name: '选项定义 Needs review' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '忽略词表变更' }))
    expect(onDiscardProposal).toHaveBeenCalledWith(expect.objectContaining({ label: 'Needs review' }))

    fireEvent.change(search, { target: { value: 'ready' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onAddOption).toHaveBeenCalledWith('Ready')
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)

    fireEvent.change(search, { target: { value: 'Blocked' } })
    fireEvent.click(screen.getByRole('option', { name: '新增选项 Blocked' }))
    expect(onAddOption).toHaveBeenCalledWith('Blocked')
    expect(onParentClick).not.toHaveBeenCalled()
    expect(onParentKeyDown).not.toHaveBeenCalled()
    expect(screen.getByTestId('enum-selector-tail')).toBeInTheDocument()
  })

  it('keeps selected enum chips and search inside one labelled value input area', () => {
    function Harness() {
      const [search, setSearch] = useState('')
      return (
        <StructuredEnumCellSelector
          ariaLabel="编辑 #Workspace 的 status"
          listboxId="status-options"
          selectedValues={['Draft']}
          options={[
            {
              label: 'Ready',
              termUri: 'https://pod.example/.vocab/terms.ttl#Ready',
              status: '已定义或已观察',
            },
          ]}
          search={search}
          onSearchChange={setSearch}
          onAddOption={vi.fn()}
          onRemoveOption={vi.fn()}
          onOpenDefinition={vi.fn()}
          onCancel={vi.fn()}
        />
      )
    }

    render(<Harness />)

    const valueInput = screen.getByLabelText('编辑 #Workspace 的 status 已选择值')
    expect(valueInput).toContainElement(screen.getByLabelText('编辑 #Workspace 的 status 已选择 Draft'))
    expect(valueInput).toContainElement(screen.getByRole('combobox', { name: '编辑 #Workspace 的 status' }))
    expect(screen.getByRole('combobox', { name: '编辑 #Workspace 的 status' }))
      .toHaveAttribute('placeholder', '选择或创建选项')
    expect(screen.queryByText('选择或创建选项')).not.toBeInTheDocument()
  })

  it('commits scalar table edits on Enter and does not bubble cell activation events', () => {
    const onCommit = vi.fn()
    const onCancel = vi.fn()
    const onParentClick = vi.fn()
    const onParentKeyDown = vi.fn()

    function Harness() {
      const [value, setValue] = useState('Draft')
      return (
        <div onClick={onParentClick} onKeyDown={onParentKeyDown}>
          <StructuredScalarCellEditor
            kind="text"
            ariaLabel="编辑 #Workspace 的 title"
            value={value}
            onValueChange={setValue}
            onCommit={onCommit}
            onCancel={onCancel}
            trailing={<span data-testid="scalar-tail">tail</span>}
          />
        </div>
      )
    }

    render(<Harness />)

    const input = screen.getByLabelText('编辑 #Workspace 的 title')
    fireEvent.click(input)
    fireEvent.change(input, { target: { value: 'Updated' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onParentClick).not.toHaveBeenCalled()
    expect(onParentKeyDown).not.toHaveBeenCalled()
    expect(onCommit).toHaveBeenCalledWith('Updated')
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByTestId('scalar-tail')).toBeInTheDocument()
  })

  it('commits scalar table edits on blur and cancels with Escape', () => {
    const onCommit = vi.fn()
    const onCancel = vi.fn()

    function Harness() {
      const [value, setValue] = useState('42')
      return (
        <StructuredScalarCellEditor
          kind="number"
          ariaLabel="编辑 #Workspace 的 progress"
          value={value}
          onValueChange={setValue}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      )
    }

    const { rerender } = render(<Harness />)
    const input = screen.getByLabelText('编辑 #Workspace 的 progress')
    fireEvent.change(input, { target: { value: '57' } })
    fireEvent.blur(input)

    expect(onCommit).toHaveBeenCalledWith('57')

    rerender(<Harness />)
    fireEvent.keyDown(screen.getByLabelText('编辑 #Workspace 的 progress'), { key: 'Escape' })

    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('can commit date table edits immediately on value change', () => {
    const onCommit = vi.fn()

    render(
      <StructuredScalarCellEditor
        kind="date"
        ariaLabel="编辑 #Workspace 的 due"
        value="2026-06-20"
        onValueChange={vi.fn()}
        onCommit={onCommit}
        onCancel={vi.fn()}
        commitOnChange
      />,
    )

    fireEvent.change(screen.getByLabelText('编辑 #Workspace 的 due'), { target: { value: '2026-07-01' } })

    expect(onCommit).toHaveBeenCalledWith('2026-07-01')
  })

  it('renders predicate header sorting and definition controls without double-activating sort', () => {
    const onSort = vi.fn()
    const onCopyPredicate = vi.fn()
    const onOpenPredicate = vi.fn()
    const onOpenShapeRule = vi.fn()

    render(
      <StructuredPredicateHeaderCell
        chrome={projectStructuredDefinedPredicateHeaderChrome({
          normalizedLabel: 'reviewStatus',
          shapeRuleActions: [{
            uri: 'https://pod.example/.vocab/shapes.ttl#reviewStatus-required',
            label: 'Required',
          }],
        })}
        predicate="https://schema.org/reviewStatus"
        displayLabel="reviewStatus"
        normalizedLabel="reviewStatus"
        typeLabel="enum"
        description="Review workflow status"
        ruleText="required"
        statusLabel="active"
        sortIcon={<span aria-hidden="true">sort</span>}
        onSort={onSort}
        onCopyPredicate={onCopyPredicate}
        onOpenPredicate={onOpenPredicate}
        onOpenShapeRule={onOpenShapeRule}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sort reviewStatus' }))
    expect(onSort).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open definition for reviewStatus' }))
    expect(onSort).toHaveBeenCalledTimes(1)
    const definitionMenu = screen.getByRole('menu')
    expect(within(definitionMenu).getByText('Predicate 定义')).toBeInTheDocument()
    expect(within(definitionMenu).getByText('reviewStatus')).toBeInTheDocument()
    expect(within(definitionMenu).getByText('enum')).toBeInTheDocument()
    expect(within(definitionMenu).getByText('规则与形状')).toBeInTheDocument()
    expect(within(definitionMenu).getByText('required')).toBeInTheDocument()
    expect(within(definitionMenu).getByText('Review workflow status')).toBeInTheDocument()
    expect(within(definitionMenu).getByText('active')).toBeInTheDocument()
    expect(within(definitionMenu).getByText('链接操作')).toBeInTheDocument()
    expect(screen.queryByText('https://schema.org/reviewStatus')).not.toBeInTheDocument()
    expect(screen.queryByText('https://pod.example/.vocab/terms.ttl#reviewStatus')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: '复制 predicate URI' }))
    expect(onCopyPredicate).toHaveBeenCalledWith('https://schema.org/reviewStatus')

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open definition for reviewStatus' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '打开 predicate URI' }))
    expect(onOpenPredicate).toHaveBeenCalledWith('https://schema.org/reviewStatus')

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Open definition for reviewStatus' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '打开规则 Required' }))
    expect(onOpenShapeRule).toHaveBeenCalledWith('https://pod.example/.vocab/shapes.ttl#reviewStatus-required')
  })

  it('renders pending predicate definition actions with the external predicate URI but without leaking proposal details', () => {
    const onSubmit = vi.fn()
    const onOpenProposal = vi.fn()
    const onDiscard = vi.fn()

    render(
      <StructuredPendingPredicateHeaderCell
        chrome={projectStructuredPendingPredicateHeaderChrome({
          hasVocabProposal: true,
          normalizedLabel: 'summary',
          status: 'pending',
        })}
        displayLabel="summary*"
        proposalUri="https://pod.example/.vocab/terms.ttl#summary"
        predicateUri="https://schema.org/summary"
        type="text"
        description="Short card summary"
        ruleText="required"
        statusLabel="待提交"
        vocabProposal={{
          proposalResourceUri: 'https://pod.example/.data/proposals/vocab/summary.ttl',
          targetVocabUri: 'https://pod.example/.vocab/terms.ttl',
        }}
        onSubmit={onSubmit}
        onOpenProposal={onOpenProposal}
        onDiscard={onDiscard}
      />,
    )

    expect(screen.getByRole('button', { name: '待确认 predicate summary' })).toHaveTextContent('summary*')
    expect(screen.queryByText('https://pod.example/.data/proposals/vocab/summary.ttl')).not.toBeInTheDocument()

    fireEvent.pointerDown(screen.getByRole('button', { name: '待确认 predicate summary' }))

    const pendingMenu = screen.getByRole('menu')
    expect(within(pendingMenu).getByText('待确认 predicate')).toBeInTheDocument()
    expect(within(pendingMenu).getAllByText('summary*').length).toBeGreaterThanOrEqual(1)
    expect(within(pendingMenu).getByText('text')).toBeInTheDocument()
    expect(within(pendingMenu).getByText('https://schema.org/summary')).toBeInTheDocument()
    expect(within(pendingMenu).getByText('Short card summary')).toBeInTheDocument()
    expect(within(pendingMenu).getByText('规则与形状')).toBeInTheDocument()
    expect(within(pendingMenu).getByText('required')).toBeInTheDocument()
    expect(within(pendingMenu).getByText('待提交')).toBeInTheDocument()
    expect(within(pendingMenu).getByText('已提交审批记录；词表未变更。')).toBeInTheDocument()
    expect(within(pendingMenu).getByText('审批记录')).toBeInTheDocument()
    expect(within(pendingMenu).getByText('https://pod.example/.data/proposals/vocab/summary.ttl')).toBeInTheDocument()
    expect(within(pendingMenu).queryByText('https://pod.example/.vocab/terms.ttl#summary')).not.toBeInTheDocument()
    expect(within(pendingMenu).queryByText('https://pod.example/.vocab/terms.ttl')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: '提交审核' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(screen.getByRole('button', { name: '待确认 predicate summary' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '打开审批记录' }))
    expect(onOpenProposal).toHaveBeenCalledTimes(1)

    fireEvent.pointerDown(screen.getByRole('button', { name: '待确认 predicate summary' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '放弃 predicate' }))
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})
