import {
  buildCodexApprovalResponse,
  normalizeCodexAppServerInteractionRequest,
  type WatchApprovalDecision,
  type WatchApprovalRequest,
  type WatchInteractionRequest,
  type WatchSessionRecord,
} from '@linx/models/watch'
import { createWatchSession, writeWatchSession } from '../watch/archive.js'
import { createRemoteWatchApproval, waitForRemoteWatchApproval } from '../watch/pod-approval.js'
import type { WatchRunOptions, WatchSpawnPlan } from '../watch/types.js'

export interface CodexAttachBridgeRuntime {
  createRemoteWatchApproval: typeof createRemoteWatchApproval
  waitForRemoteWatchApproval: typeof waitForRemoteWatchApproval
}

export interface CodexAttachDecisionResult {
  request: WatchApprovalRequest
  decision: WatchApprovalDecision
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
  readonly record: WatchSessionRecord
  handleCodexRequest(message: Record<string, unknown>): Promise<CodexAttachDecisionResult | null>
  handleCodexRpcLine(line: string): Promise<CodexAttachBridgeResponse[]>
}

const defaultPlan: WatchSpawnPlan = {
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
}): WatchSessionRecord {
  const workspacePath = resolveCodexAttachWorkspacePath(input)
  const options: WatchRunOptions = {
    backend: 'codex',
    mode: 'manual',
    cwd: workspacePath,
    model: input.model,
    prompt: input.prompt,
    passthroughArgs: [],
    runtime: 'local',
    transport: 'acp',
    credentialSource: 'local',
    resolvedCredentialSource: 'local',
    approvalSource: 'remote',
  }

  const record = createWatchSession(options, defaultPlan)
  record.backendSessionId = input.backendSessionId
  writeWatchSession(record)
  return record
}

export function createCodexAttachBridge(
  record: WatchSessionRecord,
  runtime: CodexAttachBridgeRuntime = {
    createRemoteWatchApproval,
    waitForRemoteWatchApproval,
  },
): CodexAttachBridge {
  return {
    record,
    async handleCodexRequest(message: Record<string, unknown>): Promise<CodexAttachDecisionResult | null> {
      const interaction = normalizeCodexAppServerInteractionRequest(message)
      if (!interaction || interaction.kind === 'user-input' || interaction.kind === 'codex-approval') {
        return null
      }

      const remote = await runtime.createRemoteWatchApproval({
        record,
        request: interaction,
      })
      const decision = await runtime.waitForRemoteWatchApproval({
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
  interaction: WatchInteractionRequest | null,
): interaction is WatchApprovalRequest {
  return Boolean(interaction && interaction.kind !== 'user-input')
}
