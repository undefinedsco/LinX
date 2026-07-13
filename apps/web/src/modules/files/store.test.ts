import { beforeEach, describe, expect, it } from 'vitest'
import { readStructuredWhiteboardLayoutsFromStorage, useFilesStore } from './app/store'

const WHITEBOARD_LAYOUT_STORAGE_KEY = 'linx.files.structuredWhiteboardLayouts.v1'

beforeEach(() => {
  localStorage.clear()
  useFilesStore.setState({
    selectedTreeNodeId: 'all',
    selectedFileId: null,
    selectedFileIds: new Set<string>(),
    detailTab: 'preview',
    structuredViewMode: 'table',
    structuredClassScope: null,
    structuredSearchText: '',
    structuredSortKey: null,
    structuredSortDirection: 'asc',
    structuredHiddenPredicates: new Set<string>(),
    structuredViewConfigsByDocument: {},
    structuredColumnSizingByDocument: {},
    structuredWhiteboardLayoutsByDocument: {},
    structuredWhiteboardSubjectsByDocument: {},
    structuredWhiteboardRelationsByDocument: {},
    structuredKanbanGroupPredicate: null,
    structuredKanbanOrderByDocument: {},
    structuredSubjectReturnContext: null,
    structuredScrollRestoration: null,
    editableFileSheetOpenRequestUri: null,
    folderHistory: [],
  })
})

