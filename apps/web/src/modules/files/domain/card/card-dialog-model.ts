import { FilesResourceReadError, type FilesEntry } from '../resource/resource-model'
import { displayResourceName, getEntryName, getFilesEntryOpenMode, getParentContainerUri, normalizeContainerUri } from '../resource/resource-semantics'
import { stripMarkdownSyntax } from '../search/markdown-text'
import { readablePredicateLabel } from '../structured/structured-table-vocab'
import {
  isStructuredCardBodyPredicate,
  lookupPredicateDefinition,
  projectStructuredClassScope,
  projectStructuredVocabSchemaColumns,
  type StructuredTableProjection,
  type StructuredTableRow,
  type StructuredVocabDefinitionIndex,
} from '../structured/structured-table'
import {
  resolveStructuredCellEditorPlan,
  type StructuredCellEditorValueKind,
} from '../structured/structured-cell-editor-plan'
import {
  CARD_BODY_PREDICATE_IRI,
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
  const name = displayResourceName(getEntryName(target.documentUri))
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
  // Media fragment: the player starts from the cited moment.
  if ((kind === 'audio' || kind === 'video') && typeof locator?.timeSeconds === 'number' && locator.timeSeconds > 0) {
    return `${objectUrl}#t=${Math.floor(locator.timeSeconds)}`
  }
  return objectUrl
}

// ---------------------------------------------------------------------------
// Plain text files and text selection (K5)
// ---------------------------------------------------------------------------

export interface CardLineRange {
  /** 1-based, inclusive. */
  start: number
  end: number
}

/** The lines a citation points at: a line number, or the line(s) holding the quoted passage. */
export function findCardLocatorLines(text: string, locator: CardLocator | null | undefined): CardLineRange | null {
  if (!locator) return null
  const lineCount = text.split('\n').length
  if (typeof locator.line === 'number' && locator.line >= 1) {
    const line = Math.min(Math.floor(locator.line), lineCount)
    return { start: line, end: line }
  }
  const quote = locator.quote?.trim()
  if (!quote) return null
  const index = text.indexOf(quote)
  if (index < 0) return null
  const start = text.slice(0, index).split('\n').length
  return { start, end: start + quote.split('\n').length - 1 }
}

/** Where a copied link to the cited spot points (standard fragments the preview understands). */
export function projectCardLocatorLink(uri: string, locator: CardLocator | null | undefined): string {
  if (!locator || uri.includes('#')) return uri
  if (typeof locator.page === 'number') return `${uri}#page=${Math.floor(locator.page)}`
  if (typeof locator.timeSeconds === 'number') return `${uri}#t=${Math.floor(locator.timeSeconds)}`
  if (typeof locator.line === 'number') return `${uri}#line=${Math.floor(locator.line)}`
  return uri
}

/**
 * A link inside a card or document body that points into the person's Pod opens as a card in LinX,
 * at the spot `#line=N` / `#page=N` / `#t=N` names. Returns null for anything else.
 */
