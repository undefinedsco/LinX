import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  listLinxSyncCheckpoints,
  type LinxSyncCheckpoint,
  type LinxSyncRunResult,
} from '@linx/agent-runtime/sync'
import { createFileSyncCheckpointStore } from '../sync-checkpoint-store.js'
import { LinxPiPodMirror } from './pod-mirror.js'
import { createLinxPiSessionManager } from './session.js'

export interface PiPodMirrorSyncStatus {
  sessionId: string
  checkpoints: LinxSyncCheckpoint[]
}

export interface PiPodMirrorSyncRetryResult {
  sessionId: string
  attempted: boolean
  results: LinxSyncRunResult[]
}

export function getPiPodMirrorSyncDir(agentDir: string, sessionId?: string): string {
  const baseDir = join(agentDir, 'sync', 'pi-pod-mirror')
  return sessionId ? join(baseDir, sessionId) : baseDir
}

export async function listPendingPiPodMirrorSync(agentDir: string): Promise<PiPodMirrorSyncStatus[]> {
  const baseDir = getPiPodMirrorSyncDir(agentDir)
  if (!existsSync(baseDir)) {
    return []
  }

  const statuses: PiPodMirrorSyncStatus[] = []
  for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const sessionId = entry.name
    const checkpoints = await listLinxSyncCheckpoints(createFileSyncCheckpointStore({
      dir: getPiPodMirrorSyncDir(agentDir, sessionId),
    }), {
      source: 'pi-runtime',
      target: 'pod',
      plane: 'projection',
      status: ['failed', 'partial'],
      metadata: {
        resourceBindings: {
          session: {
            local: sessionId,
          },
        },
      },
    })
    if (checkpoints.length > 0) {
      statuses.push({ sessionId, checkpoints })
    }
  }

  return statuses.sort((a, b) => {
    const aLatest = a.checkpoints.at(-1)?.completedAt ?? ''
    const bLatest = b.checkpoints.at(-1)?.completedAt ?? ''
    return bLatest.localeCompare(aLatest) || a.sessionId.localeCompare(b.sessionId)
  })
}

export async function retryPendingPiPodMirrorSync(options: {
  cwd: string
  agentDir: string
  sessionId: string
}): Promise<PiPodMirrorSyncRetryResult> {
  const checkpointStore = createFileSyncCheckpointStore({
    dir: getPiPodMirrorSyncDir(options.agentDir, options.sessionId),
  })
  const pending = await listLinxSyncCheckpoints(checkpointStore, {
    source: 'pi-runtime',
    target: 'pod',
    plane: 'projection',
    status: ['failed', 'partial'],
    metadata: {
      resourceBindings: {
        session: {
          local: options.sessionId,
        },
      },
    },
  })
  if (pending.length === 0) {
    return {
      sessionId: options.sessionId,
      attempted: false,
      results: [],
    }
  }

  const sessionManager = await createLinxPiSessionManager({
    cwd: options.cwd,
    agentDir: options.agentDir,
    session: options.sessionId,
  })
  const mirror = new LinxPiPodMirror({
    cwd: options.cwd,
    sessionManager,
    checkpointStore,
  })
  const results = await mirror.replayPendingSync()
  await mirror.flush()
  return {
    sessionId: options.sessionId,
    attempted: true,
    results,
  }
}
