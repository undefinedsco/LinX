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

  return `LinX Cloud request timed out after ${seconds}s.`
}

export function formatLinxCliErrorMessage(errorOrMessage: unknown): string {
  return normalizeMisclassifiedCloudCompletionPodTimeoutMessage(errorOrMessage)
    ?? (errorOrMessage instanceof Error ? errorOrMessage.message : String(errorOrMessage))
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
