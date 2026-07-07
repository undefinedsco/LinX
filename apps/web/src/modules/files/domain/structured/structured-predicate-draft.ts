import { localPredicateLabel, resolveLocalVocabTermUri } from './structured-table-vocab'

export type PredicateDefinitionDraft = {
  namespace: string
  localName: string
  label: string
  uri: string
  type: string
  classScope: string
  description: string
  shape: string
  enumOptions: string
  required: boolean
  minCount: string
  maxCount: string
  editorType: string
}

export const DEFAULT_PREDICATE_NAMESPACE = 'udfs'

export const DEFAULT_PREDICATE_NAMESPACE_URIS: Record<string, string> = {
  dcterms: 'http://purl.org/dc/terms/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  schema: 'https://schema.org/',
  sh: 'http://www.w3.org/ns/shacl#',
  udfs: 'https://undefineds.co/vocab/',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
}

export const PREDICATE_VALUE_TYPE_OPTIONS = [
  { value: 'text', label: 'Text', description: 'Plain literal' },
  { value: 'number', label: 'Number', description: 'Numeric literal' },
  { value: 'date', label: 'Date', description: 'Date literal' },
  { value: 'boolean', label: 'Checkbox', description: 'Boolean' },
  { value: 'enum', label: 'Select', description: 'Controlled value' },
  { value: 'relation', label: 'Relation', description: 'IRI link' },
  { value: 'url', label: 'URL', description: 'External URL' },
] as const

export function createPredicateDefinitionDraft(classScope?: string | null): PredicateDefinitionDraft {
  return {
    namespace: DEFAULT_PREDICATE_NAMESPACE,
    localName: '',
    label: '',
    uri: '',
    type: 'text',
    classScope: classScope ?? '',
    description: '',
    shape: '',
    enumOptions: '',
    required: false,
    minCount: '',
    maxCount: '',
    editorType: 'input',
  }
}

export function classUriFromDraft(
  draftUri: string,
  documentUri: string,
  currentPodRootUri?: string | null,
  targetVocabUri?: string | null,
) {
  const localName = localPredicateLabel(draftUri.trim())
  if (!localName) return ''
  return resolveLocalVocabTermUri(documentUri, localName, currentPodRootUri, targetVocabUri)
}

export function predicateUriFromDraft(
  draft: PredicateDefinitionDraft,
  documentUri: string,
  _namespaceRegistry?: ReadonlyMap<string, string>,
  currentPodRootUri?: string | null,
  targetVocabUri?: string | null,
) {
  const explicitUri = draft.uri.trim()
  const localName = draft.localName.trim() || (explicitUri ? localPredicateLabel(explicitUri) : '')
  if (!localName) return ''
  return resolveLocalVocabTermUri(documentUri, localName, currentPodRootUri, targetVocabUri)
}

export function stripPredicateIriDelimiters(value: string) {
  const trimmed = value.trim()
  return trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1).trim() : trimmed
}

export function expandPredicateCurie(value: string, namespaceRegistry?: ReadonlyMap<string, string>) {
  const curieMatch = value.match(/^([A-Za-z][\w.-]*):(.+)$/)
  if (!curieMatch || value.includes('://')) return ''
  const namespaceUri = namespaceRegistry?.get(curieMatch[1]) ?? DEFAULT_PREDICATE_NAMESPACE_URIS[curieMatch[1]]
  return namespaceUri ? `${namespaceUri}${curieMatch[2]}` : ''
}

export function predicateReferenceUriFromDraft(
  draft: PredicateDefinitionDraft,
  namespaceRegistry?: ReadonlyMap<string, string>,
) {
  const explicitUri = stripPredicateIriDelimiters(draft.uri)
  if (/^(?:https?:|urn:|mailto:)/i.test(explicitUri)) return explicitUri
  const expandedExplicitCurie = expandPredicateCurie(explicitUri, namespaceRegistry)
  if (expandedExplicitCurie) return expandedExplicitCurie

  const localName = draft.localName.trim()
  if (!localName) return ''
  const namespacePrefix = draft.namespace.trim() || DEFAULT_PREDICATE_NAMESPACE
  const namespaceUri = namespaceRegistry?.get(namespacePrefix) ?? DEFAULT_PREDICATE_NAMESPACE_URIS[namespacePrefix]
  return namespaceUri ? `${namespaceUri}${localName}` : ''
}

export function predicateLabelFromDraft(draft: PredicateDefinitionDraft, uri: string) {
  return draft.label.trim() || draft.localName.trim() || localPredicateLabel(uri)
}

export function enumOptionsFromDraft(draft: PredicateDefinitionDraft) {
  return draft.enumOptions
    .split(/[,\n]/)
    .map((option) => option.trim())
    .filter(Boolean)
}

export function enumOptionsFromShape(shape: string) {
  return shape
    .split(' · ')
    .filter((part) => part.startsWith('option '))
    .map((part) => part.slice('option '.length).trim())
    .filter(Boolean)
}

export function predicateShapeFromDraft(draft: PredicateDefinitionDraft) {
  const shapeParts: string[] = []
  const classScope = draft.classScope.trim()
  if (classScope) shapeParts.push(`class ${classScope}`)
  if (draft.required) shapeParts.push('required')
  const valueType = draft.type.trim().toLowerCase()
  if (valueType === 'date') shapeParts.push('datatype xsd:date')
  if (valueType === 'boolean') shapeParts.push('datatype xsd:boolean')
  if (valueType === 'number') shapeParts.push('datatype xsd:decimal')
  if (valueType === 'relation' || valueType === 'resource' || valueType === 'url') shapeParts.push('range resource')
  if (valueType === 'enum') {
    for (const option of enumOptionsFromDraft(draft)) {
      shapeParts.push(`option ${option}`)
    }
  }
  const minCount = draft.minCount.trim()
  const maxCount = draft.maxCount.trim()
  if (minCount) shapeParts.push(`minCount ${minCount}`)
  if (maxCount) shapeParts.push(`maxCount ${maxCount}`)
  const editorType = draft.editorType.trim()
  if (editorType) shapeParts.push(`editor ${editorType}`)
  const shape = draft.shape.trim()
  if (shape) shapeParts.push(shape)
  return shapeParts.join(' · ')
}
