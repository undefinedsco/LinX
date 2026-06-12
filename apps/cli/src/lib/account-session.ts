import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import {
  parseAccountSession,
  type AccountSession,
} from '@undefineds.co/models/client'
import { getSolidAuthAccountSessionPath, getSolidAuthDir } from './solid-auth-store.js'

export type StoredAccountSession = AccountSession

export function getAccountSessionPath(): string {
  return getSolidAuthAccountSessionPath()
}

export function saveAccountSession(session: StoredAccountSession): void {
  mkdirSync(getSolidAuthDir(), { recursive: true })
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
