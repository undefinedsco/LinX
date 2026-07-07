import type {
  StructuredTableProjection,
  StructuredTableRow,
  StructuredVocabDefinitionIndex,
  StructuredVocabShapeRuleDefinition,
} from './structured-table'
import {
  canonicalPredicateKey,
  localName,
  termLookupKeys,
} from './structured-term-keys'

export interface StructuredShapeValidationWarning {
  id: string
  subject: string
  predicate: string
  severity: 'warning'
  message: string
  rule: string
}

const TYPED_LITERAL_PATTERN = /^"((?:[^"\\]|\\.)*)"\^\^(?:<([^>]+)>|([A-Za-z][\w.-]*:[\w.-]+))$/

function parseShapeCountRule(constraint: string, ruleName: 'minCount' | 'maxCount') {
  const match = constraint.match(new RegExp(`\\b${ruleName}\\s+(\\d+)\\b`, 'i'))
  if (!match) return null
  const count = Number(match[1])
  return Number.isFinite(count) ? count : null
}

function parseShapeValueRule(constraint: string, ruleName: 'datatype' | 'pattern') {
  for (const part of constraint.split(/\s+·\s+|\s*;\s*/)) {
    const match = part.trim().match(new RegExp(`^${ruleName}\\s+(.+)$`, 'i'))
    if (!match) continue
    return match[1].trim().replace(/^"((?:[^"\\]|\\.)*)"$/, '$1').replace(/\\"/g, '"')
  }
  return null
}

function parseTypedLiteral(value: string) {
  const match = value.match(TYPED_LITERAL_PATTERN)
  if (!match) return null
  return {
    lexical: match[1].replace(/\\"/g, '"'),
    datatype: match[2] ?? match[3] ?? '',
  }
}

function unquoteRdfLiteral(value: string) {
  const typedLiteral = parseTypedLiteral(value)
  if (typedLiteral) return typedLiteral.lexical
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\"/g, '"')
  }
  return value
}

function normalizeDatatype(value: string) {
  const trimmed = value.trim().replace(/^<(.+)>$/, '$1')
  if (!trimmed) return ''
  if (/^https?:\/\/www\.w3\.org\/2001\/XMLSchema#/.test(trimmed)) {
    return `xsd:${localName(trimmed).toLowerCase()}`
  }
  if (/^xsd:/i.test(trimmed)) return `xsd:${localName(trimmed).toLowerCase()}`
  return trimmed.toLowerCase()
}

function isValidIsoDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function matchesDatatypeLexicalForm(datatype: string, value: string) {
  switch (datatype) {
    case 'xsd:string':
      return true
    case 'xsd:boolean':
      return /^(?:true|false|0|1)$/i.test(value)
    case 'xsd:integer':
      return /^[+-]?\d+$/.test(value)
    case 'xsd:decimal':
      return /^[+-]?(?:\d+\.\d*|\.\d+|\d+)$/.test(value)
    case 'xsd:float':
    case 'xsd:double':
      return /^[+-]?(?:(?:\d+\.\d*|\.\d+|\d+)(?:e[+-]?\d+)?|INF|-INF|NaN)$/i.test(value)
    case 'xsd:date':
      return isValidIsoDate(value)
    default:
      return true
  }
}

function valueMatchesShapeDatatype(value: string, datatype: string) {
  const expected = normalizeDatatype(datatype)
  if (!expected) return true
  const typedLiteral = parseTypedLiteral(value)
  if (typedLiteral) {
    return normalizeDatatype(typedLiteral.datatype) === expected
      && matchesDatatypeLexicalForm(expected, typedLiteral.lexical)
  }
  const lexical = unquoteRdfLiteral(value)
  if (expected === 'xsd:string') return value.startsWith('"')
  if (expected === 'xsd:boolean' || expected === 'xsd:integer' || expected === 'xsd:decimal' || expected === 'xsd:float' || expected === 'xsd:double') {
    return matchesDatatypeLexicalForm(expected, lexical)
  }
  return false
}

function compileShapePattern(pattern: string) {
  try {
    return new RegExp(pattern)
  } catch {
    return null
  }
}

function matchesShapeClassScope(rule: StructuredVocabShapeRuleDefinition, classScope: string | null) {
  if (!rule.classScope) return true
  if (!classScope) return false
  return termLookupKeys(rule.classScope).some((key) => termLookupKeys(classScope).includes(key))
}

function valuesForPredicate(row: StructuredTableRow, predicate: string) {
  return row.cells.find((cell) => cell.predicate === predicate)?.values ?? []
}

function lookupPredicateDefinition(
  vocabDefinitionIndex: StructuredVocabDefinitionIndex,
  predicate: string,
) {
  return vocabDefinitionIndex.predicates.get(predicate)
    ?? vocabDefinitionIndex.predicates.get(canonicalPredicateKey(predicate))
    ?? vocabDefinitionIndex.predicates.get(localName(predicate))
}

