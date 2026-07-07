import type { KeyboardEvent, ReactNode } from 'react'
import { Check, ExternalLink, Info, Minus, MoreHorizontal, RotateCcw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useStructuredPredicateValueEditorController,
  type StructuredPredicateValueEditorKind,
} from './useStructuredPredicateValueEditorController'
import { projectStructuredPredicateValueEditorChrome } from './structured-predicate-value-editor-model'
import type {
  StructuredDefinedPredicateHeaderChrome,
  StructuredPendingPredicateHeaderChrome,
} from './structured-predicate-column-header-model'
import {
  planStructuredEnumSelectorInputKeyAction,
  planStructuredEnumSelectorOptionKeyAction,
  projectStructuredEnumCellOptionMenuModel,
  projectStructuredEnumCellSelectorChrome,
  projectStructuredEnumCellSelectorModel,
} from './structured-enum-cell-workflow-model'
import {
  projectPendingCellWriteButtonChrome,
  type PendingCellWriteButtonStatus,
} from './structured-pending-cell-write-button-model'

export type StructuredPredicateValueKind = StructuredPredicateValueEditorKind
export type StructuredPredicateValueStatus = 'pending' | 'error'
/** @deprecated Use StructuredPredicateValueKind. */
export type StructuredPropertyValueKind = StructuredPredicateValueKind
/** @deprecated Use StructuredPredicateValueStatus. */
export type StructuredPropertyValueStatus = StructuredPredicateValueStatus
export type StructuredScalarEditorKind = 'text' | 'number' | 'date'

function predicateValueEditorClassName(status: StructuredPredicateValueStatus | undefined, className?: string) {
  return cn(
    'min-h-8 rounded-md border border-border/50 bg-background px-2 text-[11px] outline-none focus-within:border-primary/50',
    status === 'pending' && 'border-primary/50 bg-primary/5',
    status === 'error' && 'border-destructive/60 bg-destructive/5 focus-within:border-destructive/70',
    className,
  )
}

function commitEnter(event: KeyboardEvent<HTMLInputElement>, commit: () => void) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  commit()
}

function PredicateDefinitionRow({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-2 border-b border-border/20 py-1.5 text-[11px] last:border-0">
      <p className="text-[10px] font-medium uppercase text-muted-foreground">{label}</p>
      <div className="min-w-0 text-foreground/85">{children}</div>
    </div>
  )
}

