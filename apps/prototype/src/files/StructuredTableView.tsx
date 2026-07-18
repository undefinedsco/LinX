import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table'
import {
  Check,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  FileCode2,
  FileText,
  LayoutGrid,
  Link2,
  ListOrdered,
  MoreHorizontal,
  Plus,
  Search,
  Tags,
  X,
} from 'lucide-react'
import { SubjectOpenDialog, type FilePropertyState } from './FileEditorSheet'
import {
  clearEnumOptionProposal,
  createPredicateProposal,
  enumOptionProposalUri,
  makePredicateProposalUri,
  proposalKeyForPredicate,
  proposalKeyForEnumOption,
  removeEnumOptionFromValue,
  setEnumOptionProposal,
  type ProposalResourceAction,
  type ProposalResourceKind,
  type SourceReviewState,
} from './files-proposals'
import { TypedPredicateCell } from './typed-cell-editors'
import { ViewTabs } from './files-ui'
import { usePopover } from '../shared/ui'
import {
  classVocabUri,
  getStructuredProjection,
  predicateLocalName,
  predicateTypeOptions,
  sourceLinkedCardForSubject,
  structuredBasePredicatesByClass,
  structuredClassOptions,
  structuredClassStates,
  structuredSubjectValues,
  subjectRows,
  vocabStateLabel,
  vocabTermSlug,
} from './files-model'
import type {
  IconType,
  SourceIngestState,
  PredicateDefinition,
  PredicateKind,
  StoredFileContent,
  LastOpenedSubjectRoute,
  StructuredView,
  SubjectOpenTarget,
  SubjectRouteContext,
  SubjectRow,
  SubjectTargetKind,
  TableSortMode,
  VocabTermRow,
  VocabTermState,
} from './files-types'

interface CompactTableColumn {
  id: string
  label: string
  icon?: IconType
  width: number
}

export function StructuredFilterMenu({
  approvedClassNames,
  discardedClassNames,
  selectedClass,
  classOptions,
  onApproveClass,
  onDiscardClass,
  onSelectClass,
  onCreateClass,
}: {
  approvedClassNames: string[]
  discardedClassNames: string[]
  selectedClass: string
  classOptions: string[]
  onApproveClass: (className: string) => void
  onDiscardClass: (className: string) => void
  onSelectClass: (className: string) => void
  onCreateClass?: (className: string) => void
}) {
  const [openClassDefinition, setOpenClassDefinition] = useState<string | null>(null)
  const [creatingClass, setCreatingClass] = useState(false)
  const [draftClassName, setDraftClassName] = useState('')
  const classSubjectCount = (className: string) => subjectRows.filter((row) => row.className === className).length
  const visibleClassOptions = classOptions.filter((className) => !discardedClassNames.includes(className))

  const commitCreateClass = () => {
    const raw = draftClassName.trim()
    if (!raw) return
    const name = vocabTermSlug(raw).replace(/^./, (char) => char.toUpperCase())
    onCreateClass?.(name)
    onSelectClass(name)
    setCreatingClass(false)
    setDraftClassName('')
  }

  return (
    <div className="structured-filter-menu" role="menu" aria-label="Structured filters">
      <section>
        <h3>rdf:type · class scope</h3>
        {visibleClassOptions.map((className) => {
          const classState = approvedClassNames.includes(className) ? undefined : structuredClassStates[className]
          const isCreated = !structuredClassOptions.includes(className)
          return (
            <span
              className={`${className === selectedClass ? 'active' : ''} ${classState || isCreated ? 'vocab-pending' : ''}`}
              key={className}
            >
              <button
                className="class-filter-pick"
                onClick={() => {
                  window.setTimeout(() => onSelectClass(className), 0)
                }}
              >
                <Tags size={14} />
                <span>
                  <strong>{className}</strong>
                  <small>{classSubjectCount(className)} subject · {(structuredBasePredicatesByClass[className] ?? []).length} predicates{isCreated ? ' · 新建' : ''}</small>
                  {classState ? <em className={`vocab-state-star ${classState}`} title={vocabStateLabel(classState)}>*</em> : null}
                </span>
                {className === selectedClass ? <Check size={14} /> : null}
              </button>
              <button
                className={`class-filter-more ${openClassDefinition === className ? 'active' : ''}`}
                aria-label={`Edit ${className} class definition`}
                title="Edit class definition"
                onClick={(event) => {
                  event.stopPropagation()
                  setOpenClassDefinition((current) => current === className ? null : className)
                }}
              >
                <MoreHorizontal size={15} />
              </button>
              {openClassDefinition === className ? (
                <span className="vocab-term-menu class-definition-menu">
                  <strong>{className}</strong>
                  <small>{classVocabUri(className)}</small>
                  {classState ? <em className={`vocab-state-badge ${classState}`}>{vocabStateLabel(classState)}</em> : null}
                  <button><Tags size={13} /> Change color</button>
                  <button><FileText size={13} /> Edit class definition</button>
                  <button><ExternalLink size={13} /> Open class URI</button>
                  {classState ? (
                    <>
                      <button
                        aria-label={`Approve ${className} class`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onApproveClass(className)
                          setOpenClassDefinition(null)
                        }}
                      >
                        <Check size={13} /> Approve vocab change
                      </button>
                      <button
                        aria-label={`Discard ${className} class`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onDiscardClass(className)
                          setOpenClassDefinition(null)
                        }}
                      >
                        <X size={13} /> Discard proposal
                      </button>
                    </>
                  ) : null}
                </span>
              ) : null}
            </span>
          )
        })}
        {creatingClass ? (
          <span className="class-create-row">
            <input
              autoFocus
              value={draftClassName}
              placeholder="udfs:Note"
              aria-label="新 class 名称"
              onChange={(event) => setDraftClassName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitCreateClass()
                if (event.key === 'Escape') {
                  setCreatingClass(false)
                  setDraftClassName('')
                }
              }}
            />
            <button aria-label="创建 class" onClick={commitCreateClass}>
              <Check size={14} />
            </button>
          </span>
        ) : (
          <button className="class-create-trigger" onClick={() => setCreatingClass(true)}>
            <Plus size={14} />
            <span>新建 Class</span>
          </button>
        )}
      </section>
    </div>
  )
}

