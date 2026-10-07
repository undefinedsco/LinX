import {
  projectStructuredWhiteboard,
  type StructuredWhiteboardRelation,
  type StructuredWhiteboardVisualRelation,
} from '../../domain/structured/structured-projections'
import type {
  StructuredTableProjection,
  StructuredTableRow,
} from '../../domain/structured/structured-table'
import type { StructuredWhiteboardPosition } from '../../domain/structured/structured-view-metadata'

export type { StructuredWhiteboardVisualRelation }

export const WHITEBOARD_CARD_WIDTH = 176
export const WHITEBOARD_CARD_HEIGHT = 68
const WHITEBOARD_FRAME_MARGIN = 16
const WHITEBOARD_RELATION_ANCHOR_X = 90
const WHITEBOARD_RELATION_ANCHOR_Y = 42
const EMPTY_WHITEBOARD_LAYOUT: Record<string, StructuredWhiteboardPosition> = {}
const EMPTY_WHITEBOARD_SUBJECTS: string[] = []

export type StructuredWhiteboardFrameSize = {
  width: number
  height: number
} | null

export type StructuredWhiteboardChrome = {
  toolsButtonAriaLabel: string
  toolsButtonLabel: string
  addSubjectButtonAriaLabel: string
  addSubjectButtonLabel: string
  noAvailableSubjectOptionsLabel: string
  addRelationButtonAriaLabel: string
  addRelationButtonLabel: string
  clearSubjectsButtonAriaLabel: string
  clearSubjectsButtonLabel: string
  emptyCanvasMessage: string
}

export type StructuredWhiteboardNodeChrome = {
  openAriaLabel: string
  removeAriaLabel: string
}

export type StructuredWhiteboardNode = ReturnType<typeof projectStructuredWhiteboard>['nodes'][number] & StructuredWhiteboardNodeChrome

export interface StructuredWhiteboardRelationSegment {
  id: string
  source: StructuredWhiteboardRelation['source']
  strokeDasharray: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface StructuredWhiteboardViewModel {
  availableRows: StructuredTableRow[]
  canClearSubjects: boolean
  canCreateVisualRelation: boolean
  cardCountLabel: string
  chrome: StructuredWhiteboardChrome
  hasAvailableSubjectOptions: boolean
  isCanvasEmpty: boolean
  nodes: StructuredWhiteboardNode[]
  relationCountLabel: string
  relations: StructuredWhiteboardRelation[]
  relationSegments: StructuredWhiteboardRelationSegment[]
  relationSubjectOptions: string[]
  showRelationCount: boolean
}

export function projectStructuredWhiteboardViewModel({
  layout = EMPTY_WHITEBOARD_LAYOUT,
  projection,
  selectedSubjects = EMPTY_WHITEBOARD_SUBJECTS,
  visualRelations = [],
}: {
  layout?: Record<string, StructuredWhiteboardPosition>
  projection: StructuredTableProjection
  selectedSubjects?: readonly string[]
  visualRelations?: readonly StructuredWhiteboardVisualRelation[]
}): StructuredWhiteboardViewModel {
  const whiteboard = projectStructuredWhiteboard(projection, selectedSubjects, visualRelations)
  const nodes = whiteboard.nodes.map((node) => ({
    ...node,
    ...(layout[node.subject] ?? {}),
    ...projectStructuredWhiteboardNodeChrome(node.subject),
  }))
  const selectedSubjectSet = new Set(selectedSubjects)
  const availableRows = projection.rows.filter((row) => !selectedSubjectSet.has(row.subject))
  const nodeSubjects = new Set(nodes.map((node) => node.subject))
  const relationSubjectOptions = selectedSubjects.filter((subject) => nodeSubjects.has(subject))
  const relationSegments = projectStructuredWhiteboardRelationSegments(whiteboard.relations, nodes)

  return {
    availableRows,
    canClearSubjects: selectedSubjects.length > 0,
    canCreateVisualRelation: relationSubjectOptions.length >= 2,
    cardCountLabel: `白板中 ${selectedSubjects.length} 张卡片`,
    chrome: projectStructuredWhiteboardChrome(),
    hasAvailableSubjectOptions: availableRows.length > 0,
    isCanvasEmpty: nodes.length === 0,
    nodes,
    relationCountLabel: `${whiteboard.relations.length} 条关系线`,
    relations: whiteboard.relations,
    relationSegments,
    relationSubjectOptions,
    showRelationCount: whiteboard.relations.length > 0,
  }
}

export function projectStructuredWhiteboardChrome(): StructuredWhiteboardChrome {
  return {
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
  }
}

export function projectStructuredWhiteboardNodeChrome(subject: string): StructuredWhiteboardNodeChrome {
  return {
    openAriaLabel: `打开 subject ${subject}`,
    removeAriaLabel: `从白板移除 ${subject}`,
  }
}

export function projectStructuredWhiteboardClampedPosition({
  frameSize,
  position,
}: {
  frameSize: StructuredWhiteboardFrameSize
  position: StructuredWhiteboardPosition
}): StructuredWhiteboardPosition {
  const roundedPosition = {
    x: Math.round(position.x),
    y: Math.round(position.y),
  }

  if (!frameSize || frameSize.width <= 0 || frameSize.height <= 0) {
    return {
      x: Math.max(WHITEBOARD_FRAME_MARGIN, roundedPosition.x),
      y: Math.max(WHITEBOARD_FRAME_MARGIN, roundedPosition.y),
    }
  }

  return {
    x: Math.max(
      WHITEBOARD_FRAME_MARGIN,
      Math.min(
        roundedPosition.x,
        Math.max(WHITEBOARD_FRAME_MARGIN, frameSize.width - WHITEBOARD_CARD_WIDTH - WHITEBOARD_FRAME_MARGIN),
      ),
    ),
    y: Math.max(
      WHITEBOARD_FRAME_MARGIN,
      Math.min(
        roundedPosition.y,
        Math.max(WHITEBOARD_FRAME_MARGIN, frameSize.height - WHITEBOARD_CARD_HEIGHT - WHITEBOARD_FRAME_MARGIN),
      ),
    ),
  }
}

function projectStructuredWhiteboardRelationSegments(
  relations: readonly StructuredWhiteboardRelation[],
  nodes: readonly ReturnType<typeof projectStructuredWhiteboard>['nodes'][number][],
): StructuredWhiteboardRelationSegment[] {
  const nodeBySubject = new Map(nodes.map((node) => [node.subject, node]))
  return relations.flatMap((relation) => {
    const from = nodeBySubject.get(relation.from)
    const to = nodeBySubject.get(relation.to)
    if (!from || !to) return []
    return [{
      id: relation.id,
      source: relation.source,
      strokeDasharray: projectStructuredWhiteboardRelationStrokeDasharray(relation.source),
      x1: from.x + WHITEBOARD_RELATION_ANCHOR_X,
      y1: from.y + WHITEBOARD_RELATION_ANCHOR_Y,
      x2: to.x + WHITEBOARD_RELATION_ANCHOR_X,
      y2: to.y + WHITEBOARD_RELATION_ANCHOR_Y,
    }]
  })
}

function projectStructuredWhiteboardRelationStrokeDasharray(source: StructuredWhiteboardRelation['source']) {
  return source === 'visual' ? '2 6' : '4 4'
}
