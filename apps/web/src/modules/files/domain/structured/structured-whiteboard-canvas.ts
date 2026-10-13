/**
 * Whiteboard layout stored as JSON Canvas 1.0 (https://jsoncanvas.org).
 *
 * The whiteboard is a view of a folder or table. Its layout (where each card
 * sits, how big it is, sections, and lines that are only drawn on this board)
 * is saved in the user's Pod as one `.canvas` file per viewed resource, so it
 * follows the user across devices instead of living in one browser.
 *
 * Mapping to JSON Canvas:
 * - a card for a table row or a file inside the Pod is a `file` node; the path is
 *   relative to the Pod root and a table row adds its `#fragment` as `subpath`;
 * - a card outside the Pod is a `link` node;
 * - free text is a `text` node; a section is a `group` node (`label`, `color`);
 * - a line that is only drawn on this board is an edge. A line that was turned
 *   into a relation is written onto the cards as RDF and is not kept here.
 */
import type { StructuredWhiteboardVisualRelation } from './structured-projections'
import type {
  StructuredWhiteboardPosition,
  StructuredWhiteboardSnapshotV1,
} from './structured-view-metadata'
import { filesDataResourceUri } from '../resource/files-rdf-contract'

export type WhiteboardCanvasSide = 'top' | 'right' | 'bottom' | 'left'
export type WhiteboardCanvasEnd = 'none' | 'arrow'

interface WhiteboardCanvasNodeBase {
  id: string
  x: number
  y: number
  width: number
  height: number
  color?: string
}

export interface WhiteboardCanvasTextNode extends WhiteboardCanvasNodeBase {
  type: 'text'
  text: string
}

export interface WhiteboardCanvasFileNode extends WhiteboardCanvasNodeBase {
  type: 'file'
  file: string
  subpath?: string
}

export interface WhiteboardCanvasLinkNode extends WhiteboardCanvasNodeBase {
  type: 'link'
  url: string
}

export interface WhiteboardCanvasGroupNode extends WhiteboardCanvasNodeBase {
  type: 'group'
  label?: string
}

export type WhiteboardCanvasNode =
  | WhiteboardCanvasTextNode
  | WhiteboardCanvasFileNode
  | WhiteboardCanvasLinkNode
  | WhiteboardCanvasGroupNode

export type WhiteboardCanvasCardNode = WhiteboardCanvasFileNode | WhiteboardCanvasLinkNode

export interface WhiteboardCanvasEdge {
  id: string
  fromNode: string
  fromSide?: WhiteboardCanvasSide
  fromEnd?: WhiteboardCanvasEnd
  toNode: string
  toSide?: WhiteboardCanvasSide
  toEnd?: WhiteboardCanvasEnd
  color?: string
  label?: string
}

export interface WhiteboardCanvas {
  nodes: WhiteboardCanvasNode[]
  edges: WhiteboardCanvasEdge[]
}

export const WHITEBOARD_CANVAS_FORMAT_VERSION = 1
export const WHITEBOARD_CANVAS_MIME_TYPE = 'application/json'

export const WHITEBOARD_CARD_DEFAULT_SIZE = { width: 240, height: 140 } as const
export const WHITEBOARD_TEXT_DEFAULT_SIZE = { width: 220, height: 60 } as const
export const WHITEBOARD_SECTION_DEFAULT_SIZE = { width: 420, height: 280 } as const

/** Section colors from the R6 board artboard (yellow, blue, green, gray, red, purple). */
export const WHITEBOARD_SECTION_COLORS = ['#F0D98C', '#BFD3EA', '#BFDDBF', '#D9D3CC', '#E8C3C3', '#D5C8E8'] as const

// JSON Canvas preset colors 1–6 are red, orange, yellow, green, cyan, purple.
const PRESET_SECTION_COLORS: Record<string, string> = {
  1: '#E8C3C3',
  2: '#F2CFA8',
  3: '#F0D98C',
  4: '#BFDDBF',
  5: '#BFD3EA',
  6: '#D5C8E8',
}

// Section colors saved by the earlier whiteboard used color names.
const LEGACY_SECTION_COLORS: Record<string, string> = {
  yellow: '#F0D98C',
  blue: '#BFD3EA',
  green: '#BFDDBF',
  gray: '#D9D3CC',
  grey: '#D9D3CC',
  red: '#E8C3C3',
  purple: '#D5C8E8',
  violet: '#D5C8E8',
  orange: '#F2CFA8',
}

