import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { setLinxShellRuntimeCwd } from './linx-session-cwd-router.js'

export async function changeInteractiveCwd(interactive: any, runtime: any, target: string | undefined): Promise<void> {
  if (!target) {
    interactive.showStatus?.(`Current workspace: ${resolveInteractiveCwd(interactive, runtime)}`)
    interactive.ui?.requestRender?.()
    return
  }

  const nextCwd = resolve(resolveInteractiveCwd(interactive, runtime), target)
  if (!existsSync(nextCwd)) {
    interactive.showError?.(`Workspace not found: ${nextCwd}`)
    interactive.ui?.requestRender?.()
    return
  }
  if (!statSync(nextCwd).isDirectory()) {
    interactive.showError?.(`Workspace is not a directory: ${nextCwd}`)
    interactive.ui?.requestRender?.()
    return
  }

  process.chdir(nextCwd)
  setRuntimeCwd(interactive, runtime, nextCwd)
  await runtime?.backendCommandRouter?.setCwd?.(nextCwd)
  interactive.showStatus?.(`Workspace changed to ${nextCwd}. Session history stays in the current thread.`)
  interactive.ui?.requestRender?.()
}

export function resolveInteractiveCwd(interactive: any, runtime: any): string {
  const candidates = [
    interactive?.session?.cwd,
    runtime?.cwd,
    interactive?.sessionManager?.getCwd?.(),
    interactive?.session?.sessionManager?.getCwd?.(),
    process.cwd(),
  ]
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim()
    }
  }
  return process.cwd()
}

export function setRuntimeCwd(interactive: any, runtime: any, cwd: string): void {
  setLinxShellRuntimeCwd(interactive, runtime, cwd)
}

export function scheduleLinxCwdStartupNotice(interactive: any, sessionCwd: string): void {
  const storedCwd = interactive?.session?.cwd ?? sessionCwd
  const currentCwd = process.cwd()

  if (currentCwd === storedCwd) {
    return
  }

  setTimeout(() => {
    process.stdout.write(
      `\n\x1b[33m  Session was at ${storedCwd}\x1b[0m\n` +
      `\x1b[33m  You're now at  ${currentCwd}\x1b[0m\n`
    )
  }, 300)
}
