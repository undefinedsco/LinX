import {
  buildCodexApprovalResponse,
  normalizeCodexAppServerInteractionRequest,
  type AutoModeApprovalDecision,
  type AutoModeApprovalRequest,
  type AutoModeInteractionRequest,
  type AutoModeSessionRecord,
} from '@linx/agent-runtime/auto-mode'
import { createAutoModeSession, writeAutoModeSession } from '../auto-mode/archive.js'
import { createRemoteAutoModeApproval, waitForRemoteAutoModeApproval } from '../auto-mode/pod-approval.js'
import type { AutoRunOptions, AutoModeSpawnPlan } from '../auto-mode/types.js'

export interface CodexAttachBridgeRuntime {
  createRemoteAutoModeApproval: typeof createRemoteAutoModeApproval
  waitForRemoteAutoModeApproval: typeof waitForRemoteAutoModeApproval
}

export interface CodexAttachDecisionResult {
  request: AutoModeApprovalRequest
  decision: AutoModeApprovalDecision
  response: unknown
}

export interface CodexAttachBridgeResponse {
  jsonrpc: '2.0'
  id: string | number
  result?: unknown
  error?: {
    code: number
    message: string
  }
}

export interface CodexAttachBridge {
  readonly record: AutoModeSessionRecord
  handleCodexRequest(message: Record<string, unknown>): Promise<CodexAttachDecisionResult | null>
  handleCodexRpcLine(line: string): Promise<CodexAttachBridgeResponse[]>
}

const defaultPlan: AutoModeSpawnPlan = {
  command: 'codex',
  args: [],
}

export function resolveCodexAttachWorkspacePath(input: {
  workspacePath?: string
  cwd?: string
}): string {
  const workspacePath = input.workspacePath?.trim()
  if (workspacePath) {
    return workspacePath
  }

  const cwd = input.cwd?.trim()
  if (cwd) {
    return cwd
  }

  throw new Error('Codex attach requires a workspace path')
}

export function createCodexAttachSessionRecord(input: {
  workspacePath?: string
  cwd?: string
  backendSessionId: string
  model?: string
  prompt?: string
}): AutoModeSessionRecord {
  const workspacePath = resolveCodexAttachWorkspacePath(input)
  const options: AutoRunOptions = {
    backend: 'codex',
    mode: 'manual',
    cwd: workspacePath,
    model: input.model,
    prompt: input.prompt,
    passthroughArgs: [],
    runtime: 'local',
    transport: 'acp',
    credentialSource: 'cloud',
    resolvedCredentialSource: 'cloud',
  }

  const record = createAutoModeSession(options, defaultPlan)
  record.backendSessionId = input.backendSessionId
  writeAutoModeSession(record)
  return record
}

export function createCodexAttachBridge(
  record: AutoModeSessionRecord,
  runtime: CodexAttachBridgeRuntime = {
    createRemoteAutoModeApproval,
    waitForRemoteAutoModeApproval,
  },
): CodexAttachBridge {
  return {
    record,
    async handleCodexRequest(message: Record<string, unknown>): Promise<CodexAttachDecisionResult | null> {
      const interaction = normalizeCodexAppServerInteractionRequest(message)
      if (!interaction || interaction.kind === 'user-input' || interaction.kind === 'codex-approval') {
        return null
      }

      const remote = await runtime.createRemoteAutoModeApproval({
        record,
        request: interaction,
      })
      const decision = await runtime.waitForRemoteAutoModeApproval({
        approvalId: remote.id,
      })

      return {
        request: interaction,
        decision,
        response: buildCodexApprovalResponse(interaction, decision),
      }
    },
    async handleCodexRpcLine(line: string): Promise<CodexAttachBridgeResponse[]> {
      const trimmed = line.trim()
      if (!trimmed) {
        return []
      }

      let message: Record<string, unknown>
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return []
        }
        message = parsed as Record<string, unknown>
      } catch {
        return []
      }

      if (typeof message.method !== 'string' || !('id' in message)) {
        return []
      }

      try {
        const result = await this.handleCodexRequest(message)
        if (!result) {
          return []
        }

        return [{
          jsonrpc: '2.0',
          id: message.id as string | number,
          result: result.response,
        }]
      } catch (error) {
        return [{
          jsonrpc: '2.0',
          id: message.id as string | number,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : String(error),
          },
        }]
      }
    },
  }
}

export function isCodexAttachApprovalRequest(
  interaction: AutoModeInteractionRequest | null,
): interaction is AutoModeApprovalRequest {
  return Boolean(interaction && interaction.kind !== 'user-input')
}
