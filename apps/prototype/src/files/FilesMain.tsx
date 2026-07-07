import { useEffect, useState } from 'react'
import {
  ArrowUpDown,
  Check,
  Database,
  FileCode2,
  FolderOpen,
  ListFilter,
  MoreHorizontal,
  Search,
  Tags,
  X,
} from 'lucide-react'
import { RegularFileMain } from './RegularFileMain'
import { AccessPolicyDialog } from './ResourceSidecars'
import type { FilePropertyState } from './FileEditorSheet'
import { readPrototypeStorage, writePrototypeStorage } from './prototypeStorage'
import { StructuredKanbanView } from './StructuredKanbanView'
import { StructuredRaw } from './StructuredRaw'
import {
  StructuredDiscover,
  StructuredFilterMenu,
  StructuredTable,
  StructuredViewTabs,
  VocabTermsTable,
} from './StructuredTableView'
import { StructuredWhiteboardView } from './StructuredWhiteboardView'
import {
  approveProposalId,
  appendProposalResourceRecord,
  createProposalResourceRecord,
  discardProposalId,
  proposalKeyForPredicate,
  resolvePredicateProposals,
  visibleDefinitionsAfterDiscard,
  type SourceReviewState,
  type ProposalResourceAction,
  type ProposalResourceKind,
  type ProposalResourceRecord,
} from './files-proposals'
import {
  predicateLocalName,
  sourceLinkedCardForSubject,
  sourceLinkedCardSample,
  structuredBasePredicatesByClass,
  vocabNamespaces,
  vocabShapes,
  vocabTerms,
} from './files-model'
import type { FileOpenSample, FilesSelection, LastOpenedSubjectRoute, SourceIngestState, PredicateDefinition, StoredFileContent, StructuredView, TableSortMode } from './files-types'
import { AccessIconButton, FilePageHeader, MetaToggleButton } from './files-ui'

const SOURCE_REVIEW_STORAGE_KEY = 'linx.prototype.files.sourceReviewStatesByPath'
const APPROVED_CLASSES_STORAGE_KEY = 'linx.prototype.files.approvedClassNames'
const DISCARDED_CLASSES_STORAGE_KEY = 'linx.prototype.files.discardedClassNames'
const DRAFT_PREDICATES_STORAGE_KEY = 'linx.prototype.files.draftPredicatesByClass'
const APPROVED_PREDICATES_STORAGE_KEY = 'linx.prototype.files.approvedPredicateIds'
const DISCARDED_PREDICATES_STORAGE_KEY = 'linx.prototype.files.discardedPredicateIdsByClass'
const HIDDEN_PREDICATES_STORAGE_KEY = 'linx.prototype.files.hiddenPredicateIdsByClass'
const CELL_OVERRIDES_STORAGE_KEY = 'linx.prototype.files.cellOverrides'
const SOURCE_INGEST_STORAGE_KEY = 'linx.prototype.files.sourceIngestStatesBySource'
const LEGACY_SOURCE_INDEX_STORAGE_KEY = 'linx.prototype.files.sourceIndexStatesBySource'
const LEGACY_PARSER_INGEST_STORAGE_KEY = 'linx.prototype.files.parserIndexStatesBySource'
const PROPOSAL_RESOURCES_STORAGE_KEY = 'linx.prototype.files.proposalResources'

type StoredSourceIngestState = Partial<SourceIngestState> & {
  indexStatus?: string
  parserStatus?: string
}

function normalizeSourceIngestStates(states: Record<string, StoredSourceIngestState>): Record<string, SourceIngestState> {
  return Object.fromEntries(Object.entries(states).map(([source, state]) => [
    source,
    {
      ingestStatus: state.ingestStatus ?? state.indexStatus ?? state.parserStatus ?? 'lazy chunks',
      readChunks: state.readChunks ?? 0,
      totalChunks: state.totalChunks ?? 0,
      sourceHash: state.sourceHash ?? '',
      syncStatus: state.syncStatus ?? 'scheduled',
      manifestPath: state.manifestPath ?? '',
    },
  ]))
}

