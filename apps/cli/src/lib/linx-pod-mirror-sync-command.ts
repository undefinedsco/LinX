import { listPendingPiPodMirrorSync, retryPendingPiPodMirrorSync } from './linx-pod-mirror-sync-recovery.js'

export async function runLinxPodMirrorSyncStatusCommand(options: {
  agentDir: string
}): Promise<void> {
  const sessions = await listPendingPiPodMirrorSync(options.agentDir)
  if (sessions.length === 0) {
    process.stdout.write('No pending LinX Pod sync sessions.\n')
    return
  }

  process.stdout.write(`${sessions.map((session) => {
    const failed = session.checkpoints.filter((checkpoint) => checkpoint.status === 'failed').length
    const partial = session.checkpoints.filter((checkpoint) => checkpoint.status === 'partial').length
    const latest = session.checkpoints.at(-1)?.completedAt ?? 'unknown'
    return `${session.sessionId} · failed=${failed} partial=${partial} latest=${latest}`
  }).join('\n')}\n`)
}

export async function runLinxPodMirrorSyncRetryCommand(options: {
  cwd: string
  agentDir: string
  sessionId: string
}): Promise<void> {
  const result = await retryPendingPiPodMirrorSync({
    cwd: options.cwd,
    agentDir: options.agentDir,
    sessionId: options.sessionId,
  })
  if (!result.attempted) {
    process.stdout.write(`LinX Pod sync skipped: ${options.sessionId}\n`)
    return
  }

  const status = result.results.map((item) => item.status).join(', ') || 'none'
  process.stdout.write(
    status === 'none'
      ? `LinX Pod sync has no replayable local projections: ${options.sessionId}\n`
      : `Retried LinX Pod sync: ${options.sessionId} (${status})\n`,
  )
}