function predicateValidationEntries(
  projection: StructuredTableProjection,
  vocabDefinitionIndex: StructuredVocabDefinitionIndex,
  classScope: string | null,
) {
  const entries: Array<{
    predicate: string
    rules: StructuredVocabShapeRuleDefinition[]
  }> = []
  const seen = new Set<string>()
  const seenDefinitionUris = new Set<string>()
  const seenRuleUris = new Set<string>()

  const appendRules = (
    predicate: string,
    rules: StructuredVocabShapeRuleDefinition[],
    definitionUri?: string,
  ) => {
    if (seen.has(predicate)) return
    if (rules.length === 0) return
    seen.add(predicate)
    if (definitionUri) seenDefinitionUris.add(definitionUri)
    for (const rule of rules) {
      seenRuleUris.add(rule.uri)
    }
    entries.push({ predicate, rules })
  }

  const append = (predicate: string, definition = lookupPredicateDefinition(vocabDefinitionIndex, predicate)) => {
    const rules = (definition?.shapeRules ?? []).filter((rule) => (
      rule.status !== 'deprecated' && matchesShapeClassScope(rule, classScope)
    ))
    appendRules(predicate, rules, definition?.uri)
  }

  for (const predicate of projection.predicates) {
    append(predicate)
  }

  const addedDefinitionUris = new Set<string>()
  for (const definition of vocabDefinitionIndex.predicates.values()) {
    if (addedDefinitionUris.has(definition.uri)) continue
    addedDefinitionUris.add(definition.uri)
    if (seenDefinitionUris.has(definition.uri)) continue
    append(definition.predicateUri || definition.uri, definition)
  }

  for (const [predicate, rules] of vocabDefinitionIndex.shapesByTerm.entries()) {
    const activeRules = rules.filter((rule) => (
      !seenRuleUris.has(rule.uri)
      && rule.status !== 'deprecated'
      && matchesShapeClassScope(rule, classScope)
    ))
    appendRules(predicate, activeRules)
  }

  return entries
}

export function validateStructuredTableShapeConstraints(
  projection: StructuredTableProjection,
  vocabDefinitionIndex: StructuredVocabDefinitionIndex,
  classScope: string | null,
): StructuredShapeValidationWarning[] {
  const warnings: StructuredShapeValidationWarning[] = []

  for (const { predicate, rules } of predicateValidationEntries(projection, vocabDefinitionIndex, classScope)) {
    for (const row of projection.rows) {
      const values = valuesForPredicate(row, predicate)
      for (const rule of rules) {
        const minCount = rule.minCount ?? parseShapeCountRule(rule.constraint, 'minCount')
        if (minCount != null && values.length < minCount) {
          warnings.push({
            id: `${row.subject}|${predicate}|minCount`,
            subject: row.subject,
            predicate,
            severity: 'warning',
            message: `${row.subject} ${predicate} has ${values.length} values; minCount is ${minCount}.`,
            rule: `minCount ${minCount}`,
          })
        }

        const maxCount = rule.maxCount ?? parseShapeCountRule(rule.constraint, 'maxCount')
        if (maxCount != null && values.length > maxCount) {
          warnings.push({
            id: `${row.subject}|${predicate}|maxCount`,
            subject: row.subject,
            predicate,
            severity: 'warning',
            message: `${row.subject} ${predicate} has ${values.length} values; maxCount is ${maxCount}.`,
            rule: `maxCount ${maxCount}`,
          })
        }

        const datatype = rule.datatype || parseShapeValueRule(rule.constraint, 'datatype')
        if (datatype) {
          for (const value of values) {
            if (valueMatchesShapeDatatype(value, datatype)) continue
            const lexical = unquoteRdfLiteral(value)
            warnings.push({
              id: `${row.subject}|${predicate}|datatype`,
              subject: row.subject,
              predicate,
              severity: 'warning',
              message: `${row.subject} ${predicate} value "${lexical}" is not datatype ${datatype}.`,
              rule: `datatype ${datatype}`,
            })
          }
        }

        const pattern = rule.pattern || parseShapeValueRule(rule.constraint, 'pattern')
        const regex = pattern ? compileShapePattern(pattern) : null
        if (pattern && regex) {
          for (const value of values) {
            const lexical = unquoteRdfLiteral(value)
            if (regex.test(lexical)) continue
            warnings.push({
              id: `${row.subject}|${predicate}|pattern`,
              subject: row.subject,
              predicate,
              severity: 'warning',
              message: `${row.subject} ${predicate} value "${lexical}" does not match pattern ${pattern}.`,
              rule: `pattern ${pattern}`,
            })
          }
        }
      }
    }
  }

  return warnings
}
