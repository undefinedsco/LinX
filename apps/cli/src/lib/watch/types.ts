import type {
  WatchBackend,
  WatchCredentialSource,
  WatchEventLogEntry,
  WatchMode,
  WatchNormalizedEvent,
  WatchOutputStream,
  WatchResolvedCredentialSource,
  WatchRuntime,
  WatchSessionRecord,
  WatchSessionStatus,
} from '@linx/models/watch'

export type {
  WatchBackend,
  WatchCredentialSource,
  WatchEventLogEntry,
  WatchMode,
  WatchNormalizedEvent,
  WatchOutputStream,
  WatchResolvedCredentialSource,
  WatchRuntime,
  WatchSessionRecord,
  WatchSessionStatus,
} from '@linx/models/watch'

export type WatchSessionKind = 'persistent-process' | 'per-turn-cli'

export interface WatchRunOptions {
  backend: WatchBackend
  mode: WatchMode
  cwd: string
  model?: string
  prompt?: string
  passthroughArgs: string[]
  runtime?: WatchRuntime
  credentialSource?: WatchCredentialSource
  resolvedCredentialSource?: WatchResolvedCredentialSource
  commandEnv?: Record<string, string>
}

export interface WatchSpawnPlan {
  command: string
  args: string[]
  env?: Record<string, string>
}

export interface WatchTurnPlanContext {
  backendSessionId?: string
  prompt: string
  turnIndex: number
}

export interface WatchBackendHook {
  id: WatchBackend
  label: string
  description: string
  sessionKind: WatchSessionKind
  buildSpawnPlan(options: WatchRunOptions): WatchSpawnPlan
  buildTurnPlan?(options: WatchRunOptions, turn: WatchTurnPlanContext): WatchSpawnPlan
  extractSessionId?(line: string): string | undefined
  parseLine(line: string, stream: WatchOutputStream): WatchNormalizedEvent[]
}
