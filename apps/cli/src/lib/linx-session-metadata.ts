export type LinxSessionMetadataSource = {
  interactive?: any
  runtime?: any
  session?: any
}

type LinxSessionMetadataArchiveSnapshot = {
  cwd?: string
  name?: string
  id?: string
}

export function resolveLinxSessionCwd(source: LinxSessionMetadataSource, fallback: string): string {
  const archive = resolveLinxSessionMetadataArchiveSnapshot(source)
  const candidates = [
    source.session?.cwd,
    archive.cwd,
    source.interactive?.session?.cwd,
    source.runtime?.cwd,
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
  return resolveLinxSessionMetadataArchiveSnapshot(source).name
}

export function resolveLinxSessionId(source: LinxSessionMetadataSource): string | undefined {
  const archive = resolveLinxSessionMetadataArchiveSnapshot(source)
  return normalizeLinxSessionMetadataString(
    source.session?.sessionId
      ?? source.interactive?.session?.sessionId
      ?? source.runtime?.sessionId
      ?? archive.id,
  )
}

function resolveLinxSessionMetadataArchiveSnapshot(source: LinxSessionMetadataSource): LinxSessionMetadataArchiveSnapshot {
  return {
    cwd: normalizeLinxSessionMetadataString(
      source.session?.sessionManager?.getCwd?.()
        ?? source.interactive?.sessionManager?.getCwd?.()
        ?? source.interactive?.session?.sessionManager?.getCwd?.()
        ?? source.runtime?.session?.sessionManager?.getCwd?.()
        ?? source.runtime?.sessionManager?.getCwd?.(),
    ),
    name: normalizeLinxSessionMetadataString(
      source.session?.sessionManager?.getSessionName?.()
        ?? source.interactive?.sessionManager?.getSessionName?.()
        ?? source.interactive?.session?.sessionManager?.getSessionName?.()
        ?? source.runtime?.session?.sessionManager?.getSessionName?.()
        ?? source.runtime?.sessionManager?.getSessionName?.(),
    ),
    id: normalizeLinxSessionMetadataString(
      source.session?.sessionManager?.getSessionId?.()
        ?? source.interactive?.sessionManager?.getSessionId?.()
        ?? source.interactive?.session?.sessionManager?.getSessionId?.()
        ?? source.runtime?.session?.sessionManager?.getSessionId?.()
        ?? source.runtime?.sessionManager?.getSessionId?.(),
    ),
  }
}

function normalizeLinxSessionMetadataString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
