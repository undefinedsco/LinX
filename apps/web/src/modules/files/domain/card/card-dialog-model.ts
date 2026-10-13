import { FilesResourceReadError, type FilesEntry } from '../resource/resource-model'
import { getEntryName, getFilesEntryOpenMode, getParentContainerUri, normalizeContainerUri } from '../resource/resource-semantics'
import { readablePredicateLabel } from '../structured/structured-table-vocab'
import type { StructuredTableProjection, StructuredTableRow } from '../structured/structured-table'
import {
  RDF_TYPE_IRI,
  displayRdfValue,
  expandRdfIri,
  isRdfLiteralToken,
  localRdfName,
  rdfLiteralToken,
  toPatchValueToken,
  type RdfPrefixes,
} from './rdf-term-tokens'

/** Mirrors `CardDialogLocator` from `@/lib/card-dialog` without importing the store into the domain. */
export interface CardLocator {
  page?: number
  timeSeconds?: number
  line?: number
  quote?: string
}

export interface CardTarget {
  uri: string
  documentUri: string
  fragment: string | null
}

export type CardKind =
  | 'subject'
  | 'document'
  | 'media'
  | 'table'
  | 'source-card'
  | 'folder'
  | 'other'

export type CardMediaKind = 'image' | 'audio' | 'video' | 'pdf'

export type CardSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

/** Above this size the popup does not try to preview a file (K8b). */
export const CARD_PREVIEW_MAX_BYTES = 25 * 1024 * 1024

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function parseCardTarget(uri: string): CardTarget {
  const hashIndex = uri.indexOf('#')
  if (hashIndex < 0) return { uri, documentUri: uri, fragment: null }
  const fragment = uri.slice(hashIndex + 1)
  return {
    uri,
    documentUri: uri.slice(0, hashIndex),
    fragment: fragment || null,
  }
}

export function projectCardMediaKind(mimeType: string | null | undefined, uri = ''): CardMediaKind | null {
  const normalized = mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (normalized.startsWith('image/')) return 'image'
  if (normalized.startsWith('audio/')) return 'audio'
  if (normalized.startsWith('video/')) return 'video'
  if (normalized === 'application/pdf') return 'pdf'
  const lowerUri = uri.toLowerCase()
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(lowerUri)) return 'image'
  if (/\.(mp3|m4a|wav|ogg|aac|flac)$/.test(lowerUri)) return 'audio'
  if (/\.(mp4|mov|webm|m4v)$/.test(lowerUri)) return 'video'
  if (lowerUri.endsWith('.pdf')) return 'pdf'
  return null
}

export function projectCardKind({
  target,
  entry,
}: {
  target: CardTarget
  entry: Pick<FilesEntry, 'kind' | 'semanticKind' | 'mimeType' | 'uri'> | null | undefined
}): CardKind {
  if (!entry) return target.fragment ? 'subject' : 'other'
  if (entry.kind === 'container') return 'folder'
  const openMode = getFilesEntryOpenMode(entry)
  if (target.fragment && (openMode === 'structured-data-table' || openMode === 'locked-vocab-table' || openMode === 'source-linked-card-preview')) {
    return 'subject'
  }
  if (openMode === 'editable-file-sheet') return 'document'
  if (openMode === 'structured-data-table' || openMode === 'locked-vocab-table') return 'table'
  if (openMode === 'source-linked-card-preview') return 'source-card'
  if (projectCardMediaKind(entry.mimeType, entry.uri)) return 'media'
  return 'other'
}

export interface CardSiblingNavigation {
  index: number
  total: number
  previousUri: string | null
  nextUri: string | null
  positionLabel: string | null
}

export function projectCardSiblingNavigation(uri: string, siblings: readonly string[] | null | undefined): CardSiblingNavigation {
  const list = siblings ?? []
  const index = list.indexOf(uri)
  if (index < 0 || list.length < 2) {
    return { index: Math.max(index, 0), total: list.length, previousUri: null, nextUri: null, positionLabel: null }
  }
  return {
    index,
    total: list.length,
    previousUri: index > 0 ? list[index - 1] ?? null : null,
    nextUri: index < list.length - 1 ? list[index + 1] ?? null : null,
    positionLabel: `${index + 1} / ${list.length}`,
  }
}

