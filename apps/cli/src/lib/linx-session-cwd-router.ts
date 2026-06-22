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
