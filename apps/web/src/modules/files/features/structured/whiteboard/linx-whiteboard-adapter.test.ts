import { describe, expect, it } from 'vitest'

import type { StructuredWhiteboardViewModel } from '../structured-whiteboard-view-model'
import {
  createLinxSubjectShapeId,
  projectLinxWhiteboardSnapshot,
  reconcileLinxWhiteboardRecords,
} from './linx-whiteboard-adapter'

const baseModel: StructuredWhiteboardViewModel = {
  availableRows: [],
  canClearSubjects: true,
  canCreateVisualRelation: true,
  cardCountLabel: '白板中 2 张卡片',
  chrome: {
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
  },
  hasAvailableSubjectOptions: false,
  isCanvasEmpty: false,
  nodes: [
    {
      subject: '#a',
      title: 'Alpha',
      className: 'Card',
      summary: 'First card',
      tags: ['One', 'Two', 'Three'],
      x: 120,
      y: 88,
      openAriaLabel: '打开 subject #a',
      removeAriaLabel: '从白板移除 #a',
    },
    {
      subject: '#b',
      title: 'Beta',
      className: 'Card',
      summary: 'Second card',
      tags: [],
      x: 260,
      y: 40,
      openAriaLabel: '打开 subject #b',
      removeAriaLabel: '从白板移除 #b',
    },
  ],
  relationCountLabel: '1 条关系线',
  relations: [{
    id: 'visual-a-b',
    from: '#a',
    to: '#b',
    predicate: 'supports',
    source: 'visual',
  }],
  relationSegments: [],
  relationSubjectOptions: ['#a', '#b'],
  showRelationCount: true,
}

