import { runPrintMode, type AgentSessionRuntime, type SessionManager } from '@earendil-works/pi-coding-agent'
import { bootstrapLinxInteractiveMode } from './linx-interactive-bootstrap.js'
import type { LinxStartupLoginPromptDecision } from './linx-startup-login-policy.js'
import { resolveLinxInteractiveLoginReason } from './linx-startup-login-policy.js'
import { clearDefaultPodDataSession, getDefaultPodDataSession } from './pod-data-session.js'
import { createLinxPodMirrorRuntimeHost } from './linx-pod-mirror-runtime-host.js'
import { stopInteractiveShellUnlessRestarting } from './shell-lifecycle.js'

export interface LinxPiCliRuntimeAdapter {
  readonly cwd: string
  start(): Promise<void>
  close(): Promise<void>
  createRuntime(context: {
    cwd: string
    agentDir: string
    sessionManager: SessionManager
  }): Promise<AgentSessionRuntime>
}

export interface CreateLinxRuntimeAdapterForPiCommandOptions {
  cwd: string
  model?: string
  backend: 'cloud'
  autoEnabled: boolean
  symphonyEnabled: boolean
  getPodDataSession: typeof getDefaultPodDataSession
  port?: number
  providerConfig: {
    baseUrl: string
    issuerUrl: string
  }
}

export type CreateLinxRuntimeAdapterForPiCommand = (
  options: CreateLinxRuntimeAdapterForPiCommandOptions,
) => LinxPiCliRuntimeAdapter

export interface RunLinxPiRuntimeOptions {
  adapter: LinxPiCliRuntimeAdapter
  archive: {
    sessionId: string
  }
  agentDir: string
  autoEnabled: boolean
  print?: boolean
  prompt?: string[]
  restoreAutoFromHydration: boolean
  sessionManager: SessionManager
  startupLoginPrompt: LinxStartupLoginPromptDecision
  symphonyEnabled: boolean
}

export async function runLinxPiRuntime(options: RunLinxPiRuntimeOptions): Promise<void> {
  const { adapter } = options
  await adapter.start()

  const runtime = await adapter.createRuntime({
    cwd: adapter.cwd,
    agentDir: options.agentDir,
    sessionManager: options.sessionManager,
  })
  const prompt = ((options.prompt as string[] | undefined) ?? []).join(' ').trim()
  try {
    if (options.print) {
      const exitCode = await runPrintMode(runtime, {
        mode: 'text',
        initialMessage: prompt || undefined,
      })
      if (exitCode !== 0) {
        process.exitCode = exitCode
      }
      return
    }

    const podMirrorHost = createLinxPodMirrorRuntimeHost({
      runtime,
      cwd: adapter.cwd,
      agentDir: options.agentDir,
      archive: options.archive,
      sessionManager: options.sessionManager,
      autoEnabled: options.autoEnabled,
      symphonyEnabled: options.symphonyEnabled,
    })
    const interactive = bootstrapLinxInteractiveMode(podMirrorHost.runtime, {
      initialMessage: prompt || undefined,
      restoredAuto: options.autoEnabled && options.restoreAutoFromHydration,
      onAutoControlChange(enabled) {
        podMirrorHost.syncAutoControlState(enabled)
      },
      onSymphonyControlChange(enabled) {
        podMirrorHost.syncSymphonyControlState(enabled)
      },
    })
    const bridge = podMirrorHost.runtime
    const loginPromptReason = resolveLinxInteractiveLoginReason({
      startupDecision: options.startupLoginPrompt,
      runtimePromptOnStart: bridge.linxAuthBridge?.shouldPromptLoginOnStart,
    })
    if (loginPromptReason) {
      interactive.requestLogin?.(loginPromptReason)
    }

    try {
      await interactive.run()
    } finally {
      await podMirrorHost.close()
      stopInteractiveShellUnlessRestarting(interactive)
    }
  } finally {
    await adapter.close()
    clearDefaultPodDataSession()
  }
}