function stripDataExtension(name: string) {
  return name.replace(/\.(ttl|jsonld|rdf|nt|trig)$/i, '')
}

/** "活动 / 报名方案.md" — where the card lives, in words. */
export function projectCardPathLabel({
  uri,
  podRootUri,
  title,
}: {
  uri: string
  podRootUri?: string | null
  title?: string | null
}): string {
  const target = parseCardTarget(uri)
  if (target.fragment) {
    const tableName = stripDataExtension(getEntryName(target.documentUri))
    return `${tableName} / ${title || target.fragment}`
  }
  const parentUri = getParentContainerUri(target.documentUri)
  const parentLabel = !parentUri
    ? null
    : podRootUri && normalizeContainerUri(parentUri) === normalizeContainerUri(podRootUri)
      ? '我的空间'
      : getEntryName(parentUri)
  const name = getEntryName(target.documentUri)
  return parentLabel ? `${parentLabel} / ${name}` : name
}

export function projectCardSaveLabel(status: CardSaveStatus): string {
  switch (status) {
    case 'saving': return '保存中…'
    case 'saved': return '已保存'
    case 'error': return '没保存成功'
    case 'conflict': return '别处刚改过，刷新后再改'
    case 'idle': return '自动保存'
  }
}

export interface CardBlockingState {
  title: string
  description: string | null
  action: 'retry' | 'back-to-folder' | 'download' | null
}

export function projectCardReadErrorState(error: unknown): CardBlockingState {
  if (error instanceof FilesResourceReadError) {
    if (error.kind === 'unauthorized' || error.kind === 'forbidden') {
      return { title: '没有权限查看', description: '对方可能收回了共享，或者你还没有被共享。', action: null }
    }
    if (error.kind === 'missing') {
      return { title: '这个文件已经删除', description: null, action: 'back-to-folder' }
    }
  }
  return { title: '没读到这个文件', description: '可能是网络问题，文件本身没事', action: 'retry' }
}

export function formatCardFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, '')} GB`
}

/** K8b: one sentence and one action when the popup cannot show a file. */
export function projectCardUnpreviewableState({
  name,
  size,
  hasSystemOpen,
}: {
  name: string
  size: number | null | undefined
  hasSystemOpen: boolean
}): CardBlockingState & { secondaryAction: 'system-open' | null } {
  if (typeof size === 'number' && size > CARD_PREVIEW_MAX_BYTES) {
    return {
      title: '文件太大，不预览',
      description: `${name} · ${formatCardFileSize(size)}（超过 25 MB 不预览）`,
      action: 'download',
      secondaryAction: null,
    }
  }
  return {
    title: '这种文件不能在这里打开',
    description: name,
    action: 'download',
    secondaryAction: hasSystemOpen ? 'system-open' : null,
  }
}

export function formatCardTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export function projectCardLocatorLabel(locator: CardLocator | null | undefined): string | null {
  if (!locator) return null
  if (typeof locator.page === 'number') return `第 ${locator.page} 页`
  if (typeof locator.timeSeconds === 'number') return formatCardTimestamp(locator.timeSeconds)
  if (typeof locator.line === 'number') return `第 ${locator.line} 行`
  if (locator.quote) return `“${locator.quote.length > 40 ? `${locator.quote.slice(0, 40)}…` : locator.quote}”`
  return null
}

/** PDF viewers understand `#page=N`; media elements start from `timeSeconds`. */
export function projectCardMediaSource(objectUrl: string, kind: CardMediaKind, locator: CardLocator | null | undefined): string {
  if (kind === 'pdf' && typeof locator?.page === 'number' && locator.page > 0) {
    return `${objectUrl}#page=${Math.floor(locator.page)}`
  }
  return objectUrl
}

// ---------------------------------------------------------------------------
// Subjects (a row in a data table is a card)
// ---------------------------------------------------------------------------

const TITLE_PREDICATES = [
  'http://schema.org/name',
  'http://www.w3.org/2000/01/rdf-schema#label',
  'http://purl.org/dc/terms/title',
  'http://xmlns.com/foaf/0.1/name',
  'http://www.w3.org/2006/vcard/ns#fn',
  'https://www.w3.org/ns/activitystreams#name',
  'http://www.w3.org/2004/02/skos/core#prefLabel',
]

