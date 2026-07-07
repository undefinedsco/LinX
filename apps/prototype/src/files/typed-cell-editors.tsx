import React from 'react'
import {
  Check,
  Clock3,
  ExternalLink,
  FileCode2,
  FileText,
  Link2,
  MoreHorizontal,
  Plus,
  Tags,
  X,
} from 'lucide-react'
import type { PredicateDefinition, PredicateKind, VocabTermState } from './files-types'

interface TypedPredicateCellProps {
  active: boolean
  enumDefinitionOpen?: { cellKey: string; predicateId: string; option: string } | null
  enumDraft: string
  enumOptions: string[]
  enumOptionState: (option: string) => VocabTermState | undefined
  enumOptionTone: (option: string) => string
  enumOptionUri: (option: string) => string
  predicate: PredicateDefinition
  readonly?: boolean
  subject: string
  value?: string
  onActivate: () => void
  onClearActive: () => void
  onApproveEnumOption: (option: string) => void
  onCreateEnumOption: (option: string) => void
  onDiscardEnumOption: (option: string) => void
  onCycleEnumTone: (option: string) => void
  onSetEnumDraft: (value: string) => void
  onSetValue: (value: string) => void
  onToggleEnumDefinition: (option: string) => void
}

const inlineEditableTypes: PredicateKind[] = ['text', 'number', 'date', 'phone', 'email']

function renderEnumChip(option: string, tone: string, state?: VocabTermState, removable = false) {
  return (
    <em className={`enum-chip ${tone} ${state ? 'pending' : ''}`} data-enum-option={option}>
      {option}
      {state ? <i className={`vocab-state-star ${state}`} title="Pending vocab approval">*</i> : null}
      {removable ? <X size={13} /> : null}
    </em>
  )
}

function renderPredicateValue(
  value: string | undefined,
  predicate: PredicateDefinition,
  enumOptionTone: (option: string) => string,
  enumOptionState: (option: string) => VocabTermState | undefined,
) {
  if (!value) return <span className="empty-cell">Add</span>
  if (predicate.valueStyle === 'code' || predicate.valueStyle === 'path') {
    return <code className={`value-code ${predicate.valueStyle}`}>{value}</code>
  }
  if (predicate.type === 'multi-select') {
    return (
      <span className="value-token-row">
        {value.split(',').map((item) => (
          <React.Fragment key={item.trim()}>
            {renderEnumChip(item.trim(), enumOptionTone(item.trim()), enumOptionState(item.trim()))}
          </React.Fragment>
        ))}
      </span>
    )
  }
  if (predicate.type === 'select') return renderEnumChip(value, enumOptionTone(value), enumOptionState(value))
  if (predicate.type === 'date') return <span className="date-value"><Clock3 size={13} /> {value}</span>
  if (predicate.type === 'checkbox') {
    const checked = value === 'true' || value === 'enabled'
    return <span className={`checkbox-value ${checked ? 'checked' : ''}`}>{checked ? <Check size={13} /> : null}</span>
  }
  if (predicate.type === 'relation' || predicate.type === 'url') {
    return <span className="link-value"><Link2 size={13} /> {value}</span>
  }
  return <span className="value-text">{value}</span>
}

