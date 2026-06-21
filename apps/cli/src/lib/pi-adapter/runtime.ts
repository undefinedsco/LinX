import { createLinxAgentStreamAdapter, type LinxAgentStreamAdapter } from './stream.js'
import type { LinxCompletionBackendResult } from '../linx-completion-backend.js'
import type { AgentSessionRuntime } from '@earendil-works/pi-coding-agent'
import type { RemoteAuthFetch, RemoteChatMessage, RemoteChatTool } from '../chat-api.js'
import type { AutoModeWorkerBackend } from '../auto-mode/types.js'
import type { BackendCommandRouter, BackendCommandResult } from '../backend-command.js'
import type { PodDataSession } from '../pod-data-session.js'
import type { CodexApprovalPolicy } from '../codex-plugin/codex-native-proxy.js'
import { createLinxCloudRuntimeCoordinator } from '../linx-cloud-runtime-coordinator.js'
import { createLinxRuntimeCompletionBackend } from '../linx-runtime-completion-backend.js'
import {
  createLinxAgentSessionRuntime,
  type LinxCloudPiAuthBridge,
  type LinxRuntimeOAuthProvider,
} from '../linx-runtime-agent-session.js'

const UNDEFINEDS_SESSION_ID = 'undefineds_pi_frontend'
export interface LinxRuntimeAdapterDependencies {
  createNativeProxy?: (options?: {
    cwd?: string
    model?: string
    listenPort?: number
    autoEnabled?: boolean
    codexApprovalPolicy?: CodexApprovalPolicy
    passthroughArgs?: string[]
    env?: Record<string, string>
    resolveEnv?: () => Promise<Record<string, string> | undefined>
  }) => {
    remoteUrl: string
    record: {
      id: string
      cwd: string
      model?: string
      backend: string
    }
    start(): Promise<void>
    sendTurn(input: string): Promise<void>
    executeCommand?(input: string): Promise<BackendCommandResult>
    setAutoEnabled?(enabled: boolean): Promise<void> | void
    setCwd?(cwd: string): Promise<void> | void
    setSessionControl?(control: import('../session-control.js').SessionControlManager): void
    subscribe(listener: (event: import('../auto-mode/types.js').AutoModeNormalizedEvent) => void): () => void
    close(): Promise<void>
  }
  createRemoteCompletion?: (options: {
    runtimeUrl: string
    authFetch: RemoteAuthFetch
    model?: string
    messages: RemoteChatMessage[]
    tools?: RemoteChatTool[]
    systemPrompt?: string
    signal?: AbortSignal
  }) => Promise<string | LinxCompletionBackendResult>
  listRemoteModels?: (
    authFetch: RemoteAuthFetch,
    runtimeUrl: string,
    options?: { fallback?: boolean; timeoutMs?: number },
  ) => Promise<Array<{
    id: string
    contextWindow?: number
  }>>
}

/** @deprecated Use LinxRuntimeAdapterDependencies. */
export type PiRuntimeAdapterDependencies = LinxRuntimeAdapterDependencies

export interface LinxRuntimeFactoryContext {
  cwd: string
  agentDir: string
  sessionManager: unknown
  sessionStartEvent?: unknown
}

export type LinxCreateRuntimeFactory = (context: LinxRuntimeFactoryContext) => Promise<AgentSessionRuntime>
/** @deprecated Use LinxRuntimeFactoryContext. */
export type PiRuntimeFactoryContext = LinxRuntimeFactoryContext
/** @deprecated Use LinxCreateRuntimeFactory. */
export type PiCreateRuntimeFactory = LinxCreateRuntimeFactory

export interface LinxRuntimeAdapterOptions {
  cwd?: string
  model?: string
  port?: number
  backend?: 'cloud' | 'native'
  workerBackend?: AutoModeWorkerBackend
  autoEnabled?: boolean
  symphonyEnabled?: boolean
  codexApprovalPolicy?: CodexApprovalPolicy
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

/** @deprecated Use LinxRuntimeAdapterOptions. */
export type PiRuntimeAdapterOptions = LinxRuntimeAdapterOptions

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
  const cwd = options.cwd ?? process.cwd()
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
    backend: proxy
      ? {
        sendTurn(input) {
          return proxy.sendTurn(input)
        },
        subscribe(listener) {
          return proxy.subscribe(listener)
        },
      }
      : undefined,
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
  const backendCommandRouter: BackendCommandRouter | undefined = proxy && typeof proxy.executeCommand === 'function'
    ? {
      backend: proxy.record.backend,
      execute(input) {
        return proxy.executeCommand!(input)
      },
      setCwd: typeof proxy.setCwd === 'function'
        ? (nextCwd) => proxy.setCwd!(nextCwd)
        : undefined,
      subscribe(listener) {
        return proxy.subscribe(listener)
      },
      setSessionControl: typeof proxy.setSessionControl === 'function'
        ? (control) => proxy.setSessionControl!(control)
        : undefined,
    }
    : undefined

  return {
    remoteUrl: proxy?.remoteUrl ?? baseUrl,
    sessionId: proxy?.record.id ?? UNDEFINEDS_SESSION_ID,
    cwd: proxy?.record.cwd ?? cwd,
    model: proxy?.record.model ?? cloudRuntime.getActiveModelId(),
    backend: 'linx',
    runtimeBackend: workerBackend,
    autoEnabled: options.autoEnabled === true,
    symphonyEnabled: options.symphonyEnabled === true,
    backendCommandRouter,
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
      backendCommandRouter,
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

/** @deprecated Use LinxRuntimeAdapter. */
export type PiRuntimeAdapter = LinxRuntimeAdapter

/** @deprecated Use createLinxRuntimeAdapter. */
export const createPiRuntimeAdapter = createLinxRuntimeAdapter
