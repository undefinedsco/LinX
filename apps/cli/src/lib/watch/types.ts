import type {
  WatchApprovalSource,
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
  WatchTransport,
} from '@linx/models/watch'

export type {
  WatchApprovalSource,
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
  WatchTransport,
} from '@linx/models/watch'

export interface WatchRunOptions {
  backend: WatchBackend
  mode: WatchMode
  cwd: string
  plain?: boolean
  model?: string
  prompt?: string
  passthroughArgs: string[]
  runtime?: WatchRuntime
  transport?: WatchTransport
  credentialSource?: WatchCredentialSource
  resolvedCredentialSource?: WatchResolvedCredentialSource
  approvalSource?: WatchApprovalSource
  commandEnv?: Record<string, string>
}

export interface WatchSpawnPlan {
  command: string
  args: string[]
  env?: Record<string, string>
}

export type WatchPromptSubmissionMode = 'send' | 'follow-up'

export type WatchUiActivityTone = 'note' | 'success' | 'error' | 'debug'

export type WatchUiEntry =
  | {
    kind: 'user' | 'assistant'
    text: string
  }
  | {
    kind: 'tool'
    text: string
  }
  | {
    kind: 'note' | 'success' | 'error'
    text: string
  }
  | {
    kind: 'debug'
    text: string
    detail?: string
  }

export interface WatchPromptSubmission {
  text: string
  mode: WatchPromptSubmissionMode
}

export interface WatchQueueState {
  steeringCount: number
  followUpCount: number
}

export interface WatchInputController {
  restoreQueuedSubmission(): WatchPromptSubmission | null
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
  buildSpawnPlan(options: WatchRunOptions): WatchSpawnPlan
}
