import open from 'open'
import * as fs from 'fs'
import * as path from 'path'
import { AuthorizedWorkspaceStore } from './store'
import type { LocalAccountSession } from '../local-account-session'
import { loadLocalAccountSession } from '../local-account-session'
import { XpodWorkspaceAdapter } from './xpod-workspace-adapter'
import { materializeAuthorizedWorkspace } from './materialize-workspace'
import type {
  AuthorizedWorkspaceRecord,
  AuthorizedWorkspaceSource,
  CreateAuthorizedWorkspaceInput,
} from './types'

type LocalSessionContext = LocalAccountSession

function makeWritableRecursive(target: string): void {
  if (!fs.existsSync(target)) {
    return
  }

  const stat = fs.statSync(target)
  if (stat.isDirectory()) {
    fs.chmodSync(target, 0o755)
    for (const entry of fs.readdirSync(target)) {
      makeWritableRecursive(path.join(target, entry))
    }
    return
  }

  fs.chmodSync(target, 0o644)
}

export class AuthorizedWorkspaceModule {
  constructor(
    private readonly store = new AuthorizedWorkspaceStore(),
    private readonly source: AuthorizedWorkspaceSource = new XpodWorkspaceAdapter(),
    private readonly sessionProvider: () => LocalSessionContext | null = loadLocalAccountSession,
  ) {}

  public list(): AuthorizedWorkspaceRecord[] {
    return this.store.list()
  }

  public get(id: string): AuthorizedWorkspaceRecord | null {
    return this.store.get(id)
  }

  public listForCurrentOwner(): AuthorizedWorkspaceRecord[] {
    const session = this.sessionProvider()
    if (!session?.ownerKey) {
      return []
    }
    return this.store.list().filter((record) => (
      record.ownerKey === session.ownerKey &&
      (session.ownerWebId ? record.ownerWebId === session.ownerWebId : true)
    ))
  }

  public getForCurrentOwner(id: string): AuthorizedWorkspaceRecord | null {
    const session = this.sessionProvider()
    if (!session?.ownerKey) {
      return null
    }

    const record = this.store.get(id)
    if (!record) {
      return null
    }

    if (record.ownerKey !== session.ownerKey) {
      return null
    }

    if (session.ownerWebId && record.ownerWebId && record.ownerWebId !== session.ownerWebId) {
      return null
    }

    return record
  }

  public peekOwnerContext(): LocalSessionContext | null {
    return this.sessionProvider()
  }

  public findLatestForOwner(ownerKey: string, ownerWebId?: string): AuthorizedWorkspaceRecord | null {
    return this.store.list().find((record) => (
      record.ownerKey === ownerKey &&
      (ownerWebId ? record.ownerWebId === ownerWebId : true)
    )) ?? null
  }

  public ensureCurrent(input: Omit<CreateAuthorizedWorkspaceInput, 'ownerKey' | 'ownerWebId'> = {}): AuthorizedWorkspaceRecord {
    const session = this.sessionProvider()
    const ownerKey = session?.ownerKey
    const ownerWebId = session?.ownerWebId

    if (!ownerKey) {
      throw new Error('No active Linx session available for current workspace')
    }

    const existing = this.findLatestForOwner(ownerKey, ownerWebId)
    if (existing && fs.existsSync(existing.rootPath)) {
      if (input.revealInFinder) {
        void open(existing.rootPath, { wait: false })
      }
      return existing
    }

    return this.create({
      ...input,
      ownerKey,
      ownerWebId,
    })
  }

  public create(input: CreateAuthorizedWorkspaceInput): AuthorizedWorkspaceRecord {
    const session = this.sessionProvider()

    if (session?.ownerKey && input.ownerKey && input.ownerKey !== session.ownerKey) {
      throw new Error('ownerKey does not match the active Linx session')
    }

    if (session?.ownerWebId && input.ownerWebId && input.ownerWebId !== session.ownerWebId) {
      throw new Error('ownerWebId does not match the active Linx session')
    }

    const ownerKey = session?.ownerKey ?? input.ownerKey
    const ownerWebId = session?.ownerWebId ?? input.ownerWebId

    if (!ownerKey) {
      throw new Error('ownerKey is required when no local Linx session is available')
    }

    const { snapshot, primitives } = this.source.resolveAuthorizedPrimitives({
      ownerWebId,
      podBaseUrls: input.podBaseUrls,
    })

    if (primitives.length === 0) {
      throw new Error('No authorized pod primitives were resolved for this workspace request')
    }

    const record = materializeAuthorizedWorkspace({
      workspaceRoot: this.store.getWorkspaceRoot(),
      input: {
        ...input,
        ownerKey,
        ownerWebId,
      },
      snapshot,
      primitives,
    })

    const saved = this.store.save(record)

    if (input.revealInFinder) {
      void open(saved.rootPath, { wait: false })
    }

    return saved
  }

  public async reveal(id: string): Promise<AuthorizedWorkspaceRecord> {
    const record = this.store.get(id)
    if (!record) {
      throw new Error(`Workspace not found: ${id}`)
    }

    await open(record.rootPath, { wait: false })
    return record
  }

  public async revealForCurrentOwner(id: string): Promise<AuthorizedWorkspaceRecord> {
    const record = this.getForCurrentOwner(id)
    if (!record) {
      throw new Error(`Workspace not found for current owner: ${id}`)
    }

    await open(record.rootPath, { wait: false })
    return record
  }

  public remove(id: string): AuthorizedWorkspaceRecord {
    const record = this.store.get(id)
    if (!record) {
      throw new Error(`Workspace not found: ${id}`)
    }

    makeWritableRecursive(record.rootPath)
    fs.rmSync(record.rootPath, { recursive: true, force: true })
    this.store.remove(id)
    return record
  }

  public removeForCurrentOwner(id: string): AuthorizedWorkspaceRecord {
    const record = this.getForCurrentOwner(id)
    if (!record) {
      throw new Error(`Workspace not found for current owner: ${id}`)
    }

    makeWritableRecursive(record.rootPath)
    fs.rmSync(record.rootPath, { recursive: true, force: true })
    this.store.remove(id)
    return record
  }

  public async revealCurrent(): Promise<AuthorizedWorkspaceRecord> {
    const record = this.ensureCurrent()
    await open(record.rootPath, { wait: false })
    return record
  }
}

let instance: AuthorizedWorkspaceModule | null = null

export function getAuthorizedWorkspaceModule(): AuthorizedWorkspaceModule {
  if (!instance) {
    instance = new AuthorizedWorkspaceModule()
  }
  return instance
}
