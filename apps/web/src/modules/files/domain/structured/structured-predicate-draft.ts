import { hashText } from '../history/text-hash'
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
  { value: 'text', label: '文字', icon: 'T', description: '一段话或几个字' },
  { value: 'number', label: '数字', icon: '#', description: '可以算的数' },
  { value: 'date', label: '日期', icon: '◷', description: '某一天' },
  { value: 'boolean', label: '是 / 否', icon: '✓', description: '勾选' },
  { value: 'enum', label: '选项（可多选）', icon: '≡', description: '从几个固定选项里选' },
  { value: 'contact', label: '联系人', icon: '@', description: '通讯录里的人' },
  { value: 'relation', label: '另一张表的卡片', icon: '▤', description: '连到别的表格' },
  { value: 'url', label: '网址或文件', icon: '↗', description: '链接' },
] as const

/**
 * The machine name behind a column the person named in plain words. Term names
 * in the vocabulary are ASCII, so a Chinese name becomes `p-<hash>`: stable for
 * the same words, different for different words.
 */
export function autoPredicateLocalName(label: string): string {
  const trimmed = label.trim()
  if (!trimmed) return ''
  const ascii = trimmed.normalize('NFKC').replace(/[^A-Za-z0-9]+/g, ' ').trim()
  if (ascii && /^[A-Za-z0-9 ]+$/.test(trimmed.normalize('NFKC'))) {
    const words = ascii.split(' ')
    return words.map((word, index) => (index === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1))).join('')
  }
  return `p-${hashText(trimmed.normalize('NFKC'))}`
}

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
  if (valueType === 'relation' || valueType === 'resource' || valueType === 'url' || valueType === 'contact') shapeParts.push('range resource')
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

/**
 * The rule text of a column after its value type changes: the parts that belong to the old type
 * (datatype, resource range, options) are replaced, everything else (table scope, required,
 * counts, editor) stays.
 */
export function reshapePredicateShapeForValueType(shape: string, valueType: string, enumOptions: readonly string[] = []) {
  const kept = shape
    .split(' · ')
    .map((part) => part.trim())
    .filter((part) => part && !/^datatype /.test(part) && !/^range /.test(part) && !/^option /.test(part))
  const type = valueType.trim().toLowerCase()
  const typed: string[] = []
  if (type === 'date') typed.push('datatype xsd:date')
  if (type === 'boolean') typed.push('datatype xsd:boolean')
  if (type === 'number') typed.push('datatype xsd:decimal')
  if (type === 'relation' || type === 'resource' || type === 'url' || type === 'contact') typed.push('range resource')
  if (type === 'enum') typed.push(...enumOptions.map((option) => `option ${option}`))
  // Type parts go right after the table scope and `required`, like the rule text of a new column.
  const head = kept.filter((part) => /^class /.test(part) || part === 'required')
  const tail = kept.filter((part) => !(/^class /.test(part) || part === 'required'))
  return [...head, ...typed, ...tail].join(' · ')
}
