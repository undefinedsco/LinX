import { chmodSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { IStorage } from '@inrupt/solid-client-authn-node'
import { LINX_HOME_DIRNAME } from '@undefineds.co/models/client'

function linxDir(): string {
  return join(homedir(), LINX_HOME_DIRNAME)
}

function storageDir(): string {
  return join(linxDir(), 'oidc-storage')
}

function keyPath(key: string): string {
  return join(storageDir(), encodeURIComponent(key))
}

export function createOidcSessionStorage(): IStorage {
  return {
    async get(key: string): Promise<string | undefined> {
      const path = keyPath(key)
      if (!existsSync(path)) {
        return undefined
      }

      return readFileSync(path, 'utf-8')
    },
    async set(key: string, value: string): Promise<void> {
      mkdirSync(storageDir(), { recursive: true })
      const path = keyPath(key)
      writeFileSync(path, value, 'utf-8')
      chmodSync(path, 0o600)
    },
    async delete(key: string): Promise<void> {
      const path = keyPath(key)
      if (existsSync(path)) {
        unlinkSync(path)
      }
    },
  }
}