const SIDES = new Set<WhiteboardCanvasSide>(['top', 'right', 'bottom', 'left'])
const ENDS = new Set<WhiteboardCanvasEnd>(['none', 'arrow'])

export function createEmptyWhiteboardCanvas(): WhiteboardCanvas {
  return { nodes: [], edges: [] }
}

export function isWhiteboardCanvasEmpty(canvas: WhiteboardCanvas): boolean {
  return canvas.nodes.length === 0 && canvas.edges.length === 0
}

export function isWhiteboardCanvasCardNode(node: WhiteboardCanvasNode): node is WhiteboardCanvasCardNode {
  return node.type === 'file' || node.type === 'link'
}

/** Resolves a section color (hex, JSON Canvas preset, or legacy name) to a hex color. */
export function resolveWhiteboardSectionColor(color: string | undefined | null, fallbackIndex = 0): string {
  const fallback = WHITEBOARD_SECTION_COLORS[Math.abs(fallbackIndex) % WHITEBOARD_SECTION_COLORS.length]
  if (!color) return fallback
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toUpperCase()
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split('').map((part) => `${part}${part}`).join('')}`.toUpperCase()
  }
  return PRESET_SECTION_COLORS[color] ?? LEGACY_SECTION_COLORS[color.toLowerCase()] ?? fallback
}

function finiteInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function defaultSizeFor(type: WhiteboardCanvasNode['type']) {
  if (type === 'group') return WHITEBOARD_SECTION_DEFAULT_SIZE
  if (type === 'text') return WHITEBOARD_TEXT_DEFAULT_SIZE
  return WHITEBOARD_CARD_DEFAULT_SIZE
}

function normalizeNode(value: unknown): WhiteboardCanvasNode | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const id = nonEmptyString(candidate.id)
  const type = candidate.type
  if (!id || (type !== 'text' && type !== 'file' && type !== 'link' && type !== 'group')) return null
  const size = defaultSizeFor(type)
  const base: WhiteboardCanvasNodeBase = {
    id,
    x: finiteInteger(candidate.x, 0),
    y: finiteInteger(candidate.y, 0),
    width: Math.max(1, finiteInteger(candidate.width, size.width)),
    height: Math.max(1, finiteInteger(candidate.height, size.height)),
  }
  const color = nonEmptyString(candidate.color)
  if (color) base.color = color

  if (type === 'text') {
    return { ...base, type, text: typeof candidate.text === 'string' ? candidate.text : '' }
  }
  if (type === 'file') {
    const file = nonEmptyString(candidate.file)
    if (!file) return null
    const node: WhiteboardCanvasFileNode = { ...base, type, file }
    const subpath = nonEmptyString(candidate.subpath)
    if (subpath) node.subpath = subpath.startsWith('#') ? subpath : `#${subpath}`
    return node
  }
  if (type === 'link') {
    const url = nonEmptyString(candidate.url)
    if (!url) return null
    return { ...base, type, url }
  }
  const node: WhiteboardCanvasGroupNode = { ...base, type }
  if (typeof candidate.label === 'string') node.label = candidate.label
  return node
}

function normalizeEdge(value: unknown, nodeIds: ReadonlySet<string>): WhiteboardCanvasEdge | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  const id = nonEmptyString(candidate.id)
  const fromNode = nonEmptyString(candidate.fromNode)
  const toNode = nonEmptyString(candidate.toNode)
  if (!id || !fromNode || !toNode || !nodeIds.has(fromNode) || !nodeIds.has(toNode)) return null
  const edge: WhiteboardCanvasEdge = { id, fromNode, toNode }
  if (SIDES.has(candidate.fromSide as WhiteboardCanvasSide)) edge.fromSide = candidate.fromSide as WhiteboardCanvasSide
  if (ENDS.has(candidate.fromEnd as WhiteboardCanvasEnd)) edge.fromEnd = candidate.fromEnd as WhiteboardCanvasEnd
  if (SIDES.has(candidate.toSide as WhiteboardCanvasSide)) edge.toSide = candidate.toSide as WhiteboardCanvasSide
  if (ENDS.has(candidate.toEnd as WhiteboardCanvasEnd)) edge.toEnd = candidate.toEnd as WhiteboardCanvasEnd
  const color = nonEmptyString(candidate.color)
  if (color) edge.color = color
  if (typeof candidate.label === 'string' && candidate.label.length > 0) edge.label = candidate.label
  return edge
}

