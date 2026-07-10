import { Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { StructuredVocabDefinitionIndex } from '../../domain/structured/structured-table'
import {
  type PredicateDefinitionDraft,
} from '../../domain/structured/structured-predicate-draft'
import { useAddPredicateMenuController } from './useAddPredicateMenuController'

export function AddPredicateMenu({
  documentUri,
  predicates,
  vocabDefinitionIndex,
  showNamespaces,
  classScope,
  namespaceRegistry,
  currentPodRootUri,
  targetVocabUri,
  onCreate,
  onSelectExisting,
}: {
  documentUri: string
  predicates: string[]
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex
  showNamespaces: boolean
  classScope?: string | null
  namespaceRegistry?: ReadonlyMap<string, string>
  currentPodRootUri?: string | null
  targetVocabUri?: string | null
  onCreate: (draft: PredicateDefinitionDraft) => void
  onSelectExisting?: (predicate: string) => void
}) {
  const menu = useAddPredicateMenuController({
    documentUri,
    predicates,
    vocabDefinitionIndex,
    showNamespaces,
    classScope,
    namespaceRegistry,
    currentPodRootUri,
    targetVocabUri,
    onCreate,
  })

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-primary hover:bg-primary/10" aria-label={menu.chrome.trigger.ariaLabel}>
          <Plus className="h-3 w-3" />
          {menu.chrome.trigger.label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[calc(100vh-2rem)] w-80 overflow-y-auto overscroll-contain p-3"
      >
        <div className="space-y-3 text-xs">
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label={menu.chrome.searchField.ariaLabel}
                className="h-7 w-full rounded-md border border-border/40 bg-background pl-7 pr-2 text-[11px] outline-none focus:border-primary/50"
                placeholder={menu.chrome.searchField.placeholder}
                value={menu.predicateSearch}
                onChange={(event) => menu.setPredicateSearch(event.target.value)}
                onKeyDown={(event) => event.stopPropagation()}
              />
            </div>
            <div className="max-h-28 overflow-y-auto rounded-md border border-border/30 bg-background/60 p-1">
              {menu.hasVisibleExistingPredicates ? menu.visibleExistingPredicates.map((row) => {
                return (
                  <button
                    key={row.predicate}
                    type="button"
                    aria-label={row.selectAriaLabel}
                    className="grid w-full min-w-0 grid-cols-[1fr_auto] gap-x-2 gap-y-0.5 rounded px-1.5 py-1.5 text-left text-[11px] text-foreground/80 hover:bg-muted/70"
                    title={row.predicate}
                    onClick={() => onSelectExisting?.(row.predicate)}
                  >
                    <span className="min-w-0 truncate font-medium text-foreground">{row.displayLabel}</span>
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground">{row.typeLabel}</span>
                    {row.description ? (
                      <span className="col-span-2 min-w-0 truncate text-[10px] text-muted-foreground">{row.description}</span>
                    ) : null}
                  </button>
                )
              }) : (
                <p className="px-1.5 py-1 text-[11px] text-muted-foreground">{menu.chrome.emptyState.label}</p>
              )}
            </div>
            {!menu.createOpen ? (
              <button
                type="button"
                aria-label={menu.chrome.createPanel.heading}
                className="flex min-h-8 w-full items-center gap-2 rounded-md border border-dashed border-border/60 bg-background px-2 py-1.5 text-left text-[11px] font-medium text-foreground hover:border-primary/40 hover:bg-primary/5"
                onClick={menu.openCreateFromSearch}
              >
                <Plus className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>{menu.createTriggerLabel}</span>
              </button>
            ) : null}
          </div>
          {menu.createOpen ? (
            <>
              <div>
                <p className="font-medium text-foreground">{menu.chrome.createPanel.heading}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {menu.chrome.createPanel.description}
                </p>
              </div>
              <div className="grid gap-2 border-t border-border/30 pt-2" aria-label={menu.chrome.definitionByline.ariaLabel}>
                <section className="grid gap-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground">{menu.chrome.termSection.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="grid gap-1">
                      <span className="text-[11px] font-medium text-foreground/80">{menu.chrome.localNameField.label}</span>
                      <input
                        aria-label={menu.chrome.localNameField.ariaLabel}
                        className="h-7 rounded-md border border-border/40 bg-background px-2 text-[11px] outline-none focus:border-primary/50"
                        placeholder={menu.chrome.localNameField.placeholder}
                        value={menu.draft.localName}
                        onChange={(event) => menu.updateDraft({ localName: event.target.value })}
                      />
                    </label>
                  </div>
                  <label className="grid gap-1">
                    <span className="text-[11px] font-medium text-foreground/80">{menu.chrome.labelField.label}</span>
                    <input
                      aria-label={menu.chrome.labelField.ariaLabel}
                      className="h-7 rounded-md border border-border/40 bg-background px-2 text-[11px] outline-none focus:border-primary/50"
                      placeholder={menu.chrome.labelField.placeholder}
                      value={menu.draft.label}
                      onChange={(event) => menu.updateDraft({ label: event.target.value })}
                    />
                  </label>
                  <p className="truncate rounded-sm bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground" title={menu.uriPreview.title}>
                    {menu.uriPreview.label}
                  </p>
                </section>
                <section className="grid gap-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground">{menu.chrome.valueSection.label}</p>
                  <div className="grid grid-cols-2 gap-1.5" aria-label={menu.chrome.valueTypes.ariaLabel}>
                    {menu.valueTypeRows.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-label={`${menu.chrome.valueTypes.optionAriaLabelPrefix} ${option.value}`}
                        aria-pressed={option.selected}
                        className={cn(
                          'grid min-h-9 grid-cols-[14px_minmax(0,1fr)] gap-x-1.5 rounded-md border border-border/40 bg-background px-2 py-1 text-left text-[11px] transition-colors hover:bg-muted/60',
                          option.selected && 'border-primary/50 bg-primary/5 text-primary',
                        )}
                        onClick={() => menu.updateDraft({ type: option.value })}
                      >
                        <span className="mt-1 h-2.5 w-2.5 rounded-full border border-current" aria-hidden="true" />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{option.label}</span>
                          <span className="block truncate text-[10px] text-muted-foreground">{option.description}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                  {menu.showEnumOptionsEditor ? (
                    <label className="grid gap-1">
                      <span className="text-[11px] font-medium text-foreground/80">{menu.chrome.enumOptionsField.label}</span>
                      <input
                        aria-label={menu.chrome.enumOptionsField.ariaLabel}
                        className="h-7 rounded-md border border-border/40 bg-background px-2 text-[11px] outline-none focus:border-primary/50"
                        placeholder={menu.chrome.enumOptionsField.placeholder}
                        value={menu.draft.enumOptions}
                        onChange={(event) => menu.updateDraft({ enumOptions: event.target.value })}
                      />
                    </label>
                  ) : null}
                </section>
                <label className="grid gap-1">
                  <span className="text-[11px] font-medium text-muted-foreground">{menu.chrome.descriptionField.label}</span>
                  <textarea
                    aria-label={menu.chrome.descriptionField.ariaLabel}
                    className="min-h-14 rounded-md border border-border/40 bg-background px-2 py-1.5 text-[11px] outline-none focus:border-primary/50"
                    placeholder={menu.chrome.descriptionField.placeholder}
                    value={menu.draft.description}
                    onChange={(event) => menu.updateDraft({ description: event.target.value })}
                  />
                </label>
                <section className="grid gap-1.5">
                  <button
                    type="button"
                    aria-label={menu.definitionDetailsToggle.ariaLabel}
                    aria-expanded={menu.definitionDetailsToggle.expanded}
                    className="flex h-7 items-center justify-between rounded-md border border-border/40 bg-background px-2 text-[11px] text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    onClick={menu.toggleDefinitionDetails}
                  >
                    <span>{menu.definitionDetailsToggle.label}</span>
                    <span aria-hidden="true">{menu.definitionDetailsToggle.indicator}</span>
                  </button>
                  {menu.definitionDetailsOpen ? (
                    <div className="grid gap-2 rounded-md border border-border/40 bg-background/70 p-2">
                      <div className="grid grid-cols-[0.42fr_1fr] gap-2">
                        <label className="grid gap-1">
                          <span className="text-[11px] font-medium text-foreground/80">{menu.chrome.shapeFields.namespace.label}</span>
                          <input
                            aria-label={menu.chrome.shapeFields.namespace.ariaLabel}
                            className="h-7 rounded-md border border-border/40 bg-background px-2 text-[11px] outline-none focus:border-primary/50"
                            placeholder={menu.chrome.shapeFields.namespace.placeholder}
                            value={menu.draft.namespace}
                            onChange={(event) => menu.updateDraft({ namespace: event.target.value })}
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="text-[11px] font-medium text-foreground/80">{menu.chrome.shapeFields.uri.label}</span>
                          <input
                            aria-label={menu.chrome.shapeFields.uri.ariaLabel}
                            className="h-7 rounded-md border border-border/40 bg-background px-2 text-[11px] outline-none focus:border-primary/50"
                            placeholder={menu.chrome.shapeFields.uri.placeholder}
                            value={menu.draft.uri}
                            onChange={(event) => menu.updateDraft({ uri: event.target.value })}
                          />
                        </label>
                      </div>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-medium text-foreground/80">{menu.chrome.shapeFields.classScope.label}</span>
                        <input
                          aria-label={menu.chrome.shapeFields.classScope.ariaLabel}
                          className="h-7 rounded-md border border-border/40 bg-background px-2 text-[11px] outline-none focus:border-primary/50"
                          placeholder={menu.chrome.shapeFields.classScope.placeholder}
                          value={menu.draft.classScope}
                          onChange={(event) => menu.updateDraft({ classScope: event.target.value })}
                        />
                      </label>
                      <div className="grid grid-cols-[1fr_4rem_4rem] gap-2">
                        <label className="flex h-7 items-center gap-1.5 rounded-md border border-border/40 bg-background px-2 text-[11px] text-foreground/80">
                          <input
                            aria-label={menu.chrome.shapeFields.required.ariaLabel}
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={menu.draft.required}
                            onChange={(event) => menu.updateDraft({ required: event.target.checked })}
                          />
                          <span>{menu.chrome.shapeFields.required.label}</span>
                        </label>
                        <label className="grid gap-1">
                          <span className="sr-only">{menu.chrome.shapeFields.minCount.srLabel}</span>
                          <input
                            aria-label={menu.chrome.shapeFields.minCount.ariaLabel}
                            type="number"
                            min="0"
                            className="h-7 rounded-md border border-border/40 bg-background px-2 text-[11px] outline-none focus:border-primary/50"
                            placeholder={menu.chrome.shapeFields.minCount.placeholder}
                            value={menu.draft.minCount}
                            onChange={(event) => menu.updateDraft({ minCount: event.target.value })}
                          />
                        </label>
                        <label className="grid gap-1">
                          <span className="sr-only">{menu.chrome.shapeFields.maxCount.srLabel}</span>
                          <input
                            aria-label={menu.chrome.shapeFields.maxCount.ariaLabel}
                            type="number"
                            min="0"
                            className="h-7 rounded-md border border-border/40 bg-background px-2 text-[11px] outline-none focus:border-primary/50"
                            placeholder={menu.chrome.shapeFields.maxCount.placeholder}
                            value={menu.draft.maxCount}
                            onChange={(event) => menu.updateDraft({ maxCount: event.target.value })}
                          />
                        </label>
                      </div>
                      <label className="grid gap-1">
                        <span className="text-[11px] font-medium text-foreground/80">{menu.chrome.shapeFields.editor.label}</span>
                        <select
                          aria-label={menu.chrome.shapeFields.editor.ariaLabel}
                          className="h-7 rounded-md border border-border/40 bg-background px-2 text-[11px] outline-none focus:border-primary/50"
                          value={menu.draft.editorType}
                          onChange={(event) => menu.updateDraft({ editorType: event.target.value })}
                        >
                          {menu.chrome.shapeFields.editor.options.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}
                </section>
              </div>
              <button
                type="button"
                className="sticky bottom-0 mt-1 w-full rounded-md bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-40"
                disabled={menu.submitDisabled}
                onClick={menu.submitDraft}
              >
                {menu.chrome.submitButton.label}
              </button>
            </>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