const BODY_PREDICATES = [
  'https://www.w3.org/ns/activitystreams#content',
  'http://schema.org/text',
  'http://rdfs.org/sioc/ns#content',
  'http://schema.org/description',
  'http://purl.org/dc/terms/description',
  'http://www.w3.org/2000/01/rdf-schema#comment',
]

const AS_NOTE_IRI = 'https://www.w3.org/ns/activitystreams#Note'
const DEFAULT_NOTE_BODY_PREDICATE = 'https://www.w3.org/ns/activitystreams#content'
const DEFAULT_BODY_PREDICATE = 'http://schema.org/text'

const KNOWN_PREDICATE_LABELS: Record<string, string> = {
  'http://schema.org/name': '名称',
  'http://www.w3.org/2000/01/rdf-schema#label': '名称',
  'http://purl.org/dc/terms/title': '标题',
  'http://xmlns.com/foaf/0.1/name': '名字',
  'http://www.w3.org/2006/vcard/ns#fn': '名字',
  'http://purl.org/dc/terms/created': '创建',
  'http://purl.org/dc/terms/modified': '修改',
  'http://purl.org/dc/terms/date': '日期',
  'http://purl.org/dc/terms/creator': '谁记的',
  'http://purl.org/dc/terms/source': '来源',
  'http://purl.org/dc/terms/isReplacedBy': '被替换为',
  'http://purl.org/dc/terms/description': '说明',
  'http://schema.org/description': '说明',
  'https://www.w3.org/ns/activitystreams#content': '正文',
  'http://schema.org/text': '正文',
  'http://www.w3.org/2006/vcard/ns#hasMember': '联系人',
  'http://www.w3.org/2006/vcard/ns#hasEmail': '邮箱',
  'http://www.w3.org/2006/vcard/ns#hasTelephone': '电话',
  'https://undefineds.co/vocab/tags': '标签',
  'https://undefineds.co/vocab/reviewStatus': '状态',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type': '类型',
}

export function knownPredicateLabel(predicateIri: string): string | null {
  return KNOWN_PREDICATE_LABELS[predicateIri] ?? null
}

export interface CardPropertyModel {
  /** Absolute predicate IRI. */
  predicate: string
  label: string
  /** Patch-ready tokens of the current values. */
  valueTokens: string[]
  displayValues: string[]
  /** Values are links to other resources rather than text. */
  isResource: boolean
  /** Absolute IRI behind each displayed value when it is a link, else null. */
  links: Array<string | null>
}

export interface CardSubjectModel {
  subjectIri: string
  title: string
  titlePredicate: string | null
  bodyPredicate: string
  bodyText: string
  bodyValueTokens: string[]
  typeLabels: string[]
  properties: CardPropertyModel[]
}

export type CardPredicateLabeler = (predicateIri: string) => string | null | undefined

function rowSubjectIri(row: StructuredTableRow, documentUri: string, prefixes: RdfPrefixes) {
  return expandRdfIri(row.subject, documentUri, prefixes)
}

export function findCardSubjectRow(
  projection: StructuredTableProjection,
  documentUri: string,
  subjectIri: string,
): StructuredTableRow | null {
  return projection.rows.find((row) => rowSubjectIri(row, documentUri, projection.prefixes) === subjectIri) ?? null
}

function labelPredicate(predicateIri: string, labeler?: CardPredicateLabeler) {
  return labeler?.(predicateIri) || knownPredicateLabel(predicateIri) || readablePredicateLabel(predicateIri)
}

function cellModel(
  predicateIri: string,
  values: readonly string[],
  documentUri: string,
  prefixes: RdfPrefixes,
  labeler?: CardPredicateLabeler,
): CardPropertyModel {
  return {
    predicate: predicateIri,
    label: labelPredicate(predicateIri, labeler),
    valueTokens: values.map((value) => toPatchValueToken(value, documentUri, prefixes)),
    displayValues: values.map((value) => (
      isRdfLiteralToken(value) ? displayRdfValue(value) : localRdfName(expandRdfIri(value, documentUri, prefixes))
    )),
    isResource: values.length > 0 && values.every((value) => !isRdfLiteralToken(value)),
    links: values.map((value) => (isRdfLiteralToken(value) ? null : expandRdfIri(value, documentUri, prefixes))),
  }
}

