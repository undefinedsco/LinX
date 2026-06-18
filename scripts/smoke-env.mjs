function normalize(value) {
  return String(value ?? '').trim()
}

function parseAssignmentMap(value) {
  const raw = normalize(value)
  if (!raw) return {}

  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {}
      }
      return Object.fromEntries(
        Object.entries(parsed)
          .map(([key, item]) => [normalize(key).toLowerCase(), normalize(item)])
          .filter(([key, item]) => key && item),
      )
    } catch {
      return {}
    }
  }

  return Object.fromEntries(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const separator = item.indexOf('=')
        if (separator === -1) return ['', '']
        return [
          normalize(item.slice(0, separator)).toLowerCase(),
          normalize(item.slice(separator + 1)),
        ]
      })
      .filter(([key, item]) => key && item),
  )
}

export function shouldRunLiveSmoke(kind, env = process.env) {
  const requested = normalize(env.LINX_SMOKE_LIVE)
  if (!requested) return false
  const values = new Set(
    requested
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
  return values.has('all') || values.has(normalize(kind).toLowerCase())
}

export function getSmokePrompt(defaultPrompt, env = process.env) {
  return normalize(env.LINX_SMOKE_PROMPT) || defaultPrompt
}

export function getSmokeTimeoutMs(defaultTimeoutMs, env = process.env) {
  const value = Number(env.LINX_SMOKE_TIMEOUT_MS)
  return Number.isFinite(value) && value > 0 ? value : defaultTimeoutMs
}

export function getSmokeModel(kind, env = process.env) {
  return parseAssignmentMap(env.LINX_SMOKE_MODELS)[normalize(kind).toLowerCase()] || undefined
}

export function getSmokeBaseUrl(kind, defaultBaseUrl, env = process.env) {
  return parseAssignmentMap(env.LINX_SMOKE_BASE_URLS)[normalize(kind).toLowerCase()] || defaultBaseUrl
}
