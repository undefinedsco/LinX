import { createLinxAgentStreamAdapter, type LinxAgentStreamAdapter } from './stream.js'
import type { AgentSessionRuntime } from '@earendil-works/pi-coding-agent'
import type { AutoModeWorkerBackend } from '../auto-mode/types.js'
import type { BackendCommandRouter } from '../backend-command.js'
import type { NativeBackendApprovalPolicy } from '../native-backend-proxy.js'
import type { PodDataSession } from '../pod-data-session.js'
import type { LinxRuntimeAdapterDependencies } from '../linx-runtime-adapter-dependencies.js'
import type { LinxRuntimeBackendMode } from '../linx-runtime-adapter-defaults.js'
import {
  createLinxAgentSessionRuntime,
  type LinxCloudPiAuthBridge,
  type LinxRuntimeOAuthProvider,
} from '../linx-runtime-agent-session.js'
import {
  createRuntimeBackendComposition,
  type RuntimeBackendCompositionOptions,
} from '../linx-runtime-backend-composition.js'

export interface LinxRuntimeFactoryContext {
  cwd: string
  agentDir: string
  sessionManager: unknown
  sessionStartEvent?: unknown
}

export type LinxCreateRuntimeFactory = (context: LinxRuntimeFactoryContext) => Promise<AgentSessionRuntime>
export interface LinxRuntimeAdapterOptions extends RuntimeBackendCompositionOptions {
  cwd?: string
  model?: string
  port?: number
  backend?: LinxRuntimeBackendMode
  workerBackend?: AutoModeWorkerBackend
  autoEnabled?: boolean
  symphonyEnabled?: boolean
  codexApprovalPolicy?: NativeBackendApprovalPolicy
  passthroughArgs?: string[]
  backendEnv?: Record<string, string>
  resolveBackendEnv?: () => Promise<Record<string, string> | undefined>
  getPodDataSession?: () => Promise<PodDataSession | null>
  providerConfig?: {
    baseUrl: string
    issuerUrl?: string
    oauth?: LinxRuntimeOAuthProvider
  }
}

export type { LinxCloudPiAuthBridge }

export interface LinxRuntimeAdapter {
  readonly remoteUrl: string
  readonly sessionId: string
  readonly cwd: string
  readonly model?: string
  readonly backend: 'linx'
  readonly runtimeBackend?: AutoModeWorkerBackend
  readonly autoEnabled: boolean
  readonly symphonyEnabled: boolean
  readonly backendCommandRouter?: BackendCommandRouter
  readonly streamAdapter: LinxAgentStreamAdapter
  createRuntime: LinxCreateRuntimeFactory
  start(): Promise<void>
  close(): Promise<void>
}

export function createLinxRuntimeAdapter(
  dependencies: LinxRuntimeAdapterDependencies,
  options: LinxRuntimeAdapterOptions = {},
): LinxRuntimeAdapter {
  const runtime = createRuntimeBackendComposition(dependencies, options)
  const streamAdapter = createLinxAgentStreamAdapter({
    sessionId: runtime.sessionId,
    cwd: runtime.cwd,
    model: runtime.model,
    backend: runtime.streamBackend,
    completionBackend: runtime.completionBackend,
  })

  return {
    remoteUrl: runtime.remoteUrl,
    sessionId: runtime.sessionId,
    cwd: runtime.cwd,
    model: runtime.model,
    backend: 'linx',
    runtimeBackend: runtime.workerBackend,
    autoEnabled: runtime.autoEnabled,
    symphonyEnabled: runtime.symphonyEnabled,
    backendCommandRouter: runtime.commandRouter,
    streamAdapter,
    createRuntime: async (context: LinxRuntimeFactoryContext): Promise<AgentSessionRuntime> => createLinxAgentSessionRuntime({
      context,
      baseUrl: runtime.baseUrl,
      requestedModel: runtime.requestedModel,
      streamSimple: streamAdapter.streamFn,
      cloudRuntime: runtime.cloudRuntime,
      issuerUrl: runtime.issuerUrl,
      oauth: runtime.oauth,
      getPodDataSession: runtime.getPodDataSession,
      workerBackend: runtime.workerBackend,
      backendCommandRouter: runtime.commandRouter,
      backendSessionRef: runtime.backendSessionRef,
      autoEnabled: runtime.autoEnabled,
      symphonyEnabled: runtime.symphonyEnabled,
    }),
    start: () => runtime.start(),
    close: () => runtime.close(),
  }
}