export function projectCardSubjectModel({
  projection,
  documentUri,
  subjectIri,
  labeler,
}: {
  projection: StructuredTableProjection
  documentUri: string
  subjectIri: string
  labeler?: CardPredicateLabeler
}): CardSubjectModel | null {
  const row = findCardSubjectRow(projection, documentUri, subjectIri)
  if (!row) return null
  const prefixes = projection.prefixes
  const cells = row.cells.map((cell) => ({
    predicate: expandRdfIri(cell.predicate, documentUri, prefixes),
    values: cell.values,
  }))
  const typeIris = cells
    .filter((cell) => cell.predicate === RDF_TYPE_IRI)
    .flatMap((cell) => cell.values.map((value) => expandRdfIri(value, documentUri, prefixes)))
  const titleCell = TITLE_PREDICATES
    .map((predicate) => cells.find((cell) => cell.predicate === predicate && cell.values.some(isRdfLiteralToken)))
    .find(Boolean)
  const bodyCell = BODY_PREDICATES
    .map((predicate) => cells.find((cell) => cell.predicate === predicate))
    .find(Boolean)
  const bodyPredicate = bodyCell?.predicate
    ?? (typeIris.includes(AS_NOTE_IRI) ? DEFAULT_NOTE_BODY_PREDICATE : DEFAULT_BODY_PREDICATE)
  const title = titleCell
    ? displayRdfValue(titleCell.values.find(isRdfLiteralToken) ?? '')
    : localRdfName(subjectIri)

  return {
    subjectIri,
    title,
    titlePredicate: titleCell?.predicate ?? null,
    bodyPredicate,
    bodyText: bodyCell ? bodyCell.values.map(displayRdfValue).join('\n\n') : '',
    bodyValueTokens: bodyCell ? bodyCell.values.map((value) => toPatchValueToken(value, documentUri, prefixes)) : [],
    typeLabels: typeIris.map((iri) => labeler?.(iri) || localRdfName(iri)),
    properties: cells
      .filter((cell) => cell.predicate !== RDF_TYPE_IRI && cell.predicate !== titleCell?.predicate && cell.predicate !== bodyPredicate)
      .map((cell) => cellModel(cell.predicate, cell.values, documentUri, prefixes, labeler)),
  }
}

/** Every row of a table as a card URI, in table order — the ‹ › order of a table card. */
export function projectCardSubjectUris(projection: StructuredTableProjection, documentUri: string): string[] {
  return projection.rows.map((row) => rowSubjectIri(row, documentUri, projection.prefixes))
}

// ---------------------------------------------------------------------------
// RDF data documents (profile/card, settings, ...) opened as a card
// ---------------------------------------------------------------------------

export interface CardDocumentSubjectRow {
  subjectIri: string
  title: string
  /** A couple of "label：value" lines. */
  summary: string[]
  /** The subject lives inside this document, so it can open in the same popup. */
  openable: boolean
}

export interface CardDocumentOverview {
  /** The single main subject (`#me`, `#this`, the document itself, or the only one). */
  mainSubjectIri: string | null
  rows: CardDocumentSubjectRow[]
}

const MAIN_SUBJECT_FRAGMENTS = ['me', 'this', 'it']

export function projectCardDocumentOverview({
  projection,
  documentUri,
  labeler,
}: {
  projection: StructuredTableProjection
  documentUri: string
  labeler?: CardPredicateLabeler
}): CardDocumentOverview {
  const iris = projectCardSubjectUris(projection, documentUri)
  const unique = Array.from(new Set(iris))
  const mainSubjectIri = unique.length === 1
    ? unique[0]
    : [documentUri, ...MAIN_SUBJECT_FRAGMENTS.map((fragment) => `${documentUri}#${fragment}`)]
      .find((candidate) => unique.includes(candidate)) ?? null
  const rows = unique.map((subjectIri): CardDocumentSubjectRow => {
    const model = projectCardSubjectModel({ projection, documentUri, subjectIri, labeler })
    const summary = (model?.properties ?? [])
      .filter((property) => property.displayValues.length > 0)
      .slice(0, 2)
      .map((property) => `${property.label}：${property.displayValues.join('、')}`)
    return {
      subjectIri,
      title: model?.title ?? localRdfName(subjectIri),
      summary,
      openable: subjectIri.startsWith(`${documentUri}#`),
    }
  })
  return { mainSubjectIri, rows }
}

