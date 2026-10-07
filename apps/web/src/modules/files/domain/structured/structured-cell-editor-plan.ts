import type { StructuredVocabPredicateDefinition } from './structured-table'

export type StructuredCellEditorPredicateDefinition = StructuredVocabPredicateDefinition
export type StructuredCellScalarEditorKind = 'text' | 'number' | 'date'
export type StructuredCellEditorValueKind =
  | StructuredCellScalarEditorKind
  | 'enum'
  | 'multi-select'
  | 'boolean'
  | 'relation'

export type StructuredCellEditorPlan =
  | {
    kind: 'scalar'
    scalarKind: StructuredCellScalarEditorKind
    value: string
    definitionDriven: boolean
    commit: (next: string) => string
  }
  | {
    kind: 'enum'
    multi: boolean
    definitionDriven: boolean
  }
  | {
    kind: 'boolean'
    value: 'true' | 'false'
    definitionDriven: boolean
    nextValue: 'true' | 'false'
  }
  | {
    kind: 'relation'
    value: string
    definitionDriven: boolean
  }
  | {
    kind: 'none'
  }

const TYPED_LITERAL_PATTERN = /^"((?:[^"\\]|\\.)*)"\^\^(?:<([^>]+)>|([A-Za-z][\w.-]*:[\w.-]+))$/
const DATE_TYPE_SUFFIX_PATTERN = /(?:#|:)date$/i

function parseTypedLiteral(value: string) {
  const match = value.match(TYPED_LITERAL_PATTERN)
  if (!match) return null
  const fullIriDatatype = match[2]
  const prefixedDatatype = match[3]
  const datatypeToken = fullIriDatatype ? `<${fullIriDatatype}>` : (prefixedDatatype ?? '')
  return {
    lexical: match[1].replace(/\\"/g, '"'),
    datatype: fullIriDatatype ?? prefixedDatatype ?? '',
    datatypeToken,
  }
}

export function unquoteStructuredCellLiteral(value: string) {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1)
  return value
}

export function quoteStructuredCellLiteral(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function normalizeStructuredCellResourceValue(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return trimmed.slice(1, -1)
  return trimmed
}

export function quoteStructuredCellResourceValue(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('<') && trimmed.endsWith('>')) return trimmed
  return `<${trimmed}>`
}

export function serializeStructuredCellEditorValues(
  kind: StructuredCellEditorValueKind,
  values: readonly string[],
) {
  const normalizedValues = values.map((value) => value.trim()).filter(Boolean)
  if (kind === 'number') return normalizedValues.slice(0, 1)
  if (kind === 'date') return normalizedValues[0] ? [`"${normalizedValues[0]}"^^xsd:date`] : []
  if (kind === 'boolean') return [normalizedValues[0] === 'true' ? 'true' : 'false']
  if (kind === 'relation') {
    return normalizedValues.map(quoteStructuredCellResourceValue).filter(Boolean)
  }
  return normalizedValues.map(quoteStructuredCellLiteral)
}

export function isStructuredCellRelationLikeValue(value: string) {
  const normalized = normalizeStructuredCellResourceValue(value)
  return normalized.startsWith('#')
    || normalized.startsWith('./')
    || normalized.startsWith('../')
    || normalized.startsWith('/')
    || /^https?:\/\//.test(normalized)
    || /^[A-Za-z][\w-]*:[^\s"<>]+$/.test(normalized)
}

function valueType(definition?: StructuredCellEditorPredicateDefinition) {
  return definition?.valueType.trim().toLowerCase() ?? ''
}

export function isStructuredCellEnumDefinition(definition?: StructuredCellEditorPredicateDefinition) {
  const normalized = valueType(definition)
  if (!normalized) return false
  return normalized === 'enum'
    || normalized === 'select'
    || normalized === 'multi-select'
    || normalized === 'multiselect'
    || normalized.includes('enum')
}

function isMultiEnumDefinition(definition?: StructuredCellEditorPredicateDefinition) {
  const normalized = valueType(definition)
  return Boolean(normalized && (normalized.includes('multi') || normalized.includes('set') || normalized.includes('list')))
}

function isBooleanDefinition(definition?: StructuredCellEditorPredicateDefinition) {
  const normalized = valueType(definition)
  return normalized.includes('boolean') || normalized.includes('checkbox')
}

function isRelationDefinition(definition?: StructuredCellEditorPredicateDefinition) {
  const normalized = valueType(definition)
  return normalized.includes('relation')
    || normalized.includes('resource')
    || normalized.includes('iri')
    || normalized.includes('uri')
    || normalized.includes('url')
    || normalized.includes('anyuri')
}

function inferScalarFromDefinition(
  definition: StructuredCellEditorPredicateDefinition | undefined,
  value = '',
): Extract<StructuredCellEditorPlan, { kind: 'scalar' }> | null {
  const normalized = valueType(definition)
  if (!normalized) return null
  if (normalized.includes('date')) {
    const typedLiteral = parseTypedLiteral(value)
    return {
      kind: 'scalar',
      scalarKind: 'date',
      value: typedLiteral?.lexical ?? unquoteStructuredCellLiteral(value),
      definitionDriven: true,
      commit: (next) => `"${next}"^^${typedLiteral?.datatypeToken || 'xsd:date'}`,
    }
  }
  if (
    normalized.includes('number')
    || normalized.includes('integer')
    || normalized.includes('decimal')
    || normalized.includes('float')
    || normalized.includes('double')
  ) {
    return {
      kind: 'scalar',
      scalarKind: 'number',
      value,
      definitionDriven: true,
      commit: (next) => next,
    }
  }
  if (
    normalized.includes('text')
    || normalized.includes('string')
    || normalized.includes('code')
  ) {
    return {
      kind: 'scalar',
      scalarKind: 'text',
      value: unquoteStructuredCellLiteral(value),
      definitionDriven: true,
      commit: quoteStructuredCellLiteral,
    }
  }
  return null
}

function inferScalarFromValue(value: string): Extract<StructuredCellEditorPlan, { kind: 'scalar' }> | null {
  const typedLiteral = parseTypedLiteral(value)
  if (typedLiteral && DATE_TYPE_SUFFIX_PATTERN.test(typedLiteral.datatype)) {
    return {
      kind: 'scalar',
      scalarKind: 'date',
      value: typedLiteral.lexical,
      definitionDriven: false,
      commit: (next) => `"${next}"^^${typedLiteral.datatypeToken}`,
    }
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return {
      kind: 'scalar',
      scalarKind: 'number',
      value,
      definitionDriven: false,
      commit: (next) => next,
    }
  }
  if (value === 'true' || value === 'false') return null
  if (value.startsWith('"')) {
    return {
      kind: 'scalar',
      scalarKind: 'text',
      value: unquoteStructuredCellLiteral(value),
      definitionDriven: false,
      commit: quoteStructuredCellLiteral,
    }
  }
  return null
}

function isPlainLiteralValues(values: string[]) {
  return values.length === 1 && values[0]?.startsWith('"') && values[0]?.endsWith('"')
}

export function resolveStructuredCellEditorPlan(
  definition: StructuredCellEditorPredicateDefinition | undefined,
  values: string[],
): StructuredCellEditorPlan {
  if (isStructuredCellEnumDefinition(definition)) {
    return {
      kind: 'enum',
      multi: isMultiEnumDefinition(definition),
      definitionDriven: true,
    }
  }

  const firstValue = values[0] ?? ''
  if (isBooleanDefinition(definition) || firstValue === 'true' || firstValue === 'false') {
    const value: 'true' | 'false' = firstValue === 'true' ? 'true' : 'false'
    return {
      kind: 'boolean',
      value,
      nextValue: value === 'true' ? 'false' : 'true',
      definitionDriven: isBooleanDefinition(definition),
    }
  }

  if (isRelationDefinition(definition)) {
    return {
      kind: 'relation',
      value: normalizeStructuredCellResourceValue(firstValue),
      definitionDriven: true,
    }
  }

  const definitionScalar = inferScalarFromDefinition(definition, firstValue)
  if (definitionScalar) return definitionScalar

  if (values.length === 0) {
    return {
      kind: 'scalar',
      scalarKind: 'text',
      value: '',
      definitionDriven: false,
      commit: quoteStructuredCellLiteral,
    }
  }

  if (values.length > 1) {
    if (values.every(isStructuredCellRelationLikeValue)) {
      return {
        kind: 'relation',
        value: normalizeStructuredCellResourceValue(firstValue),
        definitionDriven: false,
      }
    }
    return {
      kind: 'enum',
      multi: true,
      definitionDriven: false,
    }
  }

  if (isStructuredCellRelationLikeValue(firstValue)) {
    return {
      kind: 'relation',
      value: normalizeStructuredCellResourceValue(firstValue),
      definitionDriven: false,
    }
  }

  const scalar = inferScalarFromValue(firstValue)
  if (scalar) return scalar

  if (isPlainLiteralValues(values)) {
    return {
      kind: 'scalar',
      scalarKind: 'text',
      value: unquoteStructuredCellLiteral(firstValue),
      definitionDriven: false,
      commit: quoteStructuredCellLiteral,
    }
  }

  return { kind: 'none' }
}