function readStoredSourceIngestStates() {
  const stored = readPrototypeStorage<Record<string, StoredSourceIngestState>>(SOURCE_INGEST_STORAGE_KEY, {})
  if (Object.keys(stored).length > 0) return normalizeSourceIngestStates(stored)
  const legacyIndex = readPrototypeStorage<Record<string, StoredSourceIngestState>>(LEGACY_SOURCE_INDEX_STORAGE_KEY, {})
  if (Object.keys(legacyIndex).length > 0) return normalizeSourceIngestStates(legacyIndex)
  return normalizeSourceIngestStates(readPrototypeStorage<Record<string, StoredSourceIngestState>>(LEGACY_PARSER_INGEST_STORAGE_KEY, {}))
}

export function FilesMain({
  selection,
  structuredView,
  onChangeView,
  detailOpen,
  onToggleDetail,
  onCloseDetail,
  onOpenSelection,
  isFileFavorite,
  fileContentsByPath,
  filePropertiesByPath,
  onChangeFileContent,
  onChangeFileProperties,
  onToggleFileFavorite,
}: {
  selection: FilesSelection
  structuredView: StructuredView
  onChangeView: (view: StructuredView) => void
  detailOpen: boolean
  onToggleDetail: () => void
  onCloseDetail: () => void
  onOpenSelection?: (selection: FilesSelection) => void
  fileContentsByPath?: Record<string, StoredFileContent>
  filePropertiesByPath?: Record<string, FilePropertyState>
  isFileFavorite?: (path: string) => boolean
  onChangeFileContent?: (path: string, content: StoredFileContent) => void
  onChangeFileProperties?: (path: string, properties: FilePropertyState) => void
  onToggleFileFavorite?: (file: FileOpenSample) => void
}) {
  const [selectedClass, setSelectedClass] = useState('Class')
  const [filterMenuOpen, setFilterMenuOpen] = useState(false)
  const [showPredicateNamespace, setShowPredicateNamespace] = useState(false)
  const [tableSearchOpen, setTableSearchOpen] = useState(false)
  const [tableSearchQuery, setTableSearchQuery] = useState('')
  const [tableSortMode, setTableSortMode] = useState<TableSortMode>('none')
  const [columnMenuOpen, setColumnMenuOpen] = useState(false)
  const [approvedClassNames, setApprovedClassNames] = useState<string[]>(() => (
    readPrototypeStorage<string[]>(APPROVED_CLASSES_STORAGE_KEY, [])
  ))
  const [discardedClassNames, setDiscardedClassNames] = useState<string[]>(() => (
    readPrototypeStorage<string[]>(DISCARDED_CLASSES_STORAGE_KEY, [])
  ))
  const [draftPredicatesByClass, setDraftPredicatesByClass] = useState<Record<string, PredicateDefinition[]>>(() => (
    readPrototypeStorage<Record<string, PredicateDefinition[]>>(DRAFT_PREDICATES_STORAGE_KEY, {})
  ))
  const [approvedPredicateIds, setApprovedPredicateIds] = useState<string[]>(() => (
    readPrototypeStorage<string[]>(APPROVED_PREDICATES_STORAGE_KEY, [])
  ))
  const [discardedPredicateIdsByClass, setDiscardedPredicateIdsByClass] = useState<Record<string, string[]>>(() => (
    readPrototypeStorage<Record<string, string[]>>(DISCARDED_PREDICATES_STORAGE_KEY, {})
  ))
  const [hiddenPredicateIdsByClass, setHiddenPredicateIdsByClass] = useState<Record<string, string[]>>(() => (
    readPrototypeStorage<Record<string, string[]>>(HIDDEN_PREDICATES_STORAGE_KEY, {})
  ))
  const [cellOverrides, setCellOverrides] = useState<Record<string, string>>(() => (
    readPrototypeStorage<Record<string, string>>(CELL_OVERRIDES_STORAGE_KEY, {})
  ))
  const [lastOpenedRoute, setLastOpenedRoute] = useState<LastOpenedSubjectRoute | null>(null)
  const [sourceReviewStatesByPath, setSourceReviewStatesByPath] = useState<Record<string, SourceReviewState>>(() => (
    readPrototypeStorage<Record<string, SourceReviewState>>(SOURCE_REVIEW_STORAGE_KEY, {})
  ))
  const [sourceIngestStatesBySource, setSourceIngestStatesBySource] = useState<Record<string, SourceIngestState>>(() => (
    readStoredSourceIngestStates()
  ))
  const [proposalResources, setProposalResources] = useState<ProposalResourceRecord[]>(() => (
    readPrototypeStorage<ProposalResourceRecord[]>(PROPOSAL_RESOURCES_STORAGE_KEY, [])
  ))
  const [accessOpen, setAccessOpen] = useState(false)
  const isStructured = selection === 'structuredVocab' || selection === 'structuredVocabShapes' || selection === 'structuredVocabNamespaces' || selection === 'structuredData'
  const isVocab = selection === 'structuredVocab' || selection === 'structuredVocabShapes' || selection === 'structuredVocabNamespaces'
  const effectiveStructuredView = isVocab ? 'table' : structuredView
  const vocabTitle = selection === 'structuredVocabShapes'
    ? '.vocab/shapes.ttl'
    : selection === 'structuredVocabNamespaces'
      ? '.vocab/namespaces.ttl'
      : '.vocab/terms.ttl'
  const vocabRows = selection === 'structuredVocabShapes'
    ? vocabShapes
    : selection === 'structuredVocabNamespaces'
      ? vocabNamespaces
      : vocabTerms
  const title = isVocab ? vocabTitle : '.data/workspaces/linx-prototype.ttl'
  const classPredicates = resolvePredicateProposals(
    visibleDefinitionsAfterDiscard([
      ...(structuredBasePredicatesByClass[selectedClass] ?? []),
      ...(draftPredicatesByClass[selectedClass] ?? []),
    ], discardedPredicateIdsByClass[selectedClass] ?? []),
    approvedPredicateIds,
    selectedClass,
  )
  const hiddenPredicateIds = hiddenPredicateIdsByClass[selectedClass] ?? []
  const visiblePredicateCount = classPredicates.filter((predicate) => !hiddenPredicateIds.includes(predicate.id)).length
  const sortStateLabel = tableSortMode === 'asc' ? 'ascending' : tableSortMode === 'desc' ? 'descending' : 'none'
  const activeSourceLinkedCard = sourceLinkedCardForSubject('#GrantWikiPage') ?? sourceLinkedCardSample
  const sourceLinkedReviewState = sourceReviewStatesByPath[activeSourceLinkedCard.path] ?? 'pending'

  useEffect(() => {
    writePrototypeStorage(SOURCE_REVIEW_STORAGE_KEY, sourceReviewStatesByPath)
  }, [sourceReviewStatesByPath])

  useEffect(() => {
    writePrototypeStorage(SOURCE_INGEST_STORAGE_KEY, sourceIngestStatesBySource)
  }, [sourceIngestStatesBySource])

  useEffect(() => {
    writePrototypeStorage(PROPOSAL_RESOURCES_STORAGE_KEY, proposalResources)
  }, [proposalResources])

  useEffect(() => {
    writePrototypeStorage(APPROVED_CLASSES_STORAGE_KEY, approvedClassNames)
  }, [approvedClassNames])

  useEffect(() => {
    writePrototypeStorage(DISCARDED_CLASSES_STORAGE_KEY, discardedClassNames)
  }, [discardedClassNames])

  useEffect(() => {
    writePrototypeStorage(DRAFT_PREDICATES_STORAGE_KEY, draftPredicatesByClass)
  }, [draftPredicatesByClass])

  useEffect(() => {
    writePrototypeStorage(APPROVED_PREDICATES_STORAGE_KEY, approvedPredicateIds)
  }, [approvedPredicateIds])

  useEffect(() => {
    writePrototypeStorage(DISCARDED_PREDICATES_STORAGE_KEY, discardedPredicateIdsByClass)
  }, [discardedPredicateIdsByClass])

  useEffect(() => {
    writePrototypeStorage(HIDDEN_PREDICATES_STORAGE_KEY, hiddenPredicateIdsByClass)
  }, [hiddenPredicateIdsByClass])

  useEffect(() => {
    writePrototypeStorage(CELL_OVERRIDES_STORAGE_KEY, cellOverrides)
  }, [cellOverrides])

  useEffect(() => {
    setSelectedClass(isVocab ? 'Class' : 'Workspace')
  }, [isVocab])

  useEffect(() => {
    if (isVocab && structuredView !== 'table') onChangeView('table')
  }, [isVocab, structuredView, onChangeView])

  useEffect(() => {
    setFilterMenuOpen(false)
    setColumnMenuOpen(false)
    setTableSearchOpen(false)
    setTableSearchQuery('')
    setTableSortMode('none')
  }, [selectedClass, isVocab])

  useEffect(() => {
    const closeToolPopovers = () => {
      setFilterMenuOpen(false)
      setColumnMenuOpen(false)
      setTableSearchOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.setTimeout(closeToolPopovers, 0)
    }
    const closeOnOutsidePointer = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('.structured-tools, .structured-filter-menu, .predicate-visibility-menu, .table-search-popover')) return
      closeToolPopovers()
    }

    window.addEventListener('keydown', closeOnEscape)
    window.addEventListener('mousedown', closeOnOutsidePointer)
    return () => {
      window.removeEventListener('keydown', closeOnEscape)
      window.removeEventListener('mousedown', closeOnOutsidePointer)
    }
  }, [])

  const cycleSortMode = () => {
    setTableSortMode((current) => {
      if (current === 'none') return 'asc'
      if (current === 'asc') return 'desc'
      return 'none'
    })
  }

  const togglePredicateVisibility = (predicateId: string) => {
    setHiddenPredicateIdsByClass((current) => {
      const currentIds = current[selectedClass] ?? []
      const nextIds = currentIds.includes(predicateId)
        ? currentIds.filter((id) => id !== predicateId)
        : [...currentIds, predicateId]
      return { ...current, [selectedClass]: nextIds }
    })
  }

  const setCellValue = (subject: string, predicateId: string, nextValue: string) => {
    setCellOverrides((current) => ({ ...current, [`${subject}::${predicateId}`]: nextValue }))
  }

  const setSourceLinkedReviewState = (state: SourceReviewState) => {
    setSourceReviewStatesByPath((current) => ({ ...current, [activeSourceLinkedCard.path]: state }))
    recordProposalResource('source-update', activeSourceLinkedCard.path, state === 'accepted' ? 'accept' : state === 'kept' ? 'keep' : 'create', activeSourceLinkedCard.sourceReview?.source ?? activeSourceLinkedCard.path)
  }

  const setSourceIngestState = (source: string, state: SourceIngestState) => {
    setSourceIngestStatesBySource((current) => ({ ...current, [source]: state }))
  }

  const recordProposalResource = (
    kind: ProposalResourceKind,
    target: string,
    action: ProposalResourceAction,
    scope = selectedClass,
  ) => {
    setProposalResources((current) => appendProposalResourceRecord(current, createProposalResourceRecord({
      action,
      kind,
      scope,
      target,
    })))
  }

  const addPredicateProposal = (predicate: PredicateDefinition) => {
    setDraftPredicatesByClass((current) => ({
      ...current,
      [selectedClass]: [...(current[selectedClass] ?? []), predicate],
    }))
    recordProposalResource('predicate', predicate.id, 'create')
  }

  const approvePredicateProposal = (predicateId: string) => {
    setApprovedPredicateIds((current) => approveProposalId(current, proposalKeyForPredicate(selectedClass, predicateId)))
    recordProposalResource('predicate', predicateId, 'approve')
  }

  const discardPredicateProposal = (predicateId: string) => {
    setDiscardedPredicateIdsByClass((current) => {
      const currentIds = current[selectedClass] ?? []
      const nextIds = discardProposalId(currentIds, predicateId)
      return { ...current, [selectedClass]: nextIds }
    })
    setApprovedPredicateIds((current) => current.filter((id) => id !== proposalKeyForPredicate(selectedClass, predicateId)))
    recordProposalResource('predicate', predicateId, 'discard')
  }

  if (!isStructured) {
    return (
      <RegularFileMain
        selection={selection}
        detailOpen={detailOpen}
        fileContentsByPath={fileContentsByPath}
        filePropertiesByPath={filePropertiesByPath}
        onChangeFileContent={onChangeFileContent}
        onChangeFileProperties={onChangeFileProperties}
        onToggleDetail={onToggleDetail}
        onCloseDetail={onCloseDetail}
        onOpenSelection={onOpenSelection}
        isFileFavorite={isFileFavorite}
        onToggleFileFavorite={onToggleFileFavorite}
      />
    )
  }

  return (
    <main
      className="work-pane files-work structured-work"
      data-last-route-subject={lastOpenedRoute?.rowSubject ?? ''}
      data-last-route-kind={lastOpenedRoute?.kind ?? ''}
      data-last-route-class={lastOpenedRoute?.className ?? ''}
      data-last-route-view={lastOpenedRoute?.view ?? ''}
      data-last-route-search={lastOpenedRoute?.searchQuery ?? ''}
      data-last-route-sort={lastOpenedRoute?.sortMode ?? ''}
      data-last-route-row-index={lastOpenedRoute?.rowIndex ?? ''}
      data-last-route-scroll-top={lastOpenedRoute?.tableScrollTop ?? ''}
      data-last-route-destination={lastOpenedRoute?.destination ?? ''}
    >
      <FilePageHeader title={title} actionClassName="head-actions" actionLabel="File header tools">
        <AccessIconButton onClick={() => setAccessOpen(true)} />
        <button title="More"><MoreHorizontal size={17} /></button>
        <MetaToggleButton open={detailOpen} onToggle={onToggleDetail} />
      </FilePageHeader>
      <section className="resource-viewbar">
        {isVocab ? (
          <div className="structured-tabs locked-tabs" aria-label="Locked vocabulary view">
            <button className="active"><Database size={17} /> Table</button>
          </div>
        ) : (
          <StructuredViewTabs structuredView={structuredView} onChangeView={onChangeView} />
        )}
        <div className="file-actions file-commandbar structured-tools" aria-label="Structured resource tools">
          {!isVocab ? (
            <span className="commandbar-anchor class-scope-anchor">
              <button
                className={`class-scope-button ${filterMenuOpen ? 'active' : ''}`}
                title={`Filter: ${selectedClass}`}
                aria-label={`Filter class ${selectedClass}`}
                aria-expanded={filterMenuOpen}
                onClick={() => {
                  window.setTimeout(() => {
                    setColumnMenuOpen(false)
                    setTableSearchOpen(false)
                    setFilterMenuOpen((open) => !open)
                  }, 0)
                }}
              >
                <Tags size={14} />
              </button>
              {filterMenuOpen ? (
                <StructuredFilterMenu
                  approvedClassNames={approvedClassNames}
                  discardedClassNames={discardedClassNames}
                  selectedClass={selectedClass}
                  onApproveClass={(className) => {
                    setApprovedClassNames((current) => approveProposalId(current, className))
                    recordProposalResource('class', className, 'approve', className)
                  }}
                  onDiscardClass={(className) => {
                    setDiscardedClassNames((current) => discardProposalId(current, className))
                    recordProposalResource('class', className, 'discard', className)
                    if (selectedClass === className) setSelectedClass('Class')
                  }}
                  onSelectClass={(className) => {
                    setSelectedClass(className)
                    setFilterMenuOpen(false)
                  }}
                />
              ) : null}
            </span>
          ) : null}
          <button
            className={`namespace-switch ${showPredicateNamespace ? 'active' : ''}`}
            title={showPredicateNamespace ? 'Hide predicate namespace' : 'Show predicate namespace'}
            role="switch"
            aria-pressed={showPredicateNamespace}
            aria-checked={showPredicateNamespace}
            onClick={() => setShowPredicateNamespace((visible) => !visible)}
          >
            <span className="switch-track"><span className="switch-thumb" /></span>
          </button>
          {!isVocab ? (
            <span className="commandbar-anchor column-visibility-anchor">
              <button
                className={columnMenuOpen ? 'active' : ''}
                title="Show or hide predicate columns"
                aria-label="Show or hide predicate columns"
                aria-expanded={columnMenuOpen}
                onClick={() => {
                  window.setTimeout(() => {
                    setFilterMenuOpen(false)
                    setTableSearchOpen(false)
                    setColumnMenuOpen((open) => !open)
                  }, 0)
                }}
              >
                <ListFilter size={18} />
              </button>
              {columnMenuOpen ? (
                <div className="predicate-visibility-menu" role="menu" aria-label="Predicate visibility">
                  <strong>Predicates</strong>
                  {classPredicates.map((predicate) => (
                    <button
                      className={`predicate-visibility-option ${hiddenPredicateIds.includes(predicate.id) ? '' : 'active'}`}
                      data-predicate-id={predicate.id}
                      key={predicate.id}
                      onClick={() => {
                        window.setTimeout(() => togglePredicateVisibility(predicate.id), 0)
                      }}
                    >
                      <Check size={13} />
                      <span>{showPredicateNamespace ? predicate.label : predicateLocalName(predicate.label)}</span>
                    </button>
                  ))}
                  <small>{visiblePredicateCount} visible</small>
                </div>
              ) : null}
            </span>
          ) : null}
          <button
            className={tableSortMode !== 'none' ? 'active' : ''}
            title={`Sort structured table: ${sortStateLabel}`}
            aria-label={`Sort structured table: ${sortStateLabel}`}
            data-sort-mode={tableSortMode}
            onClick={() => {
              window.setTimeout(() => {
                setFilterMenuOpen(false)
                setColumnMenuOpen(false)
                setTableSearchOpen(false)
                cycleSortMode()
              }, 0)
            }}
          >
            <ArrowUpDown size={18} />
          </button>
          {tableSortMode !== 'none' ? (
            <span className="structured-sort-state" data-sort-mode={tableSortMode} aria-live="polite">
              {tableSortMode === 'asc' ? 'A-Z' : 'Z-A'}
            </span>
          ) : null}
          <button
            className={tableSearchOpen || tableSearchQuery ? 'active' : ''}
            title="Search structured table"
            aria-label="Search structured table"
            onClick={() => {
              window.setTimeout(() => {
                setFilterMenuOpen(false)
                setColumnMenuOpen(false)
                setTableSearchOpen((open) => !open)
              }, 0)
            }}
          >
            <Search size={18} />
          </button>
          {tableSearchOpen ? (
            <label className="table-search-popover">
              <Search size={14} />
              <input
                autoFocus
                className="structured-search-input"
                aria-label="Search table"
                placeholder="Search subjects"
                defaultValue={tableSearchQuery}
                onChange={(event) => {
                  const nextValue = event.currentTarget.value
                  window.setTimeout(() => setTableSearchQuery(nextValue), 0)
                }}
              />
              {tableSearchQuery ? (
                <button
                  aria-label="Clear table search"
                  onClick={(event) => {
                    const input = event.currentTarget.closest('.table-search-popover')?.querySelector('input')
                    if (input instanceof HTMLInputElement) input.value = ''
                    setTableSearchQuery('')
                  }}
                >
                  <X size={13} />
                </button>
              ) : null}
            </label>
          ) : null}
        </div>
      </section>
      {effectiveStructuredView === 'table' ? (
        isVocab ? (
          <VocabTermsTable rows={vocabRows} />
        ) : (
          <StructuredTable
            canonicalVocab={false}
            editableVocab={false}
            selectedClass={selectedClass}
            predicates={classPredicates}
            draftPredicateCount={draftPredicatesByClass[selectedClass]?.length ?? 0}
            showPredicateNamespace={showPredicateNamespace}
            searchQuery={tableSearchQuery}
            sortMode={tableSortMode}
            hiddenPredicateIds={hiddenPredicateIds}
            cellOverrides={cellOverrides}
            fileContentsByPath={fileContentsByPath}
            filePropertiesByPath={filePropertiesByPath}
            sourceIngestStatesBySource={sourceIngestStatesBySource}
            routeContext={{
              className: selectedClass,
              view: effectiveStructuredView,
              searchQuery: tableSearchQuery,
              sortMode: tableSortMode,
              source: 'table',
            }}
            onAddPredicateProposal={addPredicateProposal}
            onApprovePredicateProposal={approvePredicateProposal}
            onDiscardPredicateProposal={discardPredicateProposal}
            onChangeFileContent={onChangeFileContent}
            onChangeFileProperties={onChangeFileProperties}
            onChangeSourceIngestState={setSourceIngestState}
            onChangeSourceReviewState={setSourceLinkedReviewState}
            onRecordProposalResource={recordProposalResource}
            onOpenSubjectRoute={setLastOpenedRoute}
            onOpenResourceFile={(nextSelection, row, route) => {
              setLastOpenedRoute({
                ...route,
                rowSubject: row.subject,
                destination: nextSelection,
              })
              onOpenSelection?.(nextSelection)
            }}
            onSetCellValue={setCellValue}
            sourceReviewState={sourceLinkedReviewState}
          />
        )
      ) : null}
      {effectiveStructuredView === 'discover' ? (
        <StructuredDiscover
          selectedClass={selectedClass}
          predicates={classPredicates}
          hiddenPredicateIds={hiddenPredicateIds}
          cellOverrides={cellOverrides}
          searchQuery={tableSearchQuery}
          sortMode={tableSortMode}
        />
      ) : null}
      {effectiveStructuredView === 'kanban' ? (
        <StructuredKanbanView
          selectedClass={selectedClass}
          predicates={classPredicates}
          hiddenPredicateIds={hiddenPredicateIds}
          cellOverrides={cellOverrides}
          searchQuery={tableSearchQuery}
          sortMode={tableSortMode}
          onSetCellValue={setCellValue}
        />
      ) : null}
      {effectiveStructuredView === 'whiteboard' ? (
        <StructuredWhiteboardView
          selectedClass={selectedClass}
          predicates={classPredicates}
          hiddenPredicateIds={hiddenPredicateIds}
          cellOverrides={cellOverrides}
          searchQuery={tableSearchQuery}
          sortMode={tableSortMode}
        />
      ) : null}
      {effectiveStructuredView === 'raw' ? (
        <StructuredRaw
          selectedClass={selectedClass}
          predicates={classPredicates}
          hiddenPredicateIds={hiddenPredicateIds}
          cellOverrides={cellOverrides}
          searchQuery={tableSearchQuery}
          sortMode={tableSortMode}
        />
      ) : null}
      <footer className="table-status">
        {isVocab
          ? 'Vocabulary · user-owned terms · readonly registry view · meta schema is fixed'
          : `Personal data · editable · ${selectedClass} scope · pending predicates are marked *`}
      </footer>
      <div className="proposal-resource-index" aria-hidden="true">
        {proposalResources.map((resource) => (
          <span
            data-proposal-action={resource.action}
            data-proposal-id={resource.id}
            data-proposal-kind={resource.kind}
            data-proposal-scope={resource.scope}
            data-proposal-target={resource.target}
            data-proposal-uri={resource.uri}
            key={resource.id}
          />
        ))}
      </div>
      {accessOpen ? <AccessPolicyDialog scope="Vocab" onClose={() => setAccessOpen(false)} /> : null}
    </main>
  )
}