function EnumCellPopover({
  enumDefinitionOpen,
  enumDraft,
  enumOptions,
  enumOptionState,
  enumOptionTone,
  enumOptionUri,
  predicate,
  value,
  onApproveEnumOption,
  onClearActive,
  onCreateEnumOption,
  onCycleEnumTone,
  onDiscardEnumOption,
  onSetEnumDraft,
  onSetValue,
  onToggleEnumDefinition,
}: Omit<TypedPredicateCellProps, 'active' | 'onActivate' | 'readonly' | 'subject'>) {
  const query = enumDraft.trim().toLowerCase()
  const currentValues = predicate.type === 'multi-select'
    ? (value ?? '').split(',').map((item) => item.trim()).filter(Boolean)
    : value ? [value] : []
  const allOptions = Array.from(new Set([...currentValues, ...enumOptions]))
  const filteredOptions = allOptions.filter((option) => !query || option.toLowerCase().includes(query))
  const exactMatch = allOptions.some((option) => option.toLowerCase() === query)
  const canCreate = enumDraft.trim().length > 0 && !exactMatch
  const chooseOption = (option: string) => {
    if (predicate.type === 'multi-select') {
      const nextValues = currentValues.includes(option)
        ? currentValues.filter((item) => item !== option)
        : [...currentValues, option]
      onSetValue(nextValues.join(', '))
      return
    }
    onSetValue(option)
    onClearActive()
  }
  const createOption = () => {
    const next = enumDraft.trim()
    if (!next) return
    onCreateEnumOption(next)
    chooseOption(next)
    onSetEnumDraft('')
  }
  const runAfterPointer = (action: () => void) => {
    window.setTimeout(action, 0)
  }

  return (
    <span className="cell-popover enum-popover" role="menu" onClick={(event) => event.stopPropagation()}>
      <label className="enum-input-shell">
        {currentValues.map((option) => (
          <React.Fragment key={option}>
            {renderEnumChip(option, enumOptionTone(option), enumOptionState(option), true)}
          </React.Fragment>
        ))}
        <input
          autoFocus
          placeholder="Select an option or create one"
          value={enumDraft}
          onChange={(event) => onSetEnumDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (canCreate) window.setTimeout(createOption, 0)
            }
          }}
        />
      </label>
      <span className="enum-prompt">Select an option or create one</span>
      <span className="enum-option-list">
        {filteredOptions.map((option) => {
          const selected = currentValues.includes(option)
          const optionState = enumOptionState(option)
          const definitionMenuOpen = enumDefinitionOpen?.predicateId === predicate.id && enumDefinitionOpen.option === option
          return (
            <span className={`enum-option-row ${selected ? 'active' : ''}`} key={option}>
              <button
                className="enum-option-pick"
                onClick={(event) => {
                  event.stopPropagation()
                  runAfterPointer(() => chooseOption(option))
                }}
              >
                {renderEnumChip(option, enumOptionTone(option), optionState)}
                {selected ? <Check size={14} /> : null}
              </button>
              <button
                className={`enum-option-more ${definitionMenuOpen ? 'active' : ''}`}
                aria-label={`Edit ${option} definition`}
                title="Edit enum definition"
                onClick={(event) => {
                  event.stopPropagation()
                  runAfterPointer(() => onToggleEnumDefinition(option))
                }}
              >
                <MoreHorizontal size={15} />
              </button>
              {definitionMenuOpen ? (
                <span className="enum-definition-menu">
                  <strong>{option}</strong>
                  <small>{enumOptionUri(option)}</small>
                  {optionState ? <em className={`vocab-state-badge ${optionState}`}>AI draft</em> : null}
                  <button onClick={() => runAfterPointer(() => onCycleEnumTone(option))}><Tags size={13} /> Change color</button>
                  <button><FileText size={13} /> Edit definition</button>
                  <button><ExternalLink size={13} /> Open term URI</button>
                  {optionState ? (
                    <>
                      <button
                        aria-label={`Approve ${option} enum option`}
                        onClick={(event) => {
                          event.stopPropagation()
                          runAfterPointer(() => {
                            onApproveEnumOption(option)
                            onToggleEnumDefinition(option)
                          })
                        }}
                      >
                        <Check size={13} /> Approve option
                      </button>
                      <button
                        aria-label={`Discard ${option} enum option`}
                        onClick={(event) => {
                          event.stopPropagation()
                          runAfterPointer(() => {
                            onDiscardEnumOption(option)
                            onToggleEnumDefinition(option)
                          })
                        }}
                      >
                        <X size={13} /> Discard option
                      </button>
                    </>
                  ) : null}
                </span>
              ) : null}
            </span>
          )
        })}
        {canCreate ? (
          <button
            className="enum-create-option"
            onClick={(event) => {
              event.stopPropagation()
              runAfterPointer(createOption)
            }}
          >
            <Plus size={13} />
            {renderEnumChip(enumDraft.trim(), enumOptionTone(enumDraft.trim()), 'ai-pending')}
          </button>
        ) : null}
      </span>
    </span>
  )
}

function renderCellPopover(props: TypedPredicateCellProps) {
  const { predicate, onClearActive, onSetValue } = props
  if (predicate.type === 'select' || predicate.type === 'multi-select') {
    return <EnumCellPopover {...props} />
  }
  if (predicate.type === 'relation' || predicate.type === 'url') {
    return (
      <span className="cell-popover" role="menu" onClick={(event) => event.stopPropagation()}>
        <button onClick={(event) => event.stopPropagation()}><ExternalLink size={13} /> Open target</button>
        <button
          onClick={(event) => {
            event.stopPropagation()
            onSetValue('#WorkspaceMeta')
            onClearActive()
          }}
        >
          <Link2 size={13} /> Relink subject
        </button>
        <button onClick={(event) => event.stopPropagation()}><FileCode2 size={13} /> Copy URI</button>
      </span>
    )
  }
  return null
}

export function TypedPredicateCell(props: TypedPredicateCellProps) {
  const { active, enumOptionState, enumOptionTone, predicate, readonly, value, onActivate, onSetValue } = props

  if (readonly) {
    return (
      <span className={`cell-editor readonly ${predicate.type}`} title={`Ecosystem predicate · ${predicate.label}`}>
        <span className="cell-value">{renderPredicateValue(value, predicate, enumOptionTone, enumOptionState)}</span>
      </span>
    )
  }

  if (predicate.type === 'checkbox') {
    const checked = value === 'true' || value === 'enabled'
    const toggleChecked = () => onSetValue(checked ? 'false' : 'true')
    return (
      <span
        className="cell-editor checkbox"
        role="button"
        tabIndex={0}
        title={`Toggle ${predicate.label}`}
        onClick={(event) => {
          event.stopPropagation()
          toggleChecked()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          toggleChecked()
        }}
      >
        <span className={`checkbox-value direct ${checked ? 'checked' : ''}`}>{checked ? <Check size={13} /> : null}</span>
      </span>
    )
  }

  const activateCell = () => window.setTimeout(onActivate, 0)

  return (
    <span className={`cell-editor-host ${predicate.type}`}>
      <span
        className={`cell-editor ${predicate.type} ${active ? 'active' : ''}`}
        role="button"
        tabIndex={0}
        title={`${predicate.type} · ${predicate.label}`}
        onClick={(event) => {
          event.stopPropagation()
          activateCell()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          event.stopPropagation()
          activateCell()
        }}
      >
        <span className="cell-value">
          {active && inlineEditableTypes.includes(predicate.type) ? (
            <input
              autoFocus
              className="inline-cell-input"
              value={value ?? ''}
              type={predicate.type === 'date' ? 'date' : predicate.type === 'number' ? 'number' : 'text'}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onSetValue(event.target.value)}
            />
          ) : (
            renderPredicateValue(value, predicate, enumOptionTone, enumOptionState)
          )}
        </span>
      </span>
      {active && !inlineEditableTypes.includes(predicate.type) ? renderCellPopover(props) : null}
    </span>
  )
}