describe('linx whiteboard tldraw adapter', () => {
  it('derives stable tldraw-safe subject shape ids from resource URIs', () => {
    expect(createLinxSubjectShapeId('#a')).toBe(createLinxSubjectShapeId('#a'))
    expect(createLinxSubjectShapeId('#a')).not.toBe(createLinxSubjectShapeId('#b'))
    expect(createLinxSubjectShapeId('https://pod.example/ab')).not.toBe(createLinxSubjectShapeId('https://pod.example/ba'))
    expect(createLinxSubjectShapeId('https://pod.example/a#Card 1')).toMatch(/^shape:linx-subject-[a-z0-9]+$/)
  })

  it('projects resources into subject shapes without making content geometry authoritative', () => {
    const snapshot = projectLinxWhiteboardSnapshot(baseModel)

    expect(snapshot.subjectShapes).toEqual([
      expect.objectContaining({
        id: createLinxSubjectShapeId('#a'),
        type: 'linx-subject',
        x: 120,
        y: 88,
        props: expect.objectContaining({
          resourceUri: '#a',
          title: 'Alpha',
          summary: 'First card',
          classLabel: 'Card',
          facts: [
            { id: 'tag-0', label: 'One' },
            { id: 'tag-1', label: 'Two' },
          ],
          w: 288,
          h: 160,
        }),
      }),
      expect.objectContaining({
        id: createLinxSubjectShapeId('#b'),
        x: 260,
        y: 40,
        props: expect.objectContaining({ resourceUri: '#b', title: 'Beta' }),
      }),
    ])
    expect(snapshot.arrowRecords).toEqual([
      expect.objectContaining({
        id: 'shape:linx-relation-visual-a-b',
        type: 'arrow',
        x: 264,
        y: 168,
        props: {
          start: { x: 0, y: 0 },
          end: { x: 140, y: -48 },
        },
        meta: {
          linxRelationId: 'visual-a-b',
          linxRelationSource: 'visual',
          fromResourceUri: '#a',
          toResourceUri: '#b',
          predicate: 'supports',
        },
      }),
    ])
  })

  it('rehydrates persisted geometry while keeping resource content live', () => {
    const snapshot = projectLinxWhiteboardSnapshot(baseModel, {
      version: 1,
      camera: { x: 0, y: 0, z: 0.5 },
      nodes: [
        { resourceUri: 'shape:linx-group-sprint', x: 300, y: 200, w: 640, h: 420, z: 0, shapeId: 'shape:linx-group-sprint', kind: 'group' },
        { resourceUri: '#b', x: 70, y: 120, w: 360, h: 220, z: 1, groupId: 'shape:linx-group-sprint', kind: 'subject' },
        { resourceUri: '#a', x: 40, y: 70, w: 310, h: 190, z: 2, kind: 'subject' },
      ],
      groups: [{ id: 'shape:linx-group-sprint', title: 'Sprint', color: 'purple' }],
      visualRelations: [],
    })

    expect(snapshot.subjectShapes.map((shape) => shape.props.resourceUri)).toEqual(['#b', '#a'])
    expect(snapshot.subjectShapes[0]).toMatchObject({
      x: 70,
      y: 120,
      parentId: 'shape:linx-group-sprint',
      props: { resourceUri: '#b', title: 'Beta', w: 360, h: 220 },
    })
    expect(snapshot.subjectShapes[1]).toMatchObject({
      x: 40,
      y: 70,
      props: { resourceUri: '#a', title: 'Alpha', w: 310, h: 190 },
    })
    expect(snapshot.groupRecords).toEqual([
      expect.objectContaining({
        id: 'shape:linx-group-sprint',
        type: 'linx-group',
        x: 300,
        y: 200,
        props: expect.objectContaining({ title: 'Sprint', color: 'purple' }),
      }),
    ])
    expect(snapshot.arrowRecords[0]).toMatchObject({
      x: 184,
      y: 150,
      props: { start: { x: 0, y: 0 }, end: { x: 330, y: 250 } },
    })
  })

  it('projects copied resource shapes as separate visual instances with shared live content', () => {
    const snapshot = projectLinxWhiteboardSnapshot(baseModel, {
      version: 1,
      camera: { x: 0, y: 0, z: 1 },
      nodes: [
        { resourceUri: '#a', shapeId: 'shape:a-1', x: 10, y: 20, w: 288, h: 160, z: 0, kind: 'subject' },
        { resourceUri: '#a', shapeId: 'shape:a-2', x: 410, y: 20, w: 288, h: 160, z: 1, kind: 'subject' },
      ],
      groups: [],
      visualRelations: [],
    })

    expect(snapshot.subjectShapes.filter((shape) => shape.props.resourceUri === '#a')).toEqual([
      expect.objectContaining({ id: 'shape:a-1', x: 10, props: expect.objectContaining({ title: 'Alpha' }) }),
      expect.objectContaining({ id: 'shape:a-2', x: 410, props: expect.objectContaining({ title: 'Alpha' }) }),
    ])
  })

  it('reconciles content refreshes without overwriting subject geometry and refreshes relation geometry', () => {
    const currentRecords = {
      [createLinxSubjectShapeId('#a')]: {
        id: createLinxSubjectShapeId('#a'),
        type: 'linx-subject',
        x: 400,
        y: 220,
        props: {
          resourceUri: '#a',
          title: 'Old title',
          summary: '',
          pending: false,
          facts: [],
          w: 320,
          h: 180,
        },
      },
      'shape:linx-relation-visual-a-b': {
        id: 'shape:linx-relation-visual-a-b',
        type: 'arrow',
        x: 0,
        y: 0,
        props: {
          start: { x: 0, y: 0 },
          end: { x: 20, y: 20 },
        },
        meta: { linxRelationId: 'visual-a-b' },
      },
      'shape:orphan': {
        id: 'shape:orphan',
        type: 'linx-subject',
        props: { resourceUri: '#deleted' },
      },
    }

    const nextRecords = reconcileLinxWhiteboardRecords(currentRecords, projectLinxWhiteboardSnapshot(baseModel))

    expect(nextRecords[createLinxSubjectShapeId('#a')]).toMatchObject({
      x: 400,
      y: 220,
      props: {
        resourceUri: '#a',
        title: 'Alpha',
        w: 320,
        h: 180,
      },
    })
    expect(nextRecords['shape:linx-relation-visual-a-b']).toMatchObject({
      x: 264,
      y: 168,
      props: {
        start: { x: 0, y: 0 },
        end: { x: 140, y: -48 },
      },
      meta: expect.objectContaining({ linxRelationId: 'visual-a-b' }),
    })
    expect(nextRecords['shape:orphan']).toBeUndefined()
  })
})
