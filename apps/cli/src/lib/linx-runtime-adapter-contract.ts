import type { AssistantMessageEventStream } from '@earendil-works/pi-ai'
import type { AgentSessionRuntime } from '@earendil-works/pi-coding-agent'
import type { AutoModeWorkerBackend } from './auto-mode/types.js'
import type { BackendCommandRouter } from './backend-command-router-contract.js'
import type { RuntimeBackendCompositionOptions } from './linx-runtime-backend-composition.js'

export interface LinxRuntimeFactoryContext {
  cwd: string
  agentDir: string
  sessionManager: unknown
  sessionStartEvent?: unknown
}

export type LinxCreateRuntimeFactory = (context: LinxRuntimeFactoryContext) => Promise<AgentSessionRuntime>
export type LinxRuntimeAdapterOptions = RuntimeBackendCompositionOptions

export interface LinxRuntimeStreamAdapter {
  readonly sessionId?: string
  readonly cwd?: string
  readonly model?: string
  streamFn(..._args: unknown[]): AssistantMessageEventStream
}

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
  readonly streamAdapter: LinxRuntimeStreamAdapter
  createRuntime: LinxCreateRuntimeFactory
  start(): Promise<void>
  close(): Promise<void>
}
