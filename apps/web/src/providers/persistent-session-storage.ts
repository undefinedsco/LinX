import type { IStorage } from '@inrupt/solid-client-authn-core'

const SECURE_STORAGE_PREFIX = 'solidClientAuthn:secure:'

/**
 * Inrupt's browser default keeps secure auth data in memory, which makes a
 * full renderer reload look like a logout. Keep it in an origin-scoped,
 * namespaced store so the remembered session can be restored across reloads.
 */
export class PersistentSessionStorage implements IStorage {
  private readonly prefix: string

  constructor(
    private readonly storage: Storage,
    kind: 'secure' | 'insecure',
  ) {
    this.prefix = kind === 'secure' ? SECURE_STORAGE_PREFIX : ''
  }

  async get(key: string): Promise<string | undefined> {
    return this.storage.getItem(this.key(key)) ?? undefined
  }

  async set(key: string, value: string): Promise<void> {
    this.storage.setItem(this.key(key), value)
  }

  async delete(key: string): Promise<void> {
    this.storage.removeItem(this.key(key))
  }

  private key(key: string): string {
    return `${this.prefix}${key}`
  }
}

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

let fallbackStorage: Storage | null = null

export function getPersistentBrowserStorage(): Storage {
  if (typeof window === 'undefined') {
    fallbackStorage ??= new MemoryStorage()
    return fallbackStorage
  }

  try {
    return window.localStorage
  } catch {
    fallbackStorage ??= new MemoryStorage()
    return fallbackStorage
  }
}