/**
 * Tolerant reader: drops malformed nodes, duplicate ids and edges whose ends are
 * gone, so a partly broken file still opens with everything that is readable.
 */
export function normalizeWhiteboardCanvas(value: unknown): WhiteboardCanvas {
  if (!value || typeof value !== 'object') return createEmptyWhiteboardCanvas()
  const candidate = value as Record<string, unknown>
  const nodes: WhiteboardCanvasNode[] = []
  const nodeIds = new Set<string>()
  for (const item of Array.isArray(candidate.nodes) ? candidate.nodes : []) {
    const node = normalizeNode(item)
    if (!node || nodeIds.has(node.id)) continue
    nodeIds.add(node.id)
    nodes.push(node)
  }
  const edges: WhiteboardCanvasEdge[] = []
  const edgeIds = new Set<string>()
  for (const item of Array.isArray(candidate.edges) ? candidate.edges : []) {
    const edge = normalizeEdge(item, nodeIds)
    if (!edge || edgeIds.has(edge.id)) continue
    edgeIds.add(edge.id)
    edges.push(edge)
  }
  return { nodes, edges }
}

export interface ParsedWhiteboardCanvas {
  canvas: WhiteboardCanvas
  viewOf: string | null
}

/** Returns null when the content is not JSON at all. */
export function parseWhiteboardCanvas(content: string | null | undefined): ParsedWhiteboardCanvas | null {
  if (!content || !content.trim()) return { canvas: createEmptyWhiteboardCanvas(), viewOf: null }
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return null
  }
  const linx = value && typeof value === 'object'
    ? (value as Record<string, unknown>).linx
    : null
  const viewOf = linx && typeof linx === 'object' && typeof (linx as Record<string, unknown>).viewOf === 'string'
    ? (linx as Record<string, unknown>).viewOf as string
    : null
  return { canvas: normalizeWhiteboardCanvas(value), viewOf }
}

/**
 * Writes a JSON Canvas document. Nodes keep their array order (JSON Canvas uses
 * it as stacking order). A small `linx` block records which folder or table this
 * board is a view of; JSON Canvas readers ignore unknown keys.
 */
export function serializeWhiteboardCanvas(canvas: WhiteboardCanvas, { viewOf }: { viewOf: string }): string {
  return `${JSON.stringify({
    nodes: canvas.nodes,
    edges: canvas.edges,
    linx: { version: WHITEBOARD_CANVAS_FORMAT_VERSION, viewOf },
  }, null, '\t')}\n`
}

export function whiteboardCanvasSignature(canvas: WhiteboardCanvas): string {
  return JSON.stringify(canvas)
}

