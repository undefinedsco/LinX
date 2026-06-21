import type { AutoModeNormalizedEvent, AutoModeSessionRecord } from './auto-mode/types.js'
import type { BackendCommandResult } from './backend-command.js'
import type { SessionControlManager } from './session-control.js'

export type NativeBackendApprovalPolicy = 'never' | 'on-request'

export interface NativeBackendProxyOptions {
  cwd?: string
  model?: string
  listenPort?: number
  autoEnabled?: boolean
  codexApprovalPolicy?: NativeBackendApprovalPolicy
  passthroughArgs?: string[]
  env?: Record<string, string>
  resolveEnv?: () => Promise<Record<string, string> | undefined>
}

export interface NativeBackendProxy {
  readonly remoteUrl: string
  readonly record: AutoModeSessionRecord
  start(): Promise<void>
  sendTurn(input: string): Promise<void>
  executeCommand?(input: string): Promise<BackendCommandResult>
  setAutoEnabled?(enabled: boolean): Promise<void> | void
  setCwd?(cwd: string): Promise<void> | void
  setSessionControl?(control: SessionControlManager): void
  subscribe(listener: (event: AutoModeNormalizedEvent) => void): () => void
  close(): Promise<void>
}

export type CreateNativeBackendProxy = (options?: NativeBackendProxyOptions) => NativeBackendProxy
