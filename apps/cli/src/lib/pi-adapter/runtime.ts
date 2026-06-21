import { createLinxAgentStreamAdapter, type LinxAgentStreamAdapter } from './stream.js'
import type { AgentSessionRuntime } from '@earendil-works/pi-coding-agent'
import type { AutoModeWorkerBackend } from '../auto-mode/types.js'
import type { BackendCommandRouter } from '../backend-command.js'
import type { PodDataSession } from '../pod-data-session.js'
import type { NativeBackendApprovalPolicy } from '../native-backend-proxy.js'
import { createLinxCloudRuntimeCoordinator } from '../linx-cloud-runtime-coordinator.js'
import type { LinxRuntimeAdapterDependencies } from '../linx-runtime-adapter-dependencies.js'
import { resolveLinxRuntimeAdapterCwd } from '../linx-runtime-adapter-defaults.js'
import { createNativeBackendCommandRouter } from '../native-backend-command-router.js'
import { createNativeBackendStreamBackend } from '../native-backend-stream-backend.js'
import { createLinxRuntimeCompletionBackend } from '../linx-runtime-completion-backend.js'
import {
  createLinxAgentSessionRuntime,
  type LinxCloudPiAuthBridge,
  type LinxRuntimeOAuthProvider,
} from '../linx-runtime-agent-session.js'

const UNDEFINEDS_SESSION_ID = 'undefineds_pi_frontend'
export interface LinxRuntimeFactoryContext {
  cwd: string
  agentDir: string
  sessionManager: unknown
  sessionStartEvent?: unknown
}

export type LinxCreateRuntimeFactory = (context: LinxRuntimeFactoryContext) => Promise<AgentSessionRuntime>
export interface LinxRuntimeAdapterOptions {
  cwd?: string
  model?: string
  port?: number
  backend?: 'cloud' | 'native'
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
  const backendMode = options.backend ?? 'cloud'
  const workerBackend = options.workerBackend ?? (backendMode === 'native' ? 'codex' : undefined)
  const cwd = resolveLinxRuntimeAdapterCwd(options.cwd)
  const requestedModel = options.model?.trim() || undefined
  const baseUrl = options.providerConfig?.baseUrl ?? 'https://api.undefineds.co/v1'
  const cloudRuntime = createLinxCloudRuntimeCoordinator({
    requestedModel,
    runtimeUrl: baseUrl,
    issuerUrl: options.providerConfig?.issuerUrl,
    getPodDataSession: options.getPodDataSession,
    createRemoteCompletion: dependencies.createRemoteCompletion,
    listRemoteModels: dependencies.listRemoteModels,
  })
  const proxy = backendMode === 'native'
    ? dependencies.createNativeProxy?.({
      cwd,
      model: requestedModel,
      listenPort: options.port,
      autoEnabled: options.autoEnabled,
      codexApprovalPolicy: options.codexApprovalPolicy,
      passthroughArgs: options.passthroughArgs,
      env: options.backendEnv,
      resolveEnv: options.resolveBackendEnv,
    })
    : null

  if (backendMode === 'native' && !proxy) {
    throw new Error('Native LinX runtime backend requires createNativeProxy')
  }

  if (backendMode === 'cloud' && !options.providerConfig?.oauth && !dependencies.createRemoteCompletion) {
    throw new Error('Cloud LinX runtime backend requires createRemoteCompletion')
  }

  const streamAdapter = createLinxAgentStreamAdapter({
    sessionId: proxy?.record.id ?? UNDEFINEDS_SESSION_ID,
    cwd: proxy?.record.cwd ?? cwd,
    model: proxy?.record.model ?? cloudRuntime.getActiveModelId(),
    backend: createNativeBackendStreamBackend(proxy),
    completionBackend: !proxy && dependencies.createRemoteCompletion
      ? createLinxRuntimeCompletionBackend({
        cloudRuntime,
        runtimeUrl: baseUrl,
        issuerUrl: options.providerConfig?.issuerUrl,
        getPodDataSession: options.getPodDataSession,
        useExplicitOAuthProvider: Boolean(options.providerConfig?.oauth),
      })
      : undefined,
  })
  const commandRouter = createNativeBackendCommandRouter(proxy)

  return {
    remoteUrl: proxy?.remoteUrl ?? baseUrl,
    sessionId: proxy?.record.id ?? UNDEFINEDS_SESSION_ID,
    cwd: proxy?.record.cwd ?? cwd,
    model: proxy?.record.model ?? cloudRuntime.getActiveModelId(),
    backend: 'linx',
    runtimeBackend: workerBackend,
    autoEnabled: options.autoEnabled === true,
    symphonyEnabled: options.symphonyEnabled === true,
    backendCommandRouter: commandRouter,
    streamAdapter,
    createRuntime: async (context: LinxRuntimeFactoryContext): Promise<AgentSessionRuntime> => createLinxAgentSessionRuntime({
      context,
      baseUrl,
      requestedModel,
      streamSimple: streamAdapter.streamFn,
      cloudRuntime,
      issuerUrl: options.providerConfig?.issuerUrl,
      oauth: options.providerConfig?.oauth,
      getPodDataSession: options.getPodDataSession,
      workerBackend,
      backendCommandRouter: commandRouter,
      backendSessionRef: proxy?.record,
      autoEnabled: options.autoEnabled,
      symphonyEnabled: options.symphonyEnabled,
    }),
    async start(): Promise<void> {
      await proxy?.start()
    },
    async close(): Promise<void> {
      await proxy?.close()
    },
  }

}