function hashText(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function stripLocator(uri: string): string {
  const hashIndex = uri.indexOf('#')
  const withoutHash = hashIndex >= 0 ? uri.slice(0, hashIndex) : uri
  const queryIndex = withoutHash.indexOf('?')
  return queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash
}

function ensureContainer(uri: string): string {
  return uri.endsWith('/') ? uri : `${uri}/`
}

function podRelativePath(uri: string, podRootUri: string | null | undefined): string | null {
  if (!podRootUri) return null
  const root = ensureContainer(podRootUri)
  return uri.startsWith(root) ? uri.slice(root.length) : null
}

/**
 * Where the board for `viewedUri` is stored: one JSON Canvas file per viewed
 * folder or table under the Pod's LinX data area. The name is derived from the
 * Pod-relative path so the board survives a move of the whole Pod.
 */
export function whiteboardCanvasResourceUri(podRootUri: string, viewedUri: string): string {
  const base = stripLocator(viewedUri)
  const key = podRelativePath(base, podRootUri) ?? base
  const segments = key.split('/').filter(Boolean)
  const lastSegment = segments[segments.length - 1] ?? 'space'
  let readable = lastSegment
  try {
    readable = decodeURIComponent(lastSegment)
  } catch {
    // Keep the raw segment.
  }
  const slug = readable
    .replace(/\.[a-z0-9]+$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'board'
  return filesDataResourceUri(podRootUri, `views/whiteboard/${slug}-${hashText(key)}.canvas`)
}

/** Absolute IRI for a table row subject such as `#a` inside `documentUri`. */
export function resolveWhiteboardSubjectUri(subject: string, documentUri: string): string {
  const trimmed = subject.trim().replace(/^<|>$/g, '')
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed
  try {
    return new URL(trimmed, documentUri).href
  } catch {
    return trimmed
  }
}

export type WhiteboardCardNodeTarget =
  | { type: 'file'; file: string; subpath?: string }
  | { type: 'link'; url: string }

/** How a card URI is written into a JSON Canvas node. */
export function whiteboardCardNodeTarget(cardUri: string, podRootUri: string | null | undefined): WhiteboardCardNodeTarget {
  const hashIndex = cardUri.indexOf('#')
  const resource = hashIndex >= 0 ? cardUri.slice(0, hashIndex) : cardUri
  const fragment = hashIndex >= 0 ? cardUri.slice(hashIndex) : ''
  const relative = podRelativePath(resource, podRootUri)
  if (relative === null || relative.length === 0) return { type: 'link', url: cardUri }
  return fragment.length > 1
    ? { type: 'file', file: relative, subpath: fragment }
    : { type: 'file', file: relative }
}

/** Card URI for a JSON Canvas `file` / `link` node, or null for text and sections. */
export function resolveWhiteboardCardNodeUri(node: WhiteboardCanvasNode, podRootUri: string | null | undefined): string | null {
  if (node.type === 'link') return node.url
  if (node.type !== 'file') return null
  const subpath = node.subpath ?? ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(node.file)) return `${node.file}${subpath}`
  if (!podRootUri) return null
  return `${ensureContainer(podRootUri)}${node.file.replace(/^\/+/, '')}${subpath}`
}

export function createWhiteboardCardNode({
  id,
  cardUri,
  podRootUri,
  position,
  size = WHITEBOARD_CARD_DEFAULT_SIZE,
}: {
  id: string
  cardUri: string
  podRootUri: string | null | undefined
  position: StructuredWhiteboardPosition
  size?: { width: number; height: number }
}): WhiteboardCanvasCardNode {
  const target = whiteboardCardNodeTarget(cardUri, podRootUri)
  const geometry = {
    id,
    x: Math.round(position.x),
    y: Math.round(position.y),
    width: Math.round(size.width),
    height: Math.round(size.height),
  }
  if (target.type === 'link') return { ...geometry, type: 'link', url: target.url }
  return target.subpath
    ? { ...geometry, type: 'file', file: target.file, subpath: target.subpath }
    : { ...geometry, type: 'file', file: target.file }
}

export function createWhiteboardCanvasId(prefix: string, taken: ReadonlySet<string>, seed = Date.now()): string {
  let counter = 0
  let id = `${prefix}-${seed.toString(36)}`
  while (taken.has(id)) {
    counter += 1
    id = `${prefix}-${seed.toString(36)}-${counter}`
  }
  return id
}

function legacyGridPosition(index: number): StructuredWhiteboardPosition {
  return { x: 40 + (index % 3) * 300, y: 40 + Math.floor(index / 3) * 200 }
}

/**
 * Turns a board saved by the earlier whiteboard (positions and sections kept in
 * browser view settings) into JSON Canvas, so nothing laid out before is lost.
 * Lines that were already bound to a relation stay in the data, not here.
 */
export function migrateLegacyWhiteboardToCanvas({
  documentUri,
  podRootUri,
  selectedSubjects,
  positions = {},
  snapshot,
  visualRelations = [],
}: {
  documentUri: string
  podRootUri: string | null | undefined
  selectedSubjects: readonly string[]
  positions?: Record<string, StructuredWhiteboardPosition>
  snapshot?: StructuredWhiteboardSnapshotV1 | null
  visualRelations?: readonly StructuredWhiteboardVisualRelation[]
}): WhiteboardCanvas {
  const snapshotNodes = snapshot?.nodes ?? []
  const groupNodes = new Map(snapshotNodes
    .filter((node) => node.kind === 'group')
    .map((node) => [node.resourceUri, node]))
  const nodes: WhiteboardCanvasNode[] = []
  const takenIds = new Set<string>()

  ;(snapshot?.groups ?? []).forEach((group, index) => {
    const geometry = groupNodes.get(group.id)
    const id = `section-${hashText(group.id)}`
    if (takenIds.has(id)) return
    takenIds.add(id)
    const section: WhiteboardCanvasGroupNode = {
      id,
      type: 'group',
      x: geometry?.x ?? 40 + index * 40,
      y: geometry?.y ?? 40 + index * 40,
      width: Math.max(1, geometry?.w ?? WHITEBOARD_SECTION_DEFAULT_SIZE.width),
      height: Math.max(1, geometry?.h ?? WHITEBOARD_SECTION_DEFAULT_SIZE.height),
      color: resolveWhiteboardSectionColor(group.color, index),
    }
    if (group.title) section.label = group.title
    nodes.push(section)
  })

  const subjects = Array.from(new Set(selectedSubjects.length > 0
    ? selectedSubjects
    : snapshotNodes.filter((node) => node.kind !== 'group').map((node) => node.resourceUri)))
  const nodeIdBySubject = new Map<string, string>()
  subjects.forEach((subject, index) => {
    const saved = snapshotNodes.find((node) => node.kind !== 'group' && node.resourceUri === subject)
    const group = saved?.groupId ? groupNodes.get(saved.groupId) : undefined
    const position = saved
      ? { x: saved.x + (group?.x ?? 0), y: saved.y + (group?.y ?? 0) }
      : positions[subject] ?? legacyGridPosition(index)
    const id = `card-${hashText(subject)}`
    if (takenIds.has(id)) return
    takenIds.add(id)
    nodeIdBySubject.set(subject, id)
    nodes.push(createWhiteboardCardNode({
      id,
      cardUri: resolveWhiteboardSubjectUri(subject, documentUri),
      podRootUri,
      position,
      size: saved ? { width: Math.max(1, saved.w), height: Math.max(1, saved.h) } : WHITEBOARD_CARD_DEFAULT_SIZE,
    }))
  })

  const legacyRelations = [
    ...visualRelations.map((relation) => ({ ...relation, predicate: undefined as string | undefined })),
    ...(snapshot?.visualRelations ?? []).map((relation) => ({
      id: relation.id,
      from: relation.from,
      to: relation.to,
      label: relation.label ?? '',
      predicate: relation.predicate,
    })),
  ]
  const edges: WhiteboardCanvasEdge[] = []
  const edgeIds = new Set<string>()
  for (const relation of legacyRelations) {
    if (relation.predicate) continue
    const fromNode = nodeIdBySubject.get(relation.from)
    const toNode = nodeIdBySubject.get(relation.to)
    if (!fromNode || !toNode || fromNode === toNode) continue
    const id = `edge-${hashText(relation.id)}`
    if (edgeIds.has(id)) continue
    edgeIds.add(id)
    const edge: WhiteboardCanvasEdge = { id, fromNode, toNode }
    const label = relation.label?.trim()
    if (label && label !== '视觉关系') edge.label = label
    edges.push(edge)
  }

  return { nodes, edges }
}

/**
 * How many cards another device moved or resized compared with the local copy,
 * so a conflict can be described in plain words.
 */
export function countWhiteboardCanvasMovedNodes(local: WhiteboardCanvas, remote: WhiteboardCanvas): {
  moved: number
  otherChanges: boolean
} {
  const localById = new Map(local.nodes.map((node) => [node.id, node]))
  let moved = 0
  let otherChanges = local.nodes.length !== remote.nodes.length
    || whiteboardCanvasSignature({ nodes: [], edges: local.edges }) !== whiteboardCanvasSignature({ nodes: [], edges: remote.edges })
  for (const node of remote.nodes) {
    const mine = localById.get(node.id)
    if (!mine) {
      otherChanges = true
      continue
    }
    const sameGeometry = mine.x === node.x && mine.y === node.y && mine.width === node.width && mine.height === node.height
    if (!sameGeometry) moved += 1
    const { x: _x, y: _y, width: _w, height: _h, ...mineRest } = mine
    const { x: _rx, y: _ry, width: _rw, height: _rh, ...remoteRest } = node
    if (JSON.stringify(mineRest) !== JSON.stringify(remoteRest)) otherChanges = true
  }
  return { moved, otherChanges }
}
