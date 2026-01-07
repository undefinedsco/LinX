export const getResourceId = (record?: Record<string, unknown> | null): string | null => {
  if (!record) return null
  const byAtId = record['@id']
  if (typeof byAtId === 'string' && byAtId.length > 0) return byAtId
  const subject = record.subject
  if (typeof subject === 'string' && subject.length > 0) return subject
  const id = record.id
  if (typeof id === 'string' && id.length > 0) return id
  return null
}