// ---------------------------------------------------------------------------
// File properties (stored next to the file, in its description sidecar)
// ---------------------------------------------------------------------------

const SYSTEM_PREDICATE_PREFIXES = [
  'http://www.w3.org/ns/posix/stat#',
  'http://www.w3.org/ns/ldp#',
  'http://www.w3.org/ns/auth/acl#',
  'http://www.w3.org/ns/iana/media-types/',
  'http://www.w3.org/ns/ma-ont#',
]
const SYSTEM_PREDICATES = new Set([
  RDF_TYPE_IRI,
  'http://purl.org/dc/terms/modified',
  'http://purl.org/dc/terms/created',
])

export function isCardSystemPredicate(predicateIri: string) {
  return SYSTEM_PREDICATES.has(predicateIri) || SYSTEM_PREDICATE_PREFIXES.some((prefix) => predicateIri.startsWith(prefix))
}

export interface CardFilePropertiesModel {
  /** Subject the description sidecar uses for the file. */
  subjectIri: string
  properties: CardPropertyModel[]
}

export function projectCardFileProperties({
  projection,
  metaUri,
  ownerUri,
  labeler,
}: {
  projection: StructuredTableProjection | null
  metaUri: string
  ownerUri: string
  labeler?: CardPredicateLabeler
}): CardFilePropertiesModel {
  if (!projection) return { subjectIri: ownerUri, properties: [] }
  const metaSelf = `${metaUri}#meta`
  const candidates = [ownerUri, metaSelf, metaUri]
  const row = candidates
    .map((candidate) => findCardSubjectRow(projection, metaUri, candidate))
    .find(Boolean) ?? null
  if (!row) return { subjectIri: ownerUri, properties: [] }
  const subjectIri = expandRdfIri(row.subject, metaUri, projection.prefixes)
  return {
    subjectIri,
    properties: row.cells
      .map((cell) => ({ predicate: expandRdfIri(cell.predicate, metaUri, projection.prefixes), values: cell.values }))
      .filter((cell) => !isCardSystemPredicate(cell.predicate))
      .map((cell) => cellModel(cell.predicate, cell.values, metaUri, projection.prefixes, labeler)),
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface CardValueWritePlan {
  previousValues: string[]
  nextValues: string[]
}

/** Edits from the card are plain text unless the old value was a link and the new one still is. */
export function planCardValueWrite({
  previousValueTokens,
  nextText,
  wasResource,
}: {
  previousValueTokens: readonly string[]
  nextText: string
  wasResource: boolean
}): CardValueWritePlan | null {
  const trimmed = nextText.trim()
  const nextValues = !trimmed
    ? []
    : wasResource && /^https?:\/\/\S+$/.test(trimmed)
      ? [`<${trimmed}>`]
      : [rdfLiteralToken(trimmed)]
  if (nextValues.length === previousValueTokens.length && nextValues.every((value, index) => value === previousValueTokens[index])) {
    return null
  }
  return { previousValues: [...previousValueTokens], nextValues }
}

export function planCardBodyWrite({
  previousValueTokens,
  nextText,
}: {
  previousValueTokens: readonly string[]
  nextText: string
}): CardValueWritePlan | null {
  const normalized = nextText.replace(/\s+$/, '')
  const nextValues = normalized ? [rdfLiteralToken(normalized)] : []
  if (nextValues.length === previousValueTokens.length && nextValues.every((value, index) => value === previousValueTokens[index])) {
    return null
  }
  return { previousValues: [...previousValueTokens], nextValues }
}

/** Where a property the person names in a card lives: the shared vocabulary (词表 › 属性). */
export function projectNewCardPropertyIri(label: string, vocabTermsUri: string): string {
  const slug = label
    .trim()
    .normalize('NFKC')
    .replace(/[\s/\\#?]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${vocabTermsUri}#${encodeURIComponent(slug || 'property')}`
}

// ---------------------------------------------------------------------------
// Dates shown on cards and in folder tables
// ---------------------------------------------------------------------------

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** 今天 / 昨天 / 9月16日 / 2025年9月16日 */
export function formatFilesDayLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const dayDelta = Math.round((startOfDay(now) - startOfDay(date)) / MS_PER_DAY)
  if (dayDelta === 0) return '今天'
  if (dayDelta === 1) return '昨天'
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`
}
