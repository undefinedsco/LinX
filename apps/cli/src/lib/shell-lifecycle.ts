import { spawn, type ChildProcess } from 'node:child_process'

export const LINX_TUI_NO_EXIT_MESSAGE_ENV = 'LINX_TUI_NO_EXIT_MESSAGE'

export type InteractiveShellLifecycle = {
  stop?: () => void
  showError?: (message: string) => void
}

export type ShellRestartRuntime = {
  spawnProcess: typeof spawn
  exitProcess: (code?: number) => never | void
  defer: (callback: () => void, delayMs: number) => unknown
  env: NodeJS.ProcessEnv
  execPath: string
  argv: string[]
  cwd: () => string
}

export type RestartInteractiveShellOptions = {
  runtime?: ShellRestartRuntime
  delayMs?: number
}

const DEFAULT_RESTART_DELAY_MS = 50

const defaultShellRestartRuntime: ShellRestartRuntime = {
  spawnProcess: spawn,
  exitProcess: (code?: number) => process.exit(code),
  defer: (callback, delayMs) => setTimeout(callback, delayMs),
  env: process.env,
  execPath: process.execPath,
  argv: process.argv,
  cwd: () => process.cwd(),
}

export function restartInteractiveShellProcess(
  interactive: InteractiveShellLifecycle,
  options: RestartInteractiveShellOptions = {},
): void {
  const runtime = options.runtime ?? defaultShellRestartRuntime
  stopInteractiveForRestart(interactive, runtime.env)
  runtime.defer(() => {
    const child = runtime.spawnProcess(runtime.execPath, runtime.argv.slice(1), {
      cwd: runtime.cwd(),
      env: runtime.env,
      stdio: 'inherit',
      detached: false,
    })
    waitForRestartedProcess(interactive, child, runtime)
  }, options.delayMs ?? DEFAULT_RESTART_DELAY_MS)
}

function stopInteractiveForRestart(interactive: InteractiveShellLifecycle, env: NodeJS.ProcessEnv): void {
  const previousNoExitMessage = env[LINX_TUI_NO_EXIT_MESSAGE_ENV]
  env[LINX_TUI_NO_EXIT_MESSAGE_ENV] = '1'
  try {
    interactive.stop?.()
  } finally {
    if (previousNoExitMessage === undefined) {
      delete env[LINX_TUI_NO_EXIT_MESSAGE_ENV]
    } else {
      env[LINX_TUI_NO_EXIT_MESSAGE_ENV] = previousNoExitMessage
    }
  }
}

function waitForRestartedProcess(
  interactive: InteractiveShellLifecycle,
  child: ChildProcess,
  runtime: ShellRestartRuntime,
): void {
  let settled = false

  child.on('error', (error) => {
    if (settled) {
      return
    }
    settled = true
    interactive.showError?.(`LinX restart failed: ${error.message}`)
    runtime.exitProcess(1)
  })

  child.on('close', (code, signal) => {
    if (settled) {
      return
    }
    settled = true
    runtime.exitProcess(resolveRestartExitCode(code, signal))
  })
}

function resolveRestartExitCode(code: number | null, signal: NodeJS.Signals | null): number {
  if (typeof code === 'number') {
    return code
  }
  if (signal === 'SIGINT') {
    return 130
  }
  if (signal === 'SIGTERM') {
    return 143
  }
  return 1
}