export function StructuredViewTabs({
  structuredView,
  onChangeView,
}: {
  structuredView: StructuredView
  onChangeView: (view: StructuredView) => void
}) {
  const viewMenu = usePopover('.view-menu-anchor')
  const viewDefs: Record<StructuredView, { label: string; icon: IconType }> = {
    table: { label: 'Table', icon: Database },
    discover: { label: 'Discover', icon: Search },
    kanban: { label: 'Kanban', icon: ListOrdered },
    whiteboard: { label: 'Whiteboard', icon: LayoutGrid },
    raw: { label: 'Raw', icon: FileCode2 },
  }
  const visibleViews: StructuredView[] = structuredView === 'table' ? ['table'] : ['table', structuredView]

  return (
    <ViewTabs
      ariaLabel="RDF resource views"
      views={visibleViews.map((viewId) => ({ id: viewId, label: viewDefs[viewId].label, icon: viewDefs[viewId].icon }))}
      active={structuredView}
      onChange={(id) => onChangeView(id as StructuredView)}
      trailing={(
        <span className="view-menu-anchor">
          <button
            className="add-view-button"
            onClick={viewMenu.toggle}
            title="Add view"
          >
            <Plus size={15} />
            <span>View</span>
          </button>
          {viewMenu.open ? (
            <div className="view-menu" role="menu" aria-label="Add view">
              {(['kanban', 'whiteboard', 'raw'] as StructuredView[]).map((viewId) => {
                const view = viewDefs[viewId]
                const Icon = view.icon
                return (
                  <button
                    key={viewId}
                    onClick={() => {
                      window.setTimeout(() => {
                        onChangeView(viewId)
                        viewMenu.close()
                      }, 0)
                    }}
                  >
                    <Icon size={16} />
                    <span>{view.label}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </span>
      )}
    />
  )
}

function CompactTableShell({
  className = '',
  columns,
  children,
}: {
  className?: string
  columns: CompactTableColumn[]
  children: React.ReactNode
}) {
  const schemaTemplate = columns.map((column) => `${column.width}px`).join(' ')
  const gridStyle = {
    '--predicate-count': columns.length,
    '--schema-template': schemaTemplate,
    '--schema-min-width': `${columns.reduce((sum, column) => sum + column.width, 0)}px`,
    '--schema-row-height': '34px',
    '--schema-cell-gap': '0px',
    '--schema-row-padding': '0 7px',
  } as React.CSSProperties

  return (
    <section className={`structured-table compact-table ${className}`}>
      <div className="subject-grid predicate-grid" style={gridStyle}>
        <div className="subject-head">
          {columns.map((column) => {
            const Icon = column.icon
            return (
              <span className="schema-head-label compact-head-label" key={column.id}>
                {Icon ? <Icon size={14} /> : null}
                {column.label}
              </span>
            )
          })}
        </div>
        {children}
      </div>
    </section>
  )
}

export function VocabTermsTable({ rows }: { rows: VocabTermRow[] }) {
  const [termMenu, setTermMenu] = useState<string | null>(null)
  const columns: CompactTableColumn[] = [
    { id: 'term', label: 'Term', icon: FileCode2, width: 238 },
    { id: 'kind', label: 'Kind', icon: Tags, width: 92 },
    { id: 'label', label: 'Label', icon: FileText, width: 132 },
    { id: 'definition', label: 'Definition', icon: FileText, width: 300 },
    { id: 'range', label: 'Range', icon: ExternalLink, width: 196 },
    { id: 'status', label: 'Status', icon: Check, width: 96 },
    { id: 'actions', label: '', width: 46 },
  ]

  return (
    <CompactTableShell className="canonical-vocab-table" columns={columns}>
      {rows.map((row) => (
        <div className={`subject-row vocab-term-row ${row.vocabState ? 'vocab-pending' : ''}`} key={row.uri}>
          <span className="subject-name">
            <FileCode2 size={15} />
            {row.term}{row.vocabState ? <em className={`vocab-state-star ${row.vocabState}`} title={vocabStateLabel(row.vocabState)}>*</em> : null}
          </span>
          <span><em className="value-token select">{row.kind}</em></span>
          <span>{row.label}</span>
          <span>{row.definition}</span>
          <span><code className="value-code">{row.range}</code></span>
          <span>{row.status}</span>
          <span className="vocab-term-actions">
            <button
              className={`predicate-head-more ${termMenu === row.uri ? 'active' : ''}`}
              aria-label={`View ${row.term}`}
              title="View term definition"
              onClick={(event) => {
                event.stopPropagation()
                setTermMenu((current) => current === row.uri ? null : row.uri)
              }}
            >
              <MoreHorizontal size={14} />
            </button>
            {termMenu === row.uri ? (
              <span className="vocab-term-menu predicate-definition-menu">
                <strong>{row.term}</strong>
                <small>{row.uri}</small>
                {row.vocabState ? <em className={`vocab-state-badge ${row.vocabState}`}>{vocabStateLabel(row.vocabState)}</em> : null}
                <button><FileText size={13} /> View definition</button>
                <button><Tags size={13} /> View display rule</button>
                <button><ExternalLink size={13} /> Open term URI</button>
              </span>
            ) : null}
          </span>
        </div>
      ))}
    </CompactTableShell>
  )
}

export function StructuredTable({
  canonicalVocab,
  editableVocab,
  selectedClass,
  predicates,
  draftPredicateCount,
  showPredicateNamespace,
  searchQuery,
  sortMode,
  hiddenPredicateIds,
  cellOverrides,
  fileContentsByPath,
  filePropertiesByPath,
  sourceIngestStatesBySource,
  routeContext,
  sourceReviewState,
  onChangeFileContent,
  onChangeFileProperties,
  onChangeSourceIngestState,
  onChangeSourceReviewState,
  onRecordProposalResource,
  onAddPredicateProposal,
  onApprovePredicateProposal,
  onDiscardPredicateProposal,
  onOpenSubjectRoute,
  onOpenResourceFile,
  notify,
  onSetCellValue,
}: {
  canonicalVocab: boolean
  editableVocab: boolean
  selectedClass: string
  predicates: PredicateDefinition[]
  draftPredicateCount: number
  showPredicateNamespace: boolean
  searchQuery: string
  sortMode: TableSortMode
  hiddenPredicateIds: string[]
  cellOverrides: Record<string, string>
  fileContentsByPath?: Record<string, StoredFileContent>
  filePropertiesByPath?: Record<string, FilePropertyState>
  sourceIngestStatesBySource?: Record<string, SourceIngestState>
  routeContext: Omit<SubjectRouteContext, 'rowSubject'>
  sourceReviewState: SourceReviewState
  onChangeFileContent?: (path: string, content: StoredFileContent) => void
  onChangeFileProperties?: (path: string, properties: FilePropertyState) => void
  onChangeSourceIngestState?: (source: string, state: SourceIngestState) => void
  onChangeSourceReviewState: (state: SourceReviewState) => void
  onRecordProposalResource?: (kind: ProposalResourceKind, target: string, action: ProposalResourceAction, scope?: string) => void
  onAddPredicateProposal: (predicate: PredicateDefinition) => void
  onApprovePredicateProposal: (predicateId: string) => void
  onDiscardPredicateProposal: (predicateId: string) => void
  onOpenSubjectRoute?: (route: LastOpenedSubjectRoute) => void
  onOpenResourceFile?: (selection: 'structuredVocab' | 'structuredData', row: SubjectRow, route: LastOpenedSubjectRoute) => void
  notify?: (title: string, kind?: 'ok' | 'err') => void
  onSetCellValue: (subject: string, predicateId: string, nextValue: string) => void
}) {
  const [predicateMenuOpen, setPredicateMenuOpen] = useState(false)
  const [createPredicateOpen, setCreatePredicateOpen] = useState(false)
  const [selectedPredicateType, setSelectedPredicateType] = useState<PredicateKind>('text')
  const [draftPredicateName, setDraftPredicateName] = useState('review status')
  const [draftPredicateUri, setDraftPredicateUri] = useState('/.vocab/terms.ttl#reviewStatus')
  const [activeCell, setActiveCell] = useState<{ subject: string; predicateId: string } | null>(null)
  const [predicateWidths, setPredicateWidths] = useState<Record<string, number>>({})
  const [enumDrafts, setEnumDrafts] = useState<Record<string, string>>({})
  const [enumOptionStates, setEnumOptionStates] = useState<Record<string, VocabTermState>>({})
  const [enumToneOverrides, setEnumToneOverrides] = useState<Record<string, string>>({})
  const [enumDefinitionMenu, setEnumDefinitionMenu] = useState<{ cellKey: string; predicateId: string; option: string } | null>(null)
  const [predicateDefinitionMenu, setPredicateDefinitionMenu] = useState<string | null>(null)
  const [subjectPeek, setSubjectPeek] = useState<SubjectRow | null>(null)
  const [subjectOpenTarget, setSubjectOpenTarget] = useState<SubjectOpenTarget | null>(null)
  const [addedSubjects, setAddedSubjects] = useState<SubjectRow[]>([])
  const [creatingSubject, setCreatingSubject] = useState(false)
  const [draftSubjectName, setDraftSubjectName] = useState('')
  const gridRef = useRef<HTMLDivElement | null>(null)
  const lastRouteRef = useRef<LastOpenedSubjectRoute | null>(null)
  const predicateTypeMeta = new Map(predicateTypeOptions.map((type) => [type.kind, type]))
  const visiblePredicates = predicates.filter((predicate) => !hiddenPredicateIds.includes(predicate.id))
  const predicateStateKey = (predicateId: string) => proposalKeyForPredicate(selectedClass, predicateId)
  const predicateWidth = (predicateId: string) => predicateWidths[predicateStateKey(predicateId)] ?? (showPredicateNamespace ? 124 : 96)
  const subjectColumn = '110px'
  const schemaTemplate = [
    subjectColumn,
    ...visiblePredicates.map((predicate) => `${predicateWidth(predicate.id)}px`),
    ...(!canonicalVocab ? ['66px'] : []),
  ].join(' ')
  const schemaMinWidth = 114 + visiblePredicates.reduce((sum, predicate) => sum + predicateWidth(predicate.id), 0) + (canonicalVocab ? 0 : 66)
  const gridStyle = {
    '--predicate-count': visiblePredicates.length,
    '--schema-template': schemaTemplate,
    '--schema-min-width': `${schemaMinWidth}px`,
    '--schema-row-height': '34px',
    '--schema-cell-gap': '0px',
    '--schema-row-padding': '0 7px',
  } as React.CSSProperties
  const visibleRows = useMemo(() => [
    ...subjectRows.filter((row) => row.className === selectedClass),
    ...addedSubjects.filter((row) => row.className === selectedClass),
  ], [selectedClass, addedSubjects])

  useEffect(() => {
    setActiveCell(null)
    setPredicateMenuOpen(false)
    setCreatePredicateOpen(false)
    setEnumDefinitionMenu(null)
    setPredicateDefinitionMenu(null)
    setSubjectPeek(null)
    setCreatingSubject(false)
    setDraftSubjectName('')
    const nextName = 'review status'
    setDraftPredicateName(nextName)
    setDraftPredicateUri(makePredicateProposalUri(selectedClass, nextName))
  }, [selectedClass])

  useEffect(() => {
    const closeFloatingMenus = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.cell-editor, .cell-popover, .add-predicate-head, .predicate-menu, .predicate-head-cell, .predicate-definition-menu, .vocab-term-menu, .subject-peek, .subject-resource-link')) return
      window.setTimeout(() => {
        setActiveCell(null)
        setPredicateMenuOpen(false)
        setCreatePredicateOpen(false)
        setEnumDefinitionMenu(null)
        setPredicateDefinitionMenu(null)
        setSubjectPeek(null)
      }, 0)
    }

    window.addEventListener('mousedown', closeFloatingMenus)
    return () => window.removeEventListener('mousedown', closeFloatingMenus)
  }, [])

  const cellKey = (subject: string, predicateId: string) => `${subject}::${predicateId}`
  const cellValue = (subject: string, predicateId: string) => {
    const key = cellKey(subject, predicateId)
    return cellOverrides[key] ?? structuredSubjectValues[subject]?.[predicateId]
  }
  const setCellValue = (subject: string, predicateId: string, nextValue: string) => {
    onSetCellValue(subject, predicateId, nextValue)
  }
  const normalizedSearch = searchQuery.trim().toLowerCase()
  const displayRows = useMemo(() => {
    const searchedRows = normalizedSearch
      ? visibleRows.filter((row) => {
          const haystack = [
            row.subject,
            row.label,
            row.meta,
            row.relation,
            row.status,
            ...visiblePredicates.map((predicate) => cellValue(row.subject, predicate.id) ?? ''),
          ].join(' ').toLowerCase()
          return haystack.includes(normalizedSearch)
        })
      : visibleRows

    if (sortMode === 'none') return searchedRows

    return [...searchedRows].sort((left, right) => {
      const result = left.subject < right.subject ? -1 : left.subject > right.subject ? 1 : 0
      return sortMode === 'asc' ? result : -result
    })
  }, [normalizedSearch, visibleRows, visiblePredicates, cellOverrides, sortMode])
  const tableColumns = useMemo<ColumnDef<SubjectRow>[]>(() => [
    {
      id: 'subject',
      accessorKey: 'subject',
      header: 'Subject',
      size: 110,
      minSize: 88,
    },
    ...visiblePredicates.map((predicate) => ({
      id: predicate.id,
      header: predicate.label,
      accessorFn: (row: SubjectRow) => cellValue(row.subject, predicate.id) ?? '',
      size: predicateWidth(predicate.id),
      minSize: 82,
      maxSize: 360,
      meta: { predicate },
    } satisfies ColumnDef<SubjectRow>)),
  ], [cellOverrides, visiblePredicates, showPredicateNamespace, predicateWidths])
  const table = useReactTable({
    data: displayRows,
    columns: tableColumns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    state: {
      columnSizing: predicateWidths,
      globalFilter: searchQuery,
    },
    onColumnSizingChange: (updater) => {
      setPredicateWidths((current) => {
        const nextSizing = typeof updater === 'function' ? updater(current) : updater
        return Object.fromEntries(
          Object.entries(nextSizing)
            .filter(([key]) => key !== 'subject')
            .map(([key, value]) => [predicateStateKey(key), Number(value)]),
        )
      })
    },
    columnResizeMode: 'onChange',
  })
  const tableRows = table.getRowModel().rows
  const tableHeaders = table.getFlatHeaders()
  const subjectHeader = tableHeaders.find((header) => header.column.id === 'subject')
  const predicateHeaders = tableHeaders.filter((header) => header.column.id !== 'subject')
  const predicateFromColumn = (column: { columnDef: { meta?: unknown } }) => {
    const meta = column.columnDef.meta as { predicate?: PredicateDefinition } | undefined
    if (!meta?.predicate) {
      throw new Error('Structured table predicate column is missing predicate metadata')
    }
    return meta.predicate
  }
  const enumOptionsFor = (predicate: PredicateDefinition) => {
    if (predicate.options?.length) return predicate.options
    if (predicate.type === 'multi-select') return ['core', 'rdf', 'vocab']
    return ['read', 'write', 'read/write']
  }
  const enumTone = (value: string) => {
    const tones = ['blue', 'green', 'yellow', 'red', 'gray']
    const sum = value.split('').reduce((total, char) => total + char.charCodeAt(0), 0)
    return tones[sum % tones.length]
  }
  const enumToneKey = (predicate: PredicateDefinition, option: string) => proposalKeyForEnumOption(selectedClass, predicate.id, option)
  const enumOptionState = (predicate: PredicateDefinition, option: string) => enumOptionStates[enumToneKey(predicate, option)]
  const enumOptionTone = (predicate: PredicateDefinition, option: string) => enumToneOverrides[enumToneKey(predicate, option)] ?? enumTone(option)
  const enumOptionUri = (predicate: PredicateDefinition, option: string) => {
    return enumOptionProposalUri(predicate, option, predicateLocalName(predicate.label))
  }
  const cycleEnumTone = (predicate: PredicateDefinition, option: string) => {
    const tones = ['blue', 'green', 'yellow', 'red', 'gray']
    const key = enumToneKey(predicate, option)
    const currentTone = enumOptionTone(predicate, option)
    const nextTone = tones[(tones.indexOf(currentTone) + 1) % tones.length] ?? 'blue'
    setEnumToneOverrides((current) => ({ ...current, [key]: nextTone }))
  }
  const createEnumOptionProposal = (predicate: PredicateDefinition, option: string) => {
    if (!option.trim()) return
    setEnumOptionStates((current) => setEnumOptionProposal(current, enumToneKey(predicate, option)))
    onRecordProposalResource?.('enum-option', `${predicate.id}:${option}`, 'create', selectedClass)
  }
  const approveEnumOptionProposal = (predicate: PredicateDefinition, option: string) => {
    setEnumOptionStates((current) => clearEnumOptionProposal(current, enumToneKey(predicate, option)))
    onRecordProposalResource?.('enum-option', `${predicate.id}:${option}`, 'approve', selectedClass)
  }
  const discardEnumOptionProposal = (subject: string, predicate: PredicateDefinition, option: string) => {
    setEnumOptionStates((current) => clearEnumOptionProposal(current, enumToneKey(predicate, option)))
    const currentValue = cellValue(subject, predicate.id) ?? ''
    setCellValue(subject, predicate.id, removeEnumOptionFromValue(currentValue, predicate.type, option))
    onRecordProposalResource?.('enum-option', `${predicate.id}:${option}`, 'discard', selectedClass)
  }
  const startPredicateResize = (event: React.MouseEvent<HTMLSpanElement>, predicateId: string) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = predicateWidth(predicateId)
    const onMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.max(82, Math.min(360, Math.round(startWidth + moveEvent.clientX - startX)))
      setPredicateWidths((current) => ({ ...current, [predicateStateKey(predicateId)]: nextWidth }))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const addPredicate = () => {
    const index = draftPredicateCount + 1
    const name = draftPredicateName.trim() || `${selectedClass} predicate`
    const selectedType = predicateTypeMeta.get(selectedPredicateType)
    const predicate = createPredicateProposal({
      className: selectedClass,
      description: selectedType?.example ?? 'Custom predicate',
      index,
      name,
      type: selectedPredicateType,
      uri: draftPredicateUri,
    })
    onAddPredicateProposal(predicate)
    setPredicateMenuOpen(false)
    setCreatePredicateOpen(false)
  }

  const subjectTargetKind = (row: SubjectRow): SubjectTargetKind => {
    if (row.subject === '#FileResource') return 'file-resource'
    if (sourceLinkedCardForSubject(row.subject)) return 'source-linked-card'
    if (row.subject.startsWith('http')) return 'external-url'
    if (row.subject.startsWith('/.vocab/') || row.subject.includes('terms.ttl#')) return 'vocab-term'
    return 'fragment-subject'
  }

  const subjectTargetLabel = (kind: SubjectTargetKind) => {
    if (kind === 'file-resource') return 'file resource'
    if (kind === 'source-linked-card') return 'source-linked card'
    if (kind === 'external-url') return 'external URL'
    if (kind === 'vocab-term') return 'vocab term'
    return 'fragment subject'
  }

  const restoreSubjectRoute = () => {
    const route = lastRouteRef.current
    if (!route) return
    const grid = gridRef.current
    if (!grid) return
    grid.scrollTop = route.tableScrollTop ?? 0
    const selector = `.subject-row[data-subject="${CSS.escape(route.rowSubject)}"]`
    const row = grid.querySelector(selector)
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: 'center', inline: 'nearest' })
      row.dataset.routeRestored = 'true'
    }
  }

  const openSubjectTarget = (row: SubjectRow) => {
    const kind = subjectTargetKind(row)
    const rowIndex = visibleRows.findIndex((visibleRow) => visibleRow.subject === row.subject)
    const nextRoute = {
      ...routeContext,
      rowSubject: row.subject,
      rowIndex,
      tableScrollTop: gridRef.current?.scrollTop ?? 0,
      kind,
    }
    lastRouteRef.current = nextRoute
    setSubjectOpenTarget({
      row,
      kind,
      routeContext: nextRoute,
    })
    onOpenSubjectRoute?.(nextRoute)
    setSubjectPeek(null)
  }

  const renderSubjectPeek = (row: SubjectRow) => {
    const targetKind = subjectTargetKind(row)

    return (
      <span className="subject-peek" role="dialog" aria-label={`${row.subject} subject peek`}>
        <strong>{row.subject}</strong>
        <small>{subjectTargetLabel(targetKind)} · {row.className}</small>
        <p>{row.label || row.meta || row.relation}</p>
        <span className="subject-peek-actions">
          <button
            onClick={(event) => {
              event.stopPropagation()
              window.setTimeout(() => openSubjectTarget(row), 0)
            }}
          >
            <ExternalLink size={13} /> Open
          </button>
          <button
            aria-label="Open resource file"
            onClick={(event) => {
              event.stopPropagation()
              const selection: 'structuredVocab' | 'structuredData' = targetKind === 'vocab-term' ? 'structuredVocab' : 'structuredData'
              window.setTimeout(() => {
                const resourceRoute = {
                  ...routeContext,
                  rowSubject: row.subject,
                  rowIndex: visibleRows.findIndex((visibleRow) => visibleRow.subject === row.subject),
                  tableScrollTop: gridRef.current?.scrollTop ?? 0,
                  destination: selection,
                  kind: targetKind,
                }
                lastRouteRef.current = resourceRoute
                onOpenSubjectRoute?.(resourceRoute)
                onOpenResourceFile?.(selection, row, resourceRoute)
                setSubjectPeek(null)
              }, 0)
            }}
          >
            <FileCode2 size={13} /> Resource
          </button>
          <button onClick={(event) => event.stopPropagation()}>
            <Link2 size={13} /> Copy URI
          </button>
        </span>
      </span>
    )
  }

  return (
    <section className={`structured-table ${canonicalVocab ? 'canonical-vocab-table' : ''}`}>
      <div className="subject-grid predicate-grid" ref={gridRef} style={gridStyle}>
        <div className="subject-head">
          <span className="schema-head-label"><FileCode2 size={14} /> {String(subjectHeader?.column.columnDef.header ?? 'Subject')}</span>
          {predicateHeaders.map((header) => {
            const predicate = predicateFromColumn(header.column)
            return (
            <span
              className={`predicate-head-cell ${predicate.vocabState ? 'vocab-pending' : ''}`}
              data-predicate-id={predicate.id}
              key={header.id}
            >
              <button className="predicate-head-button" title={predicate.description}>
                {(() => {
                  const TypeIcon = predicateTypeMeta.get(predicate.type)?.icon ?? FileText
                  return <TypeIcon size={14} />
                })()}
                <span>{showPredicateNamespace ? predicate.label : predicateLocalName(predicate.label)}{predicate.vocabState ? <em className={`vocab-state-star ${predicate.vocabState}`} title={vocabStateLabel(predicate.vocabState)}>*</em> : null}</span>
              </button>
              <button
                className={`predicate-head-more ${predicateDefinitionMenu === predicate.id ? 'active' : ''}`}
                aria-label={`Edit ${predicate.label} definition`}
                title={canonicalVocab ? 'View predicate definition' : 'Edit predicate definition'}
                onClick={(event) => {
                  event.stopPropagation()
                  setPredicateDefinitionMenu((current) => current === predicate.id ? null : predicate.id)
                }}
              >
                <MoreHorizontal size={14} />
              </button>
              {predicateDefinitionMenu === predicate.id ? (
                <span className="vocab-term-menu predicate-definition-menu">
                  <strong>{predicate.label}</strong>
                  <small>{predicate.uri}</small>
                  {predicate.vocabState ? <em className={`vocab-state-badge ${predicate.vocabState}`}>{vocabStateLabel(predicate.vocabState)}</em> : null}
                  <button><Tags size={13} /> View display rule</button>
                  <button><FileText size={13} /> {canonicalVocab ? 'View definition' : 'Edit definition'}</button>
                  <button><ExternalLink size={13} /> Open predicate URI</button>
                  {!canonicalVocab && predicate.vocabState ? (
                    <>
                      <button
                        aria-label={`Approve ${predicate.label} predicate`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onApprovePredicateProposal(predicate.id)
                          setPredicateDefinitionMenu(null)
                        }}
                      >
                        <Check size={13} /> Approve predicate
                      </button>
                      <button
                        aria-label={`Discard ${predicate.label} predicate`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onDiscardPredicateProposal(predicate.id)
                          setPredicateDefinitionMenu(null)
                        }}
                      >
                        <X size={13} /> Discard predicate
                      </button>
                    </>
                  ) : null}
                </span>
              ) : null}
              <span
                className="predicate-resize-handle"
                role="separator"
                aria-label={`Resize ${predicate.label}`}
                title="Drag to resize"
                onMouseDown={(event) => startPredicateResize(event, predicate.id)}
              />
            </span>
            )
          })}
          {!canonicalVocab ? (
            <span className="add-predicate-head">
              <button
                title="Add predicate"
                onClick={() => {
                  setPredicateDefinitionMenu(null)
                  setPredicateMenuOpen((open) => !open)
                }}
              >
                <Plus size={14} /> Predicate
              </button>
              {predicateMenuOpen ? (
              <div className={`predicate-menu ${createPredicateOpen ? 'creating' : ''}`} role="menu" aria-label="Add predicate">
                <section className="predicate-existing-panel">
                  <button className="create-predicate" onClick={() => setCreatePredicateOpen((open) => !open)}>
                    <Plus size={16} />
                    <span>
                      <strong>Create new predicate</strong>
                      <small>Define URI, type, and class scope</small>
                    </span>
                    <ChevronRight size={15} />
                  </button>
                  <h3>Existing predicates in {selectedClass}</h3>
                  {predicates.map((predicate) => (
                    <button key={predicate.id}>
                      {(() => {
                        const TypeIcon = predicateTypeMeta.get(predicate.type)?.icon ?? FileText
                        return <TypeIcon size={16} />
                      })()}
                      <span>
                        <strong>{predicate.label}</strong>
                        <small>{predicate.uri}</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </section>
                {createPredicateOpen ? (
                  <section className="predicate-type-panel">
                    <div className="predicate-definition-top">
                      <span>{selectedClass}</span>
                      <strong>Predicate definition</strong>
                    </div>
                    <label className="predicate-field">
                      <span>Name</span>
                      <input
                        value={draftPredicateName}
                        onChange={(event) => {
                          const name = event.target.value
                          setDraftPredicateName(name)
                          setDraftPredicateUri(makePredicateProposalUri(selectedClass, name))
                        }}
                      />
                    </label>
                    <label className="predicate-field">
                      <span>URI</span>
                      <input value={draftPredicateUri} onChange={(event) => setDraftPredicateUri(event.target.value)} />
                    </label>
                    <div className="predicate-type-grid" aria-label="Predicate type">
                      {predicateTypeOptions.map((type) => {
                      const Icon = type.icon
                      return (
                        <button
                          className={selectedPredicateType === type.kind ? 'active' : ''}
                          key={type.kind}
                          onClick={() => setSelectedPredicateType(type.kind)}
                        >
                          <Icon size={18} />
                          <span>
                            <strong>{type.label}</strong>
                            <small>{type.example}</small>
                          </span>
                        </button>
                      )
                    })}
                    </div>
                    <button className="predicate-create-button" onClick={addPredicate}>
                      <Plus size={16} />
                      Add predicate
                    </button>
                  </section>
                ) : null}
              </div>
              ) : null}
            </span>
          ) : null}
        </div>
        {tableRows.map((tableRow) => {
          const row = tableRow.original
          const predicateCells = tableRow.getVisibleCells().filter((cell) => cell.column.id !== 'subject')
          return (
          <div
            className={`subject-row ${row.active ? 'active' : ''}`}
            data-subject={row.subject}
            key={row.subject}
          >
            <span className="subject-name">
              <button
                className={`subject-resource-link ${subjectPeek?.subject === row.subject ? 'active' : ''}`}
                onClick={(event) => {
                  event.stopPropagation()
                  window.setTimeout(() => {
                    setSubjectPeek((current) => current?.subject === row.subject ? null : row)
                  }, 0)
                }}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  window.setTimeout(() => openSubjectTarget(row), 0)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  window.setTimeout(() => openSubjectTarget(row), 0)
                }}
              >
                {row.subject === '#FileResource' ? <FileText size={15} /> : <FileCode2 size={15} />}
                {row.subject}
              </button>
              {subjectPeek?.subject === row.subject ? renderSubjectPeek(row) : null}
            </span>
            {predicateCells.map((cell) => {
              const predicate = predicateFromColumn(cell.column)
              const key = cellKey(row.subject, predicate.id)
              return (
              <span className={`predicate-value ${predicate.type}`} data-predicate-id={predicate.id} key={cell.id}>
                <TypedPredicateCell
                  active={activeCell?.subject === row.subject && activeCell.predicateId === predicate.id}
                  enumDefinitionOpen={enumDefinitionMenu?.cellKey === key ? enumDefinitionMenu : null}
                  enumDraft={enumDrafts[key] ?? ''}
                  enumOptions={enumOptionsFor(predicate)}
                  enumOptionState={(option) => enumOptionState(predicate, option)}
                  enumOptionTone={(option) => enumOptionTone(predicate, option)}
                  enumOptionUri={(option) => enumOptionUri(predicate, option)}
                  predicate={predicate}
                  readonly={canonicalVocab}
                  subject={row.subject}
                  value={String(cell.getValue() ?? '')}
                  onActivate={() => setActiveCell({ subject: row.subject, predicateId: predicate.id })}
                  onClearActive={() => {
                    setActiveCell(null)
                    setEnumDefinitionMenu(null)
                  }}
                  onApproveEnumOption={(option) => approveEnumOptionProposal(predicate, option)}
                  onCreateEnumOption={(option) => createEnumOptionProposal(predicate, option)}
                  onDiscardEnumOption={(option) => discardEnumOptionProposal(row.subject, predicate, option)}
                  onCycleEnumTone={(option) => cycleEnumTone(predicate, option)}
                  onSetEnumDraft={(value) => setEnumDrafts((current) => ({ ...current, [key]: value }))}
                  onSetValue={(value) => {
                    setCellValue(row.subject, predicate.id, value)
                    setEnumDefinitionMenu(null)
                  }}
                  onToggleEnumDefinition={(option) => {
                    setEnumDefinitionMenu((current) => (
                      current?.cellKey === key && current.predicateId === predicate.id && current.option === option
                        ? null
                        : { cellKey: key, predicateId: predicate.id, option }
                    ))
                  }}
                />
              </span>
              )
            })}
          </div>
          )
        })}
        {!canonicalVocab && displayRows.length === 0 && !creatingSubject ? (
          <div className="structured-empty-hint">
            <p>还没有 {selectedClass} 行。点击下面任意格子创建第一行；或先用 + Predicate 添加列。</p>
          </div>
        ) : null}
        {!canonicalVocab ? (
          creatingSubject ? (
            <div className="add-subject-row creating">
              <span className="subject-name">
                <input
                  autoFocus
                  value={draftSubjectName}
                  placeholder="#subject 名称，回车创建"
                  aria-label="新 subject 名称"
                  onChange={(event) => setDraftSubjectName(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      const raw = draftSubjectName.trim()
                      if (!raw) return
                      const slug = vocabTermSlug(raw)
                      setAddedSubjects((current) => [...current, {
                        subject: `#${slug || 'subject'}`,
                        className: selectedClass,
                        label: raw,
                        meta: '',
                        relation: '',
                        status: 'Draft',
                      }])
                      setCreatingSubject(false)
                      setDraftSubjectName('')
                    }
                    if (event.key === 'Escape') {
                      setCreatingSubject(false)
                      setDraftSubjectName('')
                    }
                  }}
                />
              </span>
              {predicateHeaders.map((header) => (
                <span key={header.id} />
              ))}
            </div>
          ) : (
            <div className="add-subject-row" role="button" aria-label="添加 subject">
              {['subject', ...predicateHeaders.map((header) => header.id)].map((cellId, cellIndex) => (
                <span
                  className={cellIndex === 0 ? 'subject-name' : 'add-cell'}
                  key={cellId}
                  role="button"
                  tabIndex={0}
                  onClick={() => setCreatingSubject(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setCreatingSubject(true)
                    }
                  }}
                >
                  {cellIndex === 0 ? <><Plus size={15} /> Subject</> : null}
                </span>
              ))}
            </div>
          )
        ) : null}
      </div>
      {subjectOpenTarget ? (
        <SubjectOpenDialog
          fileContentsByPath={fileContentsByPath}
          filePropertiesByPath={filePropertiesByPath}
          sourceIngestStatesBySource={sourceIngestStatesBySource}
          target={subjectOpenTarget}
          onChangeFileContent={onChangeFileContent}
          onChangeFileProperties={onChangeFileProperties}
          onChangeSourceIngestState={onChangeSourceIngestState}
          onChangeSourceReviewState={onChangeSourceReviewState}
          onClose={() => {
            setSubjectOpenTarget(null)
            window.requestAnimationFrame(restoreSubjectRoute)
          }}
          notify={notify}
          sourceReviewState={sourceReviewState}
        />
      ) : null}
    </section>
  )
}

