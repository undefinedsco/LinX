import type { StructuredWhiteboardRelation } from '../../../domain/structured/structured-projections'
import type {
  StructuredWhiteboardSnapshotNode,
  StructuredWhiteboardSnapshotNodeKind,
  StructuredWhiteboardSnapshotV1,
} from '../../../domain/structured/structured-view-metadata'
import type { StructuredWhiteboardNode, StructuredWhiteboardViewModel } from '../structured-whiteboard-view-model'

export type LinxSubjectShapeProps = {
  resourceUri: string
  resourceKind: StructuredWhiteboardSnapshotNodeKind
  title: string
  summary: string
  classLabel?: string
  pending: boolean
  facts: Array<{ id: string; label: string }>
  w: number
  h: number
}

export type LinxSubjectShapeRecord = {
  id: string
  type: 'linx-subject'
  x: number
  y: number
  parentId?: string
  props: LinxSubjectShapeProps
}

export type LinxGroupRecord = {
  id: string
  type: 'linx-group'
  x: number
  y: number
  props: {
    title: string
    color: string
    w: number
    h: number
  }
}

export type LinxArrowRecord = {
  id: string
  type: 'arrow'
  x: number
  y: number
  props: {
    start: { x: number; y: number }
    end: { x: number; y: number }
  }
  meta: {
    linxRelationId: string
    linxRelationSource: StructuredWhiteboardRelation['source']
    fromResourceUri: string
    toResourceUri: string
    predicate: string
  }
}

export type LinxWhiteboardSnapshot = {
  groupRecords: LinxGroupRecord[]
  subjectShapes: LinxSubjectShapeRecord[]
  arrowRecords: LinxArrowRecord[]
}

type LinxWhiteboardRecordProps = Partial<LinxSubjectShapeProps> & {
  color?: string
  title?: string
  start?: { x: number; y: number }
  end?: { x: number; y: number }
}

export type LinxWhiteboardRecord = {
  id: string
  type: string
  x?: number
  y?: number
  parentId?: string
  props?: LinxWhiteboardRecordProps
  meta?: Record<string, unknown>
}

const DEFAULT_SUBJECT_WIDTH = 288
const DEFAULT_SUBJECT_HEIGHT = 160
const DEFAULT_GROUP_WIDTH = 640
const DEFAULT_GROUP_HEIGHT = 420

