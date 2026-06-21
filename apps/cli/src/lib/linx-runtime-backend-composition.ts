import type { AutoModeWorkerBackend } from './auto-mode/types.js'
import type { BackendCommandRouter } from './backend-command.js'
import type { NativeBackendApprovalPolicy } from './native-backend-proxy.js'
import type { NativeBackendStreamProxy } from './native-backend-stream-backend.js'
import type { PodDataSession } from './pod-data-session.js'
import { createLinxCloudRuntimeCoordinator, type LinxCloudRuntimeCoordinator } from './linx-cloud-runtime-coordinator.js'
import { createLinxRuntimeCompletionBackend, type LinxRuntimeCompletionBackend } from './linx-runtime-completion-backend.js'
import type { LinxRuntimeAdapterDependencies } from './linx-runtime-adapter-dependencies.js'
import {
  DEFAULT_LINX_RUNTIME_SESSION_ID,
  resolveLinxRuntimeAdapterCwd,
  resolveLinxRuntimeBackendMode,
  resolveLinxRuntimeWorkerBackend,
  resolveLinxRuntimeBaseUrl,
  type LinxRuntimeBackendMode,
} from './linx-runtime-adapter-defaults.js'
import { createNativeBackendCommandRouter } from './native-backend-command-router.js'
import { createNativeBackendStreamBackend } from './native-backend-stream-backend.js'
import type {
  LinxRuntimeBackendSessionRef,
  LinxRuntimeOAuthProvider,
} from './linx-runtime-agent-session.js'

export interface RuntimeBackendCompositionOptions {
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

export interface RuntimeBackendComposition {
  readonly remoteUrl: string
  readonly sessionId: string
  readonly cwd: string
  readonly model?: string
  readonly requestedModel?: string
  readonly baseUrl: string
  readonly issuerUrl?: string
  readonly oauth?: LinxRuntimeOAuthProvider
  readonly getPodDataSession?: () => Promise<PodDataSession | null>
  readonly workerBackend?: AutoModeWorkerBackend
  readonly autoEnabled: boolean
  readonly symphonyEnabled: boolean
  readonly cloudRuntime: LinxCloudRuntimeCoordinator
  readonly streamBackend?: NativeBackendStreamProxy
  readonly completionBackend?: LinxRuntimeCompletionBackend
  readonly commandRouter?: BackendCommandRouter
  readonly backendSessionRef?: LinxRuntimeBackendSessionRef
  start(): Promise<void>
  close(): Promise<void>
}

export function createRuntimeBackendComposition(
  dependencies: LinxRuntimeAdapterDependencies,
  options: RuntimeBackendCompositionOptions = {},
): RuntimeBackendComposition {
  const backendMode = resolveLinxRuntimeBackendMode(options.backend)
  const workerBackend = resolveLinxRuntimeWorkerBackend({ backendMode, workerBackend: options.workerBackend })
  const cwd = resolveLinxRuntimeAdapterCwd(options.cwd)
  const requestedModel = options.model?.trim() || undefined
  const baseUrl = resolveLinxRuntimeBaseUrl(options.providerConfig?.baseUrl)
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

  const commandRouter = createNativeBackendCommandRouter(proxy)

  return {
    remoteUrl: proxy?.remoteUrl ?? baseUrl,
    sessionId: proxy?.record.id ?? DEFAULT_LINX_RUNTIME_SESSION_ID,
    cwd: proxy?.record.cwd ?? cwd,
    model: proxy?.record.model ?? cloudRuntime.getActiveModelId(),
    requestedModel,
    baseUrl,
    issuerUrl: options.providerConfig?.issuerUrl,
    oauth: options.providerConfig?.oauth,
    getPodDataSession: options.getPodDataSession,
    workerBackend,
    autoEnabled: options.autoEnabled === true,
    symphonyEnabled: options.symphonyEnabled === true,
    cloudRuntime,
    streamBackend: createNativeBackendStreamBackend(proxy),
    completionBackend: !proxy && dependencies.createRemoteCompletion
      ? createLinxRuntimeCompletionBackend({
        cloudRuntime,
        runtimeUrl: baseUrl,
        issuerUrl: options.providerConfig?.issuerUrl,
        getPodDataSession: options.getPodDataSession,
        useExplicitOAuthProvider: Boolean(options.providerConfig?.oauth),
      })
      : undefined,
    commandRouter,
    backendSessionRef: proxy?.record,
    async start(): Promise<void> {
      await proxy?.start()
    },
    async close(): Promise<void> {
      await proxy?.close()
    },
  }
}
