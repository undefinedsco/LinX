import open from 'open'
import * as fs from 'fs'
import * as path from 'path'
import { PodMountStore } from './store'
import { materializePodMount } from './materialize-mount'
import type {
  CreatePodMountInput,
  PodMountLeaseStatus,
  PodMountRecord,
  PodMountSource,
} from './types'
import type { LocalAccountSession } from '../local-account-session'
import { buildLocalMountSessionId, loadLocalAccountSession } from '../local-account-session'
import { createDefaultPodMountSource } from './source-selector'

type LocalSessionContext = LocalAccountSession

function makeWritableRecursive(target: string): void {
  if (!fs.existsSync(target)) return
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

export class PodMountModule {
  private readonly leaseHeartbeatTimers = new Map<string, NodeJS.Timeout>()

  constructor(
    private readonly store = new PodMountStore(),
    private readonly source: PodMountSource = createDefaultPodMountSource(),
    private readonly sessionProvider: () => LocalSessionContext | null = loadLocalAccountSession,
  ) {}

  public list(): PodMountRecord[] {
    return this.store.list()
  }

  public listForCurrentOwner(): PodMountRecord[] {
    const session = this.sessionProvider()
    if (!session?.ownerKey) return []
    return this.store.list().filter((record) => (
      record.ownerKey === session.ownerKey &&
      (session.ownerWebId ? record.ownerWebId === session.ownerWebId : true)
    ))
  }

  public get(id: string): PodMountRecord | null {
    return this.store.get(id)
  }

  public getForCurrentOwner(id: string): PodMountRecord | null {
    const session = this.sessionProvider()
    if (!session?.ownerKey) return null
    const record = this.store.get(id)
    if (!record) return null
    if (record.ownerKey !== session.ownerKey) return null
    if (session.ownerWebId && record.ownerWebId && record.ownerWebId !== session.ownerWebId) return null
    return record
  }

  public findLatestForOwner(ownerKey: string, ownerWebId?: string): PodMountRecord | null {
    return this.store.list().find((record) => (
      record.ownerKey === ownerKey &&
      (ownerWebId ? record.ownerWebId === ownerWebId : true)
    )) ?? null
  }

  public getLeaseStatus(record: Pick<PodMountRecord, 'ownerKey' | 'ownerWebId'>): PodMountLeaseStatus | null {
    const lease = this.store.getLease(record.ownerKey, record.ownerWebId)
    if (!lease) {
      return null
    }
    const holderId = buildLocalMountSessionId(this.sessionProvider())
    return {
      mode: lease.mode,
      scope: 'owner-session',
      active: true,
      expiresAt: lease.expiresAt,
      ownedByCurrentSession: Boolean(holderId && holderId === lease.holderId),
    }
  }

  public peekOwnerContext(): { ownerKey?: string; ownerWebId?: string } | null {
    return this.sessionProvider()
  }

  private getLeaseKey(ownerKey: string, ownerWebId?: string): string {
    return ownerWebId ?? ownerKey
  }

  private ensureLeaseHeartbeat(ownerKey: string, ownerWebId?: string, mountId?: string) {
    const holderId = buildLocalMountSessionId(this.sessionProvider())
    if (!holderId) {
      return
    }

    const leaseKey = this.getLeaseKey(ownerKey, ownerWebId)
    const existing = this.leaseHeartbeatTimers.get(leaseKey)
    if (existing) {
      clearInterval(existing)
      this.leaseHeartbeatTimers.delete(leaseKey)
    }

    const timer = setInterval(() => {
      try {
        this.store.acquireLease({ ownerKey, ownerWebId, mountId, holderId })
      } catch {
        this.clearLeaseHeartbeat(ownerKey, ownerWebId)
      }
    }, 60_000)

    timer.unref?.()
    this.leaseHeartbeatTimers.set(leaseKey, timer)
  }

  private clearLeaseHeartbeat(ownerKey: string, ownerWebId?: string) {
    const leaseKey = this.getLeaseKey(ownerKey, ownerWebId)
    const timer = this.leaseHeartbeatTimers.get(leaseKey)
    if (!timer) {
      return
    }
    clearInterval(timer)
    this.leaseHeartbeatTimers.delete(leaseKey)
  }

  private acquireLease(ownerKey: string, ownerWebId?: string, mountId?: string) {
    const holderId = buildLocalMountSessionId(this.sessionProvider())
    if (!holderId) {
      throw new Error('No active Linx session available for Pod mount lease')
    }
    const lease = this.store.acquireLease({ ownerKey, ownerWebId, mountId, holderId })
    this.ensureLeaseHeartbeat(ownerKey, ownerWebId, mountId)
    return lease
  }

  private releaseLease(ownerKey: string, ownerWebId?: string) {
    const holderId = buildLocalMountSessionId(this.sessionProvider())
    if (!holderId) {
      return
    }
    this.clearLeaseHeartbeat(ownerKey, ownerWebId)
    this.store.releaseLease(ownerKey, ownerWebId, holderId)
  }

  public release(id: string): PodMountRecord {
    const record = this.store.get(id)
    if (!record) {
      throw new Error(`Mount not found: ${id}`)
    }
    this.releaseLease(record.ownerKey, record.ownerWebId)
    return record
  }

  public releaseForCurrentOwner(id: string): PodMountRecord {
    const record = this.getForCurrentOwner(id)
    if (!record) {
      throw new Error(`Mount not found for current owner: ${id}`)
    }
    this.releaseLease(record.ownerKey, record.ownerWebId)
    return record
  }

  public async ensureCurrent(input: Omit<CreatePodMountInput, 'ownerKey' | 'ownerWebId'> = {}): Promise<PodMountRecord> {
    const session = this.sessionProvider()
    const ownerKey = session?.ownerKey
    const ownerWebId = session?.ownerWebId
    if (!ownerKey) {
      throw new Error('No active Linx session available for current mount')
    }
    const existing = this.findLatestForOwner(ownerKey, ownerWebId)
    if (existing && fs.existsSync(existing.rootPath)) {
      this.acquireLease(existing.ownerKey, existing.ownerWebId, existing.id)
      await this.source.activateMount?.(existing)
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

  public async create(input: CreatePodMountInput): Promise<PodMountRecord> {
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

    this.acquireLease(ownerKey, ownerWebId)

    try {
      const resolved = this.source.prepareAuthorizedPrimitives
        ? await this.source.prepareAuthorizedPrimitives({ ownerWebId, podBaseUrls: input.podBaseUrls })
        : this.source.resolveAuthorizedPrimitives({ ownerWebId, podBaseUrls: input.podBaseUrls })
      const { snapshot, primitives } = resolved
      if (primitives.length === 0) {
        throw new Error('No authorized pod primitives were resolved for this mount request')
      }
      const record = materializePodMount({
        mountRoot: this.store.getMountRoot(),
        input: { ...input, ownerKey, ownerWebId },
        snapshot,
        primitives,
      })
      const saved = this.store.save(record)
      this.acquireLease(saved.ownerKey, saved.ownerWebId, saved.id)
      await this.source.activateMount?.(saved)
      if (input.revealInFinder) {
        void open(saved.rootPath, { wait: false })
      }
      return saved
    } catch (error) {
      this.releaseLease(ownerKey, ownerWebId)
      throw error
    }
  }

  public async reveal(id: string): Promise<PodMountRecord> {
    const record = this.store.get(id)
    if (!record) {
      throw new Error(`Mount not found: ${id}`)
    }
    this.acquireLease(record.ownerKey, record.ownerWebId, record.id)
    await this.source.activateMount?.(record)
    await open(record.rootPath, { wait: false })
    return record
  }

  public async revealForCurrentOwner(id: string): Promise<PodMountRecord> {
    const record = this.getForCurrentOwner(id)
    if (!record) {
      throw new Error(`Mount not found for current owner: ${id}`)
    }
    this.acquireLease(record.ownerKey, record.ownerWebId, record.id)
    await this.source.activateMount?.(record)
    await open(record.rootPath, { wait: false })
    return record
  }

  public async revealCurrent(): Promise<PodMountRecord> {
    const record = await this.ensureCurrent()
    await open(record.rootPath, { wait: false })
    return record
  }

  public async remove(id: string): Promise<PodMountRecord> {
    const record = this.store.get(id)
    if (!record) {
      throw new Error(`Mount not found: ${id}`)
    }
    await this.source.releaseMount?.(record)
    this.releaseLease(record.ownerKey, record.ownerWebId)
    makeWritableRecursive(record.rootPath)
    fs.rmSync(record.rootPath, { recursive: true, force: true })
    this.store.remove(id)
    return record
  }

  public async removeForCurrentOwner(id: string): Promise<PodMountRecord> {
    const record = this.getForCurrentOwner(id)
    if (!record) {
      throw new Error(`Mount not found for current owner: ${id}`)
    }
    await this.source.releaseMount?.(record)
    this.releaseLease(record.ownerKey, record.ownerWebId)
    makeWritableRecursive(record.rootPath)
    fs.rmSync(record.rootPath, { recursive: true, force: true })
    this.store.remove(id)
    return record
  }
}

let instance: PodMountModule | null = null

export function getPodMountModule(): PodMountModule {
  if (!instance) {
    instance = new PodMountModule()
  }
  return instance
}