function hashResourceUri(resourceUri: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < resourceUri.length; index += 1) {
    hash ^= resourceUri.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function safeRecordSuffix(value: string) {
  return value.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'relation'
}

export function createLinxSubjectShapeId(resourceUri: string) {
  return `shape:linx-subject-${hashResourceUri(resourceUri)}`
}

export function createLinxRelationShapeId(relationId: string) {
  return `shape:linx-relation-${safeRecordSuffix(relationId)}`
}

export function createLinxGroupShapeId() {
  return `shape:linx-group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function projectLinxSubjectShape(node: StructuredWhiteboardNode): LinxSubjectShapeRecord {
  return {
    id: createLinxSubjectShapeId(node.subject),
    type: 'linx-subject',
    x: node.x,
    y: node.y,
    props: {
      resourceUri: node.subject,
      resourceKind: 'subject',
      title: node.title,
      summary: node.summary,
      classLabel: node.className ?? undefined,
      pending: false,
      facts: node.tags.slice(0, 2).map((tag, index) => ({ id: `tag-${index}`, label: tag })),
      w: DEFAULT_SUBJECT_WIDTH,
      h: DEFAULT_SUBJECT_HEIGHT,
    },
  }
}

export function projectLinxArrowRecord(
  relation: StructuredWhiteboardRelation,
  nodeBySubject: ReadonlyMap<string, StructuredWhiteboardNode>,
): LinxArrowRecord {
  const from = nodeBySubject.get(relation.from)
  const to = nodeBySubject.get(relation.to)
  const start = {
    x: (from?.x ?? 0) + DEFAULT_SUBJECT_WIDTH / 2,
    y: (from?.y ?? 0) + DEFAULT_SUBJECT_HEIGHT / 2,
  }
  const end = {
    x: (to?.x ?? start.x + 120) + DEFAULT_SUBJECT_WIDTH / 2,
    y: (to?.y ?? start.y) + DEFAULT_SUBJECT_HEIGHT / 2,
  }
  return {
    id: createLinxRelationShapeId(relation.id),
    type: 'arrow',
    x: start.x,
    y: start.y,
    props: {
      start: { x: 0, y: 0 },
      end: { x: end.x - start.x, y: end.y - start.y },
    },
    meta: {
      linxRelationId: relation.id,
      linxRelationSource: relation.source,
      fromResourceUri: relation.from,
      toResourceUri: relation.to,
      predicate: relation.predicate,
    },
  }
}

export function projectLinxWhiteboardSnapshot(
  model: StructuredWhiteboardViewModel,
  persistedSnapshot?: StructuredWhiteboardSnapshotV1,
): LinxWhiteboardSnapshot {
  type LiveNodeInstance = {
    node: StructuredWhiteboardNode
    persistedNode?: StructuredWhiteboardSnapshotNode
  }

  const persistedNodesByResourceUri = new Map<string, StructuredWhiteboardSnapshotNode[]>()
  for (const node of persistedSnapshot?.nodes ?? []) {
    const instances = persistedNodesByResourceUri.get(node.resourceUri) ?? []
    instances.push(node)
    persistedNodesByResourceUri.set(node.resourceUri, instances)
  }
  const liveNodes: LiveNodeInstance[] = model.nodes
    .flatMap<LiveNodeInstance>((node) => {
      const persistedNodes = persistedNodesByResourceUri.get(node.subject) ?? []
      if (persistedNodes.length === 0) return [{ node, persistedNode: undefined }]
      return persistedNodes.map((persistedNode) => ({
        node: { ...node, x: persistedNode.x, y: persistedNode.y },
        persistedNode,
      }))
    })
    .sort((left, right) => (left.persistedNode?.z ?? Number.MAX_SAFE_INTEGER)
      - (right.persistedNode?.z ?? Number.MAX_SAFE_INTEGER))
  const persistedGroupPositions = new Map(
    (persistedSnapshot?.nodes ?? [])
      .filter((node) => node.kind === 'group')
      .map((node) => [node.resourceUri, { x: node.x, y: node.y }]),
  )
  const nodeBySubject = new Map(liveNodes.map(({ node, persistedNode }) => {
    const groupPosition = persistedNode?.groupId
      ? persistedGroupPositions.get(persistedNode.groupId)
      : undefined
    return [node.subject, groupPosition
      ? { ...node, x: node.x + groupPosition.x, y: node.y + groupPosition.y }
      : node]
  }))
  return {
    groupRecords: (persistedSnapshot?.groups ?? []).map((group) => ({
      id: group.id,
      type: 'linx-group' as const,
      x: persistedSnapshot?.nodes.find((node) => node.kind === 'group' && node.resourceUri === group.id)?.x ?? 0,
      y: persistedSnapshot?.nodes.find((node) => node.kind === 'group' && node.resourceUri === group.id)?.y ?? 0,
      props: {
        title: group.title,
        color: group.color,
        w: persistedSnapshot?.nodes.find((node) => node.kind === 'group' && node.resourceUri === group.id)?.w ?? DEFAULT_GROUP_WIDTH,
        h: persistedSnapshot?.nodes.find((node) => node.kind === 'group' && node.resourceUri === group.id)?.h ?? DEFAULT_GROUP_HEIGHT,
      },
    })),
    subjectShapes: liveNodes.map(({ node, persistedNode }) => {
      const shape = projectLinxSubjectShape(node)
      if (!persistedNode) return shape
      return {
        ...shape,
        id: persistedNode.shapeId ?? shape.id,
        parentId: persistedNode.groupId,
        props: {
          ...shape.props,
          resourceKind: persistedNode.kind,
          w: persistedNode.w,
          h: persistedNode.h,
        },
      }
    }),
    arrowRecords: model.relations.map((relation) => projectLinxArrowRecord(relation, nodeBySubject)),
  }
}

function mergeSubjectShapeGeometry(current: LinxWhiteboardRecord | undefined, next: LinxSubjectShapeRecord) {
  if (!current || current.type !== 'linx-subject') return next
  return {
    ...next,
    x: typeof current.x === 'number' ? current.x : next.x,
    y: typeof current.y === 'number' ? current.y : next.y,
    props: {
      ...next.props,
      w: typeof current.props?.w === 'number' ? current.props.w : next.props.w,
      h: typeof current.props?.h === 'number' ? current.props.h : next.props.h,
    },
  }
}

export function reconcileLinxWhiteboardRecords(
  currentRecords: Record<string, LinxWhiteboardRecord>,
  snapshot: LinxWhiteboardSnapshot,
): Record<string, LinxWhiteboardRecord> {
  const nextRecords: Record<string, LinxWhiteboardRecord> = {}

  for (const group of snapshot.groupRecords) {
    nextRecords[group.id] = group
  }

  for (const shape of snapshot.subjectShapes) {
    nextRecords[shape.id] = mergeSubjectShapeGeometry(currentRecords[shape.id], shape)
  }

  for (const arrow of snapshot.arrowRecords) {
    nextRecords[arrow.id] = {
      ...arrow,
      meta: {
        ...(currentRecords[arrow.id]?.meta ?? {}),
        ...arrow.meta,
      },
    }
  }

  for (const [recordId, record] of Object.entries(currentRecords)) {
    if (record.type !== 'linx-subject' && record.type !== 'arrow') {
      nextRecords[recordId] = record
    }
  }

  return nextRecords
}
