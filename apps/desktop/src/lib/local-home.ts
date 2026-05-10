import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { app } from 'electron'

const LOCAL_HOME_ENV_KEY = 'LINX_LOCAL_HOME'

export interface LinxLocalPaths {
  home: string
  electronUserDataDir: string
  envFile: string
  runtimeEnvFile: string
  providersFile: string
  onboardingFile: string
  stateFile: string
  logsDir: string
  podDir: string
}

export function resolveLinxLocalHome(explicitBaseDir?: string): string {
  if (explicitBaseDir && explicitBaseDir.trim()) {
    return path.resolve(explicitBaseDir)
  }

  const configured = process.env[LOCAL_HOME_ENV_KEY]
  if (configured && configured.trim()) {
    return path.resolve(configured)
  }

  return path.join(resolveDesktopUserDataDir(), 'local')
}

export function resolveLinxLocalPaths(explicitBaseDir?: string): LinxLocalPaths {
  const home = resolveLinxLocalHome(explicitBaseDir)

  return {
    home,
    electronUserDataDir: path.join(home, 'electron'),
    envFile: path.join(home, '.env'),
    runtimeEnvFile: path.join(home, 'xpod.runtime.env'),
    providersFile: path.join(home, 'providers.json'),
    onboardingFile: path.join(home, 'local-onboarding.json'),
    stateFile: path.join(home, 'xpod-service.json'),
    logsDir: path.join(home, 'logs'),
    podDir: path.join(home, 'pod'),
  }
}

export function applyLinxLocalHomeToElectronUserData(explicitBaseDir?: string): string | null {
  const configured = explicitBaseDir ?? process.env[LOCAL_HOME_ENV_KEY]
  if (!configured || !configured.trim()) {
    return null
  }

  const electronUserDataDir = resolveLinxLocalPaths(configured).electronUserDataDir
  fs.mkdirSync(electronUserDataDir, { recursive: true })
  app.setPath('userData', electronUserDataDir)
  return electronUserDataDir
}

export function ensureLinxLocalHome(explicitBaseDir?: string): LinxLocalPaths {
  const paths = resolveLinxLocalPaths(explicitBaseDir)
  fs.mkdirSync(paths.home, { recursive: true })
  if (!explicitBaseDir) {
    migrateLegacyDesktopLocalArtifacts(paths)
  }
  return paths
}

function migrateLegacyDesktopLocalArtifacts(paths: LinxLocalPaths): void {
  const legacyRoot = resolveDesktopUserDataDir()
  if (path.resolve(legacyRoot) === path.resolve(paths.home)) {
    return
  }

  fs.mkdirSync(paths.home, { recursive: true })

  moveIfMissing(path.join(legacyRoot, '.env'), paths.envFile)
  moveIfMissing(path.join(legacyRoot, 'providers.json'), paths.providersFile)
  moveIfMissing(path.join(legacyRoot, 'local-onboarding.json'), paths.onboardingFile)
  moveIfMissing(path.join(legacyRoot, 'xpod-service.json'), paths.stateFile)
  moveIfMissing(path.join(legacyRoot, 'xpod.runtime.env'), paths.runtimeEnvFile)
  moveDirectoryContentsIfMissing(path.join(legacyRoot, 'logs'), paths.logsDir)
  moveDirectoryContentsIfMissing(path.join(legacyRoot, 'pod'), paths.podDir)
}

function moveIfMissing(source: string, target: string): void {
  if (!fs.existsSync(source) || fs.existsSync(target)) {
    return
  }

  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.renameSync(source, target)
}

function moveDirectoryContentsIfMissing(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir) || fs.existsSync(targetDir)) {
    return
  }

  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.renameSync(sourceDir, targetDir)
}

function resolveDesktopUserDataDir(): string {
  try {
    const userData = app.getPath('userData')
    if (userData && userData.trim()) {
      const normalized = path.normalize(userData)
      const basename = path.basename(normalized)
      if (basename !== 'Electron') {
        return normalized
      }
    }
  } catch {
    // fall through to legacy default below
  }

  return path.join(os.homedir(), 'Library', 'Application Support', '@linx', 'desktop')
}
