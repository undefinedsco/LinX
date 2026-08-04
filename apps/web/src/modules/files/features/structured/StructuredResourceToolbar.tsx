import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Columns3,
  CloudOff,
  ExternalLink,
  Info,
  KanbanSquare,
  ListFilter,
  LoaderCircle,
  Network,
  Plus,
  Search,
  Table2,
  Tags,
  Text,
  X,
} from 'lucide-react'

import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import type { StructuredVocabTermDefinition } from '../../domain/structured/structured-table'
import type { StructuredResourceViewMode } from '../../domain/structured/structured-view-metadata'
import type { StructuredPredicateTypeFilter, StructuredVocabTermFilter } from '../../domain/structured/structured-view-projection'
import { ResourceViewBar } from '../../ui/ResourceViewBar'
import { useStructuredClassScopeMenuController } from './useStructuredClassScopeMenuController'
import {
  projectStructuredResourceToolbarModel,
  projectStructuredViewSaveIndicator,
  type StructuredToolbarClassProposal,
  type StructuredToolbarSubjectFilterId,
} from './structured-resource-toolbar-model'

export function StructuredResourceToolbar({
  documentUri,
  classScopeDisplayLabel,
  structuredStatus,
  classScopeButtonLabel,
  classScopeLabel,
  classOptions,
  selectedClassName,
  classDefinition,
  structuredWritesSupported,
  visiblePendingClassProposals,
  onSelectClassScope,
  onCreatePendingClassProposal,
  onApprovePendingClassProposal,
  onDiscardPendingClassProposal,
  onOpenClassProposal,
  viewMode,
  onViewModeChange,
  openViews,
  onCloseView,
  searchText,
  onSearchTextChange,
  warningRowsOnly,
  onWarningRowsOnlyChange,
  pendingWritesOnly,
  onPendingWritesOnlyChange,
  sourceUpdatesOnly,
  onSourceUpdatesOnlyChange,
  predicateTypeFilter,
  onPredicateTypeFilterChange,
  predicateNamespaceFilter,
  onPredicateNamespaceFilterChange,
  availablePredicateNamespaces,
  vocabTermFilter,
  onVocabTermFilterChange,
  schemaPredicateControls,
  structuredSortKey,
  structuredSortDirection,
  onSort,
  showNamespaces,
  onShowNamespacesChange,
  hiddenPredicates,
  onTogglePredicateVisibility,
  classScopeMenuOpen,
  onClassScopeMenuOpenChange,
  viewMetadataSaveStatus,
  viewMetadataSaveError,
  onRetryViewMetadataSave,
}: {
  documentUri: string
  classScopeDisplayLabel: string
  structuredStatus: string
  classScopeButtonLabel: string
  classScopeLabel: string
  classOptions: readonly string[]
  selectedClassName: string | null | undefined
  classDefinition?: StructuredVocabTermDefinition
  structuredWritesSupported: boolean
  visiblePendingClassProposals: readonly StructuredToolbarClassProposal[]
  onSelectClassScope: (className: string) => void
  onCreatePendingClassProposal: (draftUri: string) => boolean
  onApprovePendingClassProposal: (classUri: string) => void
  onDiscardPendingClassProposal: (classUri: string) => void
  onOpenClassProposal: (proposalResourceUri: string) => void
  viewMode: StructuredResourceViewMode
  onViewModeChange: (mode: StructuredResourceViewMode) => void
  openViews: readonly StructuredResourceViewMode[]
  onCloseView: (mode: StructuredResourceViewMode) => void
  searchText: string
  onSearchTextChange: (value: string) => void
  warningRowsOnly: boolean
  onWarningRowsOnlyChange: (value: boolean) => void
  pendingWritesOnly: boolean
  onPendingWritesOnlyChange: (value: boolean) => void
  sourceUpdatesOnly: boolean
  onSourceUpdatesOnlyChange: (value: boolean) => void
  predicateTypeFilter: StructuredPredicateTypeFilter
  onPredicateTypeFilterChange: (value: StructuredPredicateTypeFilter) => void
  predicateNamespaceFilter: string | null
  onPredicateNamespaceFilterChange: (value: string | null) => void
  availablePredicateNamespaces: readonly string[]
  vocabTermFilter: StructuredVocabTermFilter
  onVocabTermFilterChange: (value: StructuredVocabTermFilter) => void
  schemaPredicateControls: readonly string[]
  structuredSortKey: string | null
  structuredSortDirection: 'asc' | 'desc'
  onSort: (sortKey: string, sortDirection: 'asc' | 'desc') => void
  showNamespaces: boolean
  onShowNamespacesChange: (value: boolean) => void
  hiddenPredicates: ReadonlySet<string>
  onTogglePredicateVisibility: (predicate: string) => void
  viewMetadataSaveStatus: 'synced' | 'dirty' | 'saving' | 'error'
  viewMetadataSaveError: string | null
  onRetryViewMetadataSave: () => void
  classScopeMenuOpen?: boolean
  onClassScopeMenuOpenChange?: (open: boolean) => void
}) {
  const viewIcons = {
    table: Table2,
    kanban: KanbanSquare,
    whiteboard: Network,
    raw: Text,
  } as const
  const {
    classCreateOpen,
    classDefinitionOpen,
    classDraftUri,
    submitClassDraft,
    toggleClassCreateOpen,
    toggleClassDefinitionOpen,
    updateClassDraftUri,
  } = useStructuredClassScopeMenuController({
    documentUri,
    onCreatePendingClassProposal,
  })

  const toolbarModel = projectStructuredResourceToolbarModel({
    availablePredicateNamespaces,
    classCreateOpen,
    classDefinition,
    classDefinitionOpen,
    classOptions,
    hiddenPredicates,
    openViews,
    pendingWritesOnly,
    predicateNamespaceFilter,
    predicateTypeFilter,
    schemaPredicateControls,
    selectedClassName,
    showNamespaces,
    sourceUpdatesOnly,
    structuredSortDirection,
    structuredSortKey,
    structuredWritesSupported,
    viewMode,
    visiblePendingClassProposals,
    vocabTermFilter,
    warningRowsOnly,
  })
  const viewSaveIndicator = projectStructuredViewSaveIndicator(
    viewMetadataSaveStatus,
    viewMetadataSaveError,
  )
  const subjectFilterChangeHandlers: Record<StructuredToolbarSubjectFilterId, (value: boolean) => void> = {
    pendingWritesOnly: onPendingWritesOnlyChange,
    sourceUpdatesOnly: onSourceUpdatesOnlyChange,
    warningRowsOnly: onWarningRowsOnlyChange,
  }

  return (
    <ResourceViewBar
      ariaLabel={toolbarModel.byline.ariaLabel}
      views={[]}
      activeViewId={viewMode}
      addViewLabel={toolbarModel.extraViewTrigger.ariaLabel}
      onSelectView={onViewModeChange}
      addViewControl={<span className="hidden" aria-hidden="true" />}
      data-control-placement="structured-byline"
      className="flex h-10 min-w-0 items-center gap-1 overflow-hidden border-b border-border/30"
    >
      <div
        className="contents"
      >
        <div className="sr-only">
          <p className="text-sm font-medium text-foreground">{classScopeDisplayLabel}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{structuredStatus}</p>
        </div>
        <div
          data-structured-toolbar-scroll="view-actions"
          className="contents"
        >
          <DropdownMenu open={classScopeMenuOpen} onOpenChange={onClassScopeMenuOpenChange}>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={classScopeButtonLabel}
                title={classScopeLabel}
                className="order-[3] ml-auto flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              >
                <Tags className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {toolbarModel.classOptions.map((classOption) => (
                <DropdownMenuItem key={classOption.uri} onSelect={() => onSelectClassScope(classOption.uri)}>
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {classOption.uri === selectedClassName ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={classOption.uri}>{classOption.label}</span>
                </DropdownMenuItem>
              ))}
              {toolbarModel.pendingClassProposals.map((proposal) => (
                <div key={proposal.id} className="mx-1 my-1 rounded-md border border-warning/20 bg-warning/5 py-1 text-xs">
                  <DropdownMenuItem
                    onSelect={() => onSelectClassScope(proposal.uri)}
                    className="mx-1 px-1.5 text-xs"
                  >
                    <span className="min-w-0 truncate font-medium text-foreground" title={proposal.uri}>
                      {proposal.displayLabel}
                    </span>
                  </DropdownMenuItem>
                  <div className="flex items-center justify-end gap-1 px-2 pt-1">
                    {proposal.canOpenApproval && proposal.approvalResourceUri ? (
                      <button
                        type="button"
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                        aria-label={proposal.openApprovalLabel ?? undefined}
                        onClick={() => onOpenClassProposal(proposal.approvalResourceUri ?? '')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-[11px] text-muted-foreground hover:text-foreground"
                      aria-label={proposal.discardLabel}
                      onClick={() => onDiscardPendingClassProposal(proposal.id)}
                    >
                      {proposal.discardButtonLabel}
                    </button>
                  </div>
                  {proposal.canOpenApproval && proposal.approvalResourceUri ? (
                    <p className="mx-2 mt-1 truncate text-[11px] text-muted-foreground" title={proposal.approvalResourceUri}>{proposal.approvalStatusLabel}</p>
                  ) : null}
                  {proposal.canSubmit && proposal.submitLabel ? (
                    <button
                      type="button"
                      className="mx-2 mt-2 rounded bg-background px-2 py-1 text-[11px] text-foreground hover:bg-muted/70"
                      onClick={() => onApprovePendingClassProposal(proposal.id)}
                    >
                      {proposal.submitLabel}
                    </button>
                  ) : null}
                </div>
              ))}
              <div className="mx-1 mt-1 border-t border-border/40 pt-1">
                <div className="flex items-center justify-end gap-1">
                  {selectedClassName ? (
                  <button
                    type="button"
                    aria-label={toolbarModel.classDefinitionControl.ariaLabel}
                    aria-expanded={toolbarModel.classDefinitionControl.expanded}
                    title={toolbarModel.classDefinitionControl.ariaLabel}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                      toolbarModel.classDefinitionControl.expanded && 'bg-muted text-foreground',
                    )}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      toggleClassDefinitionOpen()
                    }}
                  >
                    <Info className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  ) : null}
                  {structuredWritesSupported ? (
                  <button
                    type="button"
                    aria-label={toolbarModel.classCreateControl.ariaLabel}
                    aria-expanded={toolbarModel.classCreateControl.expanded}
                    title={toolbarModel.classCreateControl.ariaLabel}
                    className={cn(
                      'flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                      toolbarModel.classCreateControl.expanded && 'bg-muted text-foreground',
                    )}
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      toggleClassCreateOpen()
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  ) : null}
                </div>
                {toolbarModel.classDefinitionControl.expanded ? (
                  <div className="px-1 pb-1 pt-2">
                    {toolbarModel.classDefinitionPanel.headingLabel ? (
                      <p className="text-[11px] font-medium text-foreground">{toolbarModel.classDefinitionPanel.headingLabel}</p>
                    ) : null}
                    <p className="mt-1 break-all text-[11px] text-muted-foreground">
                      {toolbarModel.classDefinitionPanel.uri}
                    </p>
                    <div className="mt-2 grid gap-1">
                      {toolbarModel.classDefinitionPanel.rows.map((row) => (
                        <p key={row.key} className="text-[11px] text-muted-foreground">{row.text}</p>
                      ))}
                    </div>
                  </div>
                ) : null}
                {structuredWritesSupported && toolbarModel.classCreateControl.expanded ? (
                    <div className="px-1 pb-1 pt-2">
                      <label className="text-[10px] font-medium uppercase text-muted-foreground" htmlFor="new-class-uri">{toolbarModel.classCreateControl.uriLabel}</label>
                      <div className="mt-1 flex gap-1">
                        <input
                          id="new-class-uri"
                          aria-label={toolbarModel.classCreateControl.inputAriaLabel}
                          className="h-7 min-w-0 flex-1 rounded border border-border/40 bg-background px-2 text-[11px] outline-none"
                          value={classDraftUri}
                          placeholder={toolbarModel.classCreateControl.placeholder}
                          onChange={(event) => updateClassDraftUri(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault()
                              submitClassDraft()
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="rounded bg-muted px-2 text-[11px] text-foreground hover:bg-muted/70"
                          onClick={submitClassDraft}
                        >
                          {toolbarModel.classCreateControl.submitLabel}
                        </button>
                      </div>
                    </div>
                ) : null}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="order-1 flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {toolbarModel.activeViewTabRows.map((row) => {
              const ViewIcon = viewIcons[row.value]
              return (
                <span key={row.value} className="group/view-tab relative flex shrink-0 items-center">
                  <button
                    aria-label={row.label}
                    title={row.label}
                    className={cn(
                      'flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-[11px] transition-colors',
                      row.closable ? 'pr-5' : '',
                      row.active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground',
                    )}
                    onClick={() => onViewModeChange(row.value)}
                  >
                    <ViewIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {row.label}
                  </button>
                  {row.closable ? (
                    <button
                      type="button"
                      aria-label={row.closeLabel}
                      title={row.closeLabel}
                      className="absolute right-1 top-1/2 flex h-3.5 w-3.5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/view-tab:opacity-100"
                      onClick={(event) => {
                        event.stopPropagation()
                        onCloseView(row.value)
                      }}
                    >
                      <X className="h-2.5 w-2.5" aria-hidden="true" />
                    </button>
                  ) : null}
                </span>
              )
            })}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label={toolbarModel.extraViewTrigger.ariaLabel} className="flex h-7 shrink-0 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground">
                  <Plus className="h-3 w-3" />
                  {toolbarModel.extraViewTrigger.label}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {toolbarModel.extraViewOptionRows.map((row) => (
                  <DropdownMenuItem key={row.value} onSelect={() => onViewModeChange(row.value)}>
                    {row.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {viewSaveIndicator ? (
            <button
              type="button"
              aria-label={viewSaveIndicator.ariaLabel}
              title={viewSaveIndicator.title}
              disabled={!viewSaveIndicator.retryable}
              className={cn(
                'order-[2] flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                viewSaveIndicator.kind === 'error'
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'text-muted-foreground',
              )}
              onClick={viewSaveIndicator.retryable ? onRetryViewMetadataSave : undefined}
            >
              {viewSaveIndicator.kind === 'saving'
                ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                : <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          ) : null}
        </div>
      </div>
      <div
        aria-label={toolbarModel.structuredTools.ariaLabel}
        data-control-surface="byline-tools"
        data-structured-toolbar-scroll="subject-tools"
        className="contents"
      >
        <div className="group/search order-[4] relative h-7 w-7 shrink-0 transition-[width] focus-within:w-44">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder={toolbarModel.searchField.placeholder}
            aria-label={toolbarModel.searchField.placeholder}
            className="h-7 w-full rounded-md border-0 bg-transparent pl-7 pr-1 text-xs placeholder:text-transparent hover:bg-muted/70 focus:bg-background focus:placeholder:text-muted-foreground focus-visible:ring-1"
          />
        </div>
        <div className="contents">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={toolbarModel.filterTool.ariaLabel}
                className={cn(
                  'order-[5] flex h-7 w-7 items-center justify-center rounded-md text-[11px] transition-colors hover:bg-muted/70',
                  toolbarModel.hasActiveFilters ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {toolbarModel.filterSectionLabels.subject}
              </div>
              {toolbarModel.subjectFilterRows.map((row) => (
                <DropdownMenuCheckboxItem
                  key={row.id}
                  checked={row.checked}
                  onCheckedChange={(checked) => subjectFilterChangeHandlers[row.id](checked === true)}
                >
                  {row.label}
                </DropdownMenuCheckboxItem>
              ))}
              <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {toolbarModel.filterSectionLabels.predicateType}
              </div>
              {toolbarModel.predicateTypeFilterRows.map((row) => (
                <DropdownMenuItem
                  key={row.value}
                  onSelect={() => onPredicateTypeFilterChange(row.value)}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {row.checked ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                </DropdownMenuItem>
              ))}
              <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {toolbarModel.filterSectionLabels.namespace}
              </div>
              {toolbarModel.namespaceFilterRows.map((row) => (
                <DropdownMenuItem
                  key={row.value ?? 'all'}
                  onSelect={() => onPredicateNamespaceFilterChange(row.value)}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {row.checked ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={row.value ?? undefined}>{row.label}</span>
                </DropdownMenuItem>
              ))}
              <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {toolbarModel.filterSectionLabels.vocabTerm}
              </div>
              {toolbarModel.vocabTermFilterRows.map((row) => (
                <DropdownMenuItem
                  key={row.value}
                  onSelect={() => onVocabTermFilterChange(row.value)}
                >
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                    {row.checked ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {toolbarModel.showSortTool ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={toolbarModel.sortTool.ariaLabel}
                  title={toolbarModel.sortTool.label}
                  className={cn(
                    'order-[6] flex h-7 w-7 items-center justify-center rounded-md text-[11px] transition-colors hover:bg-muted/70',
                    toolbarModel.sortTool.active ? 'text-primary' : 'text-muted-foreground',
                  )}
                >
                  {toolbarModel.sortTool.iconKind === 'desc' ? (
                    <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : toolbarModel.sortTool.iconKind === 'asc' ? (
                    <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {toolbarModel.sortOptionRows.map((row) => (
                  <div key={row.sortKey} className="grid grid-cols-2 gap-1 px-1 py-0.5">
                    {row.choices.map((choice) => (
                      <DropdownMenuItem
                        key={choice.key}
                        onSelect={() => onSort(choice.sortKey, choice.sortDirection)}
                        className="text-[11px]"
                      >
                        {choice.label}
                      </DropdownMenuItem>
                    ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {toolbarModel.showPredicateVisibilityTool ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={toolbarModel.predicateVisibilityTool.ariaLabel}
                  title={toolbarModel.predicateVisibilityTool.ariaLabel}
                  className={cn(
                    'order-[7] flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground',
                    hiddenPredicates.size > 0 && 'text-primary',
                  )}
                >
                  <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {toolbarModel.showNamespaceSwitch ? (
                  <DropdownMenuCheckboxItem
                    checked={showNamespaces}
                    onCheckedChange={(checked) => onShowNamespacesChange(checked === true)}
                  >
                    显示命名空间
                  </DropdownMenuCheckboxItem>
                ) : null}
                <div className="px-2 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  predicate
                </div>
                {toolbarModel.predicateVisibilityRows.map((row) => (
                  <DropdownMenuCheckboxItem
                    key={row.predicate}
                    checked={row.visible}
                    onCheckedChange={() => onTogglePredicateVisibility(row.predicate)}
                  >
                    <span className="truncate" title={row.predicate}>{row.label}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </ResourceViewBar>
  )
}
