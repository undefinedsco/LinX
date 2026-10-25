import { describe, expect, it } from 'vitest'

import { findFreeWhiteboardPosition, type WhiteboardCanvas } from '../../../domain/structured/structured-whiteboard-canvas'
import {
  moveCanvasNodes,
  nodesInsideSection,
  projectWhiteboardRowFacts,
  removeCanvasNodes,
  toFlowEdges,
  toFlowNodes,
  type WhiteboardCardContent,
} from './whiteboard-flow'
import { whiteboardRelationLabel } from './whiteboard-relations'
import { projectStructuredResourceTable } from '../../../domain/structured/structured-table'

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

describe('findFreeWhiteboardPosition', () => {
  const card = (id: string, x: number, y: number) => ({ id, type: 'file', file: 'a.md', x, y, width: 300, height: 180 }) as never

  it('puts the first card at the top-left of the visible area', () => {
    expect(findFreeWhiteboardPosition({ nodes: [], area: { x: 0, y: 0, width: 1000, height: 600 } })).toEqual({ x: 24, y: 24 })
  })

  it('moves along to the next free slot instead of covering a card', () => {
    const position = findFreeWhiteboardPosition({ nodes: [card('a', 24, 24)], area: { x: 0, y: 0, width: 1000, height: 600 } })
    expect(position.x).toBeGreaterThanOrEqual(24 + 300)
    expect(position.y).toBe(24)
  })

  it('stays inside the visible area and falls back to below the cards when it is full', () => {
    const full = [card('a', 24, 24), card('b', 348, 24), card('c', 24, 228), card('d', 348, 228)]
    const position = findFreeWhiteboardPosition({ nodes: full, area: { x: 0, y: 0, width: 700, height: 440 } })
    expect(position).toEqual({ x: 24, y: 228 + 180 + 24 })
  })
})

describe('projectWhiteboardRowFacts', () => {
  const documentUri = 'https://pod.example/tasks.ttl'
  const projection = projectStructuredResourceTable({
    uri: documentUri,
    mimeType: 'text/turtle',
    source: [
      '@prefix dcterms: <http://purl.org/dc/terms/> .',
      '@prefix t: <https://pod.example/tasks.ttl#> .',
      '<#a> dcterms:title "写方案" ; t:p-se49e298 "进行中" ; t:p-1234567a "周五" ; t:empty "" .',
      '<#b> dcterms:title "无属性" .',
    ].join('\n'),
  })
  const labels: Record<string, string> = {
    'p-se49e298': '状态',
    'p-1234567a': '截止',
  }
  const labelOf = (predicate: string) => labels[predicate.split(/[#/:]/).pop() ?? ''] ?? predicate.split(/[#/:]/).pop() ?? predicate

  it('lists the columns by their names, not the title or internal ids', () => {
    const facts = projectWhiteboardRowFacts({ projection, documentUri, subject: '#a', labelOf })
    expect(facts).toEqual([
      { label: '截止', value: '周五' },
      { label: '状态', value: '进行中' },
    ])
  })

  it('leaves out a column that has no human name and caps the lines', () => {
    expect(projectWhiteboardRowFacts({ projection, documentUri, subject: '#a', labelOf: (predicate) => predicate.split(/[#/:]/).pop() ?? '' })).toEqual([])
    expect(projectWhiteboardRowFacts({ projection, documentUri, subject: '#a', labelOf, limit: 1 })).toHaveLength(1)
    expect(projectWhiteboardRowFacts({ projection, documentUri, subject: '#b', labelOf })).toEqual([])
    expect(projectWhiteboardRowFacts({ projection, documentUri, subject: '#missing', labelOf })).toEqual([])
  })
})
