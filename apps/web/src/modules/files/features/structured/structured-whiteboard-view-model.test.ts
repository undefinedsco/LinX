import { describe, expect, it } from 'vitest'

import type { StructuredTableProjection } from '../../domain/structured/structured-table'
import {
  projectStructuredWhiteboardClampedPosition,
  projectStructuredWhiteboardViewModel,
} from './structured-whiteboard-view-model'

const projection: StructuredTableProjection = {
  prefixes: {},
  predicates: ['schema:name', 'rdf:type', 'summary'],
  rows: [
    {
      subject: '#a',
      cells: [
        { predicate: 'schema:name', values: ['"Alpha"'] },
        { predicate: 'rdf:type', values: ['udfs:Card'] },
        { predicate: 'summary', values: ['"First card"'] },
      ],
    },
    {
      subject: '#b',
      cells: [
        { predicate: 'schema:name', values: ['"Beta"'] },
        { predicate: 'rdf:type', values: ['udfs:Card'] },
      ],
    },
    {
      subject: '#c',
      cells: [
        { predicate: 'schema:name', values: ['"Gamma"'] },
      ],
    },
  ],
  warnings: [],
}

describe('projectStructuredWhiteboardViewModel', () => {
  it('projects selected nodes, layout merge, available rows, relation options, and relation geometry', () => {
    const model = projectStructuredWhiteboardViewModel({
      layout: { '#a': { x: 120, y: 88 } },
      projection,
      selectedSubjects: ['#a', '#b'],
      visualRelations: [{ id: 'visual-a-b', from: '#a', to: '#b', label: 'supports' }],
    })

    expect(model.cardCountLabel).toBe('白板中 2 张卡片')
    expect(model.nodes.map((node) => [node.subject, node.x, node.y])).toEqual([
      ['#a', 120, 88],
      ['#b', 260, 40],
    ])
    expect(model.nodes[0]).toMatchObject({
      openAriaLabel: '打开 subject #a',
      removeAriaLabel: '从白板移除 #a',
    })
    expect(model.availableRows.map((row) => row.subject)).toEqual(['#c'])
    expect(model.hasAvailableSubjectOptions).toBe(true)
    expect(model.relationSubjectOptions).toEqual(['#a', '#b'])
    expect(model.canCreateVisualRelation).toBe(true)
    expect(model.canClearSubjects).toBe(true)
    expect(model.isCanvasEmpty).toBe(false)
    expect(model.relations.map((relation) => relation.id)).toEqual(['visual-a-b'])
    expect(model.relationSegments).toEqual([{
      id: 'visual-a-b',
      source: 'visual',
      strokeDasharray: '2 6',
      x1: 210,
      x2: 350,
      y1: 130,
      y2: 82,
    }])
    expect(model.showRelationCount).toBe(true)
    expect(model.relationCountLabel).toBe('1 条关系线')
  })

  it('projects toolbar and canvas chrome outside the renderer', () => {
    const model = projectStructuredWhiteboardViewModel({
      projection,
      selectedSubjects: ['#a'],
    })

    expect(model.chrome).toEqual({
      toolsButtonAriaLabel: '白板工具',
      toolsButtonLabel: '白板工具',
      addSubjectButtonAriaLabel: '添加 subject 到白板',
      addSubjectButtonLabel: 'Subject',
      noAvailableSubjectOptionsLabel: '可见 subject 已全部加入白板',
      addRelationButtonAriaLabel: '添加视觉关系',
      addRelationButtonLabel: '关系',
      clearSubjectsButtonAriaLabel: '清空白板 subject',
      clearSubjectsButtonLabel: '清空',
      emptyCanvasMessage: '添加 subject 后会在白板中显示卡片。',
    })
  })

  it('projects toolbar/content availability for empty and fully selected boards', () => {
    const empty = projectStructuredWhiteboardViewModel({
      projection,
      selectedSubjects: [],
    })

    expect(empty.hasAvailableSubjectOptions).toBe(true)
    expect(empty.canCreateVisualRelation).toBe(false)
    expect(empty.canClearSubjects).toBe(false)
    expect(empty.isCanvasEmpty).toBe(true)
    expect(empty.showRelationCount).toBe(false)

    const allSelected = projectStructuredWhiteboardViewModel({
      projection,
      selectedSubjects: ['#a', '#b', '#c'],
    })

    expect(allSelected.hasAvailableSubjectOptions).toBe(false)
    expect(allSelected.canCreateVisualRelation).toBe(true)
    expect(allSelected.canClearSubjects).toBe(true)
  })

  it('clamps node positions with model-owned geometry rules', () => {
    expect(projectStructuredWhiteboardClampedPosition({
      position: { x: -10.4, y: 12.2 },
      frameSize: null,
    })).toEqual({ x: 16, y: 16 })

    expect(projectStructuredWhiteboardClampedPosition({
      position: { x: 999, y: 999 },
      frameSize: { width: 500, height: 300 },
    })).toEqual({ x: 308, y: 216 })

    expect(projectStructuredWhiteboardClampedPosition({
      position: { x: 40, y: 40 },
      frameSize: { width: 100, height: 40 },
    })).toEqual({ x: 16, y: 16 })
  })
})
