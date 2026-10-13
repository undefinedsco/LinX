import { describe, expect, it } from 'vitest'

import type { WhiteboardCanvas } from '../../../domain/structured/structured-whiteboard-canvas'
import {
  moveCanvasNodes,
  nodesInsideSection,
  removeCanvasNodes,
  toFlowEdges,
  toFlowNodes,
  type WhiteboardCardContent,
} from './whiteboard-flow'
import { whiteboardRelationLabel } from './whiteboard-relations'

const canvas: WhiteboardCanvas = {
  nodes: [
    { id: 'c1', type: 'text', text: 'x', x: 10, y: 10, width: 100, height: 60 },
    { id: 's1', type: 'group', x: 0, y: 0, width: 300, height: 200, label: '支持' },
    { id: 'c2', type: 'text', text: 'y', x: 500, y: 500, width: 100, height: 60 },
  ],
  edges: [{ id: 'e1', fromNode: 'c1', toNode: 'c2', fromSide: 'right' }],
}
const content: WhiteboardCardContent = { kind: 'text', title: '', body: '', className: null, state: 'ok', uri: null, subject: null }

describe('whiteboard flow mapping', () => {
  it('puts sections under cards and gives them a palette color', () => {
    const nodes = toFlowNodes(canvas, () => content, new Set(['c1']))
    expect(nodes.map((n) => n.id)).toEqual(['s1', 'c1', 'c2'])
    expect(nodes[0].type).toBe('section')
    expect((nodes[0].data as { color: string }).color).toMatch(/^#/)
    expect(nodes[1].selected).toBe(true)
  })

  it('draws stored relations solid and view-only lines dashed', () => {
    const edges = toFlowEdges(canvas, [
      { id: 'r', from: '#a', to: '#b', predicate: 'https://undefineds.co/vocab/supports', source: 'rdf' },
      { id: 'v', from: '#a', to: '#b', predicate: '先后', source: 'visual' },
    ], new Map([['#a', 'c1'], ['#b', 'c2']]))
    expect(edges).toHaveLength(2)
    expect(edges[0]).toMatchObject({ label: '支持', deletable: false })
    expect(edges[1]).toMatchObject({ id: 'e1', sourceHandle: 'right', style: { strokeDasharray: '5 5' } })
  })

  it('moves a section together with the cards inside it', () => {
    expect(nodesInsideSection(canvas, 's1')).toEqual(['c1'])
    const moved = moveCanvasNodes(canvas, new Map([['s1', { x: 50, y: 0 }], ['c1', { x: 60, y: 10 }]]))
    expect(moved.nodes.find((n) => n.id === 'c1')?.x).toBe(60)
    expect(moveCanvasNodes(moved, new Map())).toBe(moved)
  })

  it('drops lines when a card is removed and names relations without IRIs', () => {
    expect(removeCanvasNodes(canvas, new Set(['c2'])).edges).toHaveLength(0)
    expect(whiteboardRelationLabel('http://example.org/vocab/hasPart')).toBe('has Part')
  })
})