describe('files store whiteboard layout persistence', () => {
  it('enters a folder with history and restores the previous browser location', () => {
    useFilesStore.setState({
      selectedTreeNodeId: 'container:https://pod.example/public/',
      selectedFileId: 'https://pod.example/public/report.md',
    })

    useFilesStore.getState().enterFolder({
      treeNodeId: 'container:https://pod.example/public/docs/',
      containerUri: 'https://pod.example/public/docs/',
      scrollKey: 'docs:0',
    })

    expect(useFilesStore.getState()).toMatchObject({
      selectedTreeNodeId: 'container:https://pod.example/public/docs/',
      selectedFileId: 'https://pod.example/public/docs/',
    })
    expect(useFilesStore.getState().folderHistory).toHaveLength(1)

    useFilesStore.getState().goBackFolder()

    expect(useFilesStore.getState()).toMatchObject({
      selectedTreeNodeId: 'container:https://pod.example/public/',
      selectedFileId: 'https://pod.example/public/report.md',
      folderHistory: [],
    })
  })

  it('restores structured view configuration per document when returning to a file', () => {
    const stateUri = 'https://pod.example/.data/state.ttl'
    const otherUri = 'https://pod.example/.data/other.ttl'
    const state = useFilesStore.getState()

    state.selectFile(stateUri)
    useFilesStore.getState().setStructuredClassScope('udfs:Workspace')
    useFilesStore.getState().setStructuredSearchText('"Other"')
    useFilesStore.getState().setStructuredSortKey('title')
    useFilesStore.getState().toggleStructuredPredicateVisibility('status')
    useFilesStore.getState().setStructuredViewMode('kanban')
    useFilesStore.getState().setStructuredKanbanGroupPredicate('mode')
    useFilesStore.getState().setStructuredKanbanColumnOrder(stateUri, 'read/write', ['#Other', '#Workspace'])
    useFilesStore.getState().setStructuredColumnSizing(stateUri, { title: 220, mode: 148 })

    useFilesStore.getState().selectFile(otherUri)

    expect(useFilesStore.getState()).toMatchObject({
      selectedFileId: otherUri,
      structuredViewMode: 'table',
      structuredClassScope: null,
      structuredSearchText: '',
      structuredSortKey: null,
      structuredSortDirection: 'asc',
      structuredKanbanGroupPredicate: null,
    })
    expect(Array.from(useFilesStore.getState().structuredHiddenPredicates)).toEqual([])

    useFilesStore.getState().selectFile(stateUri)

    expect(useFilesStore.getState()).toMatchObject({
      selectedFileId: stateUri,
      structuredViewMode: 'kanban',
      structuredClassScope: 'udfs:Workspace',
      structuredSearchText: '"Other"',
      structuredSortKey: 'title',
      structuredSortDirection: 'asc',
      structuredKanbanGroupPredicate: 'mode',
    })
    expect(Array.from(useFilesStore.getState().structuredHiddenPredicates)).toEqual(['status'])
    expect(useFilesStore.getState().structuredColumnSizingByDocument[stateUri]).toEqual({
      title: 220,
      mode: 148,
    })
    expect(useFilesStore.getState().structuredKanbanOrderByDocument[stateUri]).toEqual({
      'read/write': ['#Other', '#Workspace'],
    })
  })

  it('sets structured sort direction explicitly without toggling menu actions', () => {
    const stateUri = 'https://pod.example/.data/state.ttl'

    useFilesStore.getState().selectFile(stateUri)
    useFilesStore.getState().setStructuredSort('title', 'desc')

    expect(useFilesStore.getState()).toMatchObject({
      structuredSortKey: 'title',
      structuredSortDirection: 'desc',
    })
    expect(useFilesStore.getState().structuredViewConfigsByDocument[stateUri]).toMatchObject({
      sortKey: 'title',
      sortDirection: 'desc',
    })

    useFilesStore.getState().setStructuredSort('title', 'desc')

    expect(useFilesStore.getState()).toMatchObject({
      structuredSortKey: 'title',
      structuredSortDirection: 'desc',
    })

    useFilesStore.getState().setStructuredSort('title', 'asc')

    expect(useFilesStore.getState()).toMatchObject({
      structuredSortKey: 'title',
      structuredSortDirection: 'asc',
    })

    useFilesStore.getState().setStructuredSort('status', 'desc')

    expect(useFilesStore.getState()).toMatchObject({
      structuredSortKey: 'status',
      structuredSortDirection: 'desc',
    })
    expect(useFilesStore.getState().structuredViewConfigsByDocument[stateUri]).toMatchObject({
      sortKey: 'status',
      sortDirection: 'desc',
    })
  })

  it('clears stale editable file sheet requests when selecting another file', () => {
    const state = useFilesStore.getState()

    state.requestEditableFileSheetOpen('https://pod.example/public/README.md')
    state.selectFile('https://pod.example/.data/state.ttl')

    expect(useFilesStore.getState().editableFileSheetOpenRequestUri).toBeNull()

    useFilesStore.getState().requestEditableFileSheetOpen('https://pod.example/public/README.md')

    expect(useFilesStore.getState().editableFileSheetOpenRequestUri).toBe('https://pod.example/public/README.md')
  })

  it('opens a resource preview through a named store action', () => {
    const sourceUri = 'https://pod.example/.data/source.card.ttl'
    const targetUri = 'https://pod.example/.data/state.ttl'
    const state = useFilesStore.getState()

    state.selectFile(targetUri)
    useFilesStore.getState().setStructuredClassScope('udfs:Workspace')
    useFilesStore.getState().setStructuredViewMode('kanban')
    useFilesStore.getState().requestEditableFileSheetOpen('https://pod.example/public/README.md')
    useFilesStore.getState().selectFile(sourceUri)

    useFilesStore.getState().openFilePreview(targetUri)

    expect(useFilesStore.getState()).toMatchObject({
      selectedFileId: targetUri,
      detailTab: 'preview',
      editableFileSheetOpenRequestUri: null,
      structuredViewMode: 'kanban',
      structuredClassScope: 'udfs:Workspace',
      structuredSubjectReturnContext: null,
      structuredScrollRestoration: null,
    })
  })

  it('persists structured whiteboard node positions as UI metadata', () => {
    useFilesStore.getState().setStructuredWhiteboardNodePosition(
      'https://pod.example/.data/state.ttl::title|related',
      '#Workspace',
      { x: 120, y: 96 },
    )

    expect(JSON.parse(localStorage.getItem(WHITEBOARD_LAYOUT_STORAGE_KEY) ?? '{}')).toEqual({
      'https://pod.example/.data/state.ttl::title|related': {
        '#Workspace': { x: 120, y: 96 },
      },
    })
  })

  it('keeps whiteboard layouts when changing the selected tree node', () => {
    useFilesStore.setState({
      structuredWhiteboardLayoutsByDocument: {
        'https://pod.example/.data/state.ttl::title': {
          '#Workspace': { x: 88, y: 64 },
        },
      },
    })

    useFilesStore.getState().selectTreeNode('container:https://pod.example/public/')

    expect(useFilesStore.getState().structuredWhiteboardLayoutsByDocument).toEqual({
      'https://pod.example/.data/state.ttl::title': {
        '#Workspace': { x: 88, y: 64 },
      },
    })
  })

  it('reads only valid whiteboard positions from persisted storage', () => {
    localStorage.setItem(WHITEBOARD_LAYOUT_STORAGE_KEY, JSON.stringify({
      valid: {
        '#A': { x: 10.2, y: 20.8 },
        '#Bad': { x: '10', y: 20 },
      },
      invalid: 'not a layout',
    }))

    expect(readStructuredWhiteboardLayoutsFromStorage()).toEqual({
      valid: {
        '#A': { x: 10, y: 21 },
      },
    })
  })

  it('tracks selected whiteboard subjects per document without duplicating them', () => {
    const state = useFilesStore.getState()

    state.addStructuredWhiteboardSubject('https://pod.example/.data/state.ttl', '#Workspace')
    state.addStructuredWhiteboardSubject('https://pod.example/.data/state.ttl', '#Workspace')
    state.addStructuredWhiteboardSubject('https://pod.example/.data/state.ttl', '#Other')
    state.addStructuredWhiteboardSubject('https://pod.example/.data/state.ttl', '#Third')
    state.addStructuredWhiteboardSubject('https://pod.example/.data/other.ttl', '#Workspace')
    state.setStructuredWhiteboardVisualRelations('https://pod.example/.data/state.ttl', [
      { id: 'visual-workspace-other', from: '#Workspace', to: '#Other', label: 'sketch link' },
      { id: 'visual-other-third', from: '#Other', to: '#Third', label: 'kept link' },
    ])
    state.setStructuredWhiteboardVisualRelations('https://pod.example/.data/other.ttl', [
      { id: 'visual-other-doc', from: '#Workspace', to: '#Remote', label: 'other document link' },
    ])

    expect(useFilesStore.getState().structuredWhiteboardSubjectsByDocument).toEqual({
      'https://pod.example/.data/state.ttl': ['#Workspace', '#Other', '#Third'],
      'https://pod.example/.data/other.ttl': ['#Workspace'],
    })

    useFilesStore.getState().removeStructuredWhiteboardSubject('https://pod.example/.data/state.ttl', '#Workspace')

    expect(useFilesStore.getState().structuredWhiteboardSubjectsByDocument['https://pod.example/.data/state.ttl']).toEqual(['#Other', '#Third'])
    expect(useFilesStore.getState().structuredWhiteboardRelationsByDocument['https://pod.example/.data/state.ttl']).toEqual([
      { id: 'visual-other-third', from: '#Other', to: '#Third', label: 'kept link' },
    ])

    useFilesStore.getState().clearStructuredWhiteboardSubjects('https://pod.example/.data/state.ttl')

    expect(useFilesStore.getState().structuredWhiteboardSubjectsByDocument['https://pod.example/.data/state.ttl']).toEqual([])
    expect(useFilesStore.getState().structuredWhiteboardRelationsByDocument['https://pod.example/.data/state.ttl']).toEqual([])
    expect(useFilesStore.getState().structuredWhiteboardSubjectsByDocument['https://pod.example/.data/other.ttl']).toEqual(['#Workspace'])
    expect(useFilesStore.getState().structuredWhiteboardRelationsByDocument['https://pod.example/.data/other.ttl']).toEqual([
      { id: 'visual-other-doc', from: '#Workspace', to: '#Remote', label: 'other document link' },
    ])
  })

  it('hydrates visual whiteboard relations from structured view metadata without writing canonical data', () => {
    const state = useFilesStore.getState()
    const documentUri = 'https://pod.example/.data/state.ttl'
    const layoutKey = `${documentUri}::title|related`

    state.hydrateStructuredViewMetadata({
      documentUri,
      viewMode: 'whiteboard',
      classScope: 'udfs:Note',
      searchText: '',
      sortKey: null,
      sortDirection: 'asc',
      hiddenPredicates: [],
      kanbanGroupPredicate: null,
      kanbanOrder: {},
      columnSizing: {},
      whiteboard: {
        selectedSubjects: ['#One', '#Two'],
        positions: {
          '#One': { x: 40, y: 80 },
        },
        visualRelations: [
          {
            id: 'visual-one-two',
            from: '#One',
            to: '#Two',
            label: 'sketch link',
          },
        ],
      },
    }, layoutKey)

    expect(useFilesStore.getState().structuredWhiteboardRelationsByDocument[documentUri]).toEqual([
      {
        id: 'visual-one-two',
        from: '#One',
        to: '#Two',
        label: 'sketch link',
      },
    ])
    expect(useFilesStore.getState().structuredWhiteboardSubjectsByDocument[documentUri]).toEqual(['#One', '#Two'])
    expect(useFilesStore.getState().structuredWhiteboardLayoutsByDocument[layoutKey]).toEqual({
      '#One': { x: 40, y: 80 },
    })
  })

  it('opens editable subject resources in the file editor sheet while preserving table return context', () => {
    const state = useFilesStore.getState()

    state.selectFile('https://pod.example/.data/state.ttl')
    useFilesStore.getState().setStructuredClassScope('udfs:Workspace')
    useFilesStore.getState().setStructuredSearchText('report')
    useFilesStore.getState().openStructuredSubjectResource({
      documentUri: 'https://pod.example/.data/state.ttl',
      subject: '#Report',
      targetUri: 'https://pod.example/public/report.md',
      scrollTop: 312,
      rowIndex: 4,
    })

    expect(useFilesStore.getState().structuredSubjectReturnContext).toMatchObject({
      documentUri: 'https://pod.example/.data/state.ttl',
      subject: '#Report',
      classScope: 'udfs:Workspace',
      searchText: 'report',
      scrollTop: 312,
      rowIndex: 4,
    })
    expect(useFilesStore.getState().editableFileSheetOpenRequestUri).toBe('https://pod.example/public/report.md')
  })

  it('keeps structured subject table resources embedded when opening from a subject', () => {
    const state = useFilesStore.getState()

    state.selectFile('https://pod.example/.data/state.ttl')
    useFilesStore.getState().openStructuredSubjectResource({
      documentUri: 'https://pod.example/.data/state.ttl',
      subject: '#RelatedTable',
      targetUri: 'https://pod.example/.data/related.ttl',
      scrollTop: 120,
      rowIndex: 2,
    })

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/related.ttl')
    expect(useFilesStore.getState().editableFileSheetOpenRequestUri).toBeNull()
  })

  it('queues structured table scroll restoration when returning from a subject resource', () => {
    useFilesStore.setState({
      selectedFileId: 'https://pod.example/public/report.md',
      structuredSubjectReturnContext: {
        documentUri: 'https://pod.example/.data/state.ttl',
        subject: '#Report',
        scrollTop: 312,
        rowIndex: 4,
        viewMode: 'table',
        classScope: 'udfs:Workspace',
        searchText: 'report',
        sortKey: null,
        sortDirection: 'asc',
        hiddenPredicates: [],
        kanbanGroupPredicate: null,
      },
    })

    useFilesStore.getState().returnToStructuredSubject()

    expect(useFilesStore.getState().selectedFileId).toBe('https://pod.example/.data/state.ttl')
    expect(useFilesStore.getState().structuredSubjectReturnContext).toBeNull()
    expect(useFilesStore.getState().structuredScrollRestoration).toEqual({
      documentUri: 'https://pod.example/.data/state.ttl',
      subject: '#Report',
      scrollTop: 312,
      rowIndex: 4,
    })
    expect(useFilesStore.getState().editableFileSheetOpenRequestUri).toBeNull()
  })

  it('restores a structured subject route without losing return context', () => {
    useFilesStore.getState().restoreStructuredSubjectRoute({
      targetUri: 'https://pod.example/public/report.md',
      documentUri: 'https://pod.example/.data/state.ttl',
      subject: '#Report',
      scrollTop: 128,
      rowIndex: 9,
      viewMode: 'whiteboard',
      classScope: 'udfs:Workspace',
      searchText: 'report',
      sortKey: 'title',
      sortDirection: 'desc',
      hiddenPredicates: ['tags'],
      kanbanGroupPredicate: 'status',
    })

    expect(useFilesStore.getState()).toMatchObject({
      selectedFileId: 'https://pod.example/public/report.md',
      detailTab: 'preview',
      editableFileSheetOpenRequestUri: null,
      structuredViewMode: 'whiteboard',
      structuredClassScope: 'udfs:Workspace',
      structuredSearchText: 'report',
      structuredSortKey: 'title',
      structuredSortDirection: 'desc',
      structuredKanbanGroupPredicate: 'status',
      structuredSubjectReturnContext: {
        documentUri: 'https://pod.example/.data/state.ttl',
        subject: '#Report',
        scrollTop: 128,
        rowIndex: 9,
      },
    })
    expect(Array.from(useFilesStore.getState().structuredHiddenPredicates)).toEqual(['tags'])
  })
})
