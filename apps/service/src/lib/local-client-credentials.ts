import * as fs from 'fs'
import { homedir } from 'os'
import * as path from 'path'

export interface LocalClientCredentials {
  url: string
  webId: string
  clientId: string
  clientSecret: string
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>
  } catch {
    return null
  }
}

export function loadLocalClientCredentials(baseDir = path.join(homedir(), '.linx')): LocalClientCredentials | null {
  const configPath = path.join(baseDir, 'config.json')
  const secretsPath = path.join(baseDir, 'secrets.json')
  const config = readJson(configPath)
  const secrets = readJson(secretsPath)

  if (!config || !secrets) {
    return null
  }

  if (
    typeof config.url !== 'string'
    || typeof config.webId !== 'string'
    || typeof secrets.clientId !== 'string'
    || typeof secrets.clientSecret !== 'string'
  ) {
    return null
  }

  return {
    url: config.url,
    webId: config.webId,
    clientId: secrets.clientId,
    clientSecret: secrets.clientSecret,
  }
}
