import { join } from 'node:path'
import type { AgentSessionRuntime, SessionManager } from '@earendil-works/pi-coding-agent'
import { LinxPiPodMirror } from './linx-pod-mirror.js'
import { createFileSyncCheckpointStore } from './sync-checkpoint-store.js'

export interface LinxPodMirrorRuntimeHostOptions {
  runtime: AgentSessionRuntime
  cwd: string
  agentDir: string
  sessionManager: SessionManager
  autoEnabled: boolean
  symphonyEnabled: boolean
}

export interface LinxPodMirrorHostedRuntime {
  session: {
    subscribe(listener: (event: unknown) => void): () => void
  }
  linxAuthBridge?: {
    shouldPromptLoginOnStart?: boolean
  }
}

export interface LinxPodMirrorRuntimeHost {
  readonly runtime: AgentSessionRuntime & LinxPodMirrorHostedRuntime
  syncAutoControlState(enabled: boolean): void
  syncSymphonyControlState(enabled: boolean): void
  close(): Promise<void>
}

export function createLinxPodMirrorRuntimeHost(options: LinxPodMirrorRuntimeHostOptions): LinxPodMirrorRuntimeHost {
  const podMirror = new LinxPiPodMirror({
    cwd: options.cwd,
    sessionManager: options.sessionManager,
    autoEnabled: options.autoEnabled,
    symphonyEnabled: options.symphonyEnabled,
    checkpointStore: createFileSyncCheckpointStore({
      dir: join(options.agentDir, 'sync', 'pi-pod-mirror', options.sessionManager.getSessionId()),
    }),
    onError(error) {
      if (process.env.LINX_DEBUG === '1') {
        const message = error instanceof Error ? error.stack || error.message : String(error)
        process.stderr.write(`[linx pod mirror] ${message}\n`)
      }
    },
  })
  const runtimeBridge = options.runtime as AgentSessionRuntime & LinxPodMirrorHostedRuntime & Record<string, unknown>
  ;(runtimeBridge as { __linxPodMirror?: LinxPiPodMirror }).__linxPodMirror = podMirror
  const unsubscribePodMirror = runtimeBridge.session.subscribe((event: unknown) => {
    podMirror.handleEvent(event)
  })

  return {
    runtime: runtimeBridge,
    syncAutoControlState(enabled: boolean): void {
      void podMirror.syncAutoControlState(enabled)
    },
    syncSymphonyControlState(enabled: boolean): void {
      void podMirror.syncSymphonyControlState(enabled)
    },
    async close(): Promise<void> {
      unsubscribePodMirror()
      await podMirror.close().catch(() => undefined)
    },
  }
}
