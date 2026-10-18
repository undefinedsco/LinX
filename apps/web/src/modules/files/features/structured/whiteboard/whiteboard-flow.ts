import type { Edge, Node } from '@xyflow/react'

import type { StructuredWhiteboardRelation } from '../../../domain/structured/structured-projections'
import {
  resolveWhiteboardSectionColor,
  type WhiteboardCanvas,
  type WhiteboardCanvasEdge,
  type WhiteboardCanvasNode,
  type WhiteboardCanvasSide,
} from '../../../domain/structured/structured-whiteboard-canvas'
import { whiteboardRelationLabel } from './whiteboard-relations'

export type WhiteboardCardState = 'ok' | 'deleted'

export interface WhiteboardCardContent {
  kind: 'row' | 'file' | 'text'
  title: string
  body: string
  className: string | null
  state: WhiteboardCardState
  /** Card URI for opening and relations; null for text and sections. */
  uri: string | null
  /** Row subject inside the viewed table, when this card is one of its rows. */
  subject: string | null
}

export interface WhiteboardCardData extends Record<string, unknown> {
  canvasNode: WhiteboardCanvasNode
  content: WhiteboardCardContent
}

export interface WhiteboardSectionData extends Record<string, unknown> {
  canvasNode: WhiteboardCanvasNode
  label: string
  color: string
}

export type WhiteboardFlowNode = Node<WhiteboardCardData, 'card'> | Node<WhiteboardSectionData, 'section'>

export interface WhiteboardEdgeData extends Record<string, unknown> {
  source: 'relation' | 'view'
}

export const WHITEBOARD_SIDES: readonly WhiteboardCanvasSide[] = ['top', 'right', 'bottom', 'left']

export function toFlowNodes(
  canvas: WhiteboardCanvas,
  contentOf: (node: WhiteboardCanvasNode) => WhiteboardCardContent,
  selectedIds: ReadonlySet<string>,
): WhiteboardFlowNode[] {
  const sections: WhiteboardFlowNode[] = []
  const cards: WhiteboardFlowNode[] = []
  let sectionIndex = 0
  for (const node of canvas.nodes) {
    const base = {
      id: node.id,
      position: { x: node.x, y: node.y },
      width: node.width,
      height: node.height,
      selected: selectedIds.has(node.id),
    }
    if (node.type === 'group') {
      sections.push({
        ...base,
        type: 'section',
        zIndex: 0,
        data: {
          canvasNode: node,
          label: node.label ?? '',
          color: resolveWhiteboardSectionColor(node.color, sectionIndex),
        },
      })
      sectionIndex += 1
    } else {
      cards.push({ ...base, type: 'card', zIndex: 1, data: { canvasNode: node, content: contentOf(node) } })
    }
  }
  return [...sections, ...cards]
}

export function toFlowEdges(
  canvas: WhiteboardCanvas,
  relations: readonly StructuredWhiteboardRelation[],
  nodeIdBySubject: ReadonlyMap<string, string>,
): Edge<WhiteboardEdgeData>[] {
  const edges: Edge<WhiteboardEdgeData>[] = []
  const seen = new Set<string>()
  for (const relation of relations) {
    if (relation.source !== 'rdf') continue
    const source = nodeIdBySubject.get(relation.from)
    const target = nodeIdBySubject.get(relation.to)
    if (!source || !target || source === target) continue
    const id = `relation:${relation.id}`
    if (seen.has(id)) continue
    seen.add(id)
    edges.push({
      id,
      source,
      target,
      label: whiteboardRelationLabel(relation.predicate),
      type: 'default',
      selectable: false,
      deletable: false,
      markerEnd: { type: 'arrowclosed' as never },
      zIndex: 2,
      data: { source: 'relation' },
    })
  }
  for (const edge of canvas.edges) {
    edges.push({
      id: edge.id,
      source: edge.fromNode,
      target: edge.toNode,
      sourceHandle: edge.fromSide ?? null,
      targetHandle: edge.toSide ?? null,
      label: edge.label,
      style: { strokeDasharray: '5 5' },
      zIndex: 2,
      data: { source: 'view' },
    })
  }
  return edges
}

export function isInside(inner: WhiteboardCanvasNode, outer: WhiteboardCanvasNode): boolean {
  const cx = inner.x + inner.width / 2
  const cy = inner.y + inner.height / 2
  return cx >= outer.x && cx <= outer.x + outer.width && cy >= outer.y && cy <= outer.y + outer.height
}

/** Ids of cards that sit inside a section, so they travel with it. */
export function nodesInsideSection(canvas: WhiteboardCanvas, sectionId: string): string[] {
  const section = canvas.nodes.find((node) => node.id === sectionId)
  if (!section || section.type !== 'group') return []
  return canvas.nodes.filter((node) => node.id !== sectionId && node.type !== 'group' && isInside(node, section)).map((node) => node.id)
}

export function moveCanvasNodes(
  canvas: WhiteboardCanvas,
  moves: ReadonlyMap<string, { x: number; y: number }>,
): WhiteboardCanvas {
  let changed = false
  const nodes = canvas.nodes.map((node) => {
    const next = moves.get(node.id)
    if (!next) return node
    const x = Math.round(next.x)
    const y = Math.round(next.y)
    if (x === node.x && y === node.y) return node
    changed = true
    return { ...node, x, y }
  })
  return changed ? { ...canvas, nodes } : canvas
}

export function removeCanvasNodes(canvas: WhiteboardCanvas, ids: ReadonlySet<string>): WhiteboardCanvas {
  if (ids.size === 0) return canvas
  return {
    nodes: canvas.nodes.filter((node) => !ids.has(node.id)),
    edges: canvas.edges.filter((edge) => !ids.has(edge.fromNode) && !ids.has(edge.toNode)),
  }
}

export function removeCanvasEdges(canvas: WhiteboardCanvas, ids: ReadonlySet<string>): WhiteboardCanvas {
  if (ids.size === 0) return canvas
  return { ...canvas, edges: canvas.edges.filter((edge) => !ids.has(edge.id)) }
}

export function addCanvasEdge(canvas: WhiteboardCanvas, edge: WhiteboardCanvasEdge): WhiteboardCanvas {
  return { ...canvas, edges: [...canvas.edges, edge] }
}

/** Sections go below cards in the stacking order. */
export function addCanvasNode(canvas: WhiteboardCanvas, node: WhiteboardCanvasNode): WhiteboardCanvas {
  return node.type === 'group'
    ? { ...canvas, nodes: [node, ...canvas.nodes] }
    : { ...canvas, nodes: [...canvas.nodes, node] }
}

export function patchCanvasNode(
  canvas: WhiteboardCanvas,
  id: string,
  patch: Partial<WhiteboardCanvasNode>,
): WhiteboardCanvas {
  return {
    ...canvas,
    nodes: canvas.nodes.map((node) => (node.id === id ? ({ ...node, ...patch } as WhiteboardCanvasNode) : node)),
  }
}

export function fileNameFromUri(uri: string): string {
  const bare = uri.split('#')[0].split('?')[0].replace(/\/+$/, '')
  const last = bare.slice(bare.lastIndexOf('/') + 1)
  try {
    return decodeURIComponent(last) || last
  } catch {
    return last
  }
}
