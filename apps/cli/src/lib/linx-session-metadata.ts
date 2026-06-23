export type LinxSessionMetadataSource = {
  interactive?: any
  runtime?: any
  session?: any
}

export function resolveLinxSessionCwd(source: LinxSessionMetadataSource, fallback: string): string {
  const candidates = [
    source.session?.cwd,
    source.interactive?.session?.cwd,
    source.runtime?.cwd,
    source.interactive?.sessionManager?.getCwd?.(),
    source.interactive?.session?.sessionManager?.getCwd?.(),
    source.runtime?.session?.sessionManager?.getCwd?.(),
    source.runtime?.sessionManager?.getCwd?.(),
    fallback,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  return fallback
}

export function resolveLinxSessionName(source: LinxSessionMetadataSource): string | undefined {
  return normalizeLinxSessionMetadataString(
    source.session?.sessionManager?.getSessionName?.()
      ?? source.interactive?.sessionManager?.getSessionName?.()
      ?? source.interactive?.session?.sessionManager?.getSessionName?.()
      ?? source.runtime?.session?.sessionManager?.getSessionName?.()
      ?? source.runtime?.sessionManager?.getSessionName?.(),
  )
}

export function resolveLinxSessionId(source: LinxSessionMetadataSource): string | undefined {
  return normalizeLinxSessionMetadataString(
    source.session?.sessionManager?.getSessionId?.()
      ?? source.interactive?.sessionManager?.getSessionId?.()
      ?? source.interactive?.session?.sessionManager?.getSessionId?.()
      ?? source.runtime?.session?.sessionManager?.getSessionId?.()
      ?? source.runtime?.sessionManager?.getSessionId?.(),
  )
}

function normalizeLinxSessionMetadataString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
