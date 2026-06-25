export function normalizeMisclassifiedCloudCompletionPodTimeoutMessage(errorOrMessage: unknown): string | null {
  const message = stripAnsi(errorOrMessage instanceof Error ? errorOrMessage.message : String(errorOrMessage))
  const match = message.match(/LinX Pod request timed out after (\d+)s:\s+\w+\s+(https?:\/\/[^\s"'<>]+)/)
  if (!match) {
    return null
  }

  const [, seconds, rawUrl] = match
  try {
    const target = new URL(trimTrailingPunctuation(rawUrl))
    if (!isCloudChatCompletionsPath(target.pathname)) {
      return null
    }
  } catch {
    return null
  }

  return formatLinxCloudTransientMessage(`Request exceeded ${seconds}s.`)
}

export function formatLinxCliErrorMessage(errorOrMessage: unknown): string {
  return normalizeMisclassifiedCloudCompletionPodTimeoutMessage(errorOrMessage)
    ?? (errorOrMessage instanceof Error ? errorOrMessage.message : String(errorOrMessage))
}

export function formatLinxCloudTransientMessage(detail?: string): string {
  const suffix = detail?.trim()
  return suffix
    ? `LinX Cloud is temporarily unavailable. ${suffix} Please retry shortly.`
    : 'LinX Cloud is temporarily unavailable. Please retry shortly.'
}

export function isLinxCloudTransientMessage(errorOrMessage: unknown): boolean {
  const normalized = stripAnsi(errorOrMessage instanceof Error ? errorOrMessage.message : String(errorOrMessage)).toLowerCase()
  return normalized.includes('linx cloud is temporarily unavailable')
    || normalized.includes('chat request failed (500): fetch failed')
    || normalized.includes('outgoing request timed out')
    || (normalized.includes('502') && normalized.includes('bad gateway'))
    || (normalized.includes('503') && normalized.includes('service unavailable'))
    || (normalized.includes('504') && normalized.includes('gateway timeout'))
}

export function isLinxCloudAuthExpiredMessage(errorOrMessage: unknown): boolean {
  const normalized = stripAnsi(errorOrMessage instanceof Error ? errorOrMessage.message : String(errorOrMessage)).toLowerCase()
  return normalized.includes('linx cloud login expired')
    || normalized.includes('no linx cloud login found')
    || normalized.includes('invalid solid token')
    || (normalized.includes('401') && normalized.includes('unauthorized'))
}

function isCloudChatCompletionsPath(pathname: string): boolean {
  const segments = normalizePathname(pathname).split('/').filter(Boolean)
  return segments.length >= 3
    && /^v\d+$/.test(segments.at(-3) ?? '')
    && segments.at(-2) === 'chat'
    && segments.at(-1) === 'completions'
}

function normalizePathname(pathname: string): string {
  const normalized = pathname.endsWith('/') ? pathname : `${pathname}/`
  return normalized.replace(/\/{2,}/g, '/')
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
}

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[),.;:!?]+$/g, '')
}
