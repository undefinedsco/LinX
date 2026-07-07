import { ArrowDown, ArrowUp, ArrowUpDown, Columns3, ExternalLink, ListFilter, Plus, Search, Tags } from 'lucide-react'

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
import { useStructuredClassScopeMenuController } from './useStructuredClassScopeMenuController'
import {
  projectStructuredResourceToolbarModel,
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
}) {
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
  const subjectFilterChangeHandlers: Record<StructuredToolbarSubjectFilterId, (value: boolean) => void> = {
    pendingWritesOnly: onPendingWritesOnlyChange,
    sourceUpdatesOnly: onSourceUpdatesOnlyChange,
    warningRowsOnly: onWarningRowsOnlyChange,
  }

  return (
    <>
      <div
        aria-label={toolbarModel.byline.ariaLabel}
        data-control-placement="structured-byline"
        className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 overflow-hidden"
      >
        <div className="min-w-0 self-center">
          <p className="text-sm font-medium text-foreground">{classScopeDisplayLabel}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{structuredStatus}</p>
        </div>
        <div
          data-structured-toolbar-scroll="view-actions"
          className="flex min-w-0 justify-end overflow-x-auto pb-0.5"
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={classScopeButtonLabel}
                title={classScopeLabel}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-border/40 bg-background text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
              >
                <Tags className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <div className="px-2 py-1.5 text-xs">
                <p className="font-medium text-foreground">{toolbarModel.classScopeMenu.headingLabel}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{classScopeLabel}</p>
              </div>
              {toolbarModel.classOptions.map((classOption) => (
                <DropdownMenuItem key={classOption.uri} onSelect={() => onSelectClassScope(classOption.uri)}>
                  <span className="truncate" title={classOption.uri}>{classOption.label}</span>
                </DropdownMenuItem>
              ))}
              {toolbarModel.pendingClassProposals.map((proposal) => (
                <div key={proposal.id} className="mx-1 my-1 rounded-md border border-amber-500/20 bg-amber-500/5 py-1 text-xs">
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
              {structuredWritesSupported ? (
                <div className="mx-1 my-1 rounded-md border border-border/40 bg-background px-2 py-1.5 text-xs">
                  <button
                    type="button"
                    aria-label={toolbarModel.classCreateControl.ariaLabel}
                    aria-expanded={toolbarModel.classCreateControl.expanded}
                    className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-medium text-foreground hover:text-primary"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      toggleClassCreateOpen()
                    }}
                  >
                    <span>{toolbarModel.classCreateControl.toggleLabel}</span>
                    <span className="text-muted-foreground">{toolbarModel.classCreateControl.stateLabel}</span>
                  </button>
                  {toolbarModel.classCreateControl.expanded ? (
                    <div className="mt-2">
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
              ) : null}
              <div className="mx-1 my-1 rounded-md border border-border/40 bg-muted/20 px-2 py-1.5 text-xs">
                <button
                  type="button"
                  aria-label={toolbarModel.classDefinitionControl.ariaLabel}
                  aria-expanded={toolbarModel.classDefinitionControl.expanded}
                  className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-medium text-foreground hover:text-primary"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    toggleClassDefinitionOpen()
                  }}
                >
                  <span>{toolbarModel.classDefinitionControl.toggleLabel}</span>
                  <span className="text-muted-foreground">{toolbarModel.classDefinitionControl.stateLabel}</span>
                </button>
                {toolbarModel.classDefinitionControl.expanded ? (
                  <>
                    {toolbarModel.classDefinitionPanel.headingLabel ? (
                      <p className="mt-2 text-[11px] font-medium text-foreground">{toolbarModel.classDefinitionPanel.headingLabel}</p>
                    ) : null}
                    <p className="mt-1 break-all text-[11px] text-muted-foreground">
                      {toolbarModel.classDefinitionPanel.uri}
                    </p>
                    <div className="mt-2 grid gap-1">
                      {toolbarModel.classDefinitionPanel.rows.map((row) => (
                        <p key={row.key} className="text-[11px] text-muted-foreground">{row.text}</p>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex min-w-max items-center gap-1 rounded-md bg-muted/30 p-0.5">
            {toolbarModel.activeViewTabRows.map((row) => (
              <button
                key={row.value}
                className={cn(
                  'rounded px-2 py-1 text-[11px] transition-colors',
                  row.active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted/70',
                )}
                onClick={() => onViewModeChange(row.value)}
              >
                {row.label}
              </button>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label={toolbarModel.extraViewTrigger.ariaLabel} className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted/70">
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
        </div>
      </div>
      <div
        aria-label={toolbarModel.structuredTools.ariaLabel}
        data-control-placement="structured-byline"
        data-control-surface="byline-tools"
        data-structured-toolbar-scroll="subject-tools"
        className="mt-2 grid min-w-0 grid-cols-[minmax(10rem,1fr)_auto] items-center gap-1.5 overflow-hidden pb-0.5"
      >
        <div className="relative min-w-[10rem]">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={(event) => onSearchTextChange(event.target.value)}
            placeholder={toolbarModel.searchField.placeholder}
            className="h-7 rounded-md border-border/40 bg-background pl-7 text-xs"
          />
        </div>
        <div className="flex min-w-max items-center justify-end gap-0.5 overflow-x-auto">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label={toolbarModel.filterTool.ariaLabel}
                className={cn(
                  'flex h-7 min-w-7 items-center justify-center rounded-md border border-border/40 bg-background px-2 text-[11px] transition-colors hover:bg-muted/70',
                  toolbarModel.hasActiveFilters ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                <ListFilter className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
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
                  {row.label}
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
                  {row.label}
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
                  {row.label}
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
                    'flex h-7 min-w-7 items-center justify-center rounded-md border border-border/40 bg-background px-2 text-[11px] transition-colors hover:bg-muted/70',
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
          {toolbarModel.showNamespaceSwitch ? (
            <button
              aria-label={toolbarModel.namespaceSwitch.ariaLabel}
              role="switch"
              aria-checked={toolbarModel.namespaceSwitch.checked}
              className={cn(
                'relative flex h-7 w-10 items-center rounded-full border border-border/40 bg-background px-0.5 transition-colors hover:bg-muted/70',
                toolbarModel.namespaceSwitch.checked ? 'border-primary/40 bg-primary/10' : 'text-muted-foreground',
              )}
              onClick={() => onShowNamespacesChange(toolbarModel.namespaceSwitch.nextValue)}
              title={toolbarModel.namespaceSwitch.title}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-4 w-4 rounded-full bg-muted-foreground/45 transition-transform',
                  toolbarModel.namespaceSwitch.checked && 'translate-x-4 bg-primary',
                )}
              />
            </button>
          ) : null}
          {toolbarModel.showPredicateVisibilityTool ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label={toolbarModel.predicateVisibilityTool.ariaLabel} className="flex h-7 items-center gap-1 rounded-md border border-border/40 bg-background px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted/70">
                  <Columns3 className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
    </>
  )
}
