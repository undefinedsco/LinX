import * as os from 'os'
import * as path from 'path'

const SOLID_HOME_DIRNAME = '.solid'
const SOLID_APPS_DIRNAME = 'apps'
const SOLID_LINX_APP_DIRNAME = 'linx'
const SERVICE_LOCAL_DIRNAME = 'service'

export function resolveLinxUserDataDir(): string {
  return path.join(resolveLinxHomeDir(), SERVICE_LOCAL_DIRNAME)
}

export function resolveLinxLocalHomeDir(): string {
  return path.join(resolveLinxUserDataDir(), 'local')
}

export function resolveLinxDefaultWorkspaceDir(): string {
  return path.join(resolveLinxLocalHomeDir(), 'workspace')
}

function resolveSolidHomeDir(): string {
  const configured = process.env.SOLID_HOME?.trim()
  if (configured) {
    return path.resolve(configured)
  }

  return path.join(os.homedir(), SOLID_HOME_DIRNAME)
}

function resolveLinxHomeDir(): string {
  const configured = process.env.LINX_HOME?.trim()
  if (configured) {
    return path.resolve(configured)
  }

  return path.join(resolveSolidHomeDir(), SOLID_APPS_DIRNAME, SOLID_LINX_APP_DIRNAME)
}