export function parseCardPodLink(
  href: string,
  podRootUri: string | null | undefined,
): { uri: string; locator?: CardLocator } | null {
  if (!podRootUri) return null
  let url: URL
  let root: URL
  try {
    url = new URL(href)
    root = new URL(podRootUri.endsWith('/') ? podRootUri : `${podRootUri}/`)
  } catch {
    return null
  }
  if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return null
  const fragment = url.hash.replace(/^#/, '')
  const located = /^(line|page|t)=(\d+)$/.exec(fragment)
  const base = `${url.origin}${url.pathname}${url.search}`
  if (!located) return { uri: fragment ? `${base}#${fragment}` : base }
  const value = Number(located[2])
  const locator: CardLocator = located[1] === 'line' ? { line: value } : located[1] === 'page' ? { page: value } : { timeSeconds: value }
  return { uri: base, locator }
}

/** The words on source line N of a note, for lighting that line up in the rendered body. */
export function projectCardLineQuote(text: string, line: number | undefined): string | null {
  if (typeof line !== 'number' || line < 1) return null
  const quote = stripMarkdownSyntax(text.split('\n')[Math.floor(line) - 1] ?? '')
  return quote || null
}

/** True when the body already opens with its own `# Title`, so the popup should not repeat it. */
export function cardBodyLeadsWithTitle(body: string | null | undefined, title: string): boolean {
  const first = (body ?? '').split('\n').find((line) => line.trim()) ?? ''
  const heading = /^\s*#\s+(.+?)\s*#*\s*$/.exec(first)?.[1]?.trim()
  const name = title.trim()
  if (!heading || !name) return false
  // 做成卡片 names the file "<excerpt> M-D" and starts the body with "# <excerpt>".
  return heading === name || name.startsWith(`${heading} `)
}

function quoteLines(text: string) {
  return text.trim().split('\n').map((line) => `> ${line}`).join('\n')
}

/** Words dropped into the clipboard by 问 LinX: the passage, with where it came from. */
export function projectCardQuotedPrompt({ title, quote, locatorLabel }: { title: string; quote: string; locatorLabel?: string | null }): string {
  const where = locatorLabel ? `「${title}」${locatorLabel}` : `「${title}」`
  return `关于${where}里的这段：\n${quoteLines(quote)}\n\n`
}

/** 做成卡片: a small note holding the passage and a link back to where it came from. */
export function projectCardExcerptNote({
  title,
  quote,
  sourceUri,
  locatorLabel,
  now = new Date(),
}: {
  title: string
  quote: string
  sourceUri: string
  locatorLabel?: string | null
  now?: Date
}): { fileName: string; content: string } {
  const heading = quote.trim().replace(/\s+/g, ' ').slice(0, 24) || '摘录'
  const safe = heading.replace(/[\\/:*?"<>|#%]+/g, ' ').trim() || '摘录'
  const day = `${now.getMonth() + 1}-${now.getDate()}`
  return {
    fileName: `${safe} ${day}.md`,
    content: `# ${safe}\n\n${quoteLines(quote)}\n\n来源：[${title}${locatorLabel ? ` · ${locatorLabel}` : ''}](${sourceUri})\n`,
  }
}

/** Files that are plain text (not notes or pages): shown with line numbers. */
export function isCardPlainTextMime(mimeType: string | null | undefined): boolean {
  const normalized = mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''
  return !!normalized && normalized !== 'text/markdown' && normalized !== 'text/html'
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
  CARD_BODY_PREDICATE_IRI,
  'https://www.w3.org/ns/activitystreams#content',
  'http://schema.org/text',
  'http://rdfs.org/sioc/ns#content',
  'http://schema.org/description',
  'http://purl.org/dc/terms/description',
  'http://www.w3.org/2000/01/rdf-schema#comment',
  'http://www.w3.org/2006/vcard/ns#note',
  'http://xmlns.com/foaf/0.1/status',
]

/** A person's avatar: shown beside the title instead of as a property row. */
const PHOTO_PREDICATES = [
  'http://www.w3.org/2006/vcard/ns#hasPhoto',
  'http://www.w3.org/2006/vcard/ns#photo',
  'http://xmlns.com/foaf/0.1/img',
  'http://xmlns.com/foaf/0.1/depiction',
  'http://schema.org/image',
  'https://schema.org/image',
]

const FOAF_PRIMARY_TOPIC_IRI = 'http://xmlns.com/foaf/0.1/primaryTopic'

const AS_NOTE_IRI = 'https://www.w3.org/ns/activitystreams#Note'
const DEFAULT_NOTE_BODY_PREDICATE = 'https://www.w3.org/ns/activitystreams#content'
const DEFAULT_BODY_PREDICATE = CARD_BODY_PREDICATE_IRI

const KNOWN_PREDICATE_LABELS: Record<string, string> = {
  'http://schema.org/name': '名称',
  'http://www.w3.org/2000/01/rdf-schema#label': '名称',
  'http://purl.org/dc/terms/title': '标题',
  'http://xmlns.com/foaf/0.1/name': '名字',
  'http://www.w3.org/2006/vcard/ns#fn': '名字',
  'http://xmlns.com/foaf/0.1/nick': '昵称',
  'http://xmlns.com/foaf/0.1/img': '头像',
  'http://xmlns.com/foaf/0.1/depiction': '头像',
  'http://xmlns.com/foaf/0.1/status': '签名',
  'http://xmlns.com/foaf/0.1/mbox': '邮箱',
  'http://xmlns.com/foaf/0.1/phone': '电话',
  'http://xmlns.com/foaf/0.1/homepage': '主页',
  'http://xmlns.com/foaf/0.1/based_near': '地区',
  'http://xmlns.com/foaf/0.1/knows': '认识的人',
  'http://xmlns.com/foaf/0.1/maker': '创建者',
  'http://xmlns.com/foaf/0.1/primaryTopic': '主要内容',
  'http://www.w3.org/2006/vcard/ns#nickname': '昵称',
  'http://www.w3.org/2006/vcard/ns#hasPhoto': '头像',
  'http://www.w3.org/2006/vcard/ns#photo': '头像',
  'http://www.w3.org/2006/vcard/ns#note': '签名',
  'http://www.w3.org/2006/vcard/ns#region': '地区',
  'http://www.w3.org/2006/vcard/ns#locality': '城市',
  'http://www.w3.org/2006/vcard/ns#country-name': '国家',
  'http://www.w3.org/2006/vcard/ns#hasAddress': '地址',
  'http://www.w3.org/2006/vcard/ns#url': '主页',
  'http://www.w3.org/2006/vcard/ns#bday': '生日',
  'http://www.w3.org/2006/vcard/ns#organization-name': '公司',
  'http://www.w3.org/2006/vcard/ns#role': '职位',
  'http://schema.org/image': '头像',
  'https://schema.org/image': '头像',
  'http://schema.org/email': '邮箱',
  'http://schema.org/telephone': '电话',
  'http://schema.org/url': '主页',
  'http://schema.org/address': '地区',
  'http://schema.org/nickname': '昵称',
  'http://schema.org/alternateName': '昵称',
  'http://schema.org/birthDate': '生日',
  'http://schema.org/jobTitle': '职位',
  'http://schema.org/dateCreated': '创建时间',
  'http://schema.org/dateModified': '修改时间',
  'http://purl.org/dc/terms/created': '创建时间',
  'http://purl.org/dc/terms/modified': '修改时间',
  'http://www.w3.org/ns/solid/terms#oidcIssuer': '登录服务',
  'http://www.w3.org/ns/pim/space#storage': '数据空间',
  'http://www.w3.org/ns/solid/terms#storage': '数据空间',
  'http://www.w3.org/ns/pim/space#preferencesFile': '偏好设置',
  'http://www.w3.org/ns/pim/space#workspace': '工作区',
  'http://www.w3.org/ns/ldp#inbox': '收件箱',
  'http://www.w3.org/2000/01/rdf-schema#seeAlso': '相关资料',
  'http://www.w3.org/2002/07/owl#sameAs': '同一个人',
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
  /** Avatar URL when the subject has one (web links only). */
  photoUri: string | null
  photoPredicate: string | null
}

export type CardPredicateLabeler = (predicateIri: string) => string | null | undefined

function rowSubjectIri(row: StructuredTableRow, documentUri: string, prefixes: RdfPrefixes) {
  return expandRdfIri(row.subject, documentUri, prefixes)
}

/** The same row can be spelled `#周末` or `#%E5%91%A8…`: compare them as one address. */
function sameSubjectAddress(left: string, right: string) {
  if (left === right) return true
  const decode = (value: string) => { try { return decodeURI(value) } catch { return value } }
  return decode(left) === decode(right)
}

export function findCardSubjectRow(
  projection: StructuredTableProjection,
  documentUri: string,
  subjectIri: string,
): StructuredTableRow | null {
  return projection.rows.find((row) => sameSubjectAddress(rowSubjectIri(row, documentUri, projection.prefixes), subjectIri)) ?? null
}

export function labelPredicate(predicateIri: string, labeler?: CardPredicateLabeler) {
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

  const photoCell = PHOTO_PREDICATES
    .map((predicate) => cells.find((cell) => cell.predicate === predicate && cell.values.some((value) => !isRdfLiteralToken(value))))
    .find(Boolean)
  const photoValue = photoCell?.values.find((value) => !isRdfLiteralToken(value))
  const photoIri = photoValue ? expandRdfIri(photoValue, documentUri, prefixes) : null

  return {
    // The row's own address, as written in the document, so edits patch the right subject.
    subjectIri: rowSubjectIri(row, documentUri, prefixes),
    photoUri: photoIri && /^https?:\/\//.test(photoIri) ? photoIri : null,
    photoPredicate: photoCell?.predicate ?? null,
    title,
    titlePredicate: titleCell?.predicate ?? null,
    bodyPredicate,
    bodyText: bodyCell ? bodyCell.values.map(displayRdfValue).join('\n\n') : '',
    bodyValueTokens: bodyCell ? bodyCell.values.map((value) => toPatchValueToken(value, documentUri, prefixes)) : [],
    typeLabels: typeIris.map((iri) => labeler?.(iri) || localRdfName(iri)),
    properties: cells
      .filter((cell) => (
        cell.predicate !== RDF_TYPE_IRI
        && cell.predicate !== titleCell?.predicate
        && cell.predicate !== bodyPredicate
        && cell.predicate !== photoCell?.predicate
      ))
      .map((cell) => cellModel(cell.predicate, cell.values, documentUri, prefixes, labeler)),
  }
}

// ---------------------------------------------------------------------------
// The table's columns as the card's properties (R6 K2)
// ---------------------------------------------------------------------------

export interface CardColumnModel extends CardPropertyModel {
  /** The same editor kinds the table cells use. */
  editorKind: StructuredCellEditorValueKind
  /** What the editor starts with (plain text, not RDF tokens). */
  editorValues: string[]
  /** Choices for an option column. */
  options: string[]
}

function columnEditorValues(plan: ReturnType<typeof resolveStructuredCellEditorPlan>, property: CardPropertyModel): {
  kind: StructuredCellEditorValueKind
  values: string[]
} {
  if (plan.kind === 'scalar') return { kind: plan.scalarKind, values: plan.value ? [plan.value] : [] }
  if (plan.kind === 'boolean') return { kind: 'boolean', values: [plan.value] }
  if (plan.kind === 'relation') return { kind: 'relation', values: property.links.filter((link): link is string => !!link) }
  if (plan.kind === 'enum') return { kind: plan.multi ? 'multi-select' : 'enum', values: [...property.displayValues] }
  return { kind: 'text', values: [...property.displayValues] }
}

/**
 * The columns of the table this card is a row of, in the table's order, each with the editor the
 * table would use. The title, the body, the avatar and the type are shown elsewhere in the card.
 */
export function projectCardColumns({
  projection,
  documentUri,
  subject,
  vocabDefinitionIndex,
}: {
  projection: StructuredTableProjection
  documentUri: string
  subject: CardSubjectModel
  vocabDefinitionIndex?: StructuredVocabDefinitionIndex
}): CardColumnModel[] {
  const row = findCardSubjectRow(projection, documentUri, subject.subjectIri)
  if (!row) return []
  const prefixes = projection.prefixes
  const rowClass = row.cells.find((cell) => cell.predicate === 'rdf:type')?.values[0] ?? null
  const scoped = rowClass ? projectStructuredClassScope(projection, rowClass) : projection
  const columns = vocabDefinitionIndex
    ? projectStructuredVocabSchemaColumns(scoped, vocabDefinitionIndex, rowClass).predicates
    : scoped.predicates
  const hidden = new Set<string | null>([RDF_TYPE_IRI, subject.titlePredicate, subject.bodyPredicate, subject.photoPredicate])
  const seen = new Set<string>()
  const result: CardColumnModel[] = []
  for (const column of columns) {
    const predicate = expandRdfIri(column, documentUri, prefixes)
    if (hidden.has(predicate) || seen.has(predicate) || isStructuredCardBodyPredicate(column, prefixes)) continue
    seen.add(predicate)
    const definition = vocabDefinitionIndex
      ? lookupPredicateDefinition(vocabDefinitionIndex, column) ?? lookupPredicateDefinition(vocabDefinitionIndex, predicate)
      : undefined
    const labeler: CardPredicateLabeler = () => definition?.label
    const existing = subject.properties.find((property) => property.predicate === predicate)
    const property = existing ?? cellModel(predicate, [], documentUri, prefixes, labeler)
    const rawValues = row.cells.find((cell) => expandRdfIri(cell.predicate, documentUri, prefixes) === predicate)?.values ?? []
    const editor = columnEditorValues(resolveStructuredCellEditorPlan(definition, rawValues), property)
    const definitionOptions = (
      vocabDefinitionIndex?.enumOptionsByPredicate.get(column)
      ?? vocabDefinitionIndex?.enumOptionsByPredicate.get(predicate)
      ?? []
    ).map((option) => option.label).filter(Boolean)
    const observed = editor.kind === 'enum' || editor.kind === 'multi-select'
      ? projection.rows.flatMap((candidate) => (
        candidate.cells
          .filter((cell) => expandRdfIri(cell.predicate, documentUri, prefixes) === predicate)
          .flatMap((cell) => cell.values.map(displayRdfValue))
      ))
      : []
    result.push({
      ...property,
      label: definition?.label?.trim() || property.label,
      editorKind: editor.kind,
      editorValues: editor.values,
      options: Array.from(new Set([...definitionOptions, ...observed].filter(Boolean))),
    })
  }
  return result
}

/** The class (as the table spells it) a card's row is typed with: the scope its columns belong to. */
export function projectCardRowClass(projection: StructuredTableProjection, documentUri: string, subjectIri: string): string | null {
  const row = findCardSubjectRow(projection, documentUri, subjectIri)
  return row?.cells.find((cell) => cell.predicate === 'rdf:type')?.values[0] ?? null
}

/**
 * The write for a column edited in the card: null when nothing changed. `nextTokens` are what the
 * table's value editor commits (`"text"`, `<link>`, `5`, `"2026-10-01"^^xsd:date`).
 */
export function planCardColumnWrite({
  column,
  nextTokens,
  documentUri,
  prefixes,
}: {
  column: CardColumnModel
  nextTokens: readonly string[]
  documentUri: string
  prefixes: RdfPrefixes
}): CardValueWritePlan | null {
  const next = nextTokens.map((token) => toPatchValueToken(token, documentUri, prefixes))
  if (next.length === column.valueTokens.length && next.every((token, index) => token === column.valueTokens[index])) return null
  return { previousValues: [...column.valueTokens], nextValues: next }
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
  // A profile document describes a person: foaf:primaryTopic points at them,
  // so the person (not the document) is the card.
  const primaryTopicIri = (() => {
    const documentRow = findCardSubjectRow(projection, documentUri, documentUri)
    const cell = documentRow?.cells.find((candidate) => (
      expandRdfIri(candidate.predicate, documentUri, projection.prefixes) === FOAF_PRIMARY_TOPIC_IRI
    ))
    const value = cell?.values.find((candidate) => !isRdfLiteralToken(candidate))
    const iri = value ? expandRdfIri(value, documentUri, projection.prefixes) : null
    return iri && unique.includes(iri) ? iri : null
  })()
  const mainSubjectIri = primaryTopicIri
    ?? (unique.length === 1
      ? unique[0]
      : [...MAIN_SUBJECT_FRAGMENTS.map((fragment) => `${documentUri}#${fragment}`), documentUri]
        .find((candidate) => unique.includes(candidate)) ?? null)
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

/** Why a new card could not be made, in words a person can act on. */
export function projectNewCardMessage(reason: 'empty' | 'duplicate' | 'unavailable'): string {
  if (reason === 'duplicate') return '已经有同名的卡片了，换个名字吧'
  if (reason === 'empty') return '先给卡片起个名字'
  return '没能创建这张卡片，稍后再试'
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
