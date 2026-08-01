import { describe, expect, it, vi } from 'vitest'
import {
  buildStructuredProjectionTableRows,
  buildStructuredShapeWarningMap,
  getStructuredProjectionCellOriginalValues,
  getStructuredProjectionTableCellValues,
  getStructuredProjectionTablePredicateValues,
  compareStructuredProjectionTableRows,
  projectStructuredColumnVisibilityState,
  projectStructuredDisplayTableRows,
  resolveStructuredVisiblePredicates,
} from './structured-projection-table-model'
import {
  hasStructuredCellEditPendingProposal,
  planStructuredCellActivation,
  planStructuredRelationCellCommit,
  planStructuredTextCellCommit,
} from './structured-cell-edit-workflow-model'
import {
  planStructuredEnumOptionAdd,
  planStructuredEnumOptionRemove,
  planStructuredEnumSelectorInputKeyAction,
  planStructuredEnumSelectorOptionKeyAction,
  projectStructuredEnumCellOptionMenuModel,
  projectStructuredEnumCellSelectorChrome,
  projectStructuredEnumCellSelectorModel,
} from './structured-enum-cell-workflow-model'
import {
  projectStructuredEnumOptionLabels,
  projectStructuredEnumOptions,
  projectStructuredEnumSelectedValues,
  projectStructuredEnumValueLabels,
  projectStructuredRelationValues,
  projectStructuredScalarValueLabels,
} from './structured-predicate-cell-display-model'
import {
  canSubmitStructuredSubjectCreation,
  getNextStructuredSubjectDraft,
  planStructuredSubjectCreation,
  projectStagedStructuredPendingSubjects,
  projectStructuredSubjectCreationExistingSubjects,
  projectStructuredSubjectCreationFooterModel,
} from './structured-subject-creation-model'
import type { StructuredTableProjection, VocabTermProposal } from '../structured-table'
import type { StructuredShapeValidationWarning } from '../structured-shape-validation'
import { documentCellKey } from '../domain/structured/structured-table-cell-model'

const projection: StructuredTableProjection = {
  prefixes: {},
  predicates: ['title', 'status'],
  rows: [
    {
      subject: '#Task',
      cells: [
        { predicate: 'title', values: ['"Draft"'] },
      ],
    },
  ],
  warnings: [],
}

