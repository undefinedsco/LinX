import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  LINX_ACCOUNT_SESSION_FILE_NAME,
  LINX_HOME_DIRNAME,
  parseAccountSession,
  type AccountSession,
} from '@linx/models/client'

export type StoredAccountSession = AccountSession

function linxDir(): string {
  return join(homedir(), LINX_HOME_DIRNAME)
}

export function getAccountSessionPath(): string {
  return join(linxDir(), LINX_ACCOUNT_SESSION_FILE_NAME)
}

export function saveAccountSession(session: StoredAccountSession): void {
  mkdirSync(linxDir(), { recursive: true })
  writeFileSync(getAccountSessionPath(), `${JSON.stringify(session, null, 2)}\n`, 'utf-8')
  chmodSync(getAccountSessionPath(), 0o600)
}

export function loadAccountSession(): StoredAccountSession | null {
  try {
    return parseAccountSession(JSON.parse(readFileSync(getAccountSessionPath(), 'utf-8')))
  } catch {
    return null
  }
}

export function clearAccountSession(): void {
  const path = getAccountSessionPath()
  if (existsSync(path)) {
    unlinkSync(path)
  }
}
