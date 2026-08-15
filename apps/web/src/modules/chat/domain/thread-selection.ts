export function chatThreadRefsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false
  if (left === right) return true
  if (left.includes('#') && right.includes('#')) return false
  const fragment = (value: string) => value.includes('#') ? value.slice(value.lastIndexOf('#') + 1) : value
  return fragment(left) === fragment(right)
}
export function readActiveBranchSelections(metadata: unknown): Record<string, string> {
  let value = metadata
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { return {} }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  let active = (value as Record<string, unknown>).active_branch_by_parent
  if (typeof active === 'string') {
    try { active = JSON.parse(active) } catch { return {} }
  }
  if (!active || typeof active !== 'object' || Array.isArray(active)) return {}
  return Object.fromEntries(Object.entries(active as Record<string, unknown>)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}
