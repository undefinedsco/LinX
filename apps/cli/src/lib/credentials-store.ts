import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  isLinxClientCredentialsSecrets,
  LINX_CONFIG_FILE_NAME,
  LINX_HOME_DIRNAME,
  LINX_SECRETS_FILE_NAME,
  parseLinxClientConfig,
  parseLinxClientSecrets,
  type LinxAuthType,
  type LinxClientConfig,
  type LinxClientCredentialsSecrets,
  type LinxClientSecrets,
  type LinxOidcOAuthSecrets,
} from '@undefineds.co/models/client'

export type AuthType = LinxAuthType
export type StoredConfig = LinxClientConfig
export type ClientCredentialsSecrets = LinxClientCredentialsSecrets
export type OidcOAuthSecrets = LinxOidcOAuthSecrets
export type StoredSecrets = LinxClientSecrets

export interface StoredCredentials extends StoredConfig {
  secrets: StoredSecrets
  sourceDir: string
}

function linxDir(): string {
  return join(homedir(), LINX_HOME_DIRNAME)
}

export function getConfigPath(): string {
  return join(linxDir(), LINX_CONFIG_FILE_NAME)
}

export function getSecretsPath(): string {
  return join(linxDir(), LINX_SECRETS_FILE_NAME)
}

function readJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

function credentialDirs(): string[] {
  return [linxDir()]
}

export function saveCredentials(creds: StoredConfig & { secrets: StoredSecrets }): void {
  const dir = linxDir()
  mkdirSync(dir, { recursive: true })

  writeFileSync(
    getConfigPath(),
    `${JSON.stringify({ url: creds.url, webId: creds.webId, authType: creds.authType }, null, 2)}\n`,
    'utf-8',
  )
  chmodSync(getConfigPath(), 0o644)

  writeFileSync(getSecretsPath(), `${JSON.stringify(creds.secrets, null, 2)}\n`, 'utf-8')
  chmodSync(getSecretsPath(), 0o600)
}

export function clearCredentials(): void {
  for (const path of [getConfigPath(), getSecretsPath()]) {
    if (existsSync(path)) {
      unlinkSync(path)
    }
  }
}

export function isClientCredentials(secrets: StoredSecrets): secrets is ClientCredentialsSecrets {
  return isLinxClientCredentialsSecrets(secrets)
}

export function getClientCredentials(creds: StoredCredentials): ClientCredentialsSecrets | null {
  return isClientCredentials(creds.secrets) ? creds.secrets : null
}

export function getOidcOAuthSecrets(creds: StoredCredentials): OidcOAuthSecrets | null {
  const secrets = creds.secrets
  return 'oidcRefreshToken' in secrets && 'oidcAccessToken' in secrets && 'oidcExpiresAt' in secrets
    ? secrets
    : null
}

export function loadCredentials(): StoredCredentials | null {
  for (const sourceDir of credentialDirs()) {
    const configPath = join(sourceDir, LINX_CONFIG_FILE_NAME)
    const secretsPath = join(sourceDir, LINX_SECRETS_FILE_NAME)

    if (!existsSync(configPath) || !existsSync(secretsPath)) {
      continue
    }

    const config = parseLinxClientConfig(readJson<unknown>(configPath))
    const secrets = parseLinxClientSecrets(readJson<unknown>(secretsPath))

    if (!config || !secrets) {
      continue
    }

    return {
      url: config.url,
      webId: config.webId,
      authType: config.authType,
      sourceDir,
      secrets,
    }
  }

  return null
}
