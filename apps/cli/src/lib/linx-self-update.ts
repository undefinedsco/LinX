import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { restartInteractiveShellProcess, type InteractiveShellLifecycle } from './shell-lifecycle.js'

export const LINX_UPDATE_PACKAGE_NAME = '@undefineds.co/linx'
export const LINX_CHANGELOG_URL = 'https://github.com/undefineds-co/linx-cli/releases'
export const LINX_CLI_VERSION = readLinxCliVersion()

type SelfUpdateRuntime = {
  spawnProcess: typeof spawn
  env: NodeJS.ProcessEnv
  restartShell: (interactive: InteractiveShellLifecycle) => Promise<void> | void
}

const defaultSelfUpdateRuntime: SelfUpdateRuntime = {
  spawnProcess: spawn,
  env: process.env,
  restartShell: restartInteractiveShellProcess,
}

export type InstallLinxSelfUpdateOptions = {
  runtime?: Partial<SelfUpdateRuntime>
}

export async function checkForNewLinxVersion(): Promise<string | undefined> {
  if (process.env.PI_OFFLINE) {
    return undefined
  }

  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(LINX_UPDATE_PACKAGE_NAME)}/latest`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) {
      return undefined
    }

    const body = await response.json() as { version?: string }
    const latest = typeof body.version === 'string' ? body.version.trim() : ''
    if (!latest || !isVersionNewer(latest, LINX_CLI_VERSION)) {
      return undefined
    }
    return latest
  } catch {
    return undefined
  }
}

export async function installLinxSelfUpdateAndRestart(
  interactive: InteractiveShellLifecycle & {
    showStatus?: (message: string) => void
    ui?: { requestRender?: () => void }
  },
  newVersion: string,
  options: InstallLinxSelfUpdateOptions = {},
): Promise<void> {
  interactive.showStatus?.(`Installing LinX ${newVersion}...`)
  interactive.ui?.requestRender?.()
  const runtime = {
    ...defaultSelfUpdateRuntime,
    ...options.runtime,
  }
  try {
    await runNpmInstallLatest(runtime)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    interactive.showError?.(`LinX update failed: ${message}`)
    return
  }

  interactive.showStatus?.(`LinX ${newVersion} installed. Restarting...`)
  interactive.ui?.requestRender?.()
  await runtime.restartShell(interactive)
}

function runNpmInstallLatest(runtime: SelfUpdateRuntime): Promise<void> {
  const npmCommand = runtime.env.npm_execpath || 'npm'
  const args = ['install', '-g', '--omit=peer', `${LINX_UPDATE_PACKAGE_NAME}@latest`]
  return new Promise((resolve, reject) => {
    const child = runtime.spawnProcess(npmCommand, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let stderr = ''
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(stderr.trim() || `npm install exited with code ${code ?? 'unknown'}`))
    })
  })
}

function readLinxCliVersion(): string {
  try {
    const raw = readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
    const pkg = JSON.parse(raw) as { version?: string }
    return typeof pkg.version === 'string' && pkg.version.trim() ? pkg.version.trim() : '0.1.0'
  } catch {
    return '0.1.0'
  }
}

export function isVersionNewer(candidate: string, current: string): boolean {
  const candidateVersion = parseSemverLike(candidate)
  const currentVersion = parseSemverLike(current)
  if (!candidateVersion || !currentVersion) {
    return candidate !== current
  }

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (candidateVersion[key] > currentVersion[key]) {
      return true
    }
    if (candidateVersion[key] < currentVersion[key]) {
      return false
    }
  }

  return !candidateVersion.prerelease && currentVersion.prerelease
}

function parseSemverLike(version: string): {
  major: number
  minor: number
  patch: number
  prerelease: boolean
} | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.+)?$/.exec(version.trim())
  if (!match) {
    return null
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: Boolean(match[4]),
  }
}
