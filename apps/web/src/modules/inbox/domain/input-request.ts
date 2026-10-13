export interface InputRequestOption {
  value: string
  label: string
}

function toOption(raw: unknown): InputRequestOption | null {
  if (typeof raw === 'string') {
    const value = raw.trim()
    return value ? { value, label: value } : null
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>
    const value = typeof record.value === 'string' ? record.value.trim() : ''
    const label = typeof record.label === 'string' ? record.label.trim() : value
    if (!value && !label) return null
    return { value: value || label, label: label || value }
  }
  return null
}

/**
 * Input request options are stored as free text on the shared resource.
 * Accept the shapes runtimes emit today: a JSON list of strings or
 * `{ label, value }` objects, `{ options: [...] }`, or one option per line.
 */
export function parseInputRequestOptions(raw: string | null | undefined): InputRequestOption[] {
  const text = raw?.trim()
  if (!text) return []

  try {
    const parsed: unknown = JSON.parse(text)
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { options?: unknown }).options)
        ? (parsed as { options: unknown[] }).options
        : null
    if (list) {
      return list.map(toOption).filter((option): option is InputRequestOption => option !== null)
    }
  } catch {
    // Plain text options fall through to line parsing.
  }

  return text
    .split(/\r?\n/)
    .map((line) => toOption(line.replace(/^[-*]\s*/, '')))
    .filter((option): option is InputRequestOption => option !== null)
}

export function isSecretInputRequest(requestKind: string | null | undefined): boolean {
  return /secret|password|credential|token/i.test(requestKind ?? '')
}

export function isPendingInputRequestStatus(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'handling'
}

/**
 * The chat message that carries an answer straight into the waiting run.
 * The runtime treats a user message in the same thread as steering input.
 */
export function formatInputSteerMessage(prompt: string | null | undefined, answer: string): string {
  const question = (prompt ?? '').trim()
  const reply = answer.trim()
  return question ? `回答「${question}」：${reply}` : reply
}
