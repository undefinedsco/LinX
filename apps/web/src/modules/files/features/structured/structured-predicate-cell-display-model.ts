import {
  normalizeStructuredCellResourceValue,
  unquoteStructuredCellLiteral,
} from '../../domain/structured/structured-cell-editor-plan'
import type { VocabTermProposal } from '../../domain/structured/structured-table'
import {
  displayStructuredCellValue,
  findPendingEnumOptionProposal,
  isPendingEnumOption,
  pendingEnumOptionLabelsForPredicate,
} from '../../domain/structured/structured-table-cell-model'
import { resolveStructuredRelationOpenTarget } from '../../domain/structured/structured-subject-peek'
import { localPredicateLabel } from '../../domain/structured/structured-table-vocab'

export type StructuredRelationValueViewModel = {
  displayLabel: string
  value: string
  external: boolean
  openAction: {
    ariaLabel: string
    external: boolean
    title: string
    value: string
  }
}

export type StructuredEnumOptionViewModel = {
  label: string
  pending: boolean
  termUri: string
  status: string
  proposalResourceUri?: string
  targetVocabUri?: string
  proposal?: VocabTermProposal
}

export function projectStructuredRelationValues(input: {
  documentUri: string
  values: readonly string[]
}): StructuredRelationValueViewModel[] {
  return input.values.map((value) => {
    const normalized = normalizeStructuredCellResourceValue(value)
    const openTarget = resolveStructuredRelationOpenTarget(input.documentUri, normalized)
    const external = openTarget?.kind === 'external'
    return {
      displayLabel: structuredRelationValueDisplayLabel(normalized),
      value: normalized,
      external,
      openAction: {
        ariaLabel: external ? `Open URL ${normalized}` : `Open predicate ${normalized}`,
        external,
        title: normalized,
        value: normalized,
      },
    }
  })
}

function structuredRelationValueDisplayLabel(value: string) {
  const normalized = value.trim().replace(/^<|>$/g, '')
  if (!normalized) return '—'
  const hashIndex = normalized.lastIndexOf('#')
  if (hashIndex >= 0 && hashIndex < normalized.length - 1) return normalized.slice(hashIndex + 1)
  const withoutTrailingSlash = normalized.replace(/\/+$/, '')
  const slashIndex = withoutTrailingSlash.lastIndexOf('/')
  if (slashIndex >= 0 && slashIndex < withoutTrailingSlash.length - 1) return withoutTrailingSlash.slice(slashIndex + 1)
  return normalized
}

export function projectStructuredEnumOptions(input: {
  options: readonly string[]
  predicate: string
  proposals: readonly VocabTermProposal[]
  resolveTermUri: (label: string) => string
}): StructuredEnumOptionViewModel[] {
  return input.options.map((option) => {
    const pendingProposal = findPendingEnumOptionProposal(input.proposals, input.predicate, option)
    return {
      label: option,
      pending: !!pendingProposal,
      termUri: pendingProposal?.termUri ?? input.resolveTermUri(option),
      status: pendingProposal ? '词表变更待确认' : '已定义或已观察',
      proposalResourceUri: pendingProposal?.proposalResourceUri,
      targetVocabUri: pendingProposal?.targetVocabUri,
      proposal: pendingProposal,
    }
  })
}

export function projectStructuredEnumOptionLabels(input: {
  observedValues: readonly string[]
  pendingDefinitionOptions?: readonly string[]
  definitionOptionsByPredicate?: ReadonlyMap<string, readonly { label?: string | null }[]> | null
  predicate: string
  proposals: readonly VocabTermProposal[]
}): string[] {
  const definitionOptions = (
    input.definitionOptionsByPredicate?.get(input.predicate)
    ?? input.definitionOptionsByPredicate?.get(localPredicateLabel(input.predicate))
    ?? []
  ).map((option) => option.label ?? '').filter(Boolean)
  const pendingOptions = pendingEnumOptionLabelsForPredicate(input.proposals, input.predicate)

  return Array.from(new Set([
    ...input.observedValues.map(unquoteStructuredCellLiteral).filter(Boolean),
    ...(input.pendingDefinitionOptions ?? []),
    ...definitionOptions,
    ...pendingOptions,
  ]))
}

export function projectStructuredEnumSelectedValues(values: readonly string[]): string[] {
  return values
    .map((value) => unquoteStructuredCellLiteral(displayStructuredCellValue(value)))
    .filter(Boolean)
}

export function projectStructuredEnumValueLabels(input: {
  predicate: string
  proposals: readonly VocabTermProposal[]
  values: readonly string[]
}): string[] {
  return input.values.map((value) => {
    const label = unquoteStructuredCellLiteral(displayStructuredCellValue(value))
    const suffix = isPendingEnumOption(input.proposals, input.predicate, label) ? '*' : ''
    return `${label}${suffix}`
  })
}

export function projectStructuredScalarValueLabels(input: {
  predicate: string
  proposals: readonly VocabTermProposal[]
  values: readonly string[]
}): string[] {
  return input.values.map((value) => {
    const label = unquoteStructuredCellLiteral(value)
    const suffix = isPendingEnumOption(input.proposals, input.predicate, label) ? '*' : ''
    return `${displayStructuredCellValue(value)}${suffix}`
  })
}
