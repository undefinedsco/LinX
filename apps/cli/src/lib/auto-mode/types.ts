import type {
  AutoModeApprovalSource,
  AutoModeBackend,
  AutoModeCredentialSource,
  AutoModeEventLogEntry,
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
  AutoModeCredentialSource,
  AutoModeEventLogEntry,
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
  backend: AutoModeBackend
  mode: AutoModeMode
  autoModeEnabled?: boolean
  resumeSessionId?: string
  cwd: string
  plain?: boolean
  model?: string
  prompt?: string
  goalMode?: boolean
  passthroughArgs: string[]
  runtime?: AutoModeRuntime
  transport?: AutoModeTransport
  credentialSource?: AutoModeCredentialSource
  resolvedCredentialSource?: AutoModeResolvedCredentialSource
  commandOverride?: string
  commandEnv?: Record<string, string>
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
  id: AutoModeBackend
  endpoint: LinxRuntimeEndpointId
  label: string
  description: string
  capabilities: AgentRuntimeCapabilities
  buildSpawnPlan(options: AutoRunOptions): AutoModeSpawnPlan
}