export function StructuredDiscover({
  selectedClass,
  predicates,
  hiddenPredicateIds,
  cellOverrides,
  searchQuery,
  sortMode,
}: {
  selectedClass: string
  predicates: PredicateDefinition[]
  hiddenPredicateIds: string[]
  cellOverrides: Record<string, string>
  searchQuery: string
  sortMode: TableSortMode
}) {
  const projection = getStructuredProjection({
    selectedClass,
    predicates,
    hiddenPredicateIds,
    cellOverrides,
    searchQuery,
    sortMode,
  })
  const relationCount = projection.rows.reduce((count, row) => count + (row.relation ? 1 : 0), 0)

  return (
    <section className="discover-surface" data-class-scope={selectedClass} data-subject-count={projection.rows.length}>
      <div className="discover-query" data-query-class={selectedClass}>
        <Search size={17} />
        <strong>
          class:{selectedClass}
          {searchQuery ? ` search:${searchQuery}` : ''}
          {sortMode !== 'none' ? ` sort:${sortMode}` : ''}
        </strong>
      </div>
      <div className="discover-metrics" aria-label="Discover metrics">
        <article data-discover-metric="subjects">
          <span>Subjects</span>
          <strong>{projection.rows.length}</strong>
        </article>
        <article data-discover-metric="predicates">
          <span>Predicates</span>
          <strong>{projection.predicates.length}</strong>
        </article>
        <article data-discover-metric="relations">
          <span>Relations</span>
          <strong>{relationCount}</strong>
        </article>
      </div>
      <div className="structured-predicate-index" aria-hidden="true">
        {projection.predicates.map((predicate, index) => (
          <span data-projection-predicate={predicate.id} data-projection-predicate-index={index} key={predicate.id} />
        ))}
      </div>
      <div className="discover-list">
        {projection.rows.map((row) => {
          const predicateSummary = projection.predicates
            .map((predicate) => {
              const value = projection.cellValue(row.subject, predicate.id)
              return value ? `${predicateLocalName(predicate.label)}: ${value}` : null
            })
            .filter(Boolean)
            .slice(0, 3)
            .join(' · ')

          return (
          <article data-class={row.className} data-discover-subject={row.subject} key={row.subject}>
            <em>{row.className}</em>
            <strong>{row.subject}</strong>
            <p>{row.relation}</p>
            <div className="discover-predicate-chips">
              {projection.predicates.slice(0, 4).map((predicate) => {
                const value = projection.cellValue(row.subject, predicate.id)
                if (!value) return null
                return (
                  <span className="discover-predicate-chip" data-predicate-id={predicate.id} key={predicate.id}>
                    <b>{predicateLocalName(predicate.label)}</b>
                    <i>{value}</i>
                  </span>
                )
              })}
            </div>
            {predicateSummary ? <small>{predicateSummary}</small> : null}
          </article>
          )
        })}
      </div>
    </section>
  )
}
