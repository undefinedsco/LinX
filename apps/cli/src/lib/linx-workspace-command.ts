import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { showLinxInteractiveError } from './linx-interactive-error-display.js'
import { showLinxInteractiveStatus } from './linx-interactive-status-display.js'
import { setLinxShellRuntimeCwd } from './linx-session-cwd-router.js'
import { resolveLinxSessionCwd } from './linx-session-metadata.js'

export async function changeInteractiveCwd(interactive: any, runtime: any, target: string | undefined): Promise<void> {
  if (!target) {
    showLinxInteractiveStatus(interactive, `Current workspace: ${resolveInteractiveCwd(interactive, runtime)}`)
    return
  }

  const nextCwd = resolve(resolveInteractiveCwd(interactive, runtime), target)
  if (!existsSync(nextCwd)) {
    showLinxInteractiveError(interactive, `Workspace not found: ${nextCwd}`)
    showLinxInteractiveStatus(interactive, undefined)
    return
  }
  if (!statSync(nextCwd).isDirectory()) {
    showLinxInteractiveError(interactive, `Workspace is not a directory: ${nextCwd}`)
    showLinxInteractiveStatus(interactive, undefined)
    return
  }

  process.chdir(nextCwd)
  setRuntimeCwd(interactive, runtime, nextCwd)
  await runtime?.backendCommandRouter?.setCwd?.(nextCwd)
  showLinxInteractiveStatus(interactive, `Workspace changed to ${nextCwd}. Session history stays in the current thread.`)
}

export function resolveInteractiveCwd(interactive: any, runtime: any): string {
  return resolveLinxSessionCwd({ interactive, runtime }, process.cwd())
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
