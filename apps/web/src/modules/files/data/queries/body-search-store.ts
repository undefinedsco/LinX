import {
  BodyIndex,
  projectBodyCoverageNote,
  type BodyCoverage,
  type BodyDoc,
  type BodyHit,
} from '../../domain/search/body-index'
import {
  bodyStamp,
  hashBodyText,
  isBodyReadable,
  isSearchableFile,
  normalizeBodyText,
} from '../../domain/search/body-text'

/**
 * Per-Pod store behind file body search. It keeps one in-memory `BodyIndex`,
 * fills it lazily (only once somebody searches) from text that is cheap to read,
 * updates it incrementally (listing stamp, then content hash) and persists the
 * texts in IndexedDB so the next session starts warm.
 */

export interface BodySearchEntry {
  id: string
  uri: string
  name: string
  kind: string
  semanticKind: string
  mimeType: string | null
  size: number | null
  modifiedAt: string | null
}

export interface BodySearchPersistence {
  load(podKey: string): Promise<BodyDoc[]>
  save(podKey: string, docs: BodyDoc[]): Promise<void>
}

export interface BodySearchSnapshot {
  version: number
  indexing: boolean
  coverage: BodyCoverage
  note: string | null
  /** Characters of body text held (for sizing). */
  indexedChars: number
}

const CONCURRENCY = 4

const DB_NAME = 'linx-body-search'
const STORE_NAME = 'docs'
const FORMAT_VERSION = 1

/** IndexedDB persistence; silently does nothing where IndexedDB is unavailable. */
export const indexedDbBodySearchPersistence: BodySearchPersistence = {
  async load(podKey) {
    try {
      if (typeof indexedDB === 'undefined') return []
      const db = await openDb()
      const record = await new Promise<{ version: number; docs: BodyDoc[] } | undefined>((resolve, reject) => {
        const request = db.transaction(STORE_NAME).objectStore(STORE_NAME).get(podKey)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
      db.close()
      return record?.version === FORMAT_VERSION ? record.docs : []
    } catch {
      return []
    }
  },
  async save(podKey, docs) {
    try {
      if (typeof indexedDB === 'undefined') return
      const db = await openDb()
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put({ version: FORMAT_VERSION, docs }, podKey)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
      db.close()
    } catch {
      // Persistence is an optimisation; the index is rebuilt lazily without it.
    }
  },
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export class BodySearchStore {
  private index = new BodyIndex()
  private listeners = new Set<() => void>()
  private snap: BodySearchSnapshot
  private loaded: Promise<void> | null = null
  private running = false
  private pending: { entries: BodySearchEntry[]; readText: (uri: string) => Promise<string> } | null = null
  private entries: BodySearchEntry[] = []
  private indexing = false
  private version = 0

  constructor(
    readonly podKey: string,
    private readonly persistence: BodySearchPersistence = indexedDbBodySearchPersistence,
  ) {
    this.snap = this.buildSnapshot()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = () => this.snap

  private buildSnapshot(): BodySearchSnapshot {
    const files = this.entries.filter(isSearchableFile)
    const coverage: BodyCoverage = {
      totalFiles: files.length,
      indexedFiles: files.filter((entry) => this.index.has(entry.uri)).length,
      indexing: this.indexing,
    }
    return {
      version: this.version,
      indexing: this.indexing,
      coverage,
      note: projectBodyCoverageNote(coverage),
      indexedChars: this.index.totalChars,
    }
  }

  private emit() {
    this.version += 1
    this.snap = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }

  private ensureLoaded() {
    this.loaded ??= this.persistence.load(this.podKey).then((docs) => {
      // Only fill an empty index; anything already read this session is newer.
      if (docs.length > 0 && this.index.size === 0) this.index.restore(docs)
    })
    return this.loaded
  }

  /**
   * Bring the index in line with the listed files: read new or changed readable
   * files, drop deleted ones. Safe to call repeatedly; overlapping calls collapse
   * into one follow-up run with the latest listing.
   */
  async sync(entries: BodySearchEntry[], readText: (uri: string) => Promise<string>): Promise<void> {
    this.pending = { entries, readText }
    if (this.running) return
    this.running = true
    try {
      await this.ensureLoaded()
      while (this.pending) {
        const job = this.pending
        this.pending = null
        await this.runSync(job.entries, job.readText)
      }
    } finally {
      this.running = false
    }
  }

  private async runSync(entries: BodySearchEntry[], readText: (uri: string) => Promise<string>) {
    this.entries = entries
    const readable = entries.filter(isBodyReadable)
    const readableUris = new Set(readable.map((entry) => entry.uri))
    let changed = false
    for (const uri of this.index.uris()) {
      if (!readableUris.has(uri) && this.index.remove(uri)) changed = true
    }
    const queue = readable.filter((entry) => this.index.get(entry.uri)?.stamp !== bodyStamp(entry))
    this.indexing = queue.length > 0
    this.emit()

    let cursor = 0
    const worker = async () => {
      while (cursor < queue.length) {
        const entry = queue[cursor++]
        try {
          const text = normalizeBodyText(await readText(entry.uri))
          const result = this.index.upsert({
            uri: entry.uri,
            title: entry.name,
            text,
            hash: hashBodyText(text),
            stamp: bodyStamp(entry),
          })
          if (result !== 'unchanged') changed = true
        } catch {
          // An unreadable file stays name-only and is counted in the coverage note.
        }
        this.emit()
        // Adding text to the index is CPU work: let the page paint between files.
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker))

    this.indexing = false
    this.emit()
    if (changed || queue.length > 0) await this.persistence.save(this.podKey, this.index.snapshot())
  }

  search(query: string, options: { limit?: number; filter?: (uri: string) => boolean } = {}): BodyHit[] {
    return this.index.search(query, options)
  }

  /** Forget everything (e.g. when signing out). */
  async clear() {
    this.index = new BodyIndex()
    this.entries = []
    await this.persistence.save(this.podKey, [])
    this.emit()
  }
}

const stores = new Map<string, BodySearchStore>()

export function getBodySearchStore(podKey: string): BodySearchStore {
  let store = stores.get(podKey)
  if (!store) {
    store = new BodySearchStore(podKey)
    stores.set(podKey, store)
  }
  return store
}
