import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  matchesLinxSyncCheckpointQuery,
  type LinxSyncCheckpoint,
  type LinxSyncCheckpointQuery,
  type LinxSyncCheckpointStore,
} from '@linx/agent-runtime/sync'

export interface FileSyncCheckpointStoreOptions {
  dir: string
}

export function createFileSyncCheckpointStore(options: FileSyncCheckpointStoreOptions): LinxSyncCheckpointStore {
  return new FileSyncCheckpointStore(options.dir)
}

class FileSyncCheckpointStore implements LinxSyncCheckpointStore {
  constructor(private readonly dir: string) {}

  writeCheckpoint(checkpoint: LinxSyncCheckpoint): void {
    mkdirSync(this.dir, { recursive: true })
    const path = this.checkpointPath(checkpoint.id)
    const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`
    writeFileSync(tempPath, `${stringifyCheckpoint(checkpoint)}\n`, 'utf-8')
    renameSync(tempPath, path)
  }

  readCheckpoint(id: string): LinxSyncCheckpoint | null {
    return readCheckpointFile(this.checkpointPath(id))
  }

  listCheckpoints(query?: LinxSyncCheckpointQuery): LinxSyncCheckpoint[] {
    if (!existsSync(this.dir)) {
      return []
    }

    return readdirSync(this.dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => readCheckpointFile(join(this.dir, name)))
      .filter((checkpoint): checkpoint is LinxSyncCheckpoint => {
        return checkpoint !== null && matchesLinxSyncCheckpointQuery(checkpoint, query)
      })
      .sort(compareCheckpoints)
  }

  deleteCheckpoint(id: string): void {
    const path = this.checkpointPath(id)
    if (existsSync(path)) {
      unlinkSync(path)
    }
  }

  private checkpointPath(id: string): string {
    return join(this.dir, `${encodeURIComponent(id)}.json`)
  }
}

function readCheckpointFile(path: string): LinxSyncCheckpoint | null {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as LinxSyncCheckpoint
  } catch {
    return null
  }
}

function compareCheckpoints(a: LinxSyncCheckpoint, b: LinxSyncCheckpoint): number {
  return a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id)
}

function stringifyCheckpoint(checkpoint: LinxSyncCheckpoint): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(checkpoint, (_key, value) => {
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      }
    }
    if (value && typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]'
      }
      seen.add(value)
    }
    return value
  }, 2)
}
