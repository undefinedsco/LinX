export const getResourceId = (record?: Record<string, unknown> | null): string | null => {
  if (!record) return null
  const id = record.id
  if (typeof id === 'string' && id.length > 0) return id
  return null
}