export function StructuredPredicateHeaderCell({
  chrome,
  predicate,
  displayLabel,
  normalizedLabel,
  typeLabel,
  description,
  ruleText,
  statusLabel,
  sortIcon,
  onSort,
  onCopyPredicate,
  onOpenPredicate,
  onOpenShapeRule,
}: {
  chrome: StructuredDefinedPredicateHeaderChrome
  predicate: string
  displayLabel: string
  normalizedLabel: string
  typeLabel: string
  description: string
  ruleText: string
  statusLabel: string
  sortIcon?: ReactNode
  onSort?: () => void
  onCopyPredicate?: (predicate: string) => void
  onOpenPredicate?: (predicate: string) => void
  onOpenShapeRule?: (shapeRuleUri: string) => void
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      <button
        type="button"
        className="flex min-w-0 items-center gap-1 hover:text-foreground"
        title={displayLabel}
        aria-label={chrome.sortButton.ariaLabel}
        onClick={onSort}
      >
        <span className="min-w-0 truncate">{displayLabel}</span>
        {sortIcon}
      </button>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={chrome.definitionTrigger.ariaLabel}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/70 hover:bg-muted/70 hover:text-foreground"
            onClick={(event) => event.stopPropagation()}
          >
            <Info className="h-3 w-3" aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <div className="px-2 py-1.5 text-xs">
            <p className="font-medium text-foreground">{chrome.menu.title}</p>
            <div className="mt-2 border-y border-border/20">
              <PredicateDefinitionRow label={chrome.menu.rows.predicate.label}>
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="min-w-0 truncate font-medium">{normalizedLabel}</p>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {typeLabel}
                  </span>
                </div>
              </PredicateDefinitionRow>
              <PredicateDefinitionRow label={chrome.menu.rows.description.label}>
                <p className="leading-relaxed text-muted-foreground">{description}</p>
              </PredicateDefinitionRow>
              <PredicateDefinitionRow label={chrome.menu.rows.rule.label}>
                <p>{ruleText}</p>
              </PredicateDefinitionRow>
              <PredicateDefinitionRow label={chrome.menu.rows.status.label}>
                <p>{statusLabel}</p>
              </PredicateDefinitionRow>
            </div>
          </div>
          <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {chrome.menu.actionsHeading}
          </div>
          <DropdownMenuItem onSelect={() => onCopyPredicate?.(predicate)}>
            {chrome.menu.actions.copyPredicate.label}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onOpenPredicate?.(predicate)}>
            {chrome.menu.actions.openPredicate.label}
          </DropdownMenuItem>
          {chrome.menu.actions.shapeRuleActions.map((rule) => (
            <DropdownMenuItem
              key={rule.uri}
              onSelect={() => onOpenShapeRule?.(rule.uri)}
            >
              {rule.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function StructuredPendingPredicateHeaderCell({
  chrome,
  displayLabel,
  proposalUri,
  predicateUri,
  type,
  description,
  ruleText,
  statusLabel,
  vocabProposal,
  onSubmit,
  onOpenProposal,
  onDiscard,
}: {
  chrome: StructuredPendingPredicateHeaderChrome
  displayLabel: string
  proposalUri: string
  predicateUri?: string
  type: string
  description: string
  ruleText: string
  statusLabel: string
  vocabProposal?: {
    proposalResourceUri: string
    targetVocabUri: string
  }
  onSubmit?: () => void
  onOpenProposal?: () => void
  onDiscard?: () => void
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1 hover:text-foreground"
          data-proposal-uri={proposalUri}
          data-predicate-uri={predicateUri}
          title={displayLabel}
          aria-label={chrome.trigger.ariaLabel}
        >
          <span className="min-w-0 truncate">{displayLabel}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <div className="px-2 py-1.5 text-xs">
          <p className="font-medium text-foreground">{chrome.menu.title}</p>
          <div className="mt-2 border-y border-border/20">
            <PredicateDefinitionRow label={chrome.menu.rows.predicate.label}>
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="min-w-0 truncate font-medium">{displayLabel}</p>
                <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {type}
                </span>
              </div>
            </PredicateDefinitionRow>
            {predicateUri ? (
              <PredicateDefinitionRow label={chrome.menu.rows.uri.label}>
                <p className="break-all text-[10px] leading-snug text-muted-foreground">{predicateUri}</p>
              </PredicateDefinitionRow>
            ) : null}
            <PredicateDefinitionRow label={chrome.menu.rows.description.label}>
              <p className="leading-relaxed text-muted-foreground">{description}</p>
            </PredicateDefinitionRow>
            <PredicateDefinitionRow label={chrome.menu.rows.rule.label}>
              <p>{ruleText}</p>
            </PredicateDefinitionRow>
            <PredicateDefinitionRow label={chrome.menu.rows.status.label}>
              <p>{statusLabel}</p>
              {chrome.menu.approvalNotice ? (
                <p className="mt-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                  {chrome.menu.approvalNotice}
                </p>
              ) : null}
            </PredicateDefinitionRow>
            {vocabProposal ? (
              <PredicateDefinitionRow label={chrome.menu.rows.approvalRecord.label}>
                <p className="break-all text-[10px] leading-snug text-muted-foreground">
                  {vocabProposal.proposalResourceUri}
                </p>
              </PredicateDefinitionRow>
            ) : null}
          </div>
        </div>
        {chrome.menu.actions.submit ? (
          <DropdownMenuItem onSelect={onSubmit}>
            {chrome.menu.actions.submit.label}
          </DropdownMenuItem>
        ) : null}
        {chrome.menu.actions.openProposal ? (
          <DropdownMenuItem onSelect={onOpenProposal}>
            {chrome.menu.actions.openProposal.label}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onDiscard}>
          {chrome.menu.actions.discard.label}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function StructuredPredicateValueEditor({
  kind,
  ariaLabel,
  values,
  options = [],
  status,
  placeholder,
  className,
  onCommit,
}: {
  kind: StructuredPredicateValueKind
  ariaLabel: string
  values: string[]
  options?: string[]
  status?: StructuredPredicateValueStatus
  placeholder?: string
  className?: string
  onCommit: (nextValues: string[]) => void
}) {
  const editor = useStructuredPredicateValueEditorController({
    kind,
    values,
    options,
    onCommit,
  })
  const predicateEditorChrome = projectStructuredPredicateValueEditorChrome({
    ariaLabel,
    enumState: editor.enumState,
    multiSelectState: editor.multiSelectState,
    placeholder,
    selectedValues: editor.selectedValues,
  })

  if (kind === 'boolean') {
    const currentValue = editor.booleanValue
    return (
      <button
        type="button"
        aria-label={predicateEditorChrome.booleanToggle.ariaLabel}
        aria-pressed={currentValue}
        className={cn(
          predicateValueEditorClassName(status, className),
          'inline-flex h-8 min-h-0 w-full items-center justify-center px-2',
        )}
        onClick={editor.toggleBooleanValue}
      >
        <span
          className={cn(
            'inline-flex h-5 w-5 items-center justify-center rounded-md border text-[11px]',
            currentValue ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground',
          )}
        >
          {currentValue ? '✓' : ''}
        </span>
      </button>
    )
  }

  if (kind === 'enum') {
    const { expanded, filteredOptions, normalizedDraft, showListbox } = editor.enumState

    return (
      <div className={predicateValueEditorClassName(status, className)}>
        <input
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={expanded}
          aria-controls={predicateEditorChrome.listbox.id}
          className="h-7 w-full bg-transparent outline-none"
          value={editor.draft}
          placeholder={predicateEditorChrome.input.placeholder}
          onChange={(event) => editor.setDraft(event.target.value)}
          onBlur={(event) => {
            const normalized = event.currentTarget.value.trim()
            if (normalized !== (editor.selectedValues[0] ?? '')) editor.commitEnumValue(normalized)
          }}
          onKeyDown={(event) => commitEnter(event, () => editor.commitEnumValue())}
        />
        {showListbox ? (
          <div
            id={predicateEditorChrome.listbox.id}
            role="listbox"
            aria-label={predicateEditorChrome.listbox.ariaLabel}
            className="mt-1 flex flex-wrap gap-1"
          >
            {predicateEditorChrome.enumCreateOption ? (
              <button
                type="button"
                role="option"
                aria-label={predicateEditorChrome.enumCreateOption.ariaLabel}
                aria-selected="false"
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground hover:bg-primary/10"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editor.commitEnumValue(normalizedDraft)}
              >
                {predicateEditorChrome.enumCreateOption.label}
              </button>
            ) : null}
            {filteredOptions.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={option === editor.selectedValues[0]}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-foreground hover:bg-primary/10"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editor.commitEnumValue(option)}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  if (kind === 'multi-select') {
    const { expanded, normalizedDraft, optionCandidates, showListbox } = editor.multiSelectState

    return (
      <div className={predicateValueEditorClassName(status, className)}>
        <div className="flex min-h-7 flex-wrap items-center gap-1 py-1">
          {predicateEditorChrome.multiSelectSelectedValues.map(({ value, ariaLabel, removeAction }) => (
            <span
              key={value}
              aria-label={ariaLabel}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
            >
              <span className="truncate">{value}</span>
              <button
                type="button"
                aria-label={removeAction.ariaLabel}
                className="inline-flex h-3.5 w-3.5 items-center justify-center rounded hover:bg-primary/10"
                onClick={() => editor.removeMultiValue(removeAction.value)}
              >
                <X className="h-2.5 w-2.5" aria-hidden="true" />
              </button>
            </span>
          ))}
          <input
            role="combobox"
            aria-label={ariaLabel}
            aria-expanded={expanded}
            aria-controls={predicateEditorChrome.listbox.id}
            className="h-6 min-w-24 flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70"
            value={editor.draft}
            placeholder={predicateEditorChrome.multiSelectInput.placeholder}
            onChange={(event) => editor.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && !editor.draft && editor.selectedValues.length) {
                editor.removeMultiValue(editor.selectedValues[editor.selectedValues.length - 1] ?? '')
                return
              }
              commitEnter(event, () => editor.commitMultiValue())
            }}
          />
        </div>
        {showListbox ? (
          <div
            id={predicateEditorChrome.listbox.id}
            role="listbox"
            aria-label={predicateEditorChrome.listbox.ariaLabel}
            className="border-t border-border/40 py-1"
          >
            {predicateEditorChrome.multiSelectCreateOption ? (
              <button
                type="button"
                role="option"
                aria-label={predicateEditorChrome.multiSelectCreateOption.ariaLabel}
                aria-selected="false"
                className="block w-full rounded px-1.5 py-1 text-left text-[10px] text-foreground hover:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editor.commitMultiValue(normalizedDraft)}
              >
                {predicateEditorChrome.multiSelectCreateOption.label}
              </button>
            ) : null}
            {optionCandidates.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected="false"
                className="block w-full rounded px-1.5 py-1 text-left text-[10px] text-foreground hover:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => editor.commitMultiValue(option)}
              >
                {option}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <input
      aria-label={ariaLabel}
      type={editor.scalarInputType}
      className={cn(predicateValueEditorClassName(status, className), 'h-8 w-full')}
      value={editor.draft}
      onChange={(event) => editor.setDraft(event.target.value)}
      onBlur={(event) => {
        const normalized = event.currentTarget.value.trim()
        if (normalized !== (editor.selectedValues[0] ?? '')) editor.commitScalarValue(normalized)
      }}
      onKeyDown={(event) => commitEnter(event, () => editor.commitScalarValue())}
    />
  )
}

/** @deprecated Use StructuredPredicateValueEditor. */
export const StructuredPropertyValueEditor = StructuredPredicateValueEditor

export function StructuredScalarCellEditor({
  kind,
  ariaLabel,
  value,
  trailing,
  className,
  autoFocus = true,
  commitOnChange = false,
  onValueChange,
  onCommit,
  onCancel,
}: {
  kind: StructuredScalarEditorKind
  ariaLabel: string
  value: string
  trailing?: ReactNode
  className?: string
  autoFocus?: boolean
  commitOnChange?: boolean
  onValueChange: (value: string) => void
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  const inputType = kind === 'text' ? 'text' : kind

  return (
    <div
      className="flex min-w-0 items-center"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <input
        aria-label={ariaLabel}
        type={inputType}
        className={cn(
          'h-6 min-w-0 flex-1 rounded border border-primary/30 bg-background px-1.5 text-[11px] text-foreground outline-none',
          className,
        )}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value
          onValueChange(nextValue)
          if (commitOnChange) onCommit(nextValue)
        }}
        onBlur={(event) => {
          if (!commitOnChange) onCommit(event.currentTarget.value)
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            event.preventDefault()
            onCommit(event.currentTarget.value)
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        autoFocus={autoFocus}
      />
      {trailing}
    </div>
  )
}

export function StructuredEnumValueChips({
  labels,
  trailing,
}: {
  labels: string[]
  trailing?: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1" aria-label={labels.join(' ')}>
      {labels.map((label, index) => (
        <span
          key={`${label}-${index}`}
          className="inline-flex max-w-full items-center rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium leading-none text-primary"
          title={label}
        >
          <span className="min-w-0 truncate" title={label}>{label}</span>
        </span>
      ))}
      {trailing}
    </div>
  )
}

export function StructuredBooleanCellToggle({
  ariaLabel,
  pressed,
  title,
  trailing,
  onToggle,
}: {
  ariaLabel: string
  pressed: boolean
  title: string
  trailing?: ReactNode
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={pressed}
      title={title}
      className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-foreground hover:bg-muted/70"
      onClick={(event) => {
        event.stopPropagation()
        onToggle()
      }}
    >
      {pressed ? (
        <Check className="h-3 w-3 text-primary" aria-hidden="true" />
      ) : (
        <Minus className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      )}
      {trailing}
    </button>
  )
}

export function StructuredScalarValueDisplay({
  labels,
  trailing,
}: {
  labels: string[]
  trailing?: ReactNode
}) {
  const displayValue = labels.join(', ')
  return (
    <div className="flex min-w-0 items-center">
      <span className="min-w-0 truncate" title={displayValue || undefined}>
        {labels.length > 0 ? displayValue : <span className="text-muted-foreground/50">—</span>}
      </span>
      {trailing}
    </div>
  )
}

export type StructuredSubjectCellOpenKind = 'resource' | 'term' | 'external'

export interface StructuredSubjectCellOpenTarget {
  targetUri: string
  kind: StructuredSubjectCellOpenKind
  canNavigateDirectly: boolean
}

export interface StructuredSubjectCellOpenAffordance {
  ariaDescription: string
  title: string
}

export interface StructuredSubjectCellPendingMarker {
  displayLabel: string
  label: string
}

export interface StructuredSubjectCellOpenOptions {
  navigate?: boolean
  rowIndex?: number | null
  scrollTop?: number
}

function structuredSubjectOpenOptions(
  trigger: HTMLElement,
  navigate: boolean,
  rowIndex: number,
): StructuredSubjectCellOpenOptions {
  const viewport = trigger.closest<HTMLElement>('[data-structured-resource-viewport="true"]')
  const scrollTop = viewport?.scrollTop
  return scrollTop !== undefined
    ? { navigate, rowIndex, scrollTop }
    : { navigate, rowIndex }
}

export function StructuredSubjectCell({
  subject,
  displayLabel,
  rowIndex,
  pending = false,
  pendingMarker,
  openTarget,
  openAffordance,
  onOpenSubject,
}: {
  subject: string
  displayLabel: string
  rowIndex: number
  pending?: boolean
  pendingMarker?: StructuredSubjectCellPendingMarker | null
  openTarget?: StructuredSubjectCellOpenTarget | null
  openAffordance?: StructuredSubjectCellOpenAffordance | null
  onOpenSubject?: (
    subject: string,
    targetUri: string,
    kind: StructuredSubjectCellOpenKind,
    options?: StructuredSubjectCellOpenOptions,
  ) => void
}) {
  if (pending) {
    return (
      <>
        <span>{pendingMarker?.displayLabel ?? displayLabel}</span>
        {pendingMarker ? (
          <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-normal text-amber-700">
            {pendingMarker.label}
          </span>
        ) : null}
      </>
    )
  }

  if (!openTarget || !onOpenSubject) return <span>{displayLabel}</span>

  return (
    <>
      <button
        type="button"
        data-structured-subject-open={subject}
        data-structured-row-index={rowIndex}
        aria-description={openAffordance?.ariaDescription}
        className="inline-block max-w-full truncate rounded-sm px-1 py-0.5 text-left text-foreground/80 hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        title={openAffordance?.title}
        onClick={(event) => onOpenSubject(
          subject,
          openTarget.targetUri,
          openTarget.kind,
          structuredSubjectOpenOptions(event.currentTarget, false, rowIndex),
        )}
        onDoubleClick={(event) => {
          event.preventDefault()
          onOpenSubject(subject, openTarget.targetUri, openTarget.kind, {
            ...structuredSubjectOpenOptions(event.currentTarget, openTarget.canNavigateDirectly, rowIndex),
          })
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          event.stopPropagation()
          onOpenSubject(subject, openTarget.targetUri, openTarget.kind, {
            ...structuredSubjectOpenOptions(event.currentTarget, openTarget.canNavigateDirectly, rowIndex),
          })
        }}
      >
        {displayLabel}
      </button>
    </>
  )
}

export function StructuredPredicateValueLinks({
  values,
  trailing,
  onOpenValue,
}: {
  values: readonly {
    displayLabel: string
    value: string
    external?: boolean
    openAction: {
      ariaLabel: string
      external: boolean
      title: string
      value: string
    }
  }[]
  trailing?: ReactNode
  onOpenValue: (value: string, external: boolean) => void
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {values.map(({ displayLabel, value, openAction }) => (
        <span key={value} className="inline-flex min-w-0 items-center">
          <button
            type="button"
            className="inline-flex max-w-[160px] items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/15"
            aria-label={openAction.ariaLabel}
            title={openAction.title}
            onClick={(event) => {
              event.stopPropagation()
              onOpenValue(openAction.value, openAction.external)
            }}
          >
            <span className="truncate">{displayLabel}</span>
            <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
          </button>
        </span>
      ))}
      {trailing}
    </div>
  )
}

/** @deprecated Use StructuredPredicateValueLinks. */
export const StructuredRelationValueLinks = StructuredPredicateValueLinks

export function StructuredPredicateCellEditor({
  ariaLabel,
  clearAction,
  value,
  values,
  trailing,
  className,
  autoFocus = true,
  onValueChange,
  onOpenValue,
  onCommit,
  onCancel,
}: {
  ariaLabel: string
  clearAction: {
    ariaLabel: string
  }
  value: string
  values: readonly {
    value: string
    external?: boolean
    openAction: {
      ariaLabel: string
      external: boolean
      title: string
      value: string
    }
  }[]
  trailing?: ReactNode
  className?: string
  autoFocus?: boolean
  onValueChange: (value: string) => void
  onOpenValue: (value: string, external: boolean) => void
  onCommit: (value: string) => void
  onCancel: () => void
}) {
  return (
    <div
      className={cn('flex min-w-56 items-center gap-1', className)}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {values.slice(0, 2).map(({ value, openAction }) => (
        <button
          key={value}
          type="button"
          aria-label={openAction.ariaLabel}
          title={openAction.title}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-primary hover:bg-primary/10"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation()
            onOpenValue(openAction.value, openAction.external)
          }}
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </button>
      ))}
      <input
        aria-label={ariaLabel}
        type="text"
        className="h-6 min-w-0 flex-1 rounded border border-primary/30 bg-background px-1.5 text-[11px] text-foreground outline-none"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onBlur={(event) => onCommit(event.currentTarget.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') {
            event.preventDefault()
            onCommit(event.currentTarget.value)
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        }}
        autoFocus={autoFocus}
      />
      <button
        type="button"
        aria-label={clearAction.ariaLabel}
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted/70 hover:text-foreground"
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation()
          onCommit('')
        }}
      >
        <X className="h-3 w-3" aria-hidden="true" />
      </button>
      {trailing}
    </div>
  )
}

/** @deprecated Use StructuredPredicateCellEditor. */
export const StructuredRelationCellEditor = StructuredPredicateCellEditor

export interface StructuredEnumCellOption {
  label: string
  pending?: boolean
  termUri: string
  status: string
  proposalResourceUri?: string
  targetVocabUri?: string
  proposal?: unknown
}

export function StructuredEnumCellSelector({
  ariaLabel,
  valueLabel,
  optionsLabel,
  listboxId,
  predicateLabel,
  selectedValues,
  options,
  search,
  trailing,
  className,
  onSearchChange,
  onAddOption,
  onRemoveOption,
  onOpenDefinition,
  onOpenProposal,
  onDiscardProposal,
  onCancel,
}: {
  ariaLabel: string
  valueLabel?: string
  optionsLabel?: string
  listboxId: string
  predicateLabel?: string
  selectedValues: string[]
  options: readonly StructuredEnumCellOption[]
  search: string
  trailing?: ReactNode
  className?: string
  onSearchChange: (value: string) => void
  onAddOption: (value: string) => void
  onRemoveOption: (value: string) => void
  onOpenDefinition: (option: StructuredEnumCellOption) => void
  onOpenProposal?: (option: StructuredEnumCellOption) => void
  onDiscardProposal?: (option: StructuredEnumCellOption) => void
  onCancel: () => void
}) {
  const selector = projectStructuredEnumCellSelectorModel({
    options,
    search,
    selectedValues,
  })
  const { canCreate, exactSearchOptionLabel, filteredOptions, normalizedSearch } = selector
  const selectorChrome = projectStructuredEnumCellSelectorChrome({
    ariaLabel,
    canCreate,
    normalizedSearch,
    optionsLabel,
    selectedValues,
    valueLabel,
  })
  const createOption = selectorChrome.createOption

  return (
    <div
      className={cn('min-w-52 rounded-md border border-border/50 bg-background p-2 shadow-sm', className)}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="mb-2 flex min-h-8 flex-wrap items-center gap-1 rounded border border-border/40 bg-background px-1.5 py-1 focus-within:border-primary/50"
        aria-label={selectorChrome.selectedValues.ariaLabel}
      >
        {selectorChrome.selectedValues.chips.map(({ value, ariaLabel, removeAction }) => (
          <span
            key={value}
            aria-label={ariaLabel}
            className="inline-flex max-w-full items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
          >
            <span className="truncate">{value}</span>
            <button
              type="button"
              aria-label={removeAction.ariaLabel}
              className="inline-flex h-3.5 w-3.5 items-center justify-center rounded hover:bg-primary/10"
              onClick={() => onRemoveOption(removeAction.value)}
            >
              <X className="h-2.5 w-2.5" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          role="combobox"
          aria-label={ariaLabel}
          aria-controls={listboxId}
          aria-expanded="true"
          aria-autocomplete="list"
          className="h-6 min-w-24 flex-1 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/70"
          placeholder={selectorChrome.input.placeholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation()
            const action = planStructuredEnumSelectorInputKeyAction({
              exactSearchOptionLabel,
              key: event.key,
              normalizedSearch,
            })
            if (action.kind === 'noop') return

            event.preventDefault()
            if (action.kind === 'cancel') {
              onCancel()
              return
            }
            onAddOption(action.value)
          }}
        />
      </div>
      <div
        id={listboxId}
        role="listbox"
        aria-label={selectorChrome.listbox.ariaLabel}
        className="mb-2 flex flex-wrap gap-1"
      >
        {createOption ? (
          <button
            type="button"
            role="option"
            aria-label={createOption.ariaLabel}
            aria-selected="false"
            className="rounded border border-dashed border-border/60 bg-muted/40 px-1.5 py-0.5 text-left text-[10px] text-foreground hover:bg-muted/70"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onAddOption(createOption.addAction.value)}
          >
            <span>{createOption.label}</span>
          </button>
        ) : null}
        {filteredOptions.map((option) => {
          const optionMenu = projectStructuredEnumCellOptionMenuModel({
            option,
            predicateLabel,
          })
          return (
            <div
              key={option.label}
              className="inline-flex items-center rounded bg-primary/10 text-primary"
            >
              <span
                role="option"
                aria-selected="true"
                tabIndex={0}
                className="px-1.5 py-0.5 text-[10px]"
                onClick={() => onAddOption(optionMenu.selectAction.value)}
                onKeyDown={(event) => {
                  const action = planStructuredEnumSelectorOptionKeyAction({
                    key: event.key,
                    optionLabel: optionMenu.selectAction.value,
                  })
                  if (action.kind === 'noop') return

                  event.preventDefault()
                  onAddOption(action.value)
                }}
              >
                {optionMenu.displayLabel}
              </span>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={optionMenu.trigger.ariaLabel}
                    className="flex h-5 w-5 items-center justify-center rounded-r text-primary/80 hover:bg-primary/10 hover:text-primary"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3 w-3" aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72">
                  <div className="px-2 py-1.5 text-xs">
                    <p className="font-medium text-foreground">{optionMenu.title}</p>
                    <div className="mt-2 border-y border-border/20">
                      <PredicateDefinitionRow label={optionMenu.rows.option.label}>
                        <p className="font-medium">{optionMenu.rows.option.value}</p>
                      </PredicateDefinitionRow>
                      {optionMenu.rows.predicate ? (
                        <PredicateDefinitionRow label={optionMenu.rows.predicate.label}>
                          <p>{optionMenu.rows.predicate.value}</p>
                        </PredicateDefinitionRow>
                      ) : null}
                      <PredicateDefinitionRow label={optionMenu.rows.status.label}>
                        <p>{optionMenu.rows.status.value}</p>
                        {optionMenu.rows.status.approvalReadyLabel ? (
                          <p className="mt-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                            {optionMenu.rows.status.approvalReadyLabel}
                          </p>
                        ) : null}
                      </PredicateDefinitionRow>
                    </div>
                  </div>
                  <DropdownMenuItem onSelect={() => onOpenDefinition(option)}>
                    {optionMenu.actions.openDefinition.label}
                  </DropdownMenuItem>
                  {optionMenu.actions.openProposal ? (
                    <DropdownMenuItem onSelect={() => onOpenProposal?.(option)}>
                      {optionMenu.actions.openProposal.label}
                    </DropdownMenuItem>
                  ) : null}
                  {optionMenu.actions.discardProposal ? (
                    <DropdownMenuItem onSelect={() => onDiscardProposal?.(option)}>
                      {optionMenu.actions.discardProposal.label}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })}
      </div>
      {trailing}
    </div>
  )
}

export function ShapeWarningIndicator({
  ariaLabel,
  title,
}: {
  ariaLabel: string
  title: string | null | undefined
}) {
  if (!title || !ariaLabel) return null

  return (
    <span
      aria-label={ariaLabel}
      role="img"
      title={title}
      className="ml-1 inline-flex shrink-0 text-amber-600"
    >
      <Info className="h-3 w-3" aria-hidden="true" />
    </span>
  )
}

export function PendingCellWriteButton({
  predicateLabel,
  subject,
  status = 'failed',
  onDiscard,
}: {
  predicateLabel: string
  subject: string
  status?: PendingCellWriteButtonStatus
  onDiscard?: () => void
}) {
  const chrome = projectPendingCellWriteButtonChrome({
    predicateLabel,
    status,
    subject,
  })

  if (chrome.kind === 'status') {
    return (
      <span
        aria-label={chrome.ariaLabel}
        role="status"
        title={chrome.title}
        className="ml-1 inline-flex h-4 shrink-0 items-center rounded bg-amber-500/10 px-1 text-[10px] font-medium text-amber-700"
      >
        {chrome.marker}
      </span>
    )
  }

  return (
    <button
      type="button"
      aria-label={chrome.ariaLabel}
      title={chrome.title}
      className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-amber-700 hover:bg-amber-500/10"
      onClick={(event) => {
        event.stopPropagation()
        onDiscard?.()
      }}
    >
      <RotateCcw className="h-3 w-3" aria-hidden="true" />
    </button>
  )
}
