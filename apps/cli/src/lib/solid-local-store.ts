import { join } from 'node:path'
import { getSolidHomeDir } from './solid-auth-store.js'

export const SOLID_APPS_DIRNAME = 'apps'
export const SOLID_LINX_APP_DIRNAME = 'linx'
export const SOLID_LINX_AGENT_DIRNAME = 'agent'
export const SOLID_LINX_AUTO_MODE_DIRNAME = 'auto-mode'
export const SOLID_LINX_SYMPHONY_DIRNAME = 'symphony'
export const SOLID_LINX_PI_WEB_ACCESS_CONFIG_FILE_NAME = 'pi-web-access.json'

export function getSolidAppsDir(): string {
  return join(getSolidHomeDir(), SOLID_APPS_DIRNAME)
}

export function getSolidLinxAppDir(): string {
  const override = process.env.LINX_HOME?.trim()
  if (override) {
    return override
  }
  return join(getSolidAppsDir(), SOLID_LINX_APP_DIRNAME)
}

export function getSolidLinxAgentDir(): string {
  return join(getSolidLinxAppDir(), SOLID_LINX_AGENT_DIRNAME)
}

export function getSolidLinxAutoModeDir(): string {
  return join(getSolidLinxAppDir(), SOLID_LINX_AUTO_MODE_DIRNAME)
}

export function getSolidLinxSymphonyDir(): string {
  return join(getSolidLinxAppDir(), SOLID_LINX_SYMPHONY_DIRNAME)
}

export function getSolidLinxPiWebAccessConfigPath(): string {
  return join(getSolidLinxAppDir(), SOLID_LINX_PI_WEB_ACCESS_CONFIG_FILE_NAME)
}
