import type { ReactNode } from 'react'

import type {
  StructuredVocabPredicateDefinition,
  VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  StructuredBooleanCellToggle,
  StructuredEnumValueChips,
  StructuredPredicateValueLinks,
  StructuredScalarValueDisplay,
} from './StructuredTableCellPrimitives'
import { projectStructuredPredicateStaticCellDisplay } from './structured-predicate-static-cell-model'

export function StructuredPredicateStaticCell({
  booleanTrailing,
  definition,
  documentUri,
  editable,
  predicate,
  proposals,
  trailing,
  values,
  onOpenRelationValue,
  onToggleBoolean,
}: {
  booleanTrailing?: ReactNode
  definition?: StructuredVocabPredicateDefinition
  documentUri: string
  editable: boolean
  predicate: string
  proposals: readonly VocabTermProposal[]
  trailing?: ReactNode
  values: readonly string[]
  onOpenRelationValue: (normalizedValue: string, external: boolean) => void
  onToggleBoolean: () => void
}) {
  const display = projectStructuredPredicateStaticCellDisplay({
    definition,
    documentUri,
    editable,
    predicate,
    proposals,
    values,
  })

  if (display.kind === 'boolean') {
    return (
      <StructuredBooleanCellToggle
        ariaLabel={display.toggle.ariaLabel}
        disabled={!display.editable}
        pressed={display.toggle.pressed}
        title={display.toggle.title}
        onToggle={onToggleBoolean}
        trailing={booleanTrailing}
      />
    )
  }

  if (display.kind === 'enum') {
    return (
      <StructuredEnumValueChips
        labels={display.labels}
        trailing={trailing}
      />
    )
  }

  if (display.kind === 'relation') {
    return (
      <StructuredPredicateValueLinks
        values={display.values}
        trailing={trailing}
        onOpenValue={onOpenRelationValue}
      />
    )
  }

  return (
    <StructuredScalarValueDisplay
      labels={display.labels}
      trailing={trailing}
    />
  )
}
