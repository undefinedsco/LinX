import type {
  StructuredVocabPredicateDefinition,
  VocabTermProposal,
} from '../../domain/structured/structured-table'
import {
  isStructuredCellEnumDefinition,
  isStructuredCellRelationLikeValue,
} from '../../domain/structured/structured-cell-editor-plan'
import {
  projectStructuredEnumValueLabels,
  projectStructuredRelationValues,
  projectStructuredScalarValueLabels,
  type StructuredRelationValueViewModel,
} from './structured-predicate-cell-display-model'

type StructuredStaticBooleanDisplay = {
  kind: 'boolean'
  toggle: {
    ariaLabel: string
    pressed: boolean
    title: string
  }
  value: 'true' | 'false'
}

type StructuredStaticEnumDisplay = {
  kind: 'enum'
  labels: string[]
}

type StructuredStaticRelationDisplay = {
  kind: 'relation'
  values: StructuredRelationValueViewModel[]
}

type StructuredStaticScalarDisplay = {
  kind: 'scalar'
  labels: string[]
}

export type StructuredPredicateStaticCellDisplay =
  | StructuredStaticBooleanDisplay
  | StructuredStaticEnumDisplay
  | StructuredStaticRelationDisplay
  | StructuredStaticScalarDisplay

export function projectStructuredPredicateStaticCellDisplay({
  definition,
  documentUri,
  editable,
  predicate,
  proposals,
  values,
}: {
  definition?: StructuredVocabPredicateDefinition
  documentUri: string
  editable: boolean
  predicate: string
  proposals: readonly VocabTermProposal[]
  values: readonly string[]
}): StructuredPredicateStaticCellDisplay {
  if (editable && values.length === 1 && (values[0] === 'true' || values[0] === 'false')) {
    const value = values[0]
    return {
      kind: 'boolean',
      toggle: {
        ariaLabel: `切换布尔值 ${value}`,
        pressed: value === 'true',
        title: value,
      },
      value,
    }
  }

  if (values.length > 0 && isStructuredCellEnumDefinition(definition)) {
    return {
      kind: 'enum',
      labels: projectStructuredEnumValueLabels({
        predicate,
        proposals,
        values,
      }),
    }
  }

  if (values.length > 0 && values.every(isStructuredCellRelationLikeValue)) {
    return {
      kind: 'relation',
      values: projectStructuredRelationValues({
        documentUri,
        values,
      }),
    }
  }

  return {
    kind: 'scalar',
    labels: projectStructuredScalarValueLabels({
      predicate,
      proposals,
      values,
    }),
  }
}
