import * as os from 'os'
import * as path from 'path'
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
