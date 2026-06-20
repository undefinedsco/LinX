export function normalizeSelectorChoice(value: unknown, options: readonly string[]): string | undefined {
  const direct = matchSelectorChoice(value, options)
  if (direct) {
    return direct
  }

  if (!isRecord(value)) {
    return undefined
  }

  for (const key of ['value', 'label', 'title', 'name', 'display', 'text', 'option', 'id']) {
    const match = matchSelectorChoice(value[key], options)
    if (match) {
      return match
    }
  }

  return undefined
}

function matchSelectorChoice(value: unknown, options: readonly string[]): string | undefined {
  const normalized = normalizeNonEmptyString(value)
  if (!normalized) {
    return undefined
  }

  return options.find((option) => option === normalized)
    ?? options.find((option) => stripAnsi(option).trim() === stripAnsi(normalized).trim())
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const normalized = value.trim()
  return normalized || undefined
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
