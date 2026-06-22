import { LINX_AGENT_DIR } from './linx-interactive-branding.js'
import { runLinxPodMirrorSyncRetryCommand, runLinxPodMirrorSyncStatusCommand } from './linx-pod-mirror-sync-command.js'

export interface LinxPodMirrorSyncCliAdmissionArgs {
  cwd?: string
  'pi-sync-status'?: boolean
  'pi-sync-retry'?: string
}

export async function handleLinxPodMirrorSyncCliAdmission(argv: LinxPodMirrorSyncCliAdmissionArgs): Promise<boolean> {
  if (argv['pi-sync-status']) {
    await runLinxPodMirrorSyncStatusCommand({ agentDir: LINX_AGENT_DIR })
    return true
  }

  if (argv['pi-sync-retry']) {
    await runLinxPodMirrorSyncRetryCommand({
      cwd: argv.cwd || process.cwd(),
      agentDir: LINX_AGENT_DIR,
      sessionId: argv['pi-sync-retry'],
    })
    return true
  }

  return false
}
