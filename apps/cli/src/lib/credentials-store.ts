import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type AuthType = 'client_credentials' | 'oidc_oauth'

export interface StoredConfig {
  url: string
  webId: string
  authType: AuthType
}

export interface ClientCredentialsSecrets {
  clientId: string
  clientSecret: string
}

export interface OidcOAuthSecrets {
  oidcRefreshToken: string
  oidcAccessToken: string
  oidcExpiresAt: string
}

export type StoredSecrets = ClientCredentialsSecrets | OidcOAuthSecrets

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

function credentialDirs(): string[] {
  const home = homedir()
  return [join(home, '.linx'), join(home, '.xpod')]
}

export function isClientCredentials(secrets: StoredSecrets): secrets is ClientCredentialsSecrets {
  return 'clientId' in secrets && 'clientSecret' in secrets
}

export function getClientCredentials(creds: StoredCredentials): ClientCredentialsSecrets | null {
  return isClientCredentials(creds.secrets) ? creds.secrets : null
}

export function loadCredentials(): StoredCredentials | null {
  for (const sourceDir of credentialDirs()) {
    const configPath = join(sourceDir, 'config.json')
    const secretsPath = join(sourceDir, 'secrets.json')

    if (!existsSync(configPath) || !existsSync(secretsPath)) {
      continue
    }

    const config = readJson<Record<string, unknown>>(configPath)
    const secrets = readJson<Record<string, unknown>>(secretsPath)

    if (!config || !secrets) {
      continue
    }

    if (
      typeof config.url !== 'string' ||
      typeof config.webId !== 'string' ||
      typeof secrets.clientId !== 'string' ||
      typeof secrets.clientSecret !== 'string'
    ) {
      continue
    }

    return {
      url: config.url,
      webId: config.webId,
      authType: (config.authType as AuthType) || 'client_credentials',
      sourceDir,
      secrets: {
        clientId: secrets.clientId,
        clientSecret: secrets.clientSecret,
      },
    }
  }

  return null
}
