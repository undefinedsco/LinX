import * as fs from 'fs'
import { homedir, hostname } from 'os'
import * as path from 'path'

export interface LocalAccountSession {
  url?: string
  email?: string
  token?: string
  webId?: string
  podUrl?: string
  createdAt?: string
  ownerKey?: string
  ownerWebId?: string
}

export function getLocalAccountSessionPath(): string {
  return path.join(homedir(), '.linx', 'account.json')
}

export function loadLocalAccountSession(sessionPath = getLocalAccountSessionPath()): LocalAccountSession | null {
  if (!fs.existsSync(sessionPath)) {
    return null
  }

  try {
    const raw = JSON.parse(fs.readFileSync(sessionPath, 'utf-8')) as Record<string, unknown>
    const email = typeof raw.email === 'string' ? raw.email : undefined
    const webId = typeof raw.webId === 'string' ? raw.webId : undefined
    const ownerKey = email ?? webId
    const ownerWebId = webId

    return ownerKey || ownerWebId
      ? {
        url: typeof raw.url === 'string' ? raw.url : undefined,
        email,
        token: typeof raw.token === 'string' ? raw.token : undefined,
        webId,
        podUrl: typeof raw.podUrl === 'string' ? raw.podUrl : undefined,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : undefined,
        ownerKey,
        ownerWebId,
      }
      : null
  } catch {
    return null
  }
}

export function buildLocalMountSessionId(session: LocalAccountSession | null | undefined): string | null {
  if (!session?.ownerKey) {
    return null
  }

  const host = hostname()
  const createdAt = session.createdAt ?? 'unknown-session'
  const webId = session.ownerWebId ?? 'unknown-webid'
  return `${host}:${process.pid}:${session.ownerKey}:${webId}:${createdAt}`
}