describe('structured projection table model', () => {
  it('projects table rows with resolved values, pending predicate columns, and pending subjects', () => {
    const resolveCellValues = vi.fn(({ originalValues }) => (
      originalValues.length > 0 ? [`resolved:${originalValues[0]}`] : []
    ))

    const rows = buildStructuredProjectionTableRows({
      classScope: 'schema:Task',
      pendingPredicateIds: ['priority'],
      pendingSubjects: ['#NewSubject'],
      projection,
      resolveCellValues,
    })

    expect(rows).toEqual([
      {
        subject: '#Task',
        cells: {
          title: ['resolved:"Draft"'],
          status: [],
          priority: [],
        },
      },
      {
        subject: '#NewSubject',
        pending: true,
        cells: { 'rdf:type': ['schema:Task'] },
      },
    ])
    expect(resolveCellValues).toHaveBeenCalledWith({
      subject: '#Task',
      predicate: 'title',
      originalValues: ['"Draft"'],
    })
    expect(resolveCellValues).toHaveBeenCalledWith({
      subject: '#Task',
      predicate: 'status',
      originalValues: [],
    })
  })

  it('resolves visible predicates, hidden column state, and pending-write-only rows', () => {
    const rows = buildStructuredProjectionTableRows({
      classScope: 'schema:Task',
      pendingPredicateIds: ['priority', 'title'],
      pendingSubjects: [],
      projection,
      resolveCellValues: ({ originalValues }) => originalValues,
    })
    const visiblePredicates = resolveStructuredVisiblePredicates({
      pendingPredicateIds: ['priority', 'title'],
      projectionPredicates: projection.predicates,
    })

    expect(visiblePredicates).toEqual(['title', 'status', 'priority'])
    expect(projectStructuredColumnVisibilityState({
      hiddenPredicates: new Set(['status']),
      visiblePredicates,
    })).toEqual({ status: false })
    expect(projectStructuredDisplayTableRows({
      pendingWritesOnly: true,
      pendingWriteSubjects: new Set(['#Task']),
      tableRows: rows,
    })).toEqual(rows)
    expect(projectStructuredDisplayTableRows({
      pendingWritesOnly: true,
      pendingWriteSubjects: new Set(['#Other']),
      tableRows: rows,
    })).toEqual([])
    expect(getStructuredProjectionTablePredicateValues({
      predicate: 'title',
      tableRows: rows,
    })).toEqual(['"Draft"'])
    expect(getStructuredProjectionTableCellValues({
      predicate: 'title',
      subject: '#Task',
      tableRows: rows,
    })).toEqual(['"Draft"'])
    expect(getStructuredProjectionTableCellValues({
      predicate: 'title',
      subject: '#Missing',
      tableRows: rows,
    })).toEqual([])
    expect(getStructuredProjectionTablePredicateValues({
      predicate: 'missing',
      tableRows: rows,
    })).toEqual([])
    expect(compareStructuredProjectionTableRows(
      { subject: '#Task2', cells: {} },
      { subject: '#Task10', cells: {} },
      'subject',
    )).toBeLessThan(0)
    expect(compareStructuredProjectionTableRows(
      { subject: '#TaskA', cells: { status: ['"Blocked"'] } },
      { subject: '#TaskB', cells: { status: ['"Draft"'] } },
      'status',
    )).toBeLessThan(0)
  })

  it('groups shape warnings by document cell key and creates stable subject drafts', () => {
    const warnings: StructuredShapeValidationWarning[] = [
      {
        id: 'w1',
        subject: '#Task',
        predicate: 'title',
        severity: 'warning',
        message: 'Required.',
        rule: 'minCount 1',
      },
      {
        id: 'w2',
        subject: '#Task',
        predicate: 'title',
        severity: 'warning',
        message: 'Pattern mismatch.',
        rule: 'pattern',
      },
    ]
    const warningMap = buildStructuredShapeWarningMap({
      documentUri: 'https://pod.example/.data/tasks.ttl',
      shapeWarnings: warnings,
    })

    expect(warningMap.get(documentCellKey('https://pod.example/.data/tasks.ttl', '#Task', 'title'))).toEqual(warnings)
    expect(projectStructuredSubjectCreationExistingSubjects([
      { subject: '#Task' },
      { subject: '#Note' },
    ])).toEqual(['#Task', '#Note'])
    expect(getNextStructuredSubjectDraft({
      existingSubjects: ['#NewSubject', '#Task'],
      pendingSubjects: ['#NewSubject2'],
    })).toBe('#NewSubject3')
    expect(planStructuredSubjectCreation({
      classScope: null,
      existingSubjects: ['#Task'],
      pendingSubjects: [],
      subjectDraft: '#NewSubject',
    })).toEqual({ kind: 'noop', reason: 'missing-class' })
    expect(planStructuredSubjectCreation({
      classScope: 'schema:Task',
      existingSubjects: ['#Task'],
      pendingSubjects: [],
      subjectDraft: '   ',
    })).toEqual({ kind: 'noop', reason: 'empty-subject' })
    expect(planStructuredSubjectCreation({
      classScope: 'schema:Task',
      existingSubjects: ['#Task'],
      pendingSubjects: ['#NewSubject'],
      subjectDraft: '#NewSubject',
    })).toEqual({ kind: 'noop', reason: 'duplicate-subject' })
    expect(planStructuredSubjectCreation({
      classScope: 'schema:Task',
      existingSubjects: ['#Task'],
      pendingSubjects: [],
      subjectDraft: ' #NewSubject ',
    })).toEqual({
      kind: 'create',
      subject: '#NewSubject',
      typePredicate: 'rdf:type',
      typeValues: ['schema:Task'],
    })
    expect(projectStagedStructuredPendingSubjects({
      pendingSubjects: ['#NewSubject'],
      subject: '#NewSubject2',
    })).toEqual(['#NewSubject', '#NewSubject2'])
    expect(canSubmitStructuredSubjectCreation({
      classScope: 'schema:Task',
      existingSubjects: ['#Task'],
      pendingSubjects: [],
      subjectDraft: ' #NewSubject ',
    })).toBe(true)
    expect(canSubmitStructuredSubjectCreation({
      classScope: 'schema:Task',
      existingSubjects: ['#Task'],
      pendingSubjects: [],
      subjectDraft: '   ',
    })).toBe(false)
    expect(canSubmitStructuredSubjectCreation({
      classScope: 'schema:Task',
      existingSubjects: ['#Task'],
      pendingSubjects: [],
      subjectDraft: '#Task',
    })).toBe(false)
    expect(projectStructuredSubjectCreationFooterModel({ classScope: 'schema:Task' })).toEqual({
      disabled: false,
      title: '在 schema:Task 中新增 subject',
      buttonAriaLabel: '+ Subject',
      buttonLabel: 'Subject',
    })
    expect(projectStructuredSubjectCreationFooterModel({ classScope: null })).toEqual({
      disabled: true,
      title: '先选择 class 再新增 subject',
      buttonAriaLabel: '+ Subject',
      buttonLabel: 'Subject',
    })
  })

  it('projects relation values into normalized link view models', () => {
    expect(projectStructuredRelationValues({
      documentUri: 'https://pod.example/.data/tasks.ttl',
      values: [
        '<https://pod.example/public/report.md>',
        '<https://source.example/report.pdf>',
        '#Task',
      ],
    })).toEqual([
      {
        value: 'https://pod.example/public/report.md',
        displayLabel: 'report.md',
        external: false,
        openAction: {
          ariaLabel: 'Open predicate https://pod.example/public/report.md',
          external: false,
          title: 'https://pod.example/public/report.md',
          value: 'https://pod.example/public/report.md',
        },
      },
      {
        value: 'https://source.example/report.pdf',
        displayLabel: 'report.pdf',
        external: true,
        openAction: {
          ariaLabel: 'Open URL https://source.example/report.pdf',
          external: true,
          title: 'https://source.example/report.pdf',
          value: 'https://source.example/report.pdf',
        },
      },
      {
        value: '#Task',
        displayLabel: 'Task',
        external: false,
        openAction: {
          ariaLabel: 'Open predicate #Task',
          external: false,
          title: '#Task',
          value: '#Task',
        },
      },
    ])
  })

  it('projects enum options with pending proposal metadata and selected labels', () => {
    const pendingProposal: VocabTermProposal = {
      id: 'proposal-review',
      kind: 'vocab-term-proposal',
      status: 'pending',
      operation: 'create',
      documentUri: 'https://pod.example/.data/tasks.ttl',
      proposalResourceUri: 'https://pod.example/.data/proposals/vocab/review.ttl',
      targetVocabUri: 'https://pod.example/.vocab/terms.ttl#Review',
      targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
      classScope: 'schema:Task',
      termUri: 'https://pod.example/.vocab/terms.ttl#Review',
      termKind: 'enum-option',
      label: 'Review',
      valueType: 'enum-option',
      description: 'A review status.',
      shape: 'predicate status',
      predicate: 'status',
      createdAt: '2026-06-18T00:00:00.000Z',
      writesCanonicalVocab: false,
    }

    expect(projectStructuredEnumOptions({
      options: ['Draft', 'Review'],
      predicate: 'status',
      proposals: [pendingProposal],
      resolveTermUri: (label) => `https://pod.example/.vocab/terms.ttl#${label}`,
    })).toEqual([
      {
        label: 'Draft',
        pending: false,
        termUri: 'https://pod.example/.vocab/terms.ttl#Draft',
        status: '已定义或已观察',
        proposalResourceUri: undefined,
        targetVocabUri: undefined,
        proposal: undefined,
      },
      {
        label: 'Review',
        pending: true,
        termUri: pendingProposal.termUri,
        status: '词表变更待确认',
        proposalResourceUri: pendingProposal.proposalResourceUri,
        targetVocabUri: pendingProposal.targetVocabUri,
        proposal: pendingProposal,
      },
    ])
    expect(projectStructuredEnumSelectedValues(['"Draft"', '"Review"'])).toEqual(['Draft', 'Review'])
  })

  it('combines enum option labels from observed values, pending definitions, vocab definitions, and proposals', () => {
    const pendingProposal: VocabTermProposal = {
      id: 'proposal-review',
      kind: 'vocab-term-proposal',
      status: 'pending',
      operation: 'create',
      documentUri: 'https://pod.example/.data/tasks.ttl',
      proposalResourceUri: 'https://pod.example/.data/proposals/vocab/review.ttl',
      targetVocabUri: 'https://pod.example/.vocab/terms.ttl#Review',
      targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
      classScope: 'schema:Task',
      termUri: 'https://pod.example/.vocab/terms.ttl#Review',
      termKind: 'enum-option',
      label: 'Review',
      valueType: 'enum-option',
      description: 'A review status.',
      shape: 'predicate https://schema.org/status',
      predicate: 'https://schema.org/status',
      createdAt: '2026-06-18T00:00:00.000Z',
      writesCanonicalVocab: false,
    }

    expect(projectStructuredEnumOptionLabels({
      definitionOptionsByPredicate: new Map([
        ['status', [
          {
            uri: 'https://pod.example/.vocab/terms.ttl#InProgress',
            label: 'In Progress',
            description: 'Work has started.',
            status: 'active',
          },
          {
            uri: 'https://pod.example/.vocab/terms.ttl#Blocked',
            label: 'Blocked',
            description: 'Work is blocked.',
            status: 'active',
          },
        ]],
      ]),
      observedValues: ['"Draft"', '"Blocked"', '"Draft"'],
      pendingDefinitionOptions: ['Review', 'Later'],
      predicate: 'https://schema.org/status',
      proposals: [pendingProposal],
    })).toEqual(['Draft', 'Blocked', 'Review', 'Later', 'In Progress'])
  })

  it('projects displayed enum and scalar cell labels with pending enum markers', () => {
    const pendingProposal: VocabTermProposal = {
      id: 'proposal-review',
      kind: 'vocab-term-proposal',
      status: 'pending',
      operation: 'create',
      documentUri: 'https://pod.example/.data/tasks.ttl',
      proposalResourceUri: 'https://pod.example/.data/proposals/vocab/review.ttl',
      targetVocabUri: 'https://pod.example/.vocab/terms.ttl#Review',
      targetShapesUri: 'https://pod.example/.vocab/shapes.ttl',
      classScope: 'schema:Task',
      termUri: 'https://pod.example/.vocab/terms.ttl#Review',
      termKind: 'enum-option',
      label: 'Review',
      valueType: 'enum-option',
      description: 'A review status.',
      shape: 'predicate status',
      predicate: 'https://schema.org/status',
      createdAt: '2026-06-18T00:00:00.000Z',
      writesCanonicalVocab: false,
    }

    expect(projectStructuredEnumValueLabels({
      predicate: 'status',
      proposals: [pendingProposal],
      values: ['"Draft"', '"Review"'],
    })).toEqual(['Draft', 'Review*'])
    expect(projectStructuredScalarValueLabels({
      predicate: 'https://schema.org/status',
      proposals: [pendingProposal],
      values: ['"Review"', '"2026-06-18"^^xsd:date'],
    })).toEqual(['Review*', '2026-06-18'])
  })

  it('reads original projection cell values and detects pending edit indicators', () => {
    const projectionWithStatus: StructuredTableProjection = {
      prefixes: {},
      predicates: ['status'],
      rows: [
        {
          subject: '#Task',
          cells: [
            { predicate: 'status', values: ['"Draft"'] },
          ],
        },
      ],
      warnings: [],
    }

    const originalValues = getStructuredProjectionCellOriginalValues({
      predicate: 'status',
      projection: projectionWithStatus,
      subject: '#Task',
    })

    expect(originalValues).toEqual(['"Draft"'])
    expect(getStructuredProjectionCellOriginalValues({
      predicate: 'status',
      projection: projectionWithStatus,
      subject: '#Missing',
    })).toEqual([])
    expect(hasStructuredCellEditPendingProposal({
      hasCellWriteProposal: false,
      nextValues: ['"Draft"'],
      originalValues,
    })).toBe(false)
    expect(hasStructuredCellEditPendingProposal({
      hasCellWriteProposal: false,
      nextValues: ['"Review"'],
      originalValues,
    })).toBe(true)
    expect(hasStructuredCellEditPendingProposal({
      hasCellWriteProposal: true,
      nextValues: ['"Draft"'],
      originalValues,
    })).toBe(true)
  })

  it('plans enum option additions without coupling cell writes to React handlers', () => {
    expect(planStructuredEnumOptionAdd({
      definition: { valueType: 'enum' },
      existingValues: ['"Draft"'],
      knownOptions: ['Draft', 'Review'],
      previousValues: [],
      value: '  Review ',
    })).toEqual({
      kind: 'known-option',
      label: 'Review',
      nextValues: ['"Review"'],
    })
    expect(planStructuredEnumOptionAdd({
      definition: { valueType: 'multi-select' },
      existingValues: ['"Draft"'],
      knownOptions: ['Draft'],
      previousValues: [],
      value: 'Blocked',
    })).toEqual({
      kind: 'new-option',
      label: 'Blocked',
      nextValues: ['"Draft"', '"Blocked"'],
    })
    expect(planStructuredEnumOptionAdd({
      definition: { valueType: 'enum' },
      existingValues: ['"Draft"'],
      knownOptions: ['Draft'],
      previousValues: [],
      value: 'Draft',
    })).toEqual({ kind: 'noop', reason: 'duplicate' })
  })

  it('plans enum option removals without mutating missing values', () => {
    expect(planStructuredEnumOptionRemove({
      existingValues: ['"Draft"', '"Review"', '"Blocked"'],
      value: 'Review',
    })).toEqual({
      kind: 'cell-write',
      nextValues: ['"Draft"', '"Blocked"'],
    })
    expect(planStructuredEnumOptionRemove({
      existingValues: ['"Draft"'],
      value: 'Missing',
    })).toEqual({ kind: 'noop', reason: 'missing' })
  })

  it('projects enum selector search state without leaving filter/create rules in the cell primitive', () => {
    const ready = {
      label: 'Ready',
      termUri: 'https://pod.example/.vocab/terms.ttl#Ready',
    }
    const needsReview = {
      label: 'Needs review',
      pending: true,
      termUri: 'https://pod.example/.vocab/terms.ttl#NeedsReview',
    }

    expect(projectStructuredEnumCellSelectorModel({
      options: [ready, needsReview],
      search: ' needs ',
      selectedValues: ['Draft'],
    })).toEqual({
      canCreate: true,
      exactSearchOptionLabel: null,
      filteredOptions: [needsReview],
      normalizedSearch: 'needs',
    })

    expect(projectStructuredEnumCellSelectorModel({
      options: [ready, needsReview],
      search: 'ready',
      selectedValues: ['Draft'],
    })).toEqual({
      canCreate: false,
      exactSearchOptionLabel: 'Ready',
      filteredOptions: [ready],
      normalizedSearch: 'ready',
    })

    expect(projectStructuredEnumCellSelectorModel({
      options: [ready, needsReview],
      search: ' draft ',
      selectedValues: ['Draft'],
    }).canCreate).toBe(false)
  })

  it('plans enum selector input keyboard actions outside the cell primitive', () => {
    expect(planStructuredEnumSelectorInputKeyAction({
      exactSearchOptionLabel: 'Ready',
      key: 'Enter',
      normalizedSearch: 'ready',
    })).toEqual({
      kind: 'add-option',
      value: 'Ready',
    })

    expect(planStructuredEnumSelectorInputKeyAction({
      exactSearchOptionLabel: null,
      key: 'Enter',
      normalizedSearch: 'Later',
    })).toEqual({
      kind: 'add-option',
      value: 'Later',
    })

    expect(planStructuredEnumSelectorInputKeyAction({
      exactSearchOptionLabel: null,
      key: 'Escape',
      normalizedSearch: 'Later',
    })).toEqual({
      kind: 'cancel',
    })

    expect(planStructuredEnumSelectorInputKeyAction({
      exactSearchOptionLabel: null,
      key: 'Enter',
      normalizedSearch: '',
    })).toEqual({
      kind: 'noop',
    })
  })

  it('plans enum selector option keyboard actions outside the cell primitive', () => {
    expect(planStructuredEnumSelectorOptionKeyAction({
      key: 'Enter',
      optionLabel: 'Ready',
    })).toEqual({
      kind: 'add-option',
      value: 'Ready',
    })

    expect(planStructuredEnumSelectorOptionKeyAction({
      key: ' ',
      optionLabel: 'Ready',
    })).toEqual({
      kind: 'add-option',
      value: 'Ready',
    })

    expect(planStructuredEnumSelectorOptionKeyAction({
      key: 'ArrowDown',
      optionLabel: 'Ready',
    })).toEqual({
      kind: 'noop',
    })
  })

  it('projects enum selector chrome and option definition menu outside the cell primitive', () => {
    const selectorChrome = projectStructuredEnumCellSelectorChrome({
      ariaLabel: '编辑 #Workspace 的 status',
      canCreate: true,
      normalizedSearch: 'Later',
      optionsLabel: 'Review status options',
      selectedValues: ['Draft'],
      valueLabel: 'status',
    })

    expect(selectorChrome).toEqual({
      createOption: {
        addAction: {
          value: 'Later',
        },
        ariaLabel: '新增选项 Later',
        label: '新增 Later*',
      },
      input: {
        placeholder: '选择或创建选项',
      },
      listbox: {
        ariaLabel: 'Review status options',
      },
      selectedValues: {
        ariaLabel: 'status 已选择值',
        chips: [
          {
            value: 'Draft',
            ariaLabel: 'status 已选择 Draft',
            removeAction: {
              ariaLabel: '从 status 移除 Draft',
              value: 'Draft',
            },
          },
        ],
      },
    })

    expect(projectStructuredEnumCellSelectorChrome({
      ariaLabel: '编辑 #Workspace 的 status',
      canCreate: false,
      normalizedSearch: 'Ready',
      selectedValues: [],
    }).createOption).toBeNull()

    const optionMenu = projectStructuredEnumCellOptionMenuModel({
      option: {
        label: 'Needs review',
        pending: true,
        proposalResourceUri: 'https://pod.example/.data/proposals/vocab/needs-review.ttl',
        status: '词表变更待确认',
      },
      predicateLabel: 'reviewStatus',
    })

    expect(optionMenu).toEqual({
      actions: {
        discardProposal: { label: '忽略词表变更' },
        openDefinition: { label: '打开选项链接' },
        openProposal: { label: '打开审批记录' },
      },
      displayLabel: 'Needs review*',
      selectAction: {
        value: 'Needs review',
      },
      rows: {
        option: {
          label: '选项',
          value: 'Needs review*',
        },
        predicate: {
          label: 'predicate',
          value: 'reviewStatus',
        },
        status: {
          approvalReadyLabel: '审批记录已准备',
          label: '状态',
          value: '词表变更待确认',
        },
      },
      title: '选项定义',
      trigger: {
        ariaLabel: '选项定义 Needs review',
      },
    })
  })

  it('plans cell activation without coupling editor type decisions to the renderer', () => {
    const row = {
      subject: '#Task',
      cells: {
        done: ['false'],
        link: ['<https://pod.example/report.md>'],
        status: ['"Draft"', '"Review"'],
        title: ['"Draft"'],
      },
    }

    expect(planStructuredCellActivation({
      editable: false,
      predicate: 'title',
      row,
    })).toEqual({ kind: 'none' })
    expect(planStructuredCellActivation({
      editable: true,
      predicate: 'title',
      row: { ...row, pending: true },
    })).toEqual({ kind: 'none' })
    expect(planStructuredCellActivation({
      editable: true,
      predicate: 'done',
      row,
    })).toEqual({
      kind: 'toggle-boolean',
      subject: '#Task',
      predicate: 'done',
      nextValues: ['true'],
    })
    expect(planStructuredCellActivation({
      editable: true,
      predicate: 'link',
      row,
    })).toEqual({
      kind: 'open-relation',
      subject: '#Task',
      predicate: 'link',
      value: 'https://pod.example/report.md',
    })
    expect(planStructuredCellActivation({
      editable: true,
      predicate: 'status',
      row,
    })).toEqual({
      kind: 'open-enum',
      subject: '#Task',
      predicate: 'status',
    })

    const scalarPlan = planStructuredCellActivation({
      editable: true,
      predicate: 'title',
      row,
    })
    expect(scalarPlan.kind).toBe('open-scalar')
    if (scalarPlan.kind !== 'open-scalar') return
    expect(scalarPlan).toMatchObject({
      subject: '#Task',
      predicate: 'title',
      value: 'Draft',
      scalarKind: 'text',
    })
    expect(scalarPlan.commit('Updated')).toBe('"Updated"')
  })

  it('plans text and relation cell commits without renderer-side RDF formatting', () => {
    expect(planStructuredTextCellCommit({
      activeCell: null,
    })).toEqual({ kind: 'none' })
    expect(planStructuredTextCellCommit({
      activeCell: {
        subject: '#Task',
        predicate: 'title',
        value: 'Draft',
        commit: (next) => `"${next}"`,
      },
      nextValue: ' Updated ',
    })).toEqual({
      kind: 'cell-write',
      subject: '#Task',
      predicate: 'title',
      nextValues: ['" Updated "'],
    })
    expect(planStructuredTextCellCommit({
      activeCell: {
        subject: '#Task',
        predicate: 'title',
        value: 'Draft',
        commit: (next) => `"${next}"`,
      },
      nextValue: '   ',
    })).toEqual({
      kind: 'cell-write',
      subject: '#Task',
      predicate: 'title',
      nextValues: [],
    })

    expect(planStructuredRelationCellCommit({
      activeCell: null,
    })).toEqual({ kind: 'none' })
    expect(planStructuredRelationCellCommit({
      activeCell: {
        subject: '#Task',
        predicate: 'link',
        value: 'https://pod.example/report.md',
      },
      nextValue: ' https://pod.example/updated.md ',
    })).toEqual({
      kind: 'cell-write',
      subject: '#Task',
      predicate: 'link',
      nextValues: ['<https://pod.example/updated.md>'],
    })
    expect(planStructuredRelationCellCommit({
      activeCell: {
        subject: '#Task',
        predicate: 'link',
        value: 'https://pod.example/report.md',
      },
      nextValue: ' ',
    })).toEqual({
      kind: 'cell-write',
      subject: '#Task',
      predicate: 'link',
      nextValues: [],
    })
  })
})
