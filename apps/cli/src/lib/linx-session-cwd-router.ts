export function resolveLinxShellRuntimeCwd(interactive: any, runtime: any, fallback: string): string {
  const candidates = [
    interactive?.session?.cwd,
    runtime?.cwd,
    interactive?.sessionManager?.getCwd?.(),
    interactive?.session?.sessionManager?.getCwd?.(),
    fallback,
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  return fallback
}

export function setLinxInteractiveSessionCwd(interactive: any, cwd: string): void {
  if (interactive?.session && typeof interactive.session === 'object') {
    interactive.session.cwd = cwd
  }
}

export function setLinxRuntimeCwd(runtime: any, cwd: string): void {
  if (runtime && typeof runtime === 'object') {
    runtime.cwd = cwd
  }
}

export function setLinxShellRuntimeCwd(interactive: any, runtime: any, cwd: string): void {
  setLinxInteractiveSessionCwd(interactive, cwd)
  setLinxRuntimeCwd(runtime, cwd)
}
