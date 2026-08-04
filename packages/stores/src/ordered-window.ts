export type OrderedWindowSort<T> = {
  column: keyof T
  direction: 'asc' | 'desc'
}

export type OrderedWindowOptions<T> = {
  limit: number
  orderBy: OrderedWindowSort<T>[]
  maxResidentPages?: number
}

export type OrderedWindowCursor = {
  values: unknown[]
  id: string
}

export type OrderedWindowPage<T> = {
  id: string
  rows: T[]
  lastAccessed: number
  pinned?: boolean
}

type IdentifiedRow = { id?: string }

function comparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value
}

function compareValue(left: unknown, right: unknown): number {
  if (left === right) return 0
  if (left == null) return 1
  if (right == null) return -1

  const normalizedLeft = comparable(left)
  const normalizedRight = comparable(right)
  if (normalizedLeft === normalizedRight) return 0
  if (typeof normalizedLeft === 'string' && typeof normalizedRight === 'string') {
    return normalizedLeft.localeCompare(normalizedRight)
  }
  return normalizedLeft! < normalizedRight! ? -1 : 1
}

function requireId(row: IdentifiedRow): string {
  if (!row.id) throw new Error('Ordered window rows require id')
  return row.id
}

export function createOrderedWindowPolicy<T extends IdentifiedRow>(
  options: OrderedWindowOptions<T>,
) {
  if (!Number.isInteger(options.limit) || options.limit <= 0) {
    throw new Error('Ordered window limit must be a positive integer')
  }
  if (options.orderBy.length === 0) {
    throw new Error('Ordered window requires at least one sort column')
  }

  const compare = (left: T, right: T): number => {
    for (const sort of options.orderBy) {
      const result = compareValue(left[sort.column], right[sort.column])
      if (result !== 0) {
        return left[sort.column] == null || right[sort.column] == null
          ? result
          : (sort.direction === 'desc' ? -result : result)
      }
    }
    return requireId(left).localeCompare(requireId(right))
  }

  return {
    options,
    compare,
    sort: (rows: T[]): T[] => [...rows].sort(compare),
    cursorFor: (row: T): OrderedWindowCursor => ({
      values: options.orderBy.map((sort) => row[sort.column]),
      id: requireId(row),
    }),
    belongsBeforeOrAt: (row: T, cursor: OrderedWindowCursor): boolean => {
      const cursorRow = Object.fromEntries([
        ...options.orderBy.map((sort, index) => [sort.column, cursor.values[index]]),
        ['id', cursor.id],
      ]) as T
      return compare(row, cursorRow) <= 0
    },
  }
}

type OrderedWindowPolicy<T extends IdentifiedRow> = ReturnType<typeof createOrderedWindowPolicy<T>>

export function reconcileOrderedWindow<T extends IdentifiedRow>(
  rows: T[],
  incoming: T,
  policy: OrderedWindowPolicy<T>,
): { rows: T[]; entered: boolean; evicted?: T } {
  const incomingId = requireId(incoming)
  const previousIds = new Set(rows.map(requireId))
  const sorted = policy.sort([
    ...rows.filter((row) => requireId(row) !== incomingId),
    incoming,
  ])
  const retained = sorted.slice(0, policy.options.limit)
  const retainedIds = new Set(retained.map(requireId))

  return {
    rows: retained,
    entered: !previousIds.has(incomingId) && retainedIds.has(incomingId),
    evicted: rows.find((row) => !retainedIds.has(requireId(row))),
  }
}

export function removeFromOrderedWindow<T extends IdentifiedRow>(
  rows: T[],
  id: string,
  backfill: T | undefined,
  policy: OrderedWindowPolicy<T>,
): { rows: T[]; removed?: T } {
  const removed = rows.find((row) => requireId(row) === id)
  if (!removed) return { rows: [...rows] }
  const remaining = rows.filter((row) => requireId(row) !== id)
  const next = backfill
    ? remaining.filter((row) => requireId(row) !== requireId(backfill)).concat(backfill)
    : remaining
  return { rows: policy.sort(next).slice(0, policy.options.limit), removed }
}

export function captureOrderedWindowSnapshot<T>(rows: T[]): T[] {
  return structuredClone(rows)
}

export function restoreOrderedWindowSnapshot<T>(snapshot: T[]): T[] {
  return structuredClone(snapshot)
}

export function evictOrderedWindowPages<T>(
  pages: OrderedWindowPage<T>[],
  maxResidentPages: number,
): { pages: OrderedWindowPage<T>[]; evictedPages: OrderedWindowPage<T>[]; residentRows: T[] } {
  const retained = [...pages]
  const evictedPages: OrderedWindowPage<T>[] = []

  while (retained.length > maxResidentPages) {
    const candidate = retained
      .filter((page) => !page.pinned)
      .sort((left, right) => left.lastAccessed - right.lastAccessed)[0]
    if (!candidate) break
    retained.splice(retained.indexOf(candidate), 1)
    evictedPages.push(candidate)
  }

  return {
    pages: retained,
    evictedPages,
    residentRows: retained.flatMap((page) => page.rows),
  }
}
