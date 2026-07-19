import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import { app } from 'electron'

function getLegacyLinxUserDataDir(): string {
  return path.join(os.homedir(), 'Library', 'Application Support', 'LinX')
}

export function resolveLinxUserDataDir(): string {
  try {
    const userData = app.getPath('userData')
    if (userData && userData.trim()) {
      const normalized = path.normalize(userData)
      const basename = path.basename(normalized)
      if (basename !== 'Electron') {
        return normalized
      }
    }

    const appName = app.getName?.()
    if (appName && appName !== 'Electron') {
      return userData
    }
  } catch {
    // Fallback to legacy path below when Electron userData is unavailable.
  }

  return getLegacyLinxUserDataDir()
}

export function resolveLinxLocalHomeDir(): string {
  return process.env.LINX_HOME?.trim() || path.join(resolveLinxUserDataDir(), 'local')
}

export function resolveLinxDefaultWorkspaceDir(): string {
  return process.env.LINX_DEFAULT_WORKSPACE_PATH?.trim() || path.join(resolveLinxLocalHomeDir(), 'workspace')
}

function pathCandidatesFromHere(): string[] {
  return [
    // apps/service/{src,dist}/lib -> repo root in dev and compiled service.
    path.resolve(__dirname, '..', '..', '..', '..'),
    // apps/service -> repo root when launched from the service package
    path.resolve(process.cwd(), '..', '..'),
    process.cwd(),
  ]
}

export function resolveLinxRepoRoot(): string | null {
  for (const candidate of pathCandidatesFromHere()) {
    if (
      fs.existsSync(path.join(candidate, 'package.json'))
      && fs.existsSync(path.join(candidate, 'apps', 'service', 'package.json'))
    ) {
      return candidate
    }
  }

  return null
}

export function prependLinxLocalBinToPath(): void {
  const repoRoot = resolveLinxRepoRoot()
  if (!repoRoot) {
    return
  }

  const pathKey = process.platform === 'win32' ? 'Path' : 'PATH'
  const currentPath = process.env[pathKey] || process.env.PATH || ''
  const delimiter = path.delimiter
  const additions = [
    path.join(repoRoot, 'node_modules', '.bin'),
    path.join(repoRoot, 'apps', 'service', 'node_modules', '.bin'),
  ].filter((candidate) => fs.existsSync(candidate))

  const existing = currentPath.split(delimiter).filter(Boolean)
  const merged = [
    ...additions.filter((candidate) => !existing.includes(candidate)),
    ...existing,
  ]

  process.env[pathKey] = merged.join(delimiter)
  if (pathKey !== 'PATH') {
    process.env.PATH = process.env[pathKey]
  }
}
