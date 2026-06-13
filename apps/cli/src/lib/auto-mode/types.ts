import type {
  AutoModeApprovalSource,
  AutoModeBackend,
  AutoModeWorkerBackend,
  AutoModeCredentialSource,
  AutoModeEventLogEntry,
  LegacyAutoModeMode,
  AutoModeMode,
  AutoModeNormalizedEvent,
  AutoModeOutputStream,
  AutoModeResolvedCredentialSource,
  AutoModeRuntime,
  AutoModeSessionRecord,
  AutoModeSessionStatus,
  AutoModeTransport,
} from '@linx/agent-runtime/auto-mode'
import type { AgentRuntimeCapabilities, LinxRuntimeEndpointId } from '@linx/agent-runtime'

export type {
  AutoModeApprovalSource,
  AutoModeBackend,
  AutoModeWorkerBackend,
  AutoModeCredentialSource,
  AutoModeEventLogEntry,
  LegacyAutoModeMode,
  AutoModeMode,
  AutoModeNormalizedEvent,
  AutoModeOutputStream,
  AutoModeResolvedCredentialSource,
  AutoModeRuntime,
  AutoModeSessionRecord,
  AutoModeSessionStatus,
  AutoModeTransport,
}

export interface AutoRunOptions {
  backend: AutoModeWorkerBackend
  autoEnabled: boolean
  mode?: LegacyAutoModeMode
  resumeSessionId?: string
  cwd: string
  plain?: boolean
  quiet?: boolean
  model?: string
  prompt?: string
  goalMode?: boolean
  passthroughArgs: string[]
  runtime?: AutoModeRuntime
  transport?: AutoModeTransport
  credentialSource?: AutoModeCredentialSource
  resolvedCredentialSource?: AutoModeResolvedCredentialSource
  approvalStrategy?: AutoModeApprovalSource
  metadata?: Record<string, unknown>
  commandOverride?: string
  commandEnv?: Record<string, string>
  signal?: AbortSignal
}

export interface AutoModeSpawnPlan {
  command: string
  args: string[]
  env?: Record<string, string>
}

export type AutoModePromptSubmissionMode = 'send' | 'follow-up'

export type AutoModeUiActivityTone = 'note' | 'success' | 'error' | 'debug'

export type AutoModeUiEntry =
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

export interface AutoModePromptSubmission {
  text: string
  mode: AutoModePromptSubmissionMode
}

export interface AutoModeSecretInputRequest {
  header: string
  question: string
  note?: string
}

export interface AutoModeQueueState {
  steeringCount: number
  followUpCount: number
}

export interface AutoModeInputController {
  restoreQueuedSubmission(): AutoModePromptSubmission | null
}

export interface AutoTurnPlanContext {
  backendSessionId?: string
  prompt: string
  turnIndex: number
}
export type AutoModeTurnPlanContext = AutoTurnPlanContext

export interface AutoModeBackendHook {
  id: AutoModeWorkerBackend
  endpoint: LinxRuntimeEndpointId
  label: string
  description: string
  capabilities: AgentRuntimeCapabilities
  buildSpawnPlan(options: AutoRunOptions): AutoModeSpawnPlan
}
