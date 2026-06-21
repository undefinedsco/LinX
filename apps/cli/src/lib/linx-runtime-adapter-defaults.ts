export function resolveLinxRuntimeAdapterCwd(cwd?: string): string {
  return typeof cwd === 'string' && cwd.trim() ? cwd : process.cwd()
}
