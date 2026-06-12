import { homedir } from 'node:os'
import { join } from 'node:path'

export const SOLID_HOME_DIRNAME = '.solid'
export const SOLID_AUTH_DIRNAME = 'auth'
export const SOLID_AUTH_CREDENTIALS_FILE_NAME = 'credentials.json'
export const SOLID_AUTH_ACCOUNT_SESSION_FILE_NAME = 'account.json'
export const SOLID_AUTH_OIDC_STORAGE_DIRNAME = 'oidc-storage'

export function getSolidHomeDir(): string {
  const override = process.env.SOLID_HOME?.trim()
  if (override) {
    return override
  }
  return join(homedir(), SOLID_HOME_DIRNAME)
}

export function getSolidAuthDir(): string {
  return join(getSolidHomeDir(), SOLID_AUTH_DIRNAME)
}

export function getSolidAuthCredentialsPath(): string {
  return join(getSolidAuthDir(), SOLID_AUTH_CREDENTIALS_FILE_NAME)
}

export function getSolidAuthAccountSessionPath(): string {
  return join(getSolidAuthDir(), SOLID_AUTH_ACCOUNT_SESSION_FILE_NAME)
}

export function getSolidAuthOidcStorageDir(): string {
  return join(getSolidAuthDir(), SOLID_AUTH_OIDC_STORAGE_DIRNAME)
}
