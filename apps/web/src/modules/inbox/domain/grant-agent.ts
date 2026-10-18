/**
 * Which assistant a grant was given to.
 *
 * The shared grant model has no assistant field, so the assistant is recorded
 * in the grant's existing `context` column as JSON: `{ "agent": "<agent IRI>" }`.
 * (`onBehalfOf` stays the person; `decisionBy` stays the person who granted.)
 * Grants without the key were made before this was recorded or apply to every
 * assistant ("通用").
 */
export const GRANT_AGENT_CONTEXT_KEY = 'agent'

function parseObject(context: string | null | undefined): Record<string, unknown> {
  const text = typeof context === 'string' ? context.trim() : ''
  if (!text) return {}
  try {
    const parsed: unknown = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    // Free text context is kept under `text`.
  }
  return { text }
}

/** The assistant IRI recorded on a grant; null = applies to every assistant. */
export function readGrantAgent(grant: { context?: string | null }): string | null {
  const value = parseObject(grant.context)[GRANT_AGENT_CONTEXT_KEY]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** `context` for a new grant, keeping anything already in it. */
export function writeGrantAgentContext(context: string | null | undefined, agentIri: string | null | undefined): string | undefined {
  const agent = agentIri?.trim()
  if (!agent) return context ?? undefined
  return JSON.stringify({ ...parseObject(context), [GRANT_AGENT_CONTEXT_KEY]: agent })
}

/**
 * Whether a grant applies to the assistant. Without an assistant to compare
 * (`agentIds` empty) every grant applies; grants with no recorded assistant
 * apply to everyone.
 */
export function grantAppliesToAgent(grant: { context?: string | null }, agentIds: readonly string[]): boolean {
  if (agentIds.length === 0) return true
  const agent = readGrantAgent(grant)
  return agent === null || agentIds.some((id) => sameAgent(agent, id))
}

/** An assistant may be named by its IRI or by its short id; compare both forms. */
function sameAgent(left: string, right: string): boolean {
  if (left === right) return true
  const tail = (value: string) => value.split(/[#/]/).filter(Boolean).pop() ?? value
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left]
  return longer.endsWith(`/${shorter}`) || longer.endsWith(`#${shorter}`) || (tail(left) === tail(right) && tail(left).length > 8)
}
