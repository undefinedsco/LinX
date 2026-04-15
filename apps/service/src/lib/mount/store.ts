import * as fs from 'fs'
import * as path from 'path'
import { homedir } from 'os'
import type { AcquirePodMountLeaseInput, PodMountLeaseRecord, PodMountRecord } from './types'

const STORE_PATH = 'pod-mounts.json'
const LEASE_STORE_PATH = 'pod-mount-leases.json'
const DEFAULT_LEASE_TTL_MS = 5 * 60_000

export interface PodMountStoreOptions {
  metadataDir?: string
  mountRoot?: string
  leaseTtlMs?: number
  nowProvider?: () => number
}

function ensureDir(target: string): void {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true })
  }
}

function getDefaultMetadataDir(): string {
  return path.join(homedir(), 'Library', 'Application Support', 'LinX')
}

function getDefaultMountRoot(): string {
  return path.join(homedir(), 'Linx Mounts')
}

function makeLeaseKey(ownerKey: string, ownerWebId?: string): string {
  return ownerWebId ?? ownerKey
}

export class PodMountStore {
  private readonly metadataDir: string
  private readonly mountRoot: string
  private readonly storePath: string
  private readonly leaseStorePath: string
  private readonly leaseTtlMs: number
  private readonly nowProvider: () => number
  private readonly rows = new Map<string, PodMountRecord>()
  private readonly leases = new Map<string, PodMountLeaseRecord>()

  public constructor(options: PodMountStoreOptions = {}) {
    this.metadataDir = options.metadataDir ?? getDefaultMetadataDir()
    this.mountRoot = options.mountRoot ?? getDefaultMountRoot()
    this.storePath = path.join(this.metadataDir, STORE_PATH)
    this.leaseStorePath = path.join(this.metadataDir, LEASE_STORE_PATH)
    this.leaseTtlMs = options.leaseTtlMs ?? DEFAULT_LEASE_TTL_MS
    this.nowProvider = options.nowProvider ?? (() => Date.now())
    this.load()
  }

  public getMountRoot(): string {
    ensureDir(this.mountRoot)
    return this.mountRoot
  }

  public list(): PodMountRecord[] {
    return Array.from(this.rows.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  public get(id: string): PodMountRecord | null {
    return this.rows.get(id) ?? null
  }

  public save(record: PodMountRecord): PodMountRecord {
    this.rows.set(record.id, record)
    this.persist()
    return record
  }

  public remove(id: string): void {
    if (this.rows.delete(id)) {
      this.persist()
    }
  }

  public getLease(ownerKey: string, ownerWebId?: string): PodMountLeaseRecord | null {
    const leaseKey = makeLeaseKey(ownerKey, ownerWebId)
    const lease = this.leases.get(leaseKey) ?? null
    if (!lease) {
      return null
    }
    if (this.isLeaseExpired(lease)) {
      this.leases.delete(leaseKey)
      this.persistLeases()
      return null
    }
    return lease
  }

  public acquireLease(input: AcquirePodMountLeaseInput): PodMountLeaseRecord {
    const leaseKey = makeLeaseKey(input.ownerKey, input.ownerWebId)
    const existing = this.leases.get(leaseKey)
    if (existing && !this.isLeaseExpired(existing) && existing.holderId !== input.holderId) {
      throw new Error('This Pod is already mounted by another active Linx session')
    }

    const now = new Date(this.nowProvider())
    const expiresAt = new Date(now.getTime() + this.leaseTtlMs)
    const lease: PodMountLeaseRecord = {
      leaseKey,
      ownerKey: input.ownerKey,
      ownerWebId: input.ownerWebId,
      mountId: input.mountId,
      holderId: input.holderId,
      acquiredAt: existing?.holderId === input.holderId ? existing.acquiredAt : now.toISOString(),
      heartbeatAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      mode: 'single-writer',
    }

    this.leases.set(leaseKey, lease)
    this.persistLeases()
    return lease
  }

  public releaseLease(ownerKey: string, ownerWebId: string | undefined, holderId: string): void {
    const leaseKey = makeLeaseKey(ownerKey, ownerWebId)
    const existing = this.leases.get(leaseKey)
    if (!existing) {
      return
    }
    if (existing.holderId !== holderId && !this.isLeaseExpired(existing)) {
      return
    }
    this.leases.delete(leaseKey)
    this.persistLeases()
  }

  private isLeaseExpired(lease: PodMountLeaseRecord): boolean {
    return new Date(lease.expiresAt).getTime() <= this.nowProvider()
  }

  private load(): void {
    ensureDir(this.metadataDir)
    ensureDir(this.mountRoot)

    if (fs.existsSync(this.storePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.storePath, 'utf-8')) as PodMountRecord[]
        for (const row of parsed) {
          this.rows.set(row.id, row)
        }
      } catch (error) {
        console.warn('[PodMountStore] Failed to load mount store:', error)
      }
    }

    if (fs.existsSync(this.leaseStorePath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.leaseStorePath, 'utf-8')) as PodMountLeaseRecord[]
        for (const lease of parsed) {
          if (!this.isLeaseExpired(lease)) {
            this.leases.set(lease.leaseKey, lease)
          }
        }
      } catch (error) {
        console.warn('[PodMountStore] Failed to load mount lease store:', error)
      }
    }
  }

  private persist(): void {
    ensureDir(this.metadataDir)
    fs.writeFileSync(this.storePath, JSON.stringify(this.list(), null, 2))
  }

  private persistLeases(): void {
    ensureDir(this.metadataDir)
    fs.writeFileSync(this.leaseStorePath, JSON.stringify(Array.from(this.leases.values()), null, 2))
  }
}
