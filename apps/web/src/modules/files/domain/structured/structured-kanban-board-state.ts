export type StructuredKanbanBoardStateV1 = {
  version: 1
  laneOrder: string[]
  collapsedLaneIds: string[]
  scrollLeft: number
  cardOrder: Record<string, string[]>
}

export type StructuredKanbanBoardLaneSnapshot = {
  id: string
  subjects: string[]
}

export const DEFAULT_STRUCTURED_KANBAN_BOARD_STATE: StructuredKanbanBoardStateV1 = {
  version: 1,
  laneOrder: [],
  collapsedLaneIds: [],
  scrollLeft: 0,
  cardOrder: {},
}

function uniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.length > 0)))
}

function normalizeSavedState(value: unknown): StructuredKanbanBoardStateV1 {
  if (!value || typeof value !== 'object') return DEFAULT_STRUCTURED_KANBAN_BOARD_STATE
  const candidate = value as Partial<StructuredKanbanBoardStateV1> & Record<string, unknown>
  if (candidate.version !== 1) return DEFAULT_STRUCTURED_KANBAN_BOARD_STATE
  const scrollLeft = typeof candidate.scrollLeft === 'number' && Number.isFinite(candidate.scrollLeft)
    ? Math.max(0, Math.round(candidate.scrollLeft))
    : 0
  return {
    version: 1,
    laneOrder: uniqueStrings(candidate.laneOrder),
    collapsedLaneIds: uniqueStrings(candidate.collapsedLaneIds),
    scrollLeft,
    cardOrder: candidate.cardOrder && typeof candidate.cardOrder === 'object'
      ? Object.fromEntries(Object.entries(candidate.cardOrder).map(([laneId, subjects]) => [laneId, uniqueStrings(subjects)]))
      : {},
  }
}

export function reconcileStructuredKanbanBoardState({
  saved,
  lanes,
}: {
  saved: unknown
  lanes: readonly StructuredKanbanBoardLaneSnapshot[]
}): StructuredKanbanBoardStateV1 {
  const normalized = normalizeSavedState(saved)
  const liveLaneIds = new Set(lanes.map((lane) => lane.id))
  const laneOrder = [
    ...normalized.laneOrder.filter((laneId) => liveLaneIds.has(laneId)),
    ...lanes.map((lane) => lane.id).filter((laneId) => !normalized.laneOrder.includes(laneId)),
  ]
  const collapsedLaneIds = normalized.collapsedLaneIds.filter((laneId) => liveLaneIds.has(laneId))
  const cardOrder: Record<string, string[]> = {}

  for (const lane of lanes) {
    const liveSubjectSet = new Set(lane.subjects)
    const savedSubjects = normalized.cardOrder[lane.id] ?? []
    cardOrder[lane.id] = [
      ...savedSubjects.filter((subject) => liveSubjectSet.has(subject)),
      ...lane.subjects.filter((subject) => !savedSubjects.includes(subject)),
    ]
  }

  return {
    version: 1,
    laneOrder,
    collapsedLaneIds,
    scrollLeft: normalized.scrollLeft,
    cardOrder,
  }
}
