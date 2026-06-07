import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import {
  isLinxClientCredentialsSecrets,
  parseLinxClientConfig,
  parseLinxClientSecrets,
  type LinxAuthType,
  type LinxClientConfig,
  type LinxClientCredentialsSecrets,
  type LinxClientSecrets,
  type LinxOidcOAuthSecrets,
} from '@undefineds.co/models/client'
import { getSolidAuthCredentialsPath, getSolidAuthDir } from './solid-auth-store.js'

export type AuthType = LinxAuthType
export type StoredConfig = LinxClientConfig
export type ClientCredentialsSecrets = LinxClientCredentialsSecrets
export type OidcOAuthSecrets = LinxOidcOAuthSecrets
export type StoredSecrets = LinxClientSecrets

export interface StoredCredentials extends StoredConfig {
  secrets: StoredSecrets
  sourceDir: string
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

function parseStoredCredentialsEnvelope(raw: unknown): StoredCredentials | null {
  const config = parseLinxClientConfig(raw)
  if (!config || typeof raw !== 'object' || raw === null || !('secrets' in raw)) {
    return null
  }

  const secrets = parseLinxClientSecrets((raw as { secrets?: unknown }).secrets)
  if (!secrets) {
    return null
  }

  return {
    url: config.url,
    webId: config.webId,
    authType: config.authType,
    sourceDir: getSolidAuthDir(),
    secrets,
  }
}

export function saveCredentials(creds: StoredConfig & { secrets: StoredSecrets }): void {
  const dir = getSolidAuthDir()
  mkdirSync(dir, { recursive: true })

  writeFileSync(
    getSolidAuthCredentialsPath(),
    `${JSON.stringify({
      url: creds.url,
      webId: creds.webId,
      authType: creds.authType,
      secrets: creds.secrets,
    }, null, 2)}\n`,
    'utf-8',
  )
  chmodSync(getSolidAuthCredentialsPath(), 0o600)
}

export function clearCredentials(): void {
  const path = getSolidAuthCredentialsPath()
  if (existsSync(path)) {
    unlinkSync(path)
  }
}

export function isClientCredentials(secrets: StoredSecrets): secrets is ClientCredentialsSecrets {
  return isLinxClientCredentialsSecrets(secrets)
}

export function getClientCredentials(creds: StoredCredentials): ClientCredentialsSecrets | null {
  return isClientCredentials(creds.secrets) ? creds.secrets : null
}

export function getClientCredentialId(secrets: ClientCredentialsSecrets): string {
  return secrets.clientId ?? (secrets as ClientCredentialsSecrets & { secret_id?: string }).secret_id ?? ''
}

export function getClientCredentialKey(secrets: ClientCredentialsSecrets): string {
  return secrets.clientSecret ?? (secrets as ClientCredentialsSecrets & { secret_key?: string }).secret_key ?? ''
}

export function getOidcOAuthSecrets(creds: StoredCredentials): OidcOAuthSecrets | null {
  const secrets = creds.secrets
  return 'oidcRefreshToken' in secrets && 'oidcAccessToken' in secrets && 'oidcExpiresAt' in secrets
    ? secrets
    : null
}

export function loadCredentials(): StoredCredentials | null {
  const path = getSolidAuthCredentialsPath()
  if (!existsSync(path)) {
    return null
  }

  return parseStoredCredentialsEnvelope(readJson<unknown>(path))
}
