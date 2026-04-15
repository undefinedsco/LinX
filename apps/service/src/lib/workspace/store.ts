import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'
import type { AuthorizedWorkspaceRecord } from './types'

const STORE_PATH = 'authorized-workspaces.json'

export interface AuthorizedWorkspaceStoreOptions {
  metadataDir?: string
  workspaceRoot?: string
}

function ensureDir(target: string): void {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true })
  }
}

function getDefaultMetadataDir(): string {
  return path.join(homedir(), 'Library', 'Application Support', 'LinX')
}

function getDefaultWorkspaceRoot(): string {
  return path.join(homedir(), 'LinX Workspaces')
}

export class AuthorizedWorkspaceStore {
  private readonly metadataDir: string
  private readonly workspaceRoot: string
  private readonly storePath: string
  private readonly rows = new Map<string, AuthorizedWorkspaceRecord>()

  public constructor(options: AuthorizedWorkspaceStoreOptions = {}) {
    this.metadataDir = options.metadataDir ?? getDefaultMetadataDir()
    this.workspaceRoot = options.workspaceRoot ?? getDefaultWorkspaceRoot()
    this.storePath = path.join(this.metadataDir, STORE_PATH)
    this.load()
  }

  public getWorkspaceRoot(): string {
    ensureDir(this.workspaceRoot)
    return this.workspaceRoot
  }

  public list(): AuthorizedWorkspaceRecord[] {
    return Array.from(this.rows.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  public get(id: string): AuthorizedWorkspaceRecord | null {
    return this.rows.get(id) ?? null
  }

  public save(record: AuthorizedWorkspaceRecord): AuthorizedWorkspaceRecord {
    this.rows.set(record.id, record)
    this.persist()
    return record
  }

  public remove(id: string): void {
    if (this.rows.delete(id)) {
      this.persist()
    }
  }

  private load(): void {
    ensureDir(this.metadataDir)
    ensureDir(this.workspaceRoot)

    if (!fs.existsSync(this.storePath)) {
      return
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as AuthorizedWorkspaceRecord[]
      for (const row of parsed) {
        this.rows.set(row.id, row)
      }
    } catch (error) {
      console.warn('[AuthorizedWorkspaceStore] Failed to load workspace store:', error)
    }
  }

  private persist(): void {
    ensureDir(this.metadataDir)
    fs.writeFileSync(this.storePath, JSON.stringify(this.list(), null, 2))
  }
}
