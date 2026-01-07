export const resolveRowId = (row?: Partial<Record<string, unknown>> | null): string | null => {
  if (!row) return null
  const record = row as Record<string, unknown>
  const candidate =
    record['@id'] ??
    record.subject ??
    record.id
  if (typeof candidate === 'string' && candidate.length > 0) {
    return candidate
  }
  return null
}

export const ensureRowId = (row?: Partial<Record<string, unknown>> | null, fallback?: string): string => {
  const resolved = resolveRowId(row) ?? fallback
  if (!resolved) {
    throw new Error('Record is missing an identifier')
  }
  return resolved
}

export const toTimestamp = (value: unknown, fallback = 0): number => {
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') {
    const ms = new Date(value).getTime()
    return Number.isNaN(ms) ? fallback : ms
  }
  if (typeof value === 'number') return value
  return fallback
}
